현재 변경사항에 대해 검증 루프를 실행한다.

이 커맨드는 유저가 명시적으로 호출할 수도 있지만, 자율 오케스트레이션에서는 **구현 완료 후 자동으로 실행**된다.

## 자동 프로세스

1. **영향 스택 감지**: git diff로 변경 파일 분석 → 어떤 스택이 변경되었는지 판별
2. **스택별 검증 실행**:
   - Flutter 변경 → `flutter analyze` + `flutter test`
   - NestJS 변경 → `npm run build` + `npm test` + `npm run lint` (cd server)
   - Prisma 변경 → `npx prisma validate`
   - CMS 변경 → `npm run build` + `npm run lint` (cd cms)
3. **크로스 스택 체크**: NestJS DTO ↔ Flutter DTO 필드 대조
4. **결과 판정**: 전체 PASS / FAIL

## FAIL 시 자동 수정 (유저 개입 불필요)

FAIL 항목이 있으면 **자동으로** loop-operator를 호출:
- 에러 메시지 분석 → 원인 파악 → 자동 수정
- 수정 후 재검증 (최대 5회 반복)
- 5회에도 해결 안 되면 유저에게 보고

## PASS 시 자동 후속

전체 PASS → "리뷰 진행할까요?" 유저에게 질문
→ 유저 승인 → code-reviewer + security-auditor + spec-verifier 3종 동시 파견

## 스킬 참조

`verification-loop` 스킬의 체크리스트 사용.

## 출력

```
## Verification Result

| 체크 | 상태 | 상세 |
|------|:----:|------|
| Flutter 빌드 | PASS | 0 issues |
| Flutter 테스트 | PASS | 42/42 |
| NestJS 빌드 | PASS | compiled |
| NestJS 테스트 | PASS | 15/15 |
| Lint | PASS | 0 warnings |
| DTO Sync | PASS | matched |

**Overall: PASS** → 리뷰 진행할까요?
```
