# Deployment Patterns

CI/CD, Docker, 환경 분리(dev/stg/prd), 헬스체크, 롤백 패턴.

## 환경 구조 (dev / stg / prd)

```
dev (개발)          stg (스테이징)        prd (프로덕션)
─────────          ──────────          ──────────
자동 배포            수동 트리거           승인 후 배포
개발 DB              QA DB               프로덕션 DB
디버그 로깅           표준 로깅            최소 로깅 + 모니터링
.env.dev            .env.stg            .env.prd
```

## Docker 구성

### NestJS Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### docker-compose.yml (환경별)
```yaml
# docker-compose.yml (공통)
services:
  api:
    build: ./server
    ports: ["3000:3000"]
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

```yaml
# docker-compose.dev.yml (개발 오버라이드)
services:
  api:
    env_file: .env.dev
    volumes:
      - ./server/src:/app/src  # 핫 리로드
    command: npm run start:dev

# docker-compose.stg.yml (스테이징 오버라이드)
services:
  api:
    env_file: .env.stg
    command: node dist/main.js

# docker-compose.prd.yml (프로덕션 오버라이드)
services:
  api:
    env_file: .env.prd
    command: node dist/main.js
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 512M
```

## CI/CD (GitHub Actions — 환경별)

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [dev, stg]
  pull_request:
    branches: [dev, stg, prd]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd server && npm ci && npm test
      - uses: subosito/flutter-action@v2
      - run: flutter test

  deploy-dev:
    needs: test
    if: github.ref == 'refs/heads/dev'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Auto deploy to dev environment"
      # dev 환경 자동 배포

  deploy-stg:
    needs: test
    if: github.ref == 'refs/heads/stg'
    runs-on: ubuntu-latest
    environment: staging  # 수동 승인 가능
    steps:
      - run: echo "Deploy to staging environment"
      # stg 환경 배포

  deploy-prd:
    needs: test
    if: github.ref == 'refs/heads/prd'
    runs-on: ubuntu-latest
    environment: production  # 필수 승인
    steps:
      - run: echo "Deploy to production environment"
      # prd 환경 배포
```

## 환경별 설정 관리

```typescript
// NestJS ConfigModule — 환경별 로딩
ConfigModule.forRoot({
  envFilePath: `.env.${process.env.NODE_ENV || 'dev'}`,
  isGlobal: true,
});
```

```dart
// Flutter — 환경별 flavor
// --dart-define=ENV=dev|stg|prd
const env = String.fromEnvironment('ENV', defaultValue: 'dev');
```

## 헬스체크 엔드포인트

```typescript
@Get('health')
async health() {
  const dbOk = await this.prisma.$queryRaw`SELECT 1`;
  return {
    status: 'ok',
    env: process.env.NODE_ENV,
    db: !!dbOk,
    timestamp: new Date(),
  };
}
```

## DB 마이그레이션 (환경별)

```bash
# dev — 마이그레이션 생성 + 적용
DATABASE_URL=$DEV_DB npx prisma migrate dev --name add_posts

# stg — 마이그레이션 적용만
DATABASE_URL=$STG_DB npx prisma migrate deploy

# prd — 마이그레이션 적용만 (CI/CD에서)
DATABASE_URL=$PRD_DB npx prisma migrate deploy
```

## Flutter OTA (Shorebird)

```bash
shorebird patch --release-version=1.0.0                    # 즉시 배포
shorebird patch --release-version=1.0.0 --percentage=10    # 카나리 (10%)
shorebird patch rollback --release-version=1.0.0            # 롤백
```

## 롤백 전략

| 대상 | 롤백 방법 |
|------|----------|
| Flutter Dart 코드 | Shorebird OTA rollback |
| Flutter 네이티브 | 스토어 핫픽스 제출 |
| NestJS API | 이전 Docker 이미지 재배포 |
| DB 마이그레이션 | 역방향 마이그레이션 SQL (사전 준비) |
| CMS | 이전 빌드 재배포 |
