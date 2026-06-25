"""
무먹 POC — 실제 API로 작동하는 음식점 추천 단일 파일 앱 (Kakao 미사용).

흐름:
  1) 위치: GPS(브라우저 Geolocation) → 실패 시 IP 폴백 → 수동 입력
  2) 식당 검색: OpenStreetMap Overpass API (실제 데이터, 키 불필요)
  3) 경로: 차량=Naver Directions 5 (NCP, 실호출) / 도보=직선거리 기반 추정
  4) 결정론적 랭킹/필터 (소요시간 예산 기준)
  5) (선택) OpenRouter LLM 추천 이유, 없으면 폴백 문구
  6) 모든 단계 로그를 화면에 그대로 출력 (눈으로 디버깅)

mock 없음 — Overpass/Naver/IP 모두 실제 호출. 실패 시 에러를 그대로 노출.
실행: python -m streamlit run poc/app.py
"""

import os
import sys
import time
import math
import json
import re
import datetime as dt
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_POC_DIR = os.path.dirname(os.path.abspath(__file__))
if _POC_DIR not in sys.path:
    sys.path.insert(0, _POC_DIR)

import requests
import streamlit as st
from dotenv import load_dotenv

from llm_roles import load_role_specs, role_summary_line, validate_role_specs

load_dotenv(os.path.join(_POC_DIR, ".env"))

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID", "").strip()          # NCP: 길찾기/역지오코딩
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "").strip()
NAVER_SEARCH_ID = os.getenv("NAVER_SEARCH_ID", "").strip()          # developers.naver.com: 지역검색
NAVER_SEARCH_SECRET = os.getenv("NAVER_SEARCH_SECRET", "").strip()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
ROLE_SPECS = load_role_specs()
ROLE_WARNINGS = validate_role_specs(ROLE_SPECS)
POC_MAX_ROUTE_CALLS = int(os.getenv("POC_MAX_ROUTE_CALLS", "4"))
POC_MAX_VISION_CALLS = int(os.getenv("POC_MAX_VISION_CALLS", "1"))
POC_ENABLE_VISION = os.getenv("POC_ENABLE_VISION", "true").strip().lower() in ("1", "true", "yes")

HTTP_TIMEOUT = 15
UA = {"User-Agent": "mumuk-poc/0.1", "Accept": "application/json"}
MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
NAVER_PLACE_BIZ_TYPES = ("restaurant", "place", "hairshop", "beauty", "hospital", "accommodation", "cafe")
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "places")
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]
_OVERPASS_CACHE = {}  # (lat5,lng5,radius) -> elements
NAVER_PLACE_ID_RE = re.compile(
    r"(?:m|pcmap)\.place\.naver\.com/(?:place|restaurant|hairshop|beauty|hospital|accommodation|cafe)/(\d+)"
)

# ---------------------------------------------------------------------------
# 로깅
# ---------------------------------------------------------------------------

_LOG_SINK = []  # streamlit 밖(루프 테스트)에서도 동작하도록 전역 싱크 폴백


def _logs():
    try:
        return st.session_state.setdefault("logs", [])
    except Exception:  # noqa: BLE001  (ScriptRunContext 없음)
        return _LOG_SINK


def log(stage, message, data=None, level="info"):
    _logs().append(
        {
            "t": dt.datetime.now().strftime("%H:%M:%S.%f")[:-3],
            "stage": stage,
            "level": level,
            "message": message,
            "data": data,
        }
    )


def clear_logs():
    try:
        st.session_state["logs"] = []
    except Exception:  # noqa: BLE001
        _LOG_SINK.clear()


# ---------------------------------------------------------------------------
# 거리 유틸
# ---------------------------------------------------------------------------

def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# 1) 위치 — IP 폴백
# ---------------------------------------------------------------------------

def locate_by_ip():
    log("GEO", "IP 기반 위치 조회 시작 (ip-api.com)")
    r = requests.get(
        "http://ip-api.com/json/?fields=status,lat,lon,city,query",
        timeout=HTTP_TIMEOUT,
    )
    r.raise_for_status()
    j = r.json()
    if j.get("status") != "success":
        raise RuntimeError(f"IP 위치 조회 실패: {j}")
    loc = {
        "lat": j["lat"],
        "lng": j["lon"],
        "source": "ip",
        "label": f'{j.get("city","?")} ({j.get("query","")})',
    }
    log("GEO", "IP 위치 확정", loc)
    return loc


# ---------------------------------------------------------------------------
# 2a) 식당 검색 — 네이버 (역지오코딩 + 지역검색). 순수 네이버 경로.
# ---------------------------------------------------------------------------

