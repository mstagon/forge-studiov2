# Architecture Rules — React + NestJS

## Frontend (client/) — feature-sliced
```
src/features/<feature>/   → components + hooks(useXQuery/useXMutation) + api + types
src/shared/               → 재사용 UI(shadcn) / lib / api client(인터셉터)
src/app/                  → 라우팅 + 전역 provider(QueryClient 등)
```
- **서버 상태는 TanStack Query 가 단일 소유** — useEffect+fetch 로 수동 패칭 금지.
  컴포넌트는 useXQuery hook 만 본다. 캐시 키 컨벤션 통일 (`['feature', id]`).
- 뮤테이션은 useMutation + onSuccess invalidate. 낙관적 업데이트는 명시적으로.
- 클라 전역 상태(Zustand)는 UI 상태만 (모달/토글/필터). 서버 데이터 복제 금지.
- API 호출은 features/<f>/api 에 격리 — 컴포넌트가 fetch 직접 호출 금지.
- 타입은 contracts/ 계약 기준. 서버 응답 추측 금지.

## Backend (server/) — NestJS modular
- Controller(얇게) → Service(로직) → Prisma(데이터). Controller 에서 Prisma 직접 금지.
- 모든 보호 엔드포인트 JwtAuthGuard + ownership 검사 (IDOR 방지).
- Global Exception Filter 로 에러 통일 (스택 트레이스 노출 금지).
- DTO 는 class-validator. 응답 형태는 contracts/ 와 일치.

## Cross-stack (contract-first)
- `contracts/<domain>.contract.md` 가 원본. server DTO + client 타입 둘 다 따른다.
- JSON key camelCase 통일. enum 값 목록 계약에 명시.
- 계약 변경은 메인 세션 소유 — 멤버는 read-only, 변경 필요 시 inbox 요청.
