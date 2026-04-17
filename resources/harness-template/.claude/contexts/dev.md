# Development Context

개발 모드 — 빠른 구현에 집중.

## 활성화 에이전트
- flutter-ui, riverpod-logic, nestjs-backend, prisma-data, nextjs-cms
- build-error-resolver, loop-operator (빌드 에러 자동 수정)
- tdd-guide (테스트 주도 개발 시)

## 워크플로우
1. 기존 코드 패턴 확인 (GateGuard)
2. 구현 (해당 스택 에이전트)
3. 빌드 확인 (flutter analyze / npm run build)
4. 테스트 (flutter test / npm test)
5. /verify로 전체 검증

## 허용
- 빠른 프로토타이핑 (ECC_HOOK_PROFILE=minimal)
- 실험적 코드 작성
- TODO/FIXME 주석 허용

## 비활성
- 보안 심층 감사 (review 모드에서)
- 문서 자동 갱신 (별도 /update-docs)
- 배포 관련 작업
