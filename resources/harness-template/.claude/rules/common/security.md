<!--
보안 룰 메타데이터:
- 기준: OWASP Top 10 — 2025 Edition (https://owasp.org/Top10/2025/)
- 다음 갱신 대상: OWASP Top 10 — 차기 Edition 발표 시
- 갱신 주기: OWASP 공식 리비전 주기 (3~4년)
- 마지막 검토: 2026-04-27
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

## OWASP Top 10 (2025) 체크리스트

> 기준: [OWASP Top 10 — 2025](https://owasp.org/Top10/2025/) (2025년 11월 공식 공개).
> 2021 대비 변경점:
> - 신규: A03 Software Supply Chain Failures, A10 Mishandling of Exceptional Conditions
> - 제거/통합: 2021 A06 Vulnerable and Outdated Components → A03로 흡수+확장,
>   2021 A10 SSRF → A01(Access Control) 등 다른 카테고리로 분산
> - 순위 변동: Security Misconfiguration 5→2, Cryptographic Failures 2→4, Injection 3→5, Insecure Design 4→6
> - 명칭 정리: A07 "Authentication Failures", A09 "Logging and **Alerting** Failures",
>   A08 "Software **or** Data Integrity Failures"

### A01:2025 — Broken Access Control
- NestJS: 모든 보호 엔드포인트에 `JwtAuthGuard` + role/permission Guard
- Next.js Server Actions: 매 요청 권한 재검사 (세션만 보지 말고 리소스 ownership까지)
- Flutter: 클라이언트 검증은 UX용. 서버가 최종 권한자
- IDOR 방지: URL/요청 파라미터의 ID에 ownership/scope 검증 필수
- SSRF 방어도 access control로 통합 — 사용자 입력 URL fetch 시 화이트리스트, 사설 IP/메타데이터 엔드포인트(169.254.169.254) 차단, 리다이렉트 follow 시 매 단계 재검증
- CORS misconfiguration도 access control 결함 — 환경별 origin 명시

### A02:2025 — Security Misconfiguration
- 프로덕션에 debug 모드/스택 트레이스 노출 금지
- NestJS Helmet 미들웨어로 보안 헤더 (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- CORS: 환경별 명시 — dev: localhost, stg: stg 도메인, prd: 프로덕션 도메인만
- Prisma `migrate deploy` 만 prd, `db push` 절대 금지 (settings.json에서 차단됨)
- 기본 자격증명/API 키 disable, 불필요한 포트/엔드포인트 닫기
- 컨테이너/이미지: 최소 권한 base image, 불필요한 패키지 제거, non-root 유저로 실행

### A03:2025 — Software Supply Chain Failures
- 의존성 lockfile (`package-lock.json`, `pubspec.lock`) 항상 커밋, CI에서 `npm ci` 강제 (`npm install` 금지)
- `npm audit` / `flutter pub outdated` CI 정기 실행, 직접+transitive 모두 (`npm audit --production`)
- Dependabot 또는 Renovate로 의존성 자동 갱신 PR, EOL 라이브러리 사용 금지
- 외부 스크립트 사용 시 SRI 해시 (`<script integrity="sha384-...">`)
- 패키지 publish 시 npm provenance / 서명 활성화 (typosquatting · dependency confusion 대응)
- CI/CD 파이프라인 자체 보호: 빌드 시크릿 격리, OIDC 단기 토큰, 아티팩트 서명·체크섬 검증
- 서드파티 SaaS / API 키 통합도 supply chain — 권한 최소화, 토큰 회전 정책

### A04:2025 — Cryptographic Failures
- 비밀번호: bcrypt (cost 12+) 또는 argon2id
- 전송: HTTPS only (HSTS 헤더), 내부 통신도 TLS
- 저장: AES-256-GCM, 키는 환경변수/시크릿 매니저 (코드 하드코딩 금지)
- JWT 서명: RS256 또는 ES256 (HS256은 시크릿 유출 시 치명적)
- Flutter: 토큰은 `flutter_secure_storage`, 일반 SharedPreferences 금지
- 구식/약한 알고리즘 금지: MD5, SHA-1, DES, RC4, ECB 모드

### A05:2025 — Injection
- SQL: Prisma ORM 파라미터 바인딩, Raw SQL은 `$queryRaw` (template literal) 사용
- NoSQL: 사용자 입력으로 query object 직접 조립 금지
- Command Injection: `child_process.exec` 대신 `execFile` + 인자 배열
- LDAP/XPath/HTML 인젝션도 동일 — 입력 escape
- XSS는 2025부터 Injection으로 통합: React 기본 출력 이스케이프 유지, `dangerouslySetInnerHTML` 금지
- 프롬프트 인젝션 (LLM 호출): 사용자 입력과 시스템 지시 분리, 출력 sanitize, tool-use 권한 최소화

### A06:2025 — Insecure Design
- 보안 요구사항을 설계 단계에서 정의 (위협 모델링)
- 비즈니스 로직 결함도 보안 결함 — rate limiting, 멱등성, 트랜잭션 경계
- secure-by-default: 새 모듈은 deny-all → allow-list 방식
- 민감 작업(결제/탈퇴/권한 변경)은 재인증 또는 2FA
- 추상화/프레임워크 선택 자체가 설계 결정 — 보안 영향 평가 후 도입

### A07:2025 — Authentication Failures
- Access Token: 15분 만료, Refresh Token: 30일 만료 + DB 해시 저장
- 로그인 실패 rate limiting (IP + 계정 단위), credential stuffing 대응
- 비밀번호 정책: NIST 권장(길이 우선, 8자+) + 유출 비밀번호 차단 (HIBP API 등)
- 세션 fixation 방지: 로그인 시 세션 ID 재발급
- MFA / passkey 도입 — 특히 어드민 / 민감 작업
- 어드민 CMS는 NextAuth.js로 별도 인증

### A08:2025 — Software or Data Integrity Failures
- CI에서 `npm ci` (lockfile 일치 강제), `npm install` 금지
- CDN/외부 스크립트 사용 시 SRI 해시 (`<script integrity="sha384-...">`)
- 배포 아티팩트 서명/검증 (코드 사이닝, GitHub Releases 체크섬)
- Deserialization: untrusted JSON/YAML을 클래스로 직접 역직렬화 금지
- 자동 업데이트 채널 (앱 OTA, electron-updater 등) 무결성 검증 필수
- 데이터 파이프라인 입력도 무결성 — webhook 서명, 메시지 큐 체크섬

### A09:2025 — Security Logging and Alerting Failures
- 인증 실패/권한 거부/관리자 행위는 반드시 로깅
- 비밀번호/토큰/PII는 로그에 절대 기록 금지 (마스킹 처리)
- 로그 저장소는 변조 방지 (append-only) + 보존 기간 정책
- **Alerting까지 커버**: 로그만 쌓고 알림 없으면 무의미 — SIEM 룰 + on-call paging 필수
- 이상 행위 알림 (브루트포스, 비정상 접근 패턴, 권한 상승 시도)
- Flutter: Crashlytics, NestJS: pino + 외부 SIEM, Next.js: Vercel/Sentry

### A10:2025 — Mishandling of Exceptional Conditions
- 예외 응답에서 스택 트레이스/내부 경로/DB 에러 메시지 노출 금지 → 일반화된 에러 메시지
- 빈 catch 블록 (`catch {}`) 금지 — 최소한 로깅 + 처리 결정
- fail-closed 원칙: 권한 검사/결제/세션 검증에서 예외 발생 시 **거부**가 기본 (fail-open 금지)
- 예외 경로의 race condition / 부분 커밋 방지 — 트랜잭션 롤백 보장
- rate limit / circuit breaker 가 예외로 우회되지 않게 finally 또는 outer wrapper로 보강
- 네트워크 호출 timeout / retry 정책 명시 — unhandled promise rejection 차단
