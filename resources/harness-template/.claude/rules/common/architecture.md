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
