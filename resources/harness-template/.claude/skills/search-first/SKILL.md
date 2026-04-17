# Search First

코딩 전 반드시 리서치하는 워크플로우. GateGuard 훅과 시너지.

## 원칙

**코드를 작성하기 전에 항상 먼저 조사한다.**

## 체크리스트

### 파일 수정 전
- [ ] 이 파일을 import하는 곳 확인 (`Grep`)
- [ ] public API 시그니처 파악 (`Read`)
- [ ] 유저 요청과의 관련성 확인
- [ ] 기존 유사 구현이 있는지 검색 (`Glob` + `Grep`)

### 새 기능 구현 전
- [ ] 기존 코드에 비슷한 패턴이 있는지 검색
- [ ] 사용할 패키지 API를 context7/docs-lookup으로 확인
- [ ] 관련 스펙/PRD 문서 확인 (`docs/specs/`, `docs/prd/`)
- [ ] lessons-learned.md에 관련 교훈이 있는지 확인

### API 작업 전
- [ ] NestJS DTO 현재 구조 확인
- [ ] Flutter DTO 현재 구조 확인
- [ ] 두 DTO 간 일치 여부 확인
- [ ] Prisma 스키마와의 관계 확인

## GateGuard 연계

`gateguard.sh`가 PreToolUse Write/Edit에서 첫 편집을 감지하면 경고를 출력한다.
이 경고가 뜨면 위 체크리스트를 수행했는지 자체 점검.

## 규칙
- 추측으로 코드를 작성하지 마라
- "아마 이렇게 되겠지"는 금지
- 확인되지 않은 API 시그니처를 사용하지 마라
- 공식 문서에서 확인 후 작성
