"$ARGUMENTS" 피처의 전체 개발 사이클을 파이프라인으로 실행한다.

## 파이프라인 (8단계)

각 단계 완료 시 결과를 요약하고, 🚦 GATE 단계에서는 유저 확인을 받는다.

### Stage 1: PLAN (아키텍처)
→ **tech-architect** 에이전트 위임
- 기존 코드베이스 분석
- 영향 범위 파악 (어떤 스택이 변경되는지)
- 구현 계획 + 의존성 순서 도출
- Output: 아키텍처 설계 문서

### 🚦 GATE: 유저 확인
→ 설계 리뷰. 수정 요청 있으면 Stage 1 반복. 없으면 진행.

### Stage 2: SCHEMA (DB 변경이 있는 경우)
→ **prisma-data** 에이전트 위임
- `prisma/schema.prisma` 수정
- `npx prisma migrate dev --name {migration}`
- `npx prisma generate`

### Stage 3: BACKEND (API)
→ **nestjs-backend** 에이전트 위임
- DTO → Module → Service → Controller
- Swagger 데코레이터
- Jest 유닛 테스트

### Stage 4: FRONTEND (앱)
→ **flutter-ui** + **riverpod-logic** 에이전트 순차 위임
1. pencil 디자인 확인 (있으면)
2. Entity/DTO (freezed) → build_runner
3. Repository + Retrofit 클라이언트
4. Riverpod Provider/Controller
5. UI 위젯 + go_router 라우트

### Stage 5: CMS (어드민 변경이 있는 경우)
→ **nextjs-cms** 에이전트 위임
- Server Component 페이지
- Server Action
- Prisma 쿼리

### Stage 6: TEST
→ **test-writer** 에이전트 위임
- 각 스택별 테스트 작성/실행
- Flutter: `flutter test`
- NestJS: `npm test`

### Stage 7: SYNC (Cross-Stack 검증)
→ API 계약 동기화 검증
- NestJS DTO ↔ Flutter DTO 필드 대조
- Prisma schema ↔ 코드 정합성
- `docs/api/` 문서 갱신

### Stage 8: REVIEW (검수)
→ **code-reviewer** + **security-auditor** + **spec-verifier** 병렬 위임
- 3개 에이전트 결과 취합
- Critical 있으면 → 자동 수정 제안 + 해당 Stage로 롤백
- PASS면 → `/pre-commit` 제안

## 스킵 규칙

- DB 변경 없으면 Stage 2 스킵
- 서버 변경 없으면 Stage 3 스킵
- 앱 변경 없으면 Stage 4 스킵
- CMS 변경 없으면 Stage 5 스킵
- Stage 1에서 영향 스택을 판별하여 자동 스킵

## 결과 보고

```
## 파이프라인 결과: $ARGUMENTS

| Stage | 상태 | 요약 |
|-------|------|------|
| 1. PLAN | ✅ | ... |
| 2. SCHEMA | ⏭️ 스킵 | DB 변경 없음 |
| 3. BACKEND | ✅ | ... |
| 4. FRONTEND | ✅ | ... |
| 5. CMS | ⏭️ 스킵 | CMS 변경 없음 |
| 6. TEST | ✅ | 전체 통과 |
| 7. SYNC | ✅ | DTO 일치 |
| 8. REVIEW | ✅ PASS | Critical 0 |

→ `/pre-commit` 실행 권장
```