def naver_reverse_geocode(lat, lng):
    """좌표 → 행정동 이름 (지역검색 키워드용). NCP 키 사용."""
    url = "https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc"
    params = {"coords": f"{lng},{lat}", "output": "json", "orders": "admcode,roadaddr"}
    headers = {"x-ncp-apigw-api-key-id": NAVER_CLIENT_ID, "x-ncp-apigw-api-key": NAVER_CLIENT_SECRET}
    r = requests.get(url, params=params, headers=headers, timeout=HTTP_TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"Reverse geocode {r.status_code}: {r.text[:150]}")
    for res in r.json().get("results", []):
        reg = res.get("region", {})
        a2 = reg.get("area2", {}).get("name", "")
        a3 = reg.get("area3", {}).get("name", "")
        area = (a2 + " " + a3).strip()
        if area:
            return area
    raise RuntimeError("역지오코딩 결과 없음")


def _naver_local_query(query):
    url = "https://openapi.naver.com/v1/search/local.json"
    headers = {"X-Naver-Client-Id": NAVER_SEARCH_ID, "X-Naver-Client-Secret": NAVER_SEARCH_SECRET}
    r = requests.get(url, params={"query": query, "display": 5, "sort": "comment"}, headers=headers, timeout=HTTP_TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"Naver local-search {r.status_code}: {r.text[:150]}")
    return r.json().get("items", [])


def naver_search_nearby(lat, lng, radius):
    if not (NAVER_SEARCH_ID and NAVER_SEARCH_SECRET):
        raise RuntimeError("NAVER_SEARCH_ID/SECRET 없음 (developers.naver.com 검색 키)")
    area = naver_reverse_geocode(lat, lng)
    log("NAVER_SEARCH", f"역지오코딩 → '{area}' 주변 검색")
    queries = [f"{area} 맛집", f"{area} 한식", f"{area} 일식", f"{area} 중식", f"{area} 카페"]
    seen, items = set(), []
    for q in queries:
        try:
            for it in _naver_local_query(q):
                title = it["title"].replace("<b>", "").replace("</b>", "")
                if title in seen:
                    continue
                seen.add(title)
                items.append(it)
        except Exception as e:  # noqa: BLE001
            log("NAVER_SEARCH", f"  쿼리 실패 '{q}': {str(e)[:80]}", level="error")
    log("NAVER_SEARCH", f"지역검색 병합 — {len(items)}개 (중복 제거 후)")
    return items


def normalize_naver_item(it):
    title = it["title"].replace("<b>", "").replace("</b>", "")
    cats = (it.get("category") or "").split(">")
    return {
        "id": it.get("link") or title,
        "name": title,
        "category": cats[-1].strip() if cats else "음식점",
        "address": it.get("roadAddress") or it.get("address") or "",
        "lat": int(it["mapy"]) / 1e7,   # WGS84 * 10^7
        "lng": int(it["mapx"]) / 1e7,
    }


# ---------------------------------------------------------------------------
# 2b) 네이버 플레이스 상세 — place_id / 리뷰 / 사진 / 메뉴판
# ---------------------------------------------------------------------------

def _strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def _is_url(value):
    return isinstance(value, str) and value.startswith(("http://", "https://"))


def _address_search_part(address):
    parts = str(address or "").split()
    return parts[1] if len(parts) > 1 else (parts[0] if parts else "")


def _extract_apollo_state(html):
    idx = html.find("__APOLLO_STATE__")
    if idx == -1:
        return None
    brace_start = html.find("{", idx)
    if brace_start == -1:
        return None
    try:
        state, _ = json.JSONDecoder().raw_decode(html, brace_start)
    except json.JSONDecodeError:
        return None
    return state if isinstance(state, dict) else None


def resolve_place_id(title, address):
    query = f"{title} {_address_search_part(address)}".strip()
    if not query:
        return None
    log("NAVER_PLACE", f"place_id 검색 → {query}")
    r = requests.get(
        "https://m.search.naver.com/search.naver",
        headers={"User-Agent": MOBILE_UA, "Accept-Language": "ko-KR,ko;q=0.9"},
        params={"query": query},
        timeout=HTTP_TIMEOUT,
    )
    r.encoding = "utf-8"
    m = NAVER_PLACE_ID_RE.search(r.text)
    place_id = m.group(1) if m else None
    if place_id:
        log("NAVER_PLACE", f"  → place_id={place_id}")
    else:
        log("NAVER_PLACE", "  → place_id 못 찾음", level="error")
    return place_id


def canonicalize_naver_place_url(url):
    if not url:
        return None
    try:
        parts = urlsplit(url)
        query = urlencode(
            [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "timestamp"]
        )
        return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))
    except Exception:  # noqa: BLE001
        return re.sub(r"([?&])timestamp=[^&]+&?", r"\1", str(url)).rstrip("?&")


def naver_place_id_from_url(url):
    if not url:
        return None
    match = NAVER_PLACE_ID_RE.search(url)
    return match.group(1) if match else None


