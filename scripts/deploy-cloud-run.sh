#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_ID="${FIREBASE_PROJECT:-dodak-01}"
REGION="${CLOUD_RUN_REGION:-asia-northeast3}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-mumuk-api}"
ENV_FILE="${CLOUD_RUN_ENV_FILE:-deploy/cloud-run.env}"

if [[ ! -f "$ENV_FILE" && -f server/.env ]]; then
  echo "deploy/cloud-run.env 없음 — server/.env 사용"
  ENV_FILE="server/.env"
fi

if [[ -f "$ENV_FILE" && -f server/.env && "$ENV_FILE" != "server/.env" ]]; then
  if ! grep -q '^NAVER_CLIENT_ID=.\+' "$ENV_FILE" 2>/dev/null; then
    echo "deploy/cloud-run.env 에 NAVER 키 없음 — server/.env 사용"
    ENV_FILE="server/.env"
  fi
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI가 필요합니다: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

gcloud config set project "$PROJECT_ID" --quiet >/dev/null

if ! gcloud run services list --region "$REGION" --project "$PROJECT_ID" --limit 1 >/dev/null 2>&1; then
  echo "오류: $PROJECT_ID 에 Cloud Run 권한이 없습니다."
  echo "dodak-01 소유자에게 IAM 역할(Cloud Run 관리자 등)을 요청하세요."
  echo "자세히: deploy/README.ko.md 의 PERMISSION_DENIED 섹션"
  exit 1
fi

ARTIFACT_REPO="cloud-run-source-deploy"
if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" \
  --location="$REGION" \
  --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "Artifact Registry 저장소 생성: $ARTIFACT_REPO ($REGION)"
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --description="Cloud Run source deploy" \
    --quiet
fi

DEPLOY_ARGS=(
  run deploy "$SERVICE_NAME"
  --source .
  --region "$REGION"
  --platform managed
  --allow-unauthenticated
  --port 8080
  --memory 1Gi
  --cpu 1
  --timeout 300
  --min-instances 0
  --max-instances 3
  --quiet
)

filter_env_for_cloud_run() {
  local src="$1"
  local dst="$2"
  node --input-type=module - "$src" "$dst" <<'EOF'
import fs from 'node:fs';
import dotenv from 'dotenv';

const [src, dst] = process.argv.slice(2);
const skip = new Set(['PORT', 'K_SERVICE', 'K_REVISION', 'K_CONFIGURATION']);
const env = dotenv.parse(fs.readFileSync(src));
const lines = [];

for (const [key, value] of Object.entries(env)) {
  if (skip.has(key) || value === undefined || value === '') {
    continue;
  }
  lines.push(`${key}: ${JSON.stringify(String(value))}`);
}

fs.writeFileSync(dst, `${lines.join('\n')}\n`);
EOF
}

FILTERED_ENV_FILE=""
if [[ -f "$ENV_FILE" ]]; then
  echo "환경 변수 파일 사용: $ENV_FILE"
  FILTERED_ENV_FILE="$(mktemp)"
  filter_env_for_cloud_run "$ENV_FILE" "$FILTERED_ENV_FILE"
  DEPLOY_ARGS+=(--env-vars-file "$FILTERED_ENV_FILE")
  trap 'rm -f "$FILTERED_ENV_FILE"' EXIT
else
  echo "경고: 환경 변수 파일 없음 — API 키 없이 배포됩니다 (폴백/제한 모드)."
  DEPLOY_ARGS+=(--set-env-vars "NODE_ENV=production")
fi

echo "Cloud Run 배포: $SERVICE_NAME ($PROJECT_ID / $REGION)"
yes | gcloud "${DEPLOY_ARGS[@]}"

echo ""
echo "헬스 체크:"
gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)'
