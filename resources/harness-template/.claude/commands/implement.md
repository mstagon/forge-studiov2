"$ARGUMENTS" 피처를 자율 오케스트레이션으로 구현한다.

## 자동 실행 (유저 개입 불필요)

### 0. 분석 + 스택 판별 (자동)
CLAUDE.md 자율 오케스트레이션 규칙을 따른다. 변경 대상 스택을 파악하고, 의존성 체인을 결정:
- DB 변경 필요? → prisma-data → nestjs-backend → Flutter DTO sync
- API만 추가? → nestjs-backend → api-sync → test-writer
- 앱 UI만? → pencil 확인 → flutter-ui → riverpod-logic
- CMS만? → nextjs-cms (독립)
- 전체? → full-cycle 파이프라인

### 1. 사전 확인 (자동)
1. pencil 디자인(.pen 파일) 있으면 pencil MCP로 디자인 먼저 확인
2. `docs/specs/$ARGUMENTS-spec.md` 있으면 스펙 기반 구현
3. `docs/api/` 관련 API 계약 확인
4. 관련 스킬 자동 적용 (Skill Routing 매칭)

### 2. 에이전트 파견 (자동)

#### Chain A: DB → Backend → Frontend (의존성)
순차 체이닝: prisma-data → nestjs-backend → flutter-ui + riverpod-logic → test-writer

#### Chain B: Backend → Frontend (DB 변경 없음)
순차: nestjs-backend → api-sync → flutter-ui → test-writer

#### Chain C: Frontend Only
flutter-ui (pencil 기반) → riverpod-logic → test-writer

#### Chain D: CMS Only
nextjs-cms 독립 실행

독립 작업은 **팀 병렬 파견** (Agent run_in_background + worktree isolation)

### 3. 자동 검증 (/verify 자동 실행)
구현 완료 → 변경 스택별:
- Flutter: flutter analyze + flutter test
- NestJS: npm run lint + npm test
- Prisma: npx prisma validate
- Cross-Stack: DTO 동기화 확인
- FAIL → loop-operator 자동 수정 (최대 5회)

### 4. 결과 보고
검증 PASS → 결과 요약 + "리뷰 진행할까요?"

## 규칙
- CLAUDE.md 자율 오케스트레이션 순서 규칙 준수
- pencil 디자인 있으면 디자인 기준 UI 구현
- API 변경 시 docs/api/ 즉시 갱신
- NestJS DTO 변경 → Flutter DTO 동기화 필수