def _fetch_naver_place_state(place_id, section):
    headers = {
        "User-Agent": MOBILE_UA,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": f"https://m.place.naver.com/restaurant/{place_id}/home",
    }
    for biz in NAVER_PLACE_BIZ_TYPES:
        url = f"https://m.place.naver.com/{biz}/{place_id}/{section}"
        try:
            r = requests.get(url, headers=headers, timeout=HTTP_TIMEOUT)
        except requests.RequestException as e:
            log("NAVER_PLACE", f"  {section} 요청 예외({biz}): {str(e)[:80]}", level="error")
            continue
        if r.status_code != 200 or "__APOLLO_STATE__" not in r.text:
            continue
        r.encoding = "utf-8"
        state = _extract_apollo_state(r.text)
        if state:
            return url, state
    return None, None


def _parse_reviews_from_state(state, limit=20):
    values = [v for v in (state or {}).values() if isinstance(v, dict)]
    nick_by_id = {
        v.get("id") or key: v.get("nickname") or v.get("name")
        for key, v in (state or {}).items()
        if isinstance(v, dict) and (v.get("nickname") or v.get("name"))
    }

    def resolve_author(review):
        author = review.get("author")
        if isinstance(author, dict):
            ref = author.get("id") or author.get("__ref")
            if ref and ref in nick_by_id:
                return nick_by_id[ref]
        return review.get("nickname") or review.get("authorName")

    reviews = []
    for value in values:
        body = value.get("body")
        if "Review" not in value.get("__typename", "") or not isinstance(body, str) or not body.strip():
            continue
        reviews.append({
            "author": resolve_author(value),
            "rating": value.get("rating") or value.get("starRating"),
            "visitedAt": value.get("visited") or value.get("visitDate") or value.get("created"),
            "body": body.strip(),
        })
        if len(reviews) >= limit:
            break
    return reviews


def _summarize_reviews(reviews):
    if not reviews:
        return {"pros": None, "cons": None}

    positive = [review for review in reviews if isinstance(review.get("rating"), (int, float)) and review["rating"] >= 4]
    negative = [review for review in reviews if isinstance(review.get("rating"), (int, float)) and review["rating"] <= 2]
    pros_source = positive[0] if positive else reviews[0]
    cons_source = negative[0] if negative else next(
        (review for review in reviews if isinstance(review.get("rating"), (int, float)) and review["rating"] == 3),
        None,
    )

    return {
        "pros": re.sub(r"\s+", " ", pros_source["body"])[:120] if pros_source.get("body") else None,
        "cons": re.sub(r"\s+", " ", cons_source["body"])[:120] if cons_source and cons_source.get("body") else None,
    }


def fetch_naver_reviews(place_id_or_url, limit=20):
    canonical_url = canonicalize_naver_place_url(place_id_or_url) if str(place_id_or_url).startswith("http") else None
    place_id = naver_place_id_from_url(canonical_url) if canonical_url else str(place_id_or_url)
    source, state = _fetch_naver_place_state(place_id, "review/visitor")
    reviews = _parse_reviews_from_state(state, limit=limit)
    source = canonicalize_naver_place_url(source or canonical_url)
    review_snippets = [review["body"] for review in reviews[: min(limit, 20)]]
    review_summary = _summarize_reviews(reviews)
    log("NAVER_PLACE", f"리뷰 수집 → {len(reviews)}개")
    return {
        "provider": "naver",
        "placeId": place_id,
        "placeUrl": source,
        "source": source,
        "count": len(reviews),
        "reviewCount": len(reviews),
        "reviews": reviews,
        "reviewSummary": review_summary,
        "reviewSnippets": review_snippets,
        "extractionMethod": "static-hydration" if source else "unavailable",
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "error": None if reviews else "No reviews extracted from Naver Place page",
    }


def _parse_photos_and_menu_from_state(state, store_name, food_limit=3):
    values = [v for v in (state or {}).values() if isinstance(v, dict)]
    photos = [v for v in values if v.get("__typename") == "PlaceDetailTopPhotoItem"]
    menu_board_titles = {"메뉴판", "메뉴"}
    store_titles = {"외부", "내부", store_name}

    menu_board = next((p for p in photos if p.get("title") in menu_board_titles), None)
    store_photo = next(
        (p for p in photos if p.get("title") in store_titles or p.get("type") == "business"),
        None,
    )
    food_photos = [
        p for p in photos
        if p is not menu_board
        and p is not store_photo
        and p.get("title") not in menu_board_titles
        and p.get("title") not in store_titles
        and _is_url(p.get("origin"))
    ]

    menu_items = []
    for value in values:
        if value.get("__typename") != "Menu":
            continue
        if value.get("name"):
            menu_items.append({
                "name": str(value.get("name")).strip(),
                "price": None if value.get("price") in (None, "") else str(value.get("price")).strip(),
            })
        if len(food_photos) < food_limit and value.get("images"):
            food_photos.append({"title": value.get("name"), "origin": value["images"][0]})

    return {
        "menu_board": menu_board.get("origin") if menu_board and _is_url(menu_board.get("origin")) else None,
        "main_photo": store_photo.get("origin") if store_photo and _is_url(store_photo.get("origin")) else None,
        "food": [
            {"title": p.get("title"), "url": p.get("origin")}
            for p in food_photos[:food_limit]
            if _is_url(p.get("origin"))
        ],
        "menu_items": [item for item in menu_items if item["name"]],
    }


