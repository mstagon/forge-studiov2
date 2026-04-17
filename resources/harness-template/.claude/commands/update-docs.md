현재 변경사항에 맞춰 문서를 자동 갱신한다.

## 프로세스

1. **변경 감지**: `git diff --name-only`로 변경 파일 목록
2. **문서 매핑**:
   - `server/src/**/controller.ts` 변경 → `docs/api/` 갱신
   - `prisma/schema.prisma` 변경 → 데이터 모델 문서 갱신
   - 새 피처 완료 → CHANGELOG.md 추가
   - 아키텍처 변경 → `docs/architecture/` ADR 작성
3. **갱신 실행**: `doc-updater` 에이전트에 위임
4. **정합성 확인**: 문서와 코드 일치 여부 최종 체크

## 에이전트 위임

`doc-updater` 에이전트에 위임.
