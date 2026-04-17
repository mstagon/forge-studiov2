---
name: freezed-models
description: Freezed Entity/DTO 패턴. 데이터 모델 작성 시 자동 참조.
globs: lib/**/models/**, lib/**/entities/**, lib/**/entity/**, lib/**/dto/**
---

## Freezed 모델 규칙

### Entity (도메인 레이어)
```dart
@freezed
class Product with _$Product {
  const factory Product({
    required String id,
    required String name,
    required int price,
    String? description,
  }) = _Product;
}
```

### DTO (데이터 레이어)
```dart
@freezed
class ProductDto with _$ProductDto {
  const factory ProductDto({
    required String id,
    required String name,
    required int price,
    String? description,
    @JsonKey(name: 'created_at') required DateTime createdAt,
  }) = _ProductDto;

  factory ProductDto.fromJson(Map<String, dynamic> json) =>
      _$ProductDtoFromJson(json);
}

extension ProductDtoX on ProductDto {
  Product toEntity() => Product(
    id: id,
    name: name,
    price: price,
    description: description,
  );
}
```

### 규칙
- Entity는 순수 도메인 객체 (fromJson 없음, Flutter 의존 금지)
- DTO는 API/DB 응답 매핑 전용 (fromJson + toEntity)
- const factory 사용
- any/dynamic 타입 금지 → 명시적 타입 선언
- 수정 후 반드시: `dart run build_runner build --delete-conflicting-outputs`
