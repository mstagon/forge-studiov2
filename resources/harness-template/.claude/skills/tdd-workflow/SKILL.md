# TDD Workflow

Red-Green-Refactor 사이클 가이드.

## 사이클

### Red — 실패하는 테스트 작성
1. 요구사항에서 단일 행위 추출
2. 테스트 작성 (이름: `should [행위] when [조건]`)
3. 실행 → 반드시 실패 확인

### Green — 최소 구현
1. 테스트 통과하는 가장 간단한 코드
2. 하드코딩도 OK (다음 테스트에서 일반화)
3. 실행 → 통과 확인

### Refactor — 정리
1. 중복 제거
2. 네이밍 개선
3. 모든 테스트 재실행 → 통과 확인

## Flutter 테스트 패턴

```dart
// Unit Test
test('should calculate toll fee correctly', () {
  final result = calculateToll(price: 200, multiplier: 2.0);
  expect(result, equals(40));
});

// Widget Test
testWidgets('should show error when input empty', (tester) async {
  await tester.pumpWidget(MaterialApp(home: LoginScreen()));
  await tester.tap(find.byType(ElevatedButton));
  await tester.pump();
  expect(find.text('Required'), findsOneWidget);
});
```

## NestJS 테스트 패턴

```typescript
// Unit Test
describe('GameService', () => {
  it('should roll dice and move player', async () => {
    const result = await service.rollDice(userId);
    expect(result.dice).toBeGreaterThanOrEqual(1);
    expect(result.dice).toBeLessThanOrEqual(6);
  });
});

// E2E Test
describe('POST /board/roll', () => {
  it('should return 401 without auth', () => {
    return request(app.getHttpServer())
      .post('/board/roll')
      .expect(401);
  });
});
```

## 규칙
- 한 번에 하나의 테스트만 추가
- 테스트 없이 구현 코드 먼저 작성 금지
- 기존 테스트를 깨뜨리면 즉시 수정
- mock은 외부 의존성에만 사용 (DB, HTTP)
