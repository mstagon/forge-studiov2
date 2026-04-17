---
name: nextjs-patterns
description: Next.js App Router 패턴. Server Components, Server Actions, 데이터 페칭.
globs: cms/app/**, cms/lib/**, cms/components/**
---

## Next.js App Router 패턴 가이드

### Server Component (기본)
```tsx
// app/users/page.tsx — Server Component (기본, 'use client' 없음)
import { prisma } from '@/lib/prisma';
import { DataTable } from '@/components/data-table';
import { columns } from './_components/columns';

interface SearchParams {
  page?: string;
  search?: string;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { page = '1', search } = await searchParams;
  const take = 20;
  const skip = (parseInt(page) - 1) * take;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: search ? { nickname: { contains: search, mode: 'insensitive' } } : undefined,
      take,
      skip,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({
      where: search ? { nickname: { contains: search, mode: 'insensitive' } } : undefined,
    }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">유저 관리</h1>
      <DataTable columns={columns} data={users} total={total} page={parseInt(page)} />
    </div>
  );
}
```

### Client Component (인터랙션 필요 시만)
```tsx
// app/users/_components/user-actions.tsx
'use client';

import { useActionState } from 'react';
import { banUser } from '@/lib/actions/user-actions';
import { Button } from '@/components/ui/button';

export function BanUserButton({ userId }: { userId: string }) {
  const [state, action, isPending] = useActionState(
    banUser.bind(null, userId),
    null,
  );

  return (
    <form action={action}>
      <Button variant="destructive" disabled={isPending}>
        {isPending ? '처리 중...' : '정지'}
      </Button>
      {state?.error && <p className="text-red-500 text-sm">{state.error}</p>}
    </form>
  );
}
```

### Server Action
```typescript
// lib/actions/user-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const banUserSchema = z.object({
  reason: z.string().min(1).max(500),
});

export async function banUser(userId: string, _prev: unknown, formData: FormData) {
  // 1. 인증 확인
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return { error: '권한이 없습니다' };
  }

  // 2. 입력 검증
  const parsed = banUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // 3. 실행
  await prisma.user.update({
    where: { id: userId },
    data: { isBanned: true, bannedReason: parsed.data.reason },
  });

  // 4. 캐시 무효화
  revalidatePath('/users');
  return { success: true };
}
```

### Prisma 싱글턴 (Next.js용)
```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### Layout + 에러/로딩 패턴
```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Sidebar />
        <main className="ml-64 p-6">{children}</main>
      </body>
    </html>
  );
}

// app/users/loading.tsx — 스켈레톤 UI
export default function Loading() {
  return <TableSkeleton rows={10} />;
}

// app/users/error.tsx — 에러 바운더리
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="text-center py-10">
      <p className="text-red-500">{error.message}</p>
      <Button onClick={reset}>다시 시도</Button>
    </div>
  );
}
```

### 규칙
- Server Components 기본 — `'use client'`는 인터랙션/브라우저 API 필요 시만
- 데이터 페칭: Server Component에서 Prisma 직접 호출 (API Route 불필요)
- 뮤테이션: Server Actions (`'use server'`)
- 폼 검증: zod schema + `safeParse`
- 캐시 무효화: `revalidatePath` / `revalidateTag`
- 에러: `error.tsx` 바운더리 + try-catch in Server Actions
- 로딩: `loading.tsx` 스켈레톤
- 스타일: Tailwind CSS + shadcn/ui
- 이미지: `next/image` 최적화
- 인증: 모든 Server Action에서 세션 검증 필수
- `any` 타입 금지
- inline styles 금지
