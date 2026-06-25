"""
naver_nearby_review_test.py
─────────────────────────────────────────────────────────────────────
검증용 스크립트: 네이버 검색 API(지역검색)로 내 위치 근처 맛집을 무작위로
가져온 다음, 각 가게의 place_id를 알아내서 실제 리뷰까지 가져오는지 확인한다.

[.env]
    NAVER_CLIENT_ID=...
    NAVER_CLIENT_SECRET=...

[동작 방식]
    1) 네이버 검색 API local.json 으로 "{지역} 맛집" 후보를 가져온다.
       (이 API는 가게 이름/주소/좌표만 주고 place_id 는 안 준다.)
    2) 후보 이름+주소로 m.search.naver.com 통합검색을 한 번 더 해서,
       검색 결과 HTML에 박혀있는 첫 번째 place/{숫자} 를 place_id 로 뽑는다.
    3) 그 place_id 로 m.place.naver.com 방문자 리뷰 페이지를 파싱한다.
    4) 사진(대표/메뉴판/음식 3장)도 같이 가져오고, 메뉴판은 Vision LLM으로 읽어
       메뉴명/가격을 추출한다.
    5) 가게별 결과를 data/places/{place_id}.json 으로 저장해서 프론트엔드가
       바로 읽어 쓸 수 있게 한다.

[실행]
    python naver_nearby_review_test.py "강남역"
    python naver_nearby_review_test.py "강남역" 3   # 3곳 무작위로 뽑기
─────────────────────────────────────────────────────────────────────
"""

import os
import re
import sys
import json
import random
import datetime as dt
import requests
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")

VISION_MODEL = os.getenv("MODEL", "anthropic/claude-sonnet-4.5")
vision_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)
NAVER_PLACE_ID_RE = re.compile(
    r"(?:m|pcmap)\.place\.naver\.com/(?:place|restaurant|hairshop|beauty|hospital|accommodation|cafe)/(\d+)"
)


def strip_tags(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "")


# ──────────────────────────────────────────────────────────────────
# 1) 네이버 검색 API(지역검색)로 근처 맛집 후보 가져오기
# ──────────────────────────────────────────────────────────────────
def search_nearby_restaurants(location: str, count: int = 5):
    r = requests.get(
        "https://openapi.naver.com/v1/search/local.json",
        headers={
            "X-Naver-Client-Id": NAVER_CLIENT_ID,
            "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
        },
        params={"query": f"{location} 맛집", "display": min(count, 5)},
        timeout=10,
    )
    r.encoding = "utf-8"
    r.raise_for_status()
    items = r.json().get("items", [])
    return [
        {
            "title": strip_tags(it["title"]),
            "address": it.get("roadAddress") or it.get("address"),
            "category": it.get("category"),
        }
        for it in items
    ]


# ──────────────────────────────────────────────────────────────────
# 2) 가게 이름+주소로 place_id 알아내기
# ──────────────────────────────────────────────────────────────────
def resolve_place_id(title: str, address: str):
    query = f"{title} {address.split()[1] if address else ''}".strip()
    r = requests.get(
        "https://m.search.naver.com/search.naver",
        headers={"User-Agent": MOBILE_UA, "Accept-Language": "ko-KR,ko;q=0.9"},
        params={"query": query},
        timeout=10,
    )
    r.encoding = "utf-8"
    m = NAVER_PLACE_ID_RE.search(r.text)
    return m.group(1) if m else None


def canonicalize_naver_place_url(url: str):
    if not url:
        return None
    try:
        parts = urlsplit(url)
        query = urlencode(
            [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "timestamp"]
        )
        return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))
    except Exception:
        return re.sub(r"([?&])timestamp=[^&]+&?", r"\1", str(url)).rstrip("?&")


def summarize_reviews(reviews: list[dict]):
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