def fetch_naver_photos(place_id, store_name="", food_limit=3):
    source, state = _fetch_naver_place_state(place_id, "home")
    parsed = _parse_photos_and_menu_from_state(state, store_name, food_limit=food_limit)
    parsed["source"] = source
    log(
        "NAVER_PLACE",
        f"사진 수집 → 대표={bool(parsed['main_photo'])}, 메뉴판={bool(parsed['menu_board'])}, 음식={len(parsed['food'])}장",
    )
    return parsed


def _strip_json_fence(text):
    return re.sub(r"^```(?:json)?|```$", "", str(text or "").strip(), flags=re.MULTILINE).strip()


def _openrouter_chat(role_name, messages):
    """역할별 모델 규칙에 따라 OpenRouter 호출. role_name: reason | vision_menu"""
    spec = ROLE_SPECS[role_name]
    payload = {
        "model": spec.model,
        "max_tokens": spec.max_tokens,
        "temperature": spec.temperature,
        "messages": messages,
    }
    r = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
        json=payload,
        timeout=spec.timeout_sec,
    )
    if not r.ok:
        raise RuntimeError(f"{spec.label} 실패 {r.status_code}: {r.text[:200]}")
    return r.json()["choices"][0]["message"]["content"].strip()


def extract_menu_from_photo(image_url):
    if not image_url:
        return []
    if not OPENROUTER_API_KEY:
        log("VISION", "OPENROUTER_API_KEY 없음 — 메뉴판 Vision 추출 스킵")
        return []

    spec = ROLE_SPECS["vision_menu"]
    log("VISION", f"역할={spec.name} · {role_summary_line(spec)}")
    try:
        text = _openrouter_chat(
            "vision_menu",
            [{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "이 메뉴판 사진을 읽고 메뉴 이름과 가격을 추출해줘. "
                            '다른 말 없이 JSON 배열로만 답해: [{"name":"메뉴명","price":"가격"}, ...]. '
                            "가격이 안 보이면 price를 null로, 글자를 읽을 수 없으면 []를 반환해."
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }],
        )
        items = json.loads(_strip_json_fence(text))
        if not isinstance(items, list):
            return []
        return [
            {
                "name": str(item.get("name", "")).strip(),
                "price": None if item.get("price") in (None, "") else str(item.get("price")).strip(),
            }
            for item in items
            if isinstance(item, dict) and str(item.get("name", "")).strip()
        ]
    except Exception as e:  # noqa: BLE001
        log("VISION", f"Vision 예외 — 메뉴 추출 스킵: {e}", level="error")
        return []


def save_place_data(place_id, data):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, f"{place_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def enrich_with_naver_place(c, run_vision=True):
    place_id = resolve_place_id(c["name"], c.get("address", ""))
    if not place_id:
        c["place_details"] = None
        c["place_error"] = "place_id를 찾지 못했습니다."
        return c

    reviews = fetch_naver_reviews(place_id)
    photos = fetch_naver_photos(place_id, store_name=c["name"])
    menu_items = []
    if run_vision and POC_ENABLE_VISION:
        menu_items = extract_menu_from_photo(photos.get("menu_board")) or photos.get("menu_items", [])
    else:
        menu_items = photos.get("menu_items", [])
        if not run_vision:
            log("VISION", f"{c['name']} — Vision 호출 제한(POC_MAX_VISION_CALLS)으로 스킵")
        elif not POC_ENABLE_VISION:
            log("VISION", "POC_ENABLE_VISION=false — 메뉴판 Vision 추출 스킵")
    place_url = f"https://m.place.naver.com/restaurant/{place_id}/home"

    details = {
        "placeId": place_id,
        "placeUrl": place_url,
        "name": c["name"],
        "category": c["category"],
        "address": c.get("address", ""),
        "mainPhoto": photos.get("main_photo"),
        "menuBoardPhoto": photos.get("menu_board"),
        "menuItems": menu_items,
        "foodPhotos": photos.get("food", []),
        "reviews": reviews.get("reviews", []),
        "reviewSummary": reviews.get("reviewSummary"),
        "reviewSnippets": reviews.get("reviewSnippets", []),
        "sources": {
            "reviews": reviews.get("source"),
            "photos": photos.get("source"),
        },
    }
    c["place_id"] = place_id
    c["place_url"] = place_url
    c["place_details"] = details
    c["place_json_path"] = save_place_data(place_id, details)
    log("NAVER_PLACE", f"상세 저장 → {c['place_json_path']}")
    return c


# ---------------------------------------------------------------------------
# 2b) 식당 검색 — OpenStreetMap Overpass (키 불필요, 폴백)
# ---------------------------------------------------------------------------

