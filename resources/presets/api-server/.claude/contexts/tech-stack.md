# Tech Stack — API Server

| 영역 | 선택 | 비고 |
|------|------|------|
| Framework | NestJS 11 | strict TypeScript |
| ORM | Prisma + PostgreSQL | migrate 전용, db push 금지 |
| 인증 | Passport + JWT (RS256) | access 15m / refresh 30d |
| 문서 | Swagger (@nestjs/swagger) | contracts/ 가 원본, swagger 는 산출물 |
| 검증 | class-validator + class-transformer | 모든 DTO |
| 테스트 | Jest + supertest | 커버리지 80%+ |
| 로깅 | pino | 구조화 JSON |

## 빌드/검증 명령
```bash
npm run start:dev    # 개발 서버 (tmux 로)
npm run build && npm run lint
npm test && npm run test:e2e
npx prisma validate && npx prisma migrate dev
```
