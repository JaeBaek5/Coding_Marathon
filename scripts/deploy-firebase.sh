#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== 1/3 클라이언트 빌드 ==="
npm run build:client

echo ""
echo "=== 2/3 Cloud Run API 배포 ==="
bash "$ROOT_DIR/scripts/deploy-cloud-run.sh"

echo ""
echo "=== 3/3 Firebase Hosting 배포 ==="
bash "$ROOT_DIR/scripts/deploy-firebase-hosting.sh"

echo ""
echo "배포 완료."
echo "- Naver Cloud 콘솔에 https://mumuk-dodak-01.web.app (또는 .firebaseapp.com) 도메인을 등록하세요."
echo "- 헬스: https://mumuk-dodak-01.web.app/api/health"
