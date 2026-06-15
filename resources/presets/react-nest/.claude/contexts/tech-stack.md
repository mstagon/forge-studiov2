# Tech Stack — React + NestJS

## Frontend (client/)
| 영역 | 선택 | 비고 |
|------|------|------|
| Framework | React 19 + Vite 6 | TypeScript strict |
| 라우팅 | TanStack Router (또는 react-router 7) | 파일/코드 기반 택1, 일관 유지 |
| 서버 상태 | TanStack Query v5 | fetch 직접 호출 금지 — query/mutation hook |
| 클라 상태 | Zustand | 전역 최소화, 서버 상태는 Query 가 소유 |
| 스타일 | Tailwind CSS + shadcn/ui | inline style 금지 |
| 폼/검증 | react-hook-form + zod | 서버 DTO 와 같은 zod 스키마 공유 가능 |
| HTTP | fetch wrapper / ky | 인터셉터(401 refresh) 한 곳에 |
| 테스트 | Vitest + Testing Library + Playwright(E2E) | 커버리지 80%+ |

## Backend (server/)
| 영역 | 선택 | 비고 |
|------|------|------|
| Framework | NestJS 11 | strict TS |
| ORM | Prisma + PostgreSQL | migrate 전용, db push 금지 |
| 인증 | Passport + JWT (RS256) | access 15m / refresh 30d |
| 검증 | class-validator + class-transformer | 모든 DTO |
| 문서 | Swagger | contracts/ 가 원본, swagger 는 산출물 |
| 테스트 | Jest + supertest | |

## 빌드/검증
```bash
# client
cd client && npm run dev          # Vite dev (tmux)
cd client && npm run build && npx tsc --noEmit && npm test && npx playwright test
# server
cd server && npm run start:dev
cd server && npm run build && npm run lint && npm test && npm run test:e2e
npx prisma validate && npx prisma migrate dev
```
