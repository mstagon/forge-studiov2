# Tech Stack

## 앱 (Flutter)

- Flutter 3.x+ / Dart 3.x+
- **Riverpod 2.x** (코드젠, `@riverpod`)
- **go_router**, **dio + retrofit**, **freezed + json_serializable**
- **flutter_secure_storage** (JWT)

## 서버 (NestJS)

- **NestJS** (TypeScript) — 모듈 기반
- **Prisma** — PostgreSQL ORM (migrate 기반)
- **Passport.js + JWT**
- **Bull MQ + Redis**

## DB

- **PostgreSQL** (Supabase Managed — DB 호스팅 전용)

## CMS

- **Next.js 15+** (App Router) + Prisma + shadcn/ui

## 환경 (dev / stg / prd)

- `dev` — 개발. 자동 배포. 디버그 로깅. `.env.dev`
- `stg` — 스테이징/QA. 수동 트리거 배포. 표준 로깅. `.env.stg`
- `prd` — 프로덕션. 승인 후 배포. 최소 로깅 + 모니터링. `.env.prd`
- 브랜치: `feat/*` → `dev` → `stg` → `prd`
- DB: 환경별 독립 (dev DB / stg DB / prd DB)

## 빌드 & 검증 명령어

```bash
# Flutter
flutter pub get && dart run build_runner build -d && flutter analyze && flutter test

# NestJS
cd server && npm install && npm run build && npm run test && npm run lint

# Prisma
npx prisma validate && npx prisma migrate dev && npx prisma generate

# Next.js CMS
cd cms && npm install && npm run build && npm run lint
```
