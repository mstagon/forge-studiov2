# PostgreSQL Optimization Patterns

Prisma 뒤에서 PostgreSQL 성능을 최적화하는 패턴.

## 인덱스 전략

### Prisma 스키마에서 인덱스
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now())

  @@index([createdAt])           // 단일 인덱스
  @@index([status, createdAt])   // 복합 인덱스 (순서 중요)
}
```

### 인덱스 규칙
- WHERE 절에 자주 사용되는 컬럼에 인덱스
- 복합 인덱스: 선택도 높은 컬럼을 앞에
- 인덱스 과다 금지 (INSERT/UPDATE 성능 저하)

## 쿼리 최적화

### N+1 방지 (Prisma include)
```typescript
// BAD: N+1
const users = await prisma.user.findMany();
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { userId: user.id } });
}

// GOOD: include
const users = await prisma.user.findMany({
  include: { posts: true },
});
```

### select로 필요한 필드만
```typescript
// BAD: 전체 컬럼
const users = await prisma.user.findMany();

// GOOD: 필요한 것만
const users = await prisma.user.findMany({
  select: { id: true, email: true, name: true },
});
```

### 대량 데이터 페이지네이션
```typescript
// Cursor-based (대량 데이터에 적합)
const results = await prisma.post.findMany({
  take: 20,
  skip: 1,
  cursor: { id: lastId },
  orderBy: { createdAt: 'desc' },
});
```

## 트랜잭션

```typescript
// Interactive Transaction (복잡한 로직)
await prisma.$transaction(async (tx) => {
  const user = await tx.user.update({
    where: { id: userId },
    data: { balance: { decrement: amount } },
  });
  if (user.balance < 0) throw new Error('Insufficient balance');
  await tx.transaction.create({ data: { userId, amount, type: 'BURN' } });
});
```

## 커넥션 관리
- Prisma 기본 pool size: `connection_limit` 파라미터
- serverless 환경: `pgbouncer=true` 사용
- 커넥션 수 모니터링: `SELECT count(*) FROM pg_stat_activity`
