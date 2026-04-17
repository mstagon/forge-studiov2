# Coding Style Rules

## 공통
- `any`, `dynamic` 타입 사용 금지
- `print()` / `console.log()` 사용 금지 → logger 사용
- 강제 `!` (null assertion) 사용 금지
- `.env` 파일을 코드에 하드코딩 금지
- git에 시크릿/API 키 커밋 금지
- 모든 public API에 문서 주석 필수 (dartdoc `///` 또는 JSDoc `/** */`)

## Dart/Flutter
- const 생성자 최대한 활용
- setState 금지 → Riverpod 사용
- Navigator.push 금지 → go_router 사용
- BuildContext를 async gap 넘기지 마라
- freezed 수정 후 build_runner 실행
- 새 패키지 추가 후 `cd ios && pod install`

## TypeScript/NestJS
- TypeScript strict mode
- Controller는 얇게 — Service에 로직 집중
- DTO는 class-validator + class-transformer
- ConfigModule로 환경변수 접근
- Prisma migrate 기반 (db push 금지)

## TypeScript/Next.js
- Server Components 기본 — `'use client'`는 인터랙션 필요 시만
- Tailwind CSS + shadcn/ui (inline styles 금지)
- Server Actions에서 인증 체크 필수
- `dangerouslySetInnerHTML` 금지
