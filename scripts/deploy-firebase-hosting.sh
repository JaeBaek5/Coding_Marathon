#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_ID="${FIREBASE_PROJECT:-dodak-01}"
HOSTING_SITE="${FIREBASE_HOSTING_SITE:-mumuk-dodak-01}"
HOSTING_TARGET="${FIREBASE_HOSTING_TARGET:-mumuk}"

if ! command -v firebase >/dev/null 2>&1; then
  echo "firebase CLI가 필요합니다: npm i -g firebase-tools"
  exit 1
fi

if [[ ! -d client/dist ]]; then
  echo "client/dist 없음 — 프론트 빌드 중..."
  npm run build:client
fi

firebase use "$PROJECT_ID"

if ! firebase hosting:sites:list --project "$PROJECT_ID" 2>/dev/null | grep -q "$HOSTING_SITE"; then
  echo "Hosting 사이트 생성: $HOSTING_SITE"
  firebase hosting:sites:create "$HOSTING_SITE" --project "$PROJECT_ID" --non-interactive
fi

echo "Firebase Hosting 배포 (target=$HOSTING_TARGET, site=$HOSTING_SITE)"
firebase deploy --only "hosting:$HOSTING_TARGET" --project "$PROJECT_ID" --non-interactive

echo ""
echo "접속 URL (예시): https://${HOSTING_SITE}.web.app"
