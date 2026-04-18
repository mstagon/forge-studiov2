"$ARGUMENTS" 피처를 TDD 방식으로 구현한다.

## 프로세스

1. **요구사항 분석**: $ARGUMENTS에서 테스트할 행위 목록 추출
2. **테스트 파일 생성**: 스택에 따라 적절한 위치에 테스트 파일 생성
3. **Red-Green-Refactor 루프**:
   - 실패하는 테스트 하나 작성
   - 최소 구현으로 통과
   - 리팩토링
   - 다음 테스트로 반복
4. **커버리지 확인**: 80% 이상 목표
5. **검증**: `/verify` 실행

## 에이전트 위임

`tdd-guide` 에이전트에 위임. 스킬 `tdd-workflow` 참조.

## 스택 감지

- `client/` 관련 → Flutter 테스트 (`test/`)
- `server/` 관련 → NestJS 테스트 (`server/test/`)
- 둘 다 → 각각 TDD 진행
