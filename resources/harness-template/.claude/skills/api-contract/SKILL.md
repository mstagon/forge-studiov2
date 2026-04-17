---
name: api-contract
description: Cross-stack API 계약 동기화. NestJS DTO ↔ Flutter DTO 일치성 관리.
globs: server/src/**/dto/**, lib/data/remote/**, lib/data/dto/**, lib/domain/entity/**, docs/api/**
---

## API 계약 동기화 패턴

### 계약 흐름
```
Prisma Schema → NestJS DTO (Response) → Flutter DTO → Flutter Entity
      ↑                ↑                      ↑              ↑
   DB 테이블        API 응답 형태         JSON 역직렬화      앱 도메인 모델
```

### NestJS Response DTO (서버 계약의 원본)
```typescript
// server/src/game/dto/roll-dice-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class TileEventDto {
  @ApiProperty({ enum: ['BUY_OPTION', 'PAY_TOLL', 'GOLDEN_KEY', 'WARP', 'ISLAND'] })
  type: string;

  @ApiProperty({ required: false })
  data?: Record<string, unknown>;
}

export class RollDiceResponseDto {
  @ApiProperty({ minimum: 1, maximum: 6 })
  dice: number;

  @ApiProperty()
  newPosition: number;

  @ApiProperty()
  passedStart: boolean;

  @ApiProperty({ required: false })
  startBonus?: number;

  @ApiProperty({ required: false })
  event?: TileEventDto;

  @ApiProperty()
  diceBalance: number;
}
```

### Flutter DTO (서버 응답 매핑)
```dart
// lib/data/remote/dto/roll_dice_response_dto.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'roll_dice_response_dto.freezed.dart';
part 'roll_dice_response_dto.g.dart';

@freezed
class RollDiceResponseDto with _$RollDiceResponseDto {
  const factory RollDiceResponseDto({
    required int dice,
    required int newPosition,
    required bool passedStart,
    int? startBonus,
    TileEventDto? event,
    required int diceBalance,
  }) = _RollDiceResponseDto;

  factory RollDiceResponseDto.fromJson(Map<String, dynamic> json) =>
      _$RollDiceResponseDtoFromJson(json);
}

@freezed
class TileEventDto with _$TileEventDto {
  const factory TileEventDto({
    required String type,
    Map<String, dynamic>? data,
  }) = _TileEventDto;

  factory TileEventDto.fromJson(Map<String, dynamic> json) =>
      _$TileEventDtoFromJson(json);
}
```

### Flutter Entity (도메인 모델)
```dart
// lib/domain/entity/roll_result.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'roll_result.freezed.dart';

@freezed
class RollResult with _$RollResult {
  const factory RollResult({
    required int dice,
    required int newPosition,
    required bool passedStart,
    int? startBonus,
    TileEvent? event,
    required int diceBalance,
  }) = _RollResult;
}
```

### DTO → Entity 변환
```dart
// lib/data/remote/dto/roll_dice_response_dto.dart (extension)
extension RollDiceResponseDtoX on RollDiceResponseDto {
  RollResult toEntity() => RollResult(
    dice: dice,
    newPosition: newPosition,
    passedStart: passedStart,
    startBonus: startBonus,
    event: event?.toEntity(),
    diceBalance: diceBalance,
  );
}
```

### 필드 매핑 규칙

| NestJS (서버) | Flutter DTO | Flutter Entity | 비고 |
|--------------|-------------|---------------|------|
| camelCase | camelCase | camelCase | JSON key 동일 |
| snake_case DB | `@ApiProperty` | `@JsonKey(name:)` | DB↔API 변환은 서버 |
| `string` | `String` | `String` | |
| `number` | `int` / `double` | `int` / `double` | 정수/실수 구분 |
| `boolean` | `bool` | `bool` | |
| `Date` (ISO) | `DateTime` | `DateTime` | JSON: ISO 8601 문자열 |
| `enum` | `String` + enum | domain enum | DTO는 String, Entity에서 enum 변환 |
| `T?` optional | `T?` nullable | `T?` nullable | |
| `T[]` array | `List<T>` | `List<T>` | |

### API 문서 동기화

```
docs/api/
├── auth.md          # POST /auth/login, /auth/refresh, /auth/logout
├── board.md         # GET /boards, POST /board/roll, /board/buy, etc.
├── game.md          # 게임 이벤트 상세
└── _template.md     # API 문서 템플릿
```

각 API 문서에 포함할 항목:
- Endpoint (Method + Path)
- Auth (Required / Public)
- Request (Headers, Params, Body + DTO 클래스명)
- Response (Success DTO + Error codes)
- NestJS 파일 위치 + Flutter 파일 위치

### 동기화 체크 방법

```bash
# NestJS Swagger에서 자동 생성된 OpenAPI JSON과 Flutter DTO 대조
# 1. NestJS에서 swagger.json 추출
curl http://localhost:3000/api-json > docs/api/swagger.json

# 2. Flutter DTO 파일 목록과 대조
# → 누락된 DTO, 필드 불일치 확인
```

### 규칙
- **API 계약의 원본은 NestJS Swagger DTO** — Flutter는 이를 따름
- 서버 DTO 변경 시 Flutter DTO 즉시 업데이트
- JSON key는 camelCase 통일 (서버에서 DB snake_case → camelCase 변환)
- DateTime은 ISO 8601 문자열로 전송
- Enum은 대문자 스네이크케이스 문자열 (`GOLDEN_KEY`, `PAY_TOLL`)
- Optional 필드는 양쪽 모두 nullable 처리
- `docs/api/` 문서는 API 변경 시 즉시 갱신
- 새 API 추가 시: NestJS DTO → docs/api/ 문서 → Flutter DTO → Entity 순서
