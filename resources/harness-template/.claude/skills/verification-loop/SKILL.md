# Verification Loop

구현 완료 후 자동 검증 루프. 모든 체크를 통과할 때까지 반복한다.

## 검증 체크리스트

### 1. 빌드 체크
```bash
# Flutter
flutter analyze --no-pub client/
dart run build_runner build -d  # freezed/json_serializable 동기화

# NestJS
cd server && npm run build

# Prisma
npx prisma validate

# Next.js
cd cms && npm run build
```

### 2. 테스트 체크
```bash
flutter test
cd server && npm run test
cd cms && npm run test  # 있으면
```

### 3. Lint 체크
```bash
dart format --set-exit-if-changed .
cd server && npm run lint
cd cms && npm run lint
```

### 4. 크로스 스택 체크
- NestJS DTO ↔ Flutter DTO 필드 일치
- Prisma schema ↔ NestJS entity 일치
- API 문서 ↔ 실제 엔드포인트 일치

## 루프 프로세스

```
START → 빌드 체크 → FAIL? → build-error-resolver → 재빌드
                  → PASS → 테스트 체크 → FAIL? → 수정 → 재테스트
                                       → PASS → Lint 체크 → FAIL? → auto-fix → 재lint
                                                            → PASS → 크로스 스택 체크
                                                                   → ALL PASS → DONE
```

## 결과 형식

```markdown
## Verification Result

| 체크 | 상태 | 상세 |
|------|:----:|------|
| Flutter 빌드 | PASS/FAIL | ... |
| NestJS 빌드 | PASS/FAIL | ... |
| Flutter 테스트 | PASS/FAIL | 42/42 passed |
| NestJS 테스트 | PASS/FAIL | 15/15 passed |
| Lint | PASS/FAIL | ... |
| DTO Sync | PASS/FAIL | ... |

**Overall: PASS/FAIL**
```

## 규칙
- 영향받는 스택만 검증 (전체 검증은 `/pre-commit`에서)
- 최대 루프 5회. 초과 시 유저에게 에스컬레이션
- 자동 수정은 빌드/lint 에러만. 테스트 실패는 분석 후 수정
