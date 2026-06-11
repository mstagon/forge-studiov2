# Architecture Rules — Next.js Web

## App Router 원칙
- Server Components 기본 — `'use client'` 는 인터랙션 필요한 leaf 만
- 데이터 페칭은 서버에서 (RSC 직접 또는 Route Handler) — 클라 fetch 최소화
- 뮤테이션은 Server Actions + zod 검증 + revalidatePath/Tag
- Route Handler 는 외부 공개 API (webhook, 모바일 클라이언트) 전용

## 레이어
```
app/        → 라우팅 + 페이지 조립 (얇게)
components/ → 표현 (서버/클라 컴포넌트 분리 명확히)
lib/        → 비즈니스 로직 + prisma 접근 (여기만 DB 접근)
contracts/  → Server Action 입출력 계약 (contract-first)
```
- 페이지/컴포넌트에서 prisma 직접 호출 금지 → lib/ 의 함수 경유
- 캐싱 전략 명시: fetch cache / unstable_cache / revalidate 의도 주석

## Prisma
- schema.prisma 가 단일 소스. `db push` 금지, migrate 전용
- 쿼리는 select 명시 (over-fetch 금지), N+1 은 include 로 해소

## 보안
- Server Actions 마다 세션/권한 재검사 (lib/auth 의 가드 헬퍼 경유)
- dangerouslySetInnerHTML 금지, 출력 이스케이프 기본
