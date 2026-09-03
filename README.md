# Yogoda Backend

Yogoda의 인증, AI 통신 상담, 요금제 가입, 혜택과 리워드, 사용 패턴 분석 및 관리자 기능을 제공하는 Express API 서버입니다.

- 개발 기간: 2026.08.14 - 2026.09.03
- Frontend: [yogoda-frontend](https://github.com/ureca-yogoda/yogoda-frontend)

## 주요 기능

- 카카오, 네이버, 구글 OAuth 인증과 JWT 갱신 및 로그아웃
- Gemini Interactions API 기반 페르소나 분석과 스트리밍 AI 상담
- 대화 맥락, 설문 결과, 현재 요금제 및 후보 데이터를 반영한 추천과 비교
- 요금제 선택부터 본인 확인, 혜택 및 결제 수단 선택까지 이어지는 가입 처리
- 요금제, 혜택, 제휴처, 매장, 출석, 미션, 포인트 및 쿠폰 API
- 구독 서비스와 월별 사용량 리포트, 패턴 변화 기반 AI 재추천
- 알림 저장, 실시간 전송, 읽음 및 삭제 처리
- 상담 퍼널, UI 이벤트, 세션 로그 및 프롬프트 버전 관리
- OpenAPI 3.0 문서와 라우트 문서화 누락 검사

## 기술 스택

| 영역              | 기술                      |
| ----------------- | ------------------------- |
| Runtime           | Node.js, TypeScript 6     |
| API               | Express 5, Zod            |
| Realtime          | Socket.IO                 |
| AI                | Gemini Interactions API   |
| Database          | MongoDB Atlas, Mongoose   |
| Authentication    | OAuth 2.0, JWT            |
| Scheduling        | node-cron                 |
| Documentation     | Swagger UI, swagger-jsdoc |
| Secret management | dotenv, Azure Key Vault   |
| Quality           | ESLint, Prettier, Husky   |

## 시작하기

### 요구 사항

- Node.js 22 이상과 npm
- MongoDB
- 카카오, 네이버, 구글 OAuth 앱
- Gemini API 키와 Interactions API를 지원하는 모델

### 설치 및 실행

```bash
npm install
npm run dev
```

서버는 기본적으로 [http://localhost:8000](http://localhost:8000)에서 실행되며 루트 경로는 Swagger UI로 이동합니다.

프로덕션 실행:

```bash
npm run build
npm run start
```

## 환경 변수

프로젝트 루트에 `.env`를 만들고 아래 값을 설정합니다. `KEY_VAULT_URL`을 지정하면 서버 시작 시 Azure Key Vault의 시크릿을 불러오며, 시크릿 이름의 하이픈은 환경 변수의 언더스코어로 변환됩니다.

```dotenv
PORT=8000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
KEY_VAULT_URL=

JWT_SECRET_KEY=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=yogoda

KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URI=http://localhost:3000/auth/kakao/callback
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
NAVER_MAP_KEY_ID=
NAVER_MAP_KEY_SECRET=
NAVER_REDIRECT_URI=http://localhost:3000/auth/naver/callback
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

AI_API_KEY=
AI_MODEL=
```

`CORS_ORIGIN`은 쉼표로 여러 주소를 지정할 수 있습니다. `AI_API_KEY`와 `AI_MODEL`이 없으면 일반 API 서버는 시작되지만 AI 상담 및 분석 요청은 실패합니다.

## API

Swagger UI: [http://localhost:8000/api-docs](http://localhost:8000/api-docs)

| Prefix               | 기능                                  |
| -------------------- | ------------------------------------- |
| `/api/auth`          | OAuth 로그인, 토큰 갱신, 로그아웃     |
| `/api/persona`       | 설문 기반 AI 페르소나 분석            |
| `/api/chats`         | 상담 세션 조회, 가져오기 및 종료      |
| `/api/plans`         | 요금제 목록, 상세, 비교, 가입 및 변경 |
| `/api/benefits`      | 혜택 목록, 내 주변 혜택과 찜          |
| `/api/stores`        | 직영 매장 검색 및 상세                |
| `/api/missions`      | 사용자 미션 참여와 보상 수령          |
| `/api/rewards`       | 출석, 포인트 상품, 혜택 일정          |
| `/api/coupons`       | 보유 쿠폰 조회와 사용                 |
| `/api/subscriptions` | 구독 서비스 관리                      |
| `/api/usage`         | 사용량 리포트, 재추천과 시연 시나리오 |
| `/api/notifications` | 알림 조회, 읽음, 전체 읽음과 삭제     |
| `/api/admin`         | 대시보드, 상담 로그와 UI 분석         |
| `/api/admin/prompts` | 프롬프트 테스트, 배포와 버전 관리     |

새 라우트를 추가한 뒤에는 `npm run swagger:audit`으로 실제 Express 라우트와 OpenAPI 문서 경로가 일치하는지 검사합니다.

## 실시간 통신

### `/chat`

JWT는 선택 사항이며 비로그인 사용자도 임시 상담 세션을 시작할 수 있습니다. 주요 클라이언트 이벤트는 `message`, `stop`, `signup_entry`, `conversion_event`, `ui_event`, `consent`입니다. 서버는 `session_created`, `thinking`, `chunk`, `plans`, `quickReplies`, `signup`, `signup_complete`, `done`, `error` 등을 전송합니다.

### `/notifications`

연결 시 `auth.token`에 JWT가 필요합니다. 서버는 사용자별 room으로 접속을 묶고 새 알림을 `notification` 이벤트로 전송합니다. 접속 중이 아니어도 알림은 MongoDB에 저장되어 다음 조회에서 확인할 수 있습니다.

## 배치 알림

모든 일정은 서버 환경과 관계없이 `Asia/Seoul` 시간대를 사용합니다.

| 작업                    | 실행 시각  |
| ----------------------- | ---------- |
| 만료 임박 쿠폰 알림     | 매일 09:00 |
| 미출석 사용자 리마인드  | 매일 20:00 |
| 미완료 AI 상담 리마인드 | 30분마다   |

중복 알림 생성은 `dedupe_key` 고유 인덱스로 방지합니다. 다중 인스턴스 환경에서는 각 인스턴스가 스케줄러를 등록한다는 점을 고려해야 합니다.

## 데이터 준비

로컬 데이터가 비어 있다면 필요한 seed를 실행합니다.

```bash
npm run seed:uplus
npm run seed:yogoda-missions
npm run seed:benefit-schedule
npm run seed:benefit-locations
npm run seed:stores
npm run seed:point-products
```

`migrate:*`와 `cleanup:*` 명령은 기존 데이터 구조 변경 또는 정리를 수행합니다. 대상 DB와 백업 여부를 확인한 뒤 실행해야 합니다.

## 실행 명령

| 명령                    | 설명                            |
| ----------------------- | ------------------------------- |
| `npm run dev`           | tsx watch 모드로 개발 서버 실행 |
| `npm run build`         | TypeScript를 `dist`로 컴파일    |
| `npm run start`         | 빌드된 서버 실행                |
| `npm run lint`          | 전체 소스 ESLint 검사           |
| `npm run format`        | Prettier로 파일 정리            |
| `npm run format:check`  | 포맷 변경 없이 검사             |
| `npm run swagger:audit` | 라우트와 OpenAPI 문서 범위 비교 |

## 프로젝트 구조

```text
src/
├─ api/
│  ├─ controllers/  # HTTP 요청 및 응답 처리
│  ├─ docs/         # 공통 OpenAPI schema
│  ├─ routes/       # REST 라우트와 OpenAPI 주석
│  └─ websocket/    # 채팅 및 알림 Socket.IO 처리
├─ constants/       # 도메인 상수
├─ core/            # 환경 설정, DB, 보안, 미들웨어, 스케줄러
├─ models/          # Mongoose 모델
├─ schemas/         # 요청 데이터 검증 schema
├─ seeds/           # 초기 데이터와 마이그레이션 스크립트
├─ services/        # 도메인 및 외부 API 로직
├─ types/           # 공통 TypeScript 타입
├─ utils/           # 공통 유틸리티
└─ server.ts        # Express 및 Socket.IO 진입점
```

요청 처리는 `route -> controller -> service -> model` 흐름을 따릅니다. 공통 인증, 관리자 권한 및 오류 처리는 `src/core/middlewares`에서 관리합니다.

## 팀

| 이름   | GitHub                                      | 역할               |
| ------ | ------------------------------------------- | ------------------ |
| 박해준 | [jun6390](https://github.com/jun6390)       | Frontend / Backend |
| 고유정 | [daenggg](https://github.com/daenggg)       | Frontend / Backend |
| 서지현 | [jhwest-dev](https://github.com/jhwest-dev) | Frontend / Backend |
