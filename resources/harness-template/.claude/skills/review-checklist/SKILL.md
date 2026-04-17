---
name: review-checklist
description: 풀스택 코드 리뷰 체크리스트. Flutter/NestJS/Prisma/Next.js 전체 검수.
globs: null
---

## 상용 프로덕트 검수 체크리스트

### Flutter 특화
- dispose() 누락 (Controller, StreamSubscription, Timer, AnimationController)
- BuildContext async gap
- setState 사용 (Riverpod 프로젝트에서 금지)
- 불필요한 rebuild (watch 범위 과다, select 미사용)
- ListView children 사용 (builder 아닌)
- 하드코딩 색상/사이즈 (테마 미사용)
- const 미사용
- import cycle

### Riverpod 특화
- ref.watch in callback (build 밖에서 사용)
- ref.read in build (watch 아닌)
- AsyncValue 미처리 (loading/error 누락)
- autoDispose 누락 (메모리 릭)
- .g.dart 파일 outdated (build_runner 미실행)

### NestJS 특화
- Controller에 비즈니스 로직 (Service로 분리)
- Swagger 데코레이터 누락
- DTO class-validator 누락
- Guard 미적용 (인증 필요 엔드포인트)
- ConfigModule 미사용 (process.env 직접 참조)
- console.log 사용 (Logger 사용)
- Service에 Request/Response 객체 직접 접근

### Prisma 특화
- N+1 쿼리 (include/select 없이 루프 내 조회)
- deleteMany without where (전체 삭제 위험)
- 마이그레이션 없이 스키마만 변경
- 트랜잭션 미사용 (동시성 필요 작업)
- prisma db push 사용 (migrate dev 사용해야 함)

### Next.js 특화
- Client Component에서 Prisma 직접 호출
- Server Action에서 인증 체크 누락
- dangerouslySetInnerHTML 사용 (XSS)
- 불필요한 'use client' (Server Component로 가능)
- revalidatePath 누락 (mutation 후 캐시 무효화)

### 에러 핸들링 (공통)
- catch에서 에러 삼킴 (로깅/전파 없이 무시)
- DioException을 AppError로 변환하지 않고 throw (Flutter)
- Result 패턴 미사용 (직접 throw/try-catch in Presentation)
- AsyncValue.error에서 사용자 메시지 미표시
- 재시도 불가능한 에러에 retry 버튼 표시
- context.mounted 체크 없이 비동기 후 ScaffoldMessenger 사용
- 서버 에러 코드(code) 미처리 → 비즈니스 에러 분기 누락

### 로깅 (공통)
- print() / console.log() 사용 (logger 사용 필수)
- 민감정보 로깅 (토큰, 비밀번호, 개인정보)
- stackTrace 누락 (logger.e 호출 시)
- API 응답 바디 릴리즈 로깅 (debug에서만 허용)

### 보안 (공통)
- API 키 하드코딩
- 사용자 입력 미검증
- 민감정보 SharedPreferences 저장 (flutter_secure_storage 사용)
- HTTP (HTTPS 아닌) 사용
- JWT 토큰 노출
- SQL Injection 가능성 (raw query + 사용자 입력)
- CORS 허용 범위 과다

### Cross-Stack 정합성
- NestJS DTO ↔ Flutter DTO 필드 불일치
- Prisma schema ↔ NestJS 코드 불일치
- API 문서 (docs/api/) 미갱신
- 환경변수 스택 간 불일치

### 코드 품질 (공통)
- public API dartdoc/JSDoc 누락
- any/dynamic 타입 사용
- 강제 ! (null assertion) 사용
- 아키텍처 레이어 규칙 위반
