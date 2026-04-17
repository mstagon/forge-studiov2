커밋 전 전체 검증 파이프라인을 실행한다.

변경된 파일의 스택을 자동 판별하여 해당 스택만 검증.

## Flutter (lib/, test/ 변경 시)

1. `dart format --set-exit-if-changed .` → 포맷 체크
2. `flutter analyze` → 정적 분석
3. `flutter test` → 전체 테스트
4. `dart run build_runner build --delete-conflicting-outputs` → 코드젠 최신 확인
5. CLAUDE.md 금지 패턴 위반 검사:
   - `grep -rn 'print(' lib/` → print() 사용
   - `grep -rn 'dynamic\|: any' lib/` → any/dynamic 사용
   - `grep -rn '!;$\|!\.' lib/ | grep -v '!='` → 강제 ! 사용

## NestJS (server/ 변경 시)

1. `npm run lint` → ESLint
2. `npm run build` → TypeScript 컴파일
3. `npm test` → Jest 테스트
4. 금지 패턴 검사:
   - `grep -rn 'console.log' server/src/` → console.log 사용
   - `grep -rn ': any' server/src/` → any 타입 사용
   - `grep -rn 'process.env\.' server/src/ | grep -v 'config'` → .env 직접 참조

## Prisma (prisma/ 변경 시)

1. `npx prisma validate` → 스키마 유효성
2. `npx prisma generate` → 클라이언트 재생성

## Next.js (cms/ 변경 시)

1. `npm run lint` → ESLint
2. `npm run build` → 빌드 확인
3. 금지 패턴 검사:
   - `grep -rn ': any' cms/` → any 타입 사용
   - `grep -rn 'dangerouslySetInnerHTML' cms/` → XSS 위험

## Cross-Stack 검증

- NestJS DTO 변경 시: Flutter DTO 동기화 여부 확인
- Prisma schema 변경 시: 마이그레이션 파일 존재 확인

## 결과

모든 통과 시:
→ conventional commit 메시지 제안 (feat/fix/refactor/chore)

하나라도 실패 시:
→ 실패 항목 + 수정 방법 안내
→ 자동 수정 가능한 것은 수정할지 물어볼 것
