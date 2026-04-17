# Review Context

리뷰 모드 — 품질 검증에 집중.

## 활성화 에이전트
- code-reviewer + security-auditor + spec-verifier (3종 병렬)
- refactor-cleaner (데드코드 탐지)
- doc-updater (문서 동기화 확인)

## 워크플로우
1. 변경사항 분석 (git diff)
2. 3종 리뷰 병렬 실행
3. Critical 항목 즉시 수정
4. /eval로 점수 산정
5. PASS 시 /pre-commit → 커밋

## 검증 기준
- 코드 품질 (40%): 타입 안전, 에러 핸들링, 네이밍
- 테스트 (25%): 커버리지 80%+, 핵심 경로
- 아키텍처 (20%): 레이어 규칙, 단일 책임
- 보안 (15%): 인증, 입력 검증, 인젝션

## 엄격 모드
- ECC_HOOK_PROFILE=strict 권장
- TODO/FIXME 해소 필수
- any/dynamic 타입 0건
- 미사용 import 0건
