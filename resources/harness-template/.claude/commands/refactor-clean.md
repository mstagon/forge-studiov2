코드베이스의 데드코드와 불필요한 요소를 정리한다.

## 프로세스

1. **정적 분석**:
   - `flutter analyze` — unused imports/variables
   - `npm run lint` — ESLint unused warnings
2. **미사용 심볼 수집**: Grep으로 전체 참조 재확인
3. **안전한 항목만 제거**: public API 제외
4. **빌드+테스트 검증**: 제거 후 문제 없는지 확인

## 에이전트 위임

`refactor-cleaner` 에이전트에 위임.

## 대상
- 미사용 import
- 미사용 변수/함수/클래스
- 주석 처리된 코드 블록
- 빈 catch 블록
- 불필요한 타입 캐스팅
