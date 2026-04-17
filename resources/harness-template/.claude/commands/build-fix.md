현재 빌드 에러를 자동으로 분석하고 수정한다.

## 프로세스

1. **에러 수집**: 모든 스택의 빌드 실행
   ```bash
   flutter analyze 2>&1
   cd server && npm run build 2>&1
   npx prisma validate 2>&1
   cd cms && npm run build 2>&1
   ```
2. **에러 파싱**: 에러 메시지에서 파일, 라인, 원인 추출
3. **수정 적용**: `build-error-resolver` 에이전트에 위임
4. **재빌드**: 수정 후 재빌드로 검증
5. **루프**: 최대 5회 반복 또는 모든 에러 해결

## 에이전트 위임

`build-error-resolver` → 실패 시 `loop-operator`로 반복
