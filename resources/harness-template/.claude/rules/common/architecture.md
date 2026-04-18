# Architecture Rules

## Flutter — Clean Architecture
- presentation → domain → data 단방향 의존
- domain 레이어는 순수 Dart (Flutter SDK 의존 금지)
- Repository: 인터페이스(domain) ↔ 구현체(data) 분리
- UseCase: 단일 책임, 하나의 public 메서드
- Entity(domain) ≠ DTO(data) — 변환 로직 필수

## NestJS — Modular Architecture
- Module 단위 도메인 분리
- Controller(얇게) → Service(로직) → Prisma(데이터)
- Controller에서 Prisma 직접 호출 금지
- Guard/Interceptor로 횡단 관심사 분리
- Global Exception Filter로 에러 통합 처리

## Prisma — Single Source of Truth
- `schema.prisma`가 DB 스키마의 유일한 소스
- NestJS + CMS 모두 같은 Prisma Client 공유
- 마이그레이션은 `prisma migrate dev` 전용

## Next.js CMS — App Router
- Server Components 기본
- Prisma 직접 접근 (같은 DB)
- Server Actions로 뮤테이션

## Cross-Stack
- API 계약의 원본: NestJS Swagger DTO
- Flutter DTO는 NestJS DTO를 따름
- JSON key는 camelCase 통일
- API 변경 시 `/api-sync`로 동기화

## 레포 구조 (모노레포 + 서브트리)

로컬은 **모노레포**로 작업하고, 원격은 **git subtree**로 각 스택별 독립 레포로 관리.

```
<project>/ (로컬 모노레포)
├── client/        → 원격: app repo (Flutter)
├── server/     → 원격: server repo (NestJS + Prisma)
├── prisma/     → server repo에 포함 또는 독립
├── cms/        → 원격: cms repo (Next.js)
└── docs/       → 모노레포 전용 (push 안 함)
```

## 앱 디렉터리 레이아웃 (Clean Architecture)

```
client/
├── core/           # config, network, theme, logger, utils
├── data/           # remote (API), local (cache), repository (구현체)
├── domain/         # entity, repository (추상), usecase
├── presentation/   # 화면별 디렉터리 (위젯 + 컨트롤러)
└── app.dart        # GoRouter, 전역 Provider
```

레이어 규칙: **presentation → domain → data 단방향**. domain은 순수 Dart.

## 서버 디렉터리 레이아웃 (NestJS)

```
server/src/
├── auth/           # Passport OAuth + JWT (strategies, guards, decorators)
├── users/          # 유저 모듈
├── [도메인]/       # 도메인별 모듈 (controller + service + dto)
├── common/         # guards, interceptors, filters, pipes
├── config/         # 환경변수, 밸런스 JSON
└── prisma/         # PrismaService (싱글턴)
```