def overpass_search_nearby(lat, lng, radius, retries=3):
    cache_key = (round(lat, 5), round(lng, 5), radius)
    if cache_key in _OVERPASS_CACHE:
        els = _OVERPASS_CACHE[cache_key]
        log("OVERPASS", f"캐시 HIT — 식당 {len(els)}개")
        return els

    q = (
        f"[out:json][timeout:25];"
        f'(node["amenity"~"restaurant|fast_food|cafe"]["name"](around:{radius},{lat},{lng}););'
        f"out body 30;"
    )
    log("OVERPASS", f"식당 검색 호출 (radius={radius}m)")
    last_err = None
    for attempt in range(1, retries + 1):
        for ep in OVERPASS_ENDPOINTS:
            host = ep.split("/")[2]
            try:
                t0 = time.time()
                r = requests.post(ep, data={"data": q}, headers=UA, timeout=30)
                dtms = int((time.time() - t0) * 1000)
                if r.status_code in (429, 504, 502, 503):
                    last_err = f"{host} {r.status_code}"
                    log("OVERPASS", f"  미러 혼잡 {last_err} (재시도 대상)", level="error")
                    continue
                if not r.ok:
                    last_err = f"{host} {r.status_code}"
                    log("OVERPASS", f"  미러 실패 {last_err}", level="error")
                    continue
                els = [e for e in r.json().get("elements", []) if e.get("tags", {}).get("name")]
                log("OVERPASS", f"성공 — 식당 {len(els)}개 ({host}, attempt {attempt}, {dtms}ms)")
                _OVERPASS_CACHE[cache_key] = els
                return els
            except Exception as e:  # noqa: BLE001
                last_err = f"{host}: {str(e)[:80]}"
                log("OVERPASS", f"  미러 예외 {last_err}", level="error")
        if attempt < retries:
            backoff = 2 * attempt
            log("OVERPASS", f"모든 미러 실패 — {backoff}s 후 재시도 ({attempt}/{retries})")
            time.sleep(backoff)
    raise RuntimeError(f"Overpass 전체 실패: {last_err}")


CUISINE_KO = {
    "korean": "한식", "japanese": "일식", "chinese": "중식", "italian": "이탈리안",
    "pizza": "피자", "burger": "버거", "chicken": "치킨", "fish": "해산물",
    "coffee_shop": "카페", "cafe": "카페", "asian": "아시안", "thai": "태국",
}


def normalize_candidate(el):
    tags = el.get("tags", {})
    cuisine = (tags.get("cuisine") or "").split(";")[0]
    category = CUISINE_KO.get(cuisine, cuisine or {"cafe": "카페", "fast_food": "패스트푸드"}.get(tags.get("amenity"), "음식점"))
    return {
        "id": el.get("id"),
        "name": tags.get("name"),
        "category": category,
        "address": tags.get("addr:full") or tags.get("addr:street") or "",
        "lat": el["lat"],
        "lng": el["lon"],
    }


# ---------------------------------------------------------------------------
# 3) 경로 — 차량(Naver NCP) / 도보(직선거리 추정)
# ---------------------------------------------------------------------------

def naver_driving_route(s_lat, s_lng, g_lat, g_lng):
    if not (NAVER_CLIENT_ID and NAVER_CLIENT_SECRET):
        raise RuntimeError("NAVER_CLIENT_ID/SECRET 없음")
    url = "https://maps.apigw.ntruss.com/map-direction/v1/driving"
    params = {"start": f"{s_lng},{s_lat}", "goal": f"{g_lng},{g_lat}", "option": "trafast"}
    headers = {
        "x-ncp-apigw-api-key-id": NAVER_CLIENT_ID,
        "x-ncp-apigw-api-key": NAVER_CLIENT_SECRET,
    }
    r = requests.get(url, headers=headers, params=params, timeout=HTTP_TIMEOUT)
    if not r.ok:
        raise RuntimeError(f"Naver Directions {r.status_code}: {r.text[:200]}")
    body = r.json()
    if body.get("code") != 0:
        raise RuntimeError(f"Naver Directions code={body.get('code')} {body.get('message')}")
    summary = body["route"]["trafast"][0]["summary"]
    return {
        "duration_min": max(1, round(summary["duration"] / 1000 / 60)),
        "distance_m": round(summary["distance"]),
        "provider": "naver-driving",
    }


WALK_M_PER_MIN = 67.0   # 약 4km/h
WALK_DETOUR = 1.3       # 직선거리 → 실제 보행거리 보정


def walking_route_estimate(s_lat, s_lng, g_lat, g_lng):
    straight = haversine_m(s_lat, s_lng, g_lat, g_lng)
    dist = straight * WALK_DETOUR
    return {
        "duration_min": max(1, round(dist / WALK_M_PER_MIN)),
        "distance_m": round(dist),
        "provider": "walk-estimate",
    }


