# Architecture Rules — Flutter App (Clean Architecture)

## 레이어 (단방향: presentation → domain → data)
- **domain**: 순수 Dart — Flutter SDK / supabase import 금지. entity + repository 추상 + usecase
- **data**: repository 구현 + remote (supabase/외부 API) + local (drift). DTO ↔ entity 변환 필수
- **presentation**: 화면 + Riverpod 컨트롤러. data 레이어 직접 import 금지 (usecase 경유)
- **core**: 횡단 (theme/logger/network 설정/Result 타입)

## BaaS (Supabase) 사용 시
- supabase client 접근은 data/remote 에만 — 위젯/컨트롤러에서 직접 호출 금지
- 테이블/정책 변경은 `contracts/<domain>.contract.md` 에 먼저 기록 (RLS 포함)
- 인증 상태는 Riverpod provider 로 단일 노출 (authStateProvider)

## 오프라인 우선
- 읽기: local(drift) 캐시 → remote 동기화. 쓰기: 큐잉 후 재시도
- 네트워크 의존 usecase 는 Result 타입으로 실패를 값으로 표현 (error-handling 스킬)
