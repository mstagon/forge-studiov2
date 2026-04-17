# Security Rules

## 인증/인가
- JWT Access Token: 15분 만료, 메모리/SecureStorage 저장
- Refresh Token: 30일 만료, SecureStorage + DB 해시 저장
- 모든 보호 엔드포인트에 JwtAuthGuard 적용
- 어드민 CMS: 별도 인증 (NextAuth.js)

## 입력 검증
- 클라이언트 검증은 UX용 — 최종 검증은 서버
- NestJS DTO: class-validator 필수
- Next.js Server Actions: zod 스키마 검증 필수
- SQL 인젝션: Prisma 파라미터 바인딩 (Raw SQL 시 $queryRaw 사용)

## 데이터 보호
- `.env.dev`, `.env.stg`, `.env.prd` 전부 git 커밋 금지
- API 키, 시크릿 코드 하드코딩 금지
- 민감 데이터 로깅 금지 (비밀번호, 토큰 등)
- CORS: 환경별 허용 오리진 명시적 설정
  - dev: localhost 허용
  - stg: stg 도메인만
  - prd: 프로덕션 도메인만

## OWASP Top 10 체크
- A01 접근 제어: Guard/Middleware로 강제
- A02 암호화: bcrypt(비밀번호), HTTPS 전용
- A03 인젝션: ORM 사용, Raw SQL 최소화
- A07 XSS: dangerouslySetInnerHTML 금지, 출력 이스케이프
