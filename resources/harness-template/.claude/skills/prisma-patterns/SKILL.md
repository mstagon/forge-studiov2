---
name: prisma-patterns
description: Prisma 스키마, 쿼리, 관계, 마이그레이션 패턴.
globs: prisma/**, server/prisma/**, server/src/**/prisma/**
---

## Prisma 패턴 가이드

### 스키마 기본 구조
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 모든 모델 공통 필드
model User {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // 필드
  nickname  String
  email     String?  @unique
  provider  AuthProvider
  providerId String  @map("provider_id")

  // 관계
  boardParticipants BoardParticipant[]
  pointTransactions PointTransaction[]

  // 복합 유니크
  @@unique([provider, providerId])
  // 인덱스
  @@index([email])
  // DB 테이블명 매핑
  @@map("users")
}

enum AuthProvider {
  KAKAO
  NAVER
  APPLE
}
```

### 관계 패턴
```prisma
// 1:N 관계
model Board {
  id    String @id @default(cuid())
  name  String
  tiles BoardTile[]  // 1:N

  @@map("boards")
}

model BoardTile {
  id       String @id @default(cuid())
  boardId  String @map("board_id")
  board    Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  position Int

  // 자기 참조 (워프 대상)
  warpTargetId String?    @map("warp_target_id")
  warpTarget   BoardTile? @relation("WarpLink", fields: [warpTargetId], references: [id])
  warpedFrom   BoardTile? @relation("WarpLink")

  @@unique([boardId, position])
  @@map("board_tiles")
}

// M:N 관계 (명시적 조인 테이블)
model BoardParticipant {
  id              String          @id @default(cuid())
  boardId         String          @map("board_id")
  board           Board           @relation(fields: [boardId], references: [id])
  participantId   String          @map("participant_id")
  user            User?           @relation(fields: [participantId], references: [id])
  participantType ParticipantType
  currentPosition Int             @default(0) @map("current_position")
  lapCount        Int             @default(0) @map("lap_count")

  @@unique([boardId, participantId])
  @@map("board_participants")
}
```

### 쿼리 패턴
```typescript
// Select: 필요한 필드만
const users = await prisma.user.findMany({
  select: {
    id: true,
    nickname: true,
    _count: { select: { pointTransactions: true } },
  },
  take: 20,
  skip: page * 20,
  orderBy: { createdAt: 'desc' },
});

// Include: 관계 로딩 (N+1 방지)
const board = await prisma.board.findUnique({
  where: { id: boardId },
  include: {
    tiles: {
      orderBy: { position: 'asc' },
      include: {
        building: true,
      },
    },
  },
});

// Aggregate
const stats = await prisma.pointTransaction.aggregate({
  where: { userId, type: 'FAUCET' },
  _sum: { amount: true },
  _count: true,
});

// GroupBy
const dailyStats = await prisma.pointTransaction.groupBy({
  by: ['source'],
  where: { createdAt: { gte: startOfDay } },
  _sum: { amount: true },
  _count: true,
});
```

### 트랜잭션 패턴
```typescript
// Interactive Transaction (권장)
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

  // 포인트 차감
  await tx.pointTransaction.create({
    data: { userId, amount: -price, type: 'BURN', source: 'LAND_PURCHASE' },
  });

  // 땅 구매
  const tile = await tx.boardTile.update({
    where: { id: tileId },
    data: { ownerId: userId, ownerType: 'USER' },
  });

  return tile;
}, {
  isolationLevel: 'Serializable', // 동시성 제어 필요 시
  timeout: 10000,
});
```

### 마이그레이션 워크플로우
```bash
# 개발: 스키마 변경 → 마이그레이션 생성 + 적용
npx prisma migrate dev --name add_building_level

# 프로덕션: 마이그레이션 적용만
npx prisma migrate deploy

# 클라이언트 재생성 (스키마 변경 후)
npx prisma generate

# DB 리셋 (개발용 - 주의)
npx prisma migrate reset

# DB 시드
npx prisma db seed
```

### 규칙
- 모델명: PascalCase / 테이블명: snake_case (`@@map`)
- 필드명: camelCase / 컬럼명: snake_case (`@map`)
- PK: `@id @default(cuid())` 기본
- `createdAt` + `updatedAt` 필수
- 관계는 명시적 `@relation` (name, fields, references)
- `@@index` 쿼리 패턴에 맞춰 생성
- `onDelete` 명시 (Cascade / SetNull / Restrict)
- `deleteMany` without `where` 금지
- Raw SQL은 최후 수단 (PostGIS 등 특수 케이스)
- Service를 통해서만 Prisma 호출 (Controller 직접 호출 금지)
