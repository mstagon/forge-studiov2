"$ARGUMENTS" API의 NestJS ↔ Flutter 계약 동기화를 검증하고 수정한다.

## 1. NestJS DTO 확인

`server/src/` 에서 관련 Response/Request DTO 파일을 찾아 필드 목록 추출.

## 2. Flutter DTO 확인

`client/data/remote/dto/` 또는 `client/data/dto/` 에서 대응하는 freezed DTO 찾아 필드 목록 추출.

## 3. 대조

| 필드 | NestJS DTO | Flutter DTO | 상태 |
|------|-----------|-------------|------|
| ... | ... | ... | ✅ 일치 / ❌ 불일치 / ⚠️ 누락 |

## 4. 불일치 수정

- NestJS DTO가 원본 (서버 우선)
- Flutter DTO를 NestJS에 맞춰 수정
- `dart run build_runner build --delete-conflicting-outputs` 실행
- Entity toEntity() 메서드도 함께 업데이트

## 5. 문서 갱신

`docs/api/` 해당 API 문서 업데이트.

## 규칙

- api-contract 스킬 참조
- JSON key는 camelCase 통일
- DateTime은 ISO 8601
- Enum은 대문자 스네이크케이스 문자열
