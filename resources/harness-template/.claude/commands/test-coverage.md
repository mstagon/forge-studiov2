테스트 커버리지를 분석하고 부족한 영역을 식별한다.

## 프로세스

### Flutter
```bash
flutter test --coverage
# lcov.info 생성 → 분석
```

### NestJS
```bash
cd server && npm run test -- --coverage
# coverage/ 디렉토리 생성 → 분석
```

## 분석 항목

1. **전체 커버리지 %** — 목표 80%
2. **미커버 파일 목록** — 테스트가 없는 파일
3. **미커버 함수 목록** — 테스트되지 않은 public 함수
4. **핵심 경로 체크** — 비즈니스 로직의 커버리지

## 출력

```markdown
## 테스트 커버리지 리포트

### Flutter
- 전체: 72% (목표: 80%)
- 미커버: 5개 파일
  - client/domain/usecase/buy_land.dart (0%)
  - client/data/repository/game_repo_impl.dart (30%)

### NestJS
- 전체: 85% (목표: 80%)
- 미커버: 2개 파일

### 권장 테스트 추가
1. [파일] — [이유]
```

## 후속 조치
커버리지 80% 미만 → `test-writer` 또는 `/tdd`로 테스트 추가 제안