# ──────────────────────────────────────────────────────────────────
# 3) place_id 로 방문자 리뷰 직접 파싱 (1.py 의 로직과 동일)
# ──────────────────────────────────────────────────────────────────
def fetch_naver_reviews(place_id: str, limit: int = 20):
    headers = {
        "User-Agent": MOBILE_UA,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": f"https://m.place.naver.com/restaurant/{place_id}/home",
    }

    for biz in ("restaurant", "place", "hairshop", "beauty", "hospital", "accommodation", "cafe"):
        url = f"https://m.place.naver.com/{biz}/{place_id}/review/visitor"
        try:
            r = requests.get(url, headers=headers, timeout=15)
        except requests.RequestException:
            continue
        if r.status_code != 200 or "__APOLLO_STATE__" not in r.text:
            continue
        r.encoding = "utf-8"

        idx = r.text.find("__APOLLO_STATE__")
        brace_start = r.text.find("{", idx)
        if brace_start == -1:
            continue
        try:
            state, _ = json.JSONDecoder().raw_decode(r.text, brace_start)
        except json.JSONDecodeError:
            continue

        reviews = _parse_reviews_from_state(state)
        review_snippets = [review["body"] for review in reviews[: min(limit, 20)]]
        if reviews:
            return {
                "provider": "naver",
                "placeId": place_id,
                "placeUrl": canonicalize_naver_place_url(url),
                "source": canonicalize_naver_place_url(url),
                "count": len(reviews[:limit]),
                "reviewCount": len(reviews[:limit]),
                "reviews": reviews[:limit],
                "reviewSummary": summarize_reviews(reviews[:limit]),
                "reviewSnippets": review_snippets,
                "extractionMethod": "static-hydration",
                "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "error": None,
            }

    return {
        "provider": "naver",
        "placeId": place_id,
        "placeUrl": None,
        "source": None,
        "count": 0,
        "reviewCount": 0,
        "reviews": [],
        "reviewSummary": {"pros": None, "cons": None},
        "reviewSnippets": [],
        "extractionMethod": "unavailable",
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "error": "No reviews extracted from Naver Place page",
    }


# ──────────────────────────────────────────────────────────────────
# 3-2) place_id 로 사진 가져오기: 메뉴판 / 가게 사진 / 음식 사진 분류
# ──────────────────────────────────────────────────────────────────
def fetch_naver_photos(place_id: str, store_name: str = "", food_limit: int = 3):
    """
    m.place.naver.com 의 __APOLLO_STATE__ 안에 있는 PlaceDetailTopPhotoItem 들은
    네이버가 이미 title로 앨범을 분류해둔다 (예: "메뉴판", "외부", "내부", "음식·음료",
    또는 구체적인 메뉴 이름). 이 title 을 기준으로 메뉴판/가게사진/음식사진을 가른다.
    title이 없는 경우를 대비해 Menu 객체(이름+가격+이미지)도 음식 사진 후보로 보충한다.
    """
    headers = {
        "User-Agent": MOBILE_UA,
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": f"https://m.place.naver.com/restaurant/{place_id}/home",
    }

    state = None
    for biz in ("restaurant", "place", "hairshop", "beauty", "hospital", "accommodation", "cafe"):
        url = f"https://m.place.naver.com/{biz}/{place_id}/home"
        try:
            r = requests.get(url, headers=headers, timeout=15)
        except requests.RequestException:
            continue
        if r.status_code != 200 or "__APOLLO_STATE__" not in r.text:
            continue
        r.encoding = "utf-8"
        idx = r.text.find("__APOLLO_STATE__")
        brace_start = r.text.find("{", idx)
        if brace_start == -1:
            continue
        try:
            state, _ = json.JSONDecoder().raw_decode(r.text, brace_start)
        except json.JSONDecodeError:
            continue
        break

    if state is None:
        return {"menu_board": None, "store": None, "food": []}

    photos = [v for v in state.values() if isinstance(v, dict) and v.get("__typename") == "PlaceDetailTopPhotoItem"]

    menu_board_titles = ("메뉴판", "메뉴")
    store_titles = ("외부", "내부", store_name)

    menu_board = next((p for p in photos if p.get("title") in menu_board_titles), None)
    store_photo = next(
        (p for p in photos if p.get("title") in store_titles or p.get("type") == "business"),
        None,
    )
    food_photos = [
        p for p in photos
        if p is not menu_board and p is not store_photo
        and p.get("title") not in menu_board_titles
        and p.get("title") not in ("외부", "내부", store_name)
    ]

    # 앨범에 음식 사진이 부족하면 Menu(메뉴 항목)의 이미지로 보충
    if len(food_photos) < food_limit:
        for v in state.values():
            if isinstance(v, dict) and v.get("__typename") == "Menu" and v.get("images"):
                food_photos.append({"title": v.get("name"), "origin": v["images"][0]})
                if len(food_photos) >= food_limit:
                    break

    return {
        "menu_board": menu_board.get("origin") if menu_board else None,
        "main_photo": store_photo.get("origin") if store_photo else None,
        "food": [{"title": p.get("title"), "url": p.get("origin")} for p in food_photos[:food_limit]],
    }


