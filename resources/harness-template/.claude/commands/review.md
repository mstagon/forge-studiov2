현재 브랜치의 변경사항을 상용 프로덕트 기준으로 검수한다.

자율 오케스트레이션에서는 검증(verify) PASS 후 유저가 "리뷰 진행" 승인 시 **자동 실행**된다.

3개 검수 에이전트를 **동시에** 병렬 파견 (한 메시지에서 Agent 3회 호출):

1. **code-reviewer**: `git diff main...HEAD` 기반 풀스택 코드 리뷰 (Flutter/NestJS/Prisma/Next.js)
2. **security-auditor**: 풀스택 보안 감사 (OWASP Top 10 + 모바일 보안)
3. **spec-verifier**: `docs/specs/` 대비 구현 정합성 검증 (스펙이 있는 경우)

결과를 취합하여 보고:

## 검수 종합 결과: PASS / FAIL

### 코드 리뷰 (🔴 N / 🟡 N / 🔵 N)
- Flutter: ...
- NestJS: ...
- Prisma: ...
- Next.js: ...

### 보안 감사 (🔴 N / 🟡 N)

### 스펙 정합성 (일치 N / 불일치 N / 미구현 N)

### Cross-Stack 정합성
- NestJS DTO ↔ Flutter DTO 일치 여부
- Prisma schema ↔ NestJS Entity 일치 여부

### 자동 검증
- flutter analyze
- flutter test
- npm run lint (server)
- npm test (server)
- npx prisma validate

Critical이 하나라도 있으면 FAIL.
FAIL 시 → 해당 에이전트 자동 재파견 → 수정 → 재리뷰 (자동).
PASS 시 → "커밋할까요?" 유저에게 질문 → 승인 시 /pre-commit 자동 실행.
