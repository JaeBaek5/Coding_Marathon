"""
무먹 POC 루프 검증 — 실제 API로 전체 파이프라인을 N회 반복 실행하고 결과를 검증.
Streamlit 없이 헤드리스로 동작 (app.py 의 함수 재사용).

실행: python poc/loop_test.py [반복횟수]
"""
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔 이모지 출력
except Exception:  # noqa: BLE001
    pass

import app

# 검증 좌표 세트 (실제 도심 좌표 — Overpass 식당 다수 존재)
LOCATIONS = [
    {"name": "서울시청", "lat": 37.5665, "lng": 126.9780},
    {"name": "강남역", "lat": 37.4979, "lng": 127.0276},
    {"name": "부산서면", "lat": 35.1577, "lng": 129.0594},
]


def verify_result(results, transport):
    """결과가 '완벽히 작동'했는지 단언 검사."""
    assert results, "결과가 비어 있음"
    for i, c in enumerate(results, 1):
        assert c.get("name"), f"#{i} 이름 없음"
        assert c["one_way_min"] >= 1, f"#{i} 경로 시간 비정상: {c['one_way_min']}"
        assert c["total_expected_min"] >= 1, f"#{i} 총 시간 비정상"
        assert c.get("reason"), f"#{i} 추천 이유 없음"
        if transport == "drive":
            assert c["route"]["provider"] == "naver-driving", f"#{i} 차량인데 naver 경로 아님"
            assert c["route"]["distance_m"] > 0, f"#{i} 거리 0"
    return True


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else len(LOCATIONS)
    source = sys.argv[2] if len(sys.argv) > 2 else "naver"  # naver | overpass
    transport = "drive"  # Naver 실호출 경로를 확실히 태움
    passed, failed = 0, 0
    print(f"=== 무먹 POC 루프 검증 시작 (source={source}, transport={transport}, rounds={rounds}) ===\n")

    for i in range(rounds):
        loc_def = LOCATIONS[i % len(LOCATIONS)]
        loc = {"lat": loc_def["lat"], "lng": loc_def["lng"], "source": "test", "label": loc_def["name"]}
        app.clear_logs()
        t0 = time.time()
        tag = f"[{i+1}/{rounds}] {loc_def['name']}"
        try:
            results = app.run_pipeline(
                loc, mode="normal", transport=transport,
                budget_minutes=120, top_n=3, use_llm=False, source=source, max_route_calls=4,
            )
            verify_result(results, transport)
            dtms = int((time.time() - t0) * 1000)
            top = results[0]
            print(f"✅ PASS {tag} — {len(results)}건, 1위='{top['name']}' "
                  f"편도{top['one_way_min']}분/{top['route']['distance_m']}m ({dtms}ms)")
            passed += 1
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"❌ FAIL {tag} — {e}")
            for log_e in app._logs()[-6:]:
                print(f"      {log_e['t']} [{log_e['stage']}] {log_e['message']}")
        time.sleep(1.5)  # 공개 Overpass 서버 예의상 간격

    print(f"\n=== 결과: PASS {passed} / FAIL {failed} (총 {rounds}) ===")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