def get_route(transport, s_lat, s_lng, c):
    label = "Naver Directions(차량)" if transport == "drive" else "직선거리 추정(도보)"
    log("ROUTE", f"경로 계산 → {c['name']} [{label}]")
    t0 = time.time()
    if transport == "drive":
        route = naver_driving_route(s_lat, s_lng, c["lat"], c["lng"])
    else:
        route = walking_route_estimate(s_lat, s_lng, c["lat"], c["lng"])
    route["_ms"] = int((time.time() - t0) * 1000)
    log("ROUTE", f"  → {c['name']}: 편도 {route['duration_min']}분 / {route['distance_m']}m ({route['_ms']}ms)")
    return route


# ---------------------------------------------------------------------------
# 4) 랭킹
# ---------------------------------------------------------------------------

DINING_MINUTES = 30


def rank(candidates, budget_minutes):
    for c in candidates:
        one_way = c["route"]["duration_min"]
        total = one_way * 2 + DINING_MINUTES
        c["one_way_min"] = one_way
        c["total_expected_min"] = total
        c["fits_budget"] = total <= budget_minutes
        c["score"] = (1000 if c["fits_budget"] else 0) - one_way
    candidates.sort(key=lambda x: x["score"], reverse=True)
    eligible = [c for c in candidates if c["fits_budget"]]
    log("RANK", f"예산 {budget_minutes}분 기준 적합 {len(eligible)}/{len(candidates)}개 (식사 {DINING_MINUTES}분 가정, 왕복 포함)")
    return eligible if eligible else candidates[:3]


# ---------------------------------------------------------------------------
# 5) 추천 이유
# ---------------------------------------------------------------------------

def reason_fallback(c, transport):
    t = "차량" if transport == "drive" else "도보"
    parts = [
        f"현재 위치에서 {t} {c['one_way_min']}분 거리(왕복 {c['one_way_min']*2}분)의 "
        f"{c['category']} 음식점입니다. 예상 총 소요 {c['total_expected_min']}분으로 시간 예산에 적합합니다."
    ]
    details = c.get("place_details") or {}
    review_summary = details.get("reviewSummary") or {}
    if review_summary.get("pros"):
        parts.append(f"리뷰 장점으로는 {review_summary['pros']}")
    if review_summary.get("cons"):
        parts.append(f"다만 리뷰 단점으로는 {review_summary['cons']}")
    reviews = details.get("reviews") or []
    if reviews and not review_summary.get("pros"):
        parts.append(f"네이버 방문자 리뷰에는 “{reviews[0]['body'][:80]}”라는 반응이 있습니다.")
    menu_items = details.get("menuItems") or []
    if menu_items:
        preview = ", ".join(
            item["name"] if not item.get("price") else f"{item['name']}({item['price']})"
            for item in menu_items[:3]
        )
        parts.append(f"추출된 메뉴 예시는 {preview}입니다.")
    return " ".join(parts)


def reason_llm(c, transport):
    if not OPENROUTER_API_KEY:
        return reason_fallback(c, transport)
    spec = ROLE_SPECS["reason"]
    log("LLM", f"역할={spec.name} · {role_summary_line(spec)} → {c['name']}")
    try:
        txt = _openrouter_chat(
            "reason",
            [{
                "role": "user",
                "content": (
                    "다음 식당을 한국어 1~2문장으로 추천하는 이유를 써줘. 제공된 사실만 사용하고 "
                    "평점/리뷰수/가격 등 없는 정보는 지어내지 마. 좌표(위경도)는 언급 금지.\n"
                    + json.dumps(
                        {
                            "name": c["name"],
                            "category": c["category"],
                            "transport": transport,
                            "one_way_min": c["one_way_min"],
                            "total_expected_min": c["total_expected_min"],
                            "naver_place": {
                                "reviewSummary": (c.get("place_details") or {}).get("reviewSummary"),
                                "reviewSnippets": (c.get("place_details") or {}).get("reviewSnippets", [])[:5],
                                "reviews": (c.get("place_details") or {}).get("reviews", [])[:3],
                                "menuItems": (c.get("place_details") or {}).get("menuItems", [])[:5],
                            },
                        },
                        ensure_ascii=False,
                    )
                ),
            }],
        )
        log("LLM", f"  → {c['name']} 이유 생성 완료")
        return txt or reason_fallback(c, transport)
    except Exception as e:  # noqa: BLE001
        log("LLM", f"예외 — 폴백 사용: {e}", level="error")
        return reason_fallback(c, transport)


# ---------------------------------------------------------------------------
# 파이프라인
# ---------------------------------------------------------------------------

def search_radius(mode, transport):
    if mode == "normal":
        return 1500 if transport == "walk" else 5000
    return 3000 if transport == "walk" else 10000


def collect_candidates(source, lat, lng, radius):
    """source='naver'|'overpass' → 정규화된 후보 리스트 (반경 필터 포함)."""
    if source == "naver":
        items = naver_search_nearby(lat, lng, radius)
        cands = [normalize_naver_item(it) for it in items]
        within = [c for c in cands if haversine_m(lat, lng, c["lat"], c["lng"]) <= radius]
        log("NAVER_SEARCH", f"반경 {radius}m 내 {len(within)}/{len(cands)}개")
        return within
    els = overpass_search_nearby(lat, lng, radius)
    return [normalize_candidate(e) for e in els]


