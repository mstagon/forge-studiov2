# Testing Rules

## 공통
- 테스트 커버리지 목표: 80%+
- given/when/then 구조
- 테스트 이름은 행위 설명: `should return error when user not found`
- 모킹은 최소한으로 — 통합 테스트 우선

## Flutter
- Widget test: `testWidgets` + `pumpWidget` + `find.byType`
- Unit test: `test` + mocktail (mockito 아님)
- Integration test: `integration_test/` 디렉토리
- Provider test: `ProviderContainer` + `overrides`
- 테스트에서 실제 API 호출 금지 → Mock Repository

## NestJS
- Unit test: Jest + 서비스 단위
- E2E test: supertest + `Test.createTestingModule`
- Prisma mock: `jest.mock` 또는 테스트 DB
- 테스트 DB 격리: 트랜잭션 롤백 또는 별도 DB

## TDD 워크플로우
1. Red: 실패하는 테스트 먼저 작성
2. Green: 테스트 통과하는 최소 구현
3. Refactor: 중복 제거, 구조 개선 (테스트 유지)
