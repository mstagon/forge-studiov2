<!--
보안 룰 메타데이터:
- 기준: OWASP Top 10 — 2021 Edition
- 다음 갱신 대상: OWASP Top 10 — 2025 Edition (예정)
- 갱신 주기: 3년 (OWASP 공식 리비전 주기)
- 마지막 검토: 2026-04-24
-->

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

## OWASP Top 10 (2021) 체크리스트

> 기준: OWASP Top 10 — 2021. 차기 2025 발표 시 본 섹션 갱신 (메타데이터 헤더 참조).

### A01:2021 — Broken Access Control
- NestJS: 모든 보호 엔드포인트에 `JwtAuthGuard` + role/permission Guard
- Next.js Server Actions: 매 요청 권한 재검사 (세션만 보지 말고 리소스 ownership까지)
- Flutter: 클라이언트 검증은 UX용. 서버가 최종 권한자
- IDOR 방지: URL/요청 파라미터의 ID에 ownership/scope 검증 필수

### A02:2021 — Cryptographic Failures
- 비밀번호: bcrypt (cost 12+) 또는 argon2id
- 전송: HTTPS only (HSTS 헤더), 내부 통신도 TLS
- 저장: AES-256-GCM, 키는 환경변수/시크릿 매니저 (코드 하드코딩 금지)
- JWT 서명: RS256 또는 ES256 (HS256은 시크릿 유출 시 치명적)
- Flutter: 토큰은 `flutter_secure_storage`, 일반 SharedPreferences 금지

### A03:2021 — Injection
- SQL: Prisma ORM 파라미터 바인딩, Raw SQL은 `$queryRaw` (template literal) 사용
- NoSQL: 사용자 입력으로 query object 직접 조립 금지
- Command Injection: `child_process.exec` 대신 `execFile` + 인자 배열
- LDAP/XPath/HTML 인젝션도 동일 — 입력 escape

### A04:2021 — Insecure Design
- 보안 요구사항을 설계 단계에서 정의 (위협 모델링)
- 비즈니스 로직 결함도 보안 결함 — rate limiting, 멱등성, 트랜잭션 경계
- secure-by-default: 새 모듈은 deny-all → allow-list 방식
- 민감 작업(결제/탈퇴/권한 변경)은 재인증 또는 2FA

### A05:2021 — Security Misconfiguration
- 프로덕션에 debug 모드/스택 트레이스 노출 금지
- NestJS Helmet 미들웨어로 보안 헤더 (CSP, X-Frame-Options, X-Content-Type-Options)
- CORS: 환경별 명시 — dev: localhost, stg: stg 도메인, prd: 프로덕션 도메인만
- Prisma `migrate deploy` 만 prd, `db push` 절대 금지 (settings.json에서 차단됨)
- 기본 자격증명/API 키 disable, 불필요한 포트/엔드포인트 닫기

### A06:2021 — Vulnerable and Outdated Components
- `npm audit` / `flutter pub outdated` CI에서 정기 실행
- Dependabot 또는 Renovate로 의존성 자동 갱신 PR
- 직접 의존성뿐 아니라 transitive 까지 — `npm audit --production`
- EOL 라이브러리 사용 금지. major 버전 업그레이드 주기적 검토

### A07:2021 — Identification and Authentication Failures
- Access Token: 15분 만료, Refresh Token: 30일 만료 + DB 해시 저장
- 로그인 실패 rate limiting (IP + 계정 단위)
- 비밀번호 정책: 최소 8자 + 복잡도 또는 NIST 권장(길이 우선)
- 세션 fixation 방지: 로그인 시 세션 ID 재발급
- XSS: `dangerouslySetInnerHTML` 금지, 출력 이스케이프 (React 기본 동작 유지)
- 어드민 CMS는 NextAuth.js로 별도 인증

### A08:2021 — Software and Data Integrity Failures
- 의존성 lockfile (`package-lock.json`, `pubspec.lock`) 항상 커밋
- CI에서 `npm ci` (lockfile 일치 강제), `npm install` 금지
- CDN/외부 스크립트 사용 시 SRI 해시 (`<script integrity="sha384-..."`)
- 배포 아티팩트 서명/검증 (코드 사이닝, GitHub Releases 체크섬)
- Deserialization: untrusted JSON/YAML을 클래스로 직접 역직렬화 금지

### A09:2021 — Security Logging and Monitoring Failures
- 인증 실패/권한 거부/관리자 행위는 반드시 로깅
- 비밀번호/토큰/PII는 로그에 절대 기록 금지 (마스킹 처리)
- 로그 저장소는 변조 방지 (append-only) + 보존 기간 정책
- 이상 행위 알림 (브루트포스, 비정상 접근 패턴)
- Flutter: Crashlytics, NestJS: pino + 외부 SIEM, Next.js: Vercel/Sentry

### A10:2021 — Server-Side Request Forgery (SSRF)
- 사용자 입력 URL을 서버에서 fetch할 때 화이트리스트 검증
- 내부 네트워크/메타데이터 엔드포인트(169.254.169.254 등) 차단
- `http://localhost`, `http://127.0.0.1`, 사설 IP 대역 거부
- 리다이렉트 follow 시 매 단계 재검증
- DNS rebinding 대응: hostname 검증 후 IP resolve, 캐시된 IP로 연결