def run_pipeline(
    loc,
    mode,
    transport,
    budget_minutes,
    top_n,
    use_llm,
    source="naver",
    max_route_calls=None,
):
    if max_route_calls is None:
        max_route_calls = POC_MAX_ROUTE_CALLS
    radius = search_radius(mode, transport)
    log("PIPELINE", f"시작 — source={source}, mode={mode}, transport={transport}, budget={budget_minutes}분, 위치={loc}")

    candidates = collect_candidates(source, loc["lat"], loc["lng"], radius)
    if not candidates:
        log("PIPELINE", "후보 0개 — 종료", level="error")
        return []
    # 직선거리 가까운 순으로 정렬 후, 경로 계산은 상위 일부만(차량은 외부 호출이라 제한)
    candidates.sort(key=lambda c: haversine_m(loc["lat"], loc["lng"], c["lat"], c["lng"]))
    target = candidates[:max_route_calls]
    log("PIPELINE", f"후보 {len(candidates)}개 중 가까운 {len(target)}개에 대해 경로 계산")

    routed = []
    for c in target:
        try:
            c["route"] = get_route(transport, loc["lat"], loc["lng"], c)
            routed.append(c)
        except Exception as e:  # noqa: BLE001
            log("ROUTE", f"  ✗ {c['name']} 경로 실패: {e}", level="error")
    if not routed:
        log("PIPELINE", "경로 계산 성공 후보 0개 — ROUTE_UNAVAILABLE", level="error")
        return []

    ranked = rank(routed, budget_minutes)[:top_n]
    for i, c in enumerate(ranked, 1):
        log("RANK", f"#{i} {c['name']} — score={c['score']}, 총 {c['total_expected_min']}분")
        enrich_with_naver_place(c, run_vision=(i <= POC_MAX_VISION_CALLS))
        c["reason"] = reason_llm(c, transport) if use_llm else reason_fallback(c, transport)

    log("PIPELINE", f"완료 — 최종 {len(ranked)}개")
    return ranked


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

