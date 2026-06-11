---
name: nextauth-patterns
description: Auth.js v5 (NextAuth) 패턴. 세션/미들웨어/Server Action 가드.
globs: app/**, lib/auth/**, middleware.ts
---

## Auth.js v5 패턴

### 구성 (lib/auth.ts 단일 소스)
```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, Credentials({...})],
  session: { strategy: 'jwt' },
  callbacks: { session: ({ session, token }) => ({ ...session, userId: token.sub }) },
})
```
- `app/api/auth/[...nextauth]/route.ts` 는 `export const { GET, POST } = handlers` 한 줄만

### 미들웨어 (라우트 보호의 1차선)
```ts
export { auth as middleware } from '@/lib/auth'
export const config = { matcher: ['/dashboard/:path*', '/settings/:path*'] }
```
- 미들웨어는 UX 용 1차 차단 — **최종 권한은 항상 서버에서 재검사**

### Server Action 가드 (필수 — 매 액션)
```ts
'use server'
export async function updatePost(input: unknown) {
  const session = await auth()
  if (!session?.userId) throw new Error('UNAUTHORIZED')
  const data = updatePostSchema.parse(input)        // zod 필수
  await assertOwnership(session.userId, data.postId) // IDOR 방지
  ...
}
```

### 금지
- 클라이언트 세션만 믿고 뮤테이션 실행 (useSession 은 표시용)
- Server Action 에서 zod 검증 생략 / ownership 검사 생략
- AUTH_SECRET 하드코딩 (.env 만, 32바이트+)