# ──────────────────────────────────────────────────────────────────
# 3-4) 프론트엔드에서 쓸 수 있도록 가게별 결과를 JSON 파일로 저장
# ──────────────────────────────────────────────────────────────────
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "places")


def save_place_data(place_id: str, data: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, f"{place_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


# ──────────────────────────────────────────────────────────────────
# 3-3) 메뉴판 사진을 Vision LLM 에게 읽혀서 메뉴명/가격 추출
# ──────────────────────────────────────────────────────────────────
def extract_menu_from_photo(image_url: str):
    """메뉴판 이미지 URL을 멀티모달 LLM에게 보여주고 메뉴명/가격을 JSON으로 뽑는다."""
    resp = vision_client.chat.completions.create(
        model=VISION_MODEL,
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "이 메뉴판 사진을 읽고 메뉴 이름과 가격을 추출해줘. "
                        '다른 말 없이 JSON 배열로만 답해: [{"name": "메뉴명", "price": "가격"}, ...] '
                        "가격이 안 보이면 price를 null로, 글자를 읽을 수 없으면 빈 배열 []을 반환해."
                    ),
                },
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }],
    )
    text = resp.choices[0].message.content.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return []


def _parse_reviews_from_state(state: dict):
    nick_by_id = {
        k: (v.get("nickname") or v.get("name"))
        for k, v in state.items()
        if isinstance(v, dict) and (v.get("nickname") or v.get("name"))
    }

    def resolve_author(v):
        a = v.get("author")
        if isinstance(a, dict):
            ref = a.get("id") or a.get("__ref")
            if ref and ref in nick_by_id:
                return nick_by_id[ref]
        return v.get("nickname") or v.get("authorName")

    reviews = []
    for v in state.values():
        if not isinstance(v, dict):
            continue
        body = v.get("body")
        if "Review" in v.get("__typename", "") and isinstance(body, str) and body.strip():
            reviews.append({
                "author": resolve_author(v),
                "rating": v.get("rating") or v.get("starRating"),
                "visitedAt": v.get("visited") or v.get("visitDate") or v.get("created"),
                "body": body.strip(),
            })
    return reviews


def run(location: str, sample_count: int):
    print(f"🔎 '{location} 맛집' 검색 중...\n")
    candidates = search_nearby_restaurants(location, count=5)
    if not candidates:
        print("❌ 검색 결과 없음")
        return

    sample = random.sample(candidates, k=min(sample_count, len(candidates)))

    for c in sample:
        print(f"── {c['title']} ({c['category']}) — {c['address']}")
        place_id = resolve_place_id(c["title"], c["address"])
        if not place_id:
            print("   place_id 못 찾음 → 리뷰 스킵\n")
            continue
        print(f"   place_id = {place_id}")

        result = fetch_naver_reviews(place_id)
        print(f"   리뷰 {result['count']}개 수집 (source={result['source']})")
        for rev in result["reviews"][:2]:
            print(f"   - {rev['body'][:60]}...")

        photos = fetch_naver_photos(place_id, store_name=c["title"])
        print(f"   메뉴판: {photos['menu_board'] or '없음'}")
        menu_items = []
        if photos["menu_board"]:
            menu_items = extract_menu_from_photo(photos["menu_board"])
            if menu_items:
                for item in menu_items:
                    print(f"     · {item.get('name')} - {item.get('price') or '가격 미확인'}")
            else:
                print("     · 메뉴판 글자를 읽지 못함")
        print(f"   가게(대표) 사진: {photos['main_photo'] or '없음'}")
        for f in photos["food"]:
            print(f"   음식 사진({f['title']}): {f['url']}")

        saved_path = save_place_data(place_id, {
            "placeId": place_id,
            "name": c["title"],
            "category": c["category"],
            "address": c["address"],
            "mainPhoto": photos["main_photo"],
            "menuBoardPhoto": photos["menu_board"],
            "menuItems": menu_items,
            "foodPhotos": photos["food"],
            "reviews": result["reviews"],
            "reviewSummary": result["reviewSummary"],
            "reviewSnippets": result["reviewSnippets"],
        })
        print(f"   💾 저장: {saved_path}")
        print()


if __name__ == "__main__":
    loc = sys.argv[1] if len(sys.argv) > 1 else "강남역"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    run(loc, n)