def main():
    st.set_page_config(page_title="무먹 POC", page_icon="🍚", layout="centered")
    st.title("🍚 무먹 POC")
    st.caption("실제 API 작동 검증용 · Kakao 미사용(Overpass+Naver) · 단계별 로그 노출")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Naver검색", "OK" if (NAVER_SEARCH_ID and NAVER_SEARCH_SECRET) else "없음")
    c2.metric("Naver길찾기/지오", "OK" if (NAVER_CLIENT_ID and NAVER_CLIENT_SECRET) else "없음")
    c3.metric("Overpass", "폴백")
    if OPENROUTER_API_KEY:
        c4.metric("LLM", ROLE_SPECS["reason"].model.split("/")[-1])
    else:
        c4.metric("LLM", "폴백")

    if OPENROUTER_API_KEY:
        with st.expander("🤖 모델 역할 규칙", expanded=False):
            for role in ("reason", "vision_menu"):
                spec = ROLE_SPECS[role]
                st.markdown(f"**{spec.label}** (`{spec.name}`)")
                st.caption(spec.description)
                st.code(f"model={spec.model}\nmax_tokens={spec.max_tokens}\ntemperature={spec.temperature}")
            for warn in ROLE_WARNINGS:
                st.warning(warn)
        st.caption(
            f"제한: 경로 {POC_MAX_ROUTE_CALLS}회 · Vision {POC_MAX_VISION_CALLS}곳"
            + ("" if POC_ENABLE_VISION else " · Vision OFF")
        )

    st.divider()
    st.subheader("1. 위치")
    st.write("GPS 버튼 → 권한 허용. 거부/실패 시 IP 폴백을 쓰세요.")
    gps_col, ip_col = st.columns(2)
    with gps_col:
        try:
            from streamlit_geolocation import streamlit_geolocation

            gps = streamlit_geolocation()
            if gps and gps.get("latitude") is not None:
                st.session_state["user_loc"] = {"lat": gps["latitude"], "lng": gps["longitude"], "source": "gps", "label": "GPS"}
                log("GEO", "GPS 위치 확정", st.session_state["user_loc"])
        except Exception as e:  # noqa: BLE001
            st.warning(f"GPS 컴포넌트 사용 불가: {e}")
    with ip_col:
        if st.button("📡 IP로 위치 잡기 (폴백)", use_container_width=True):
            try:
                st.session_state["user_loc"] = locate_by_ip()
            except Exception as e:  # noqa: BLE001
                st.error(f"IP 위치 실패: {e}")

    with st.expander("수동 좌표 입력 (선택)"):
        mlat = st.number_input("위도(lat)", value=37.5665, format="%.6f")
        mlng = st.number_input("경도(lng)", value=126.9780, format="%.6f")
        if st.button("이 좌표 사용"):
            st.session_state["user_loc"] = {"lat": mlat, "lng": mlng, "source": "manual", "label": "수동"}

    loc = st.session_state.get("user_loc")
    if not (isinstance(loc, dict) and "lat" in loc and "lng" in loc):
        loc = None  # 컴포넌트 잔여값 등 잘못된 형태 방어
    if loc:
        st.success(f"현재 위치: {loc['lat']:.5f}, {loc['lng']:.5f}  (출처: {loc.get('source','?')} {loc.get('label','')})")
        st.map([{"lat": loc["lat"], "lon": loc["lng"]}], zoom=14)
    else:
        st.info("위치를 먼저 설정하세요. (GPS 버튼 또는 IP 폴백)")

    st.divider()
    st.subheader("2. 조건")
    source = st.radio("식당 검색 소스", ["naver", "overpass"], horizontal=True,
                      format_func=lambda x: "네이버 지역검색" if x == "naver" else "OpenStreetMap(키불필요)")
    mode = st.radio("모드", ["normal", "travel"], horizontal=True, format_func=lambda x: "일반" if x == "normal" else "출장/여행")
    transport = st.radio("이동수단", ["drive", "walk"], horizontal=True, format_func=lambda x: "차량(Naver 실호출)" if x == "drive" else "도보(거리추정)")
    budget = st.slider("총 소요시간 예산(분)", 20, 120, 60, 5)
    top_n = st.slider("추천 개수", 1, 10, 5)
    use_llm = st.checkbox("추천 이유 LLM 생성", value=bool(OPENROUTER_API_KEY), disabled=not OPENROUTER_API_KEY)

    run = st.button("🔍 추천 실행", type="primary", use_container_width=True, disabled=not loc)
    st.divider()

    if run:
        clear_logs()
        with st.spinner("실제 API 호출 중..."):
            try:
                st.session_state["results"] = run_pipeline(loc, mode, transport, budget, top_n, use_llm, source=source)
            except Exception as e:  # noqa: BLE001
                log("PIPELINE", f"치명적 오류: {e}", level="error")
                st.session_state["results"] = []
                st.exception(e)

    results = st.session_state.get("results")
    if results is not None:
        st.subheader(f"3. 결과 ({len(results)}개)")
        if not results:
            st.warning("결과 없음. 아래 로그를 확인하세요.")
        for i, c in enumerate(results, 1):
            fit = "✅예산내" if c.get("fits_budget") else "⚠️예산초과"
            with st.container(border=True):
                st.markdown(f"**#{i}. {c['name']}**  ·  {c['category']}  ·  {fit}")
                st.write(c.get("reason", ""))
                st.caption(f"편도 {c['one_way_min']}분 / 총 {c['total_expected_min']}분 · {c['route']['provider']} · {c.get('address') or ''}")
                details = c.get("place_details") or {}
                if details:
                    if details.get("mainPhoto"):
                        st.image(details["mainPhoto"], caption="대표 사진", use_container_width=True)
                    menu_items = details.get("menuItems") or []
                    if menu_items:
                        st.markdown("**메뉴**")
                        st.table(menu_items[:8])
                    food_photos = details.get("foodPhotos") or []
                    if food_photos:
                        st.markdown("**음식 사진**")
                        cols = st.columns(min(3, len(food_photos)))
                        for col, photo in zip(cols, food_photos):
                            with col:
                                st.image(photo["url"], caption=photo.get("title") or "음식", use_container_width=True)
                    reviews = details.get("reviews") or []
                    if reviews:
                        st.markdown("**네이버 방문자 리뷰**")
                        for rev in reviews[:3]:
                            st.write(f"- {rev['body']}")
                    if c.get("place_json_path"):
                        st.caption(f"저장: {c['place_json_path']}")
                elif c.get("place_error"):
                    st.caption(f"네이버 플레이스 상세 없음: {c['place_error']}")

    st.divider()
    st.subheader("🪵 단계별 로그")
    logs = _logs()
    if not logs:
        st.caption("아직 로그 없음. 추천을 실행하면 단계별 호출 내역이 쌓입니다.")
    else:
        ICON = {"GEO": "📍", "NAVER_SEARCH": "🍴", "NAVER_PLACE": "🧾", "VISION": "👁️", "OVERPASS": "🍴", "ROUTE": "🛣️", "RANK": "📊", "LLM": "🤖", "PIPELINE": "⚙️"}
        lines = []
        for e in logs:
            mark = "❌ " if e["level"] == "error" else ""
            line = f"{e['t']} {ICON.get(e['stage'],'•')} [{e['stage']}] {mark}{e['message']}"
            if e.get("data") is not None:
                line += "  " + json.dumps(e["data"], ensure_ascii=False)
            lines.append(line)
        st.code("\n".join(lines), language="text")
        st.download_button("로그 다운로드(.txt)", "\n".join(lines), file_name="mumuk_poc_log.txt")


if __name__ == "__main__" or st.runtime.exists():
    main()
