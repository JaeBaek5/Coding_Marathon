# Firebase + Cloud Run 임시 배포 (dodak-01)

Mumuk 프론트는 **Firebase Hosting**, API는 **Cloud Run**에 올리고 Hosting이 `/api/**`를 Cloud Run으로 프록시합니다.

## 사전 준비

1. [Firebase 콘솔](https://console.firebase.google.com/u/0/project/dodak-01/overview?hl=ko) · `dodak-01` 프로젝트 접근 권한
2. CLI 설치 및 로그인

```bash
npm i -g firebase-tools
# Google Cloud SDK (gcloud) 설치 후:
gcloud auth login
gcloud auth application-default login
firebase login
```

3. Cloud Run API 활성화 (최초 1회)

```bash
gcloud config set project dodak-01
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

4. 환경 변수 파일 (API 키)

```bash
cp deploy/cloud-run.env.example deploy/cloud-run.env
# deploy/cloud-run.env 편집 — 이 파일은 git에 올리지 않음
```

## 한 번에 배포

```bash
npm run deploy:firebase
```

순서: `client` 빌드 → Cloud Run `mumuk-api` → Hosting `mumuk-dodak-01`

## 단계별 배포

```bash
npm run build:client
npm run deploy:cloud-run
npm run deploy:hosting
```

## 배포 후 URL

| 항목 | URL |
|------|-----|
| 앱 | `https://mumuk-dodak-01.web.app` |
| 헬스 | `https://mumuk-dodak-01.web.app/api/health` |

사이트 이름은 `FIREBASE_HOSTING_SITE` 환경 변수로 변경 가능합니다.

## Naver Maps

배포 URL을 Naver Cloud Platform Maps 앱 설정의 **Web 서비스 URL**에 추가해야 지도·경로 API가 동작합니다.

## 도닥 앱과 분리

기본 Hosting 사이트가 아닌 **별도 사이트** `mumuk-dodak-01`을 사용해 도닥 본 서비스와 충돌하지 않습니다.

## 문제 해결

### `PERMISSION_DENIED` / `does not have permission to access projects instance [dodak-01]`

Firebase 콘솔에서 프로젝트가 보여도, **GCP IAM 권한**이 없으면 Cloud Run 배포는 실패합니다. (로그의 `run.services.get` 거부가 이 경우입니다.)

**dodak-01 소유자(또는 관리자)**에게 `ojaebaek@gmail.com`에 아래를 요청하세요.

1. [Google Cloud Console IAM](https://console.cloud.google.com/iam-admin/iam?project=dodak-01)에서 역할 추가:
   - `Cloud Run 관리자` (`roles/run.admin`)
   - `Cloud Build 편집자` (`roles/cloudbuild.builds.editor`)
   - `Artifact Registry 작성자` (`roles/artifactregistry.writer`) — **`gcloud run deploy --source` 필수**
   - `서비스 사용량 관리자` (`roles/serviceusage.serviceUsageAdmin`) — API 활성화용  
     또는 소유자가 한 번만 API 활성화:
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project=dodak-01
   ```
   - Firebase Hosting 배포용: `Firebase Hosting 관리자` (`roles/firebasehosting.admin`)

2. Firebase 요금제가 **Blaze(종량제)** 인지 확인 — Hosting → Cloud Run rewrite는 Blaze가 필요합니다.

3. 권한 부여 후 로컬에서:
   ```bash
   gcloud auth application-default set-quota-project dodak-01
   npm run deploy:firebase
   ```

### `artifactregistry.repositories.get` / `cloud-run-source-deploy`

Cloud Run 목록은 보이는데 배포가 Artifact Registry에서 막히면, **Run 권한만 있고 Registry 권한이 없는 상태**입니다.

소유자에게 추가 요청:
- 프로젝트 IAM: `Artifact Registry 작성자` (`roles/artifactregistry.writer`)
- 또는 저장소 `asia-northeast3/cloud-run-source-deploy`에 대한 `Artifact Registry 저장소 관리자`

권한 반영 후 1~2분 기다렸다가 `npm run deploy:cloud-run` 재실행.

### 기타

- `/api/*` 404: Cloud Run `mumuk-api`가 `asia-northeast3`에 배포됐는지, `firebase.json`의 `serviceId`/`region` 확인
- LLM/검색 실패: `deploy/cloud-run.env` 값 확인 후 `npm run deploy:cloud-run` 재실행
- Hosting만 다시: `npm run deploy:hosting`
