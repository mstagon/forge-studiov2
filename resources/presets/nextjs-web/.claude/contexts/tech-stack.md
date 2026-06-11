# Tech Stack — Next.js Web

| 영역 | 선택 | 비고 |
|------|------|------|
| Framework | Next.js 15 (App Router) | Server Components 기본 |
| ORM | Prisma + PostgreSQL | `prisma migrate dev` 전용 |
| 스타일 | Tailwind CSS + shadcn/ui | inline style 금지 |
| 인증 | NextAuth.js (Auth.js v5) | 미들웨어 + 세션 |
| 검증 | zod (Server Actions 필수) | 클라 검증은 UX 용 |
| 테스트 | Vitest + Playwright (E2E) | 커버리지 80%+ |
| 배포 | Vercel | preview = PR 단위 |

## 빌드/검증 명령
```bash
npm run dev          # 개발 서버 (tmux 로)
npm run build        # 프로덕션 빌드 = 핵심 검증
npm run lint && npx tsc --noEmit
npx prisma validate && npx prisma migrate dev
npm test             # vitest
npx playwright test  # E2E
```
