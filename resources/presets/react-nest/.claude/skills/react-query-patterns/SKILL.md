---
name: react-query-patterns
description: TanStack Query v5 패턴 (React). 서버 상태 패칭/캐시/뮤테이션/낙관적 업데이트.
globs: client/src/features/**, client/src/shared/api/**, client/src/app/**
---

## TanStack Query v5 패턴

### 원칙
- **서버 상태 = Query 소유**. useEffect+fetch / 수동 로딩 state 금지.
- 컴포넌트는 `useXQuery()` / `useXMutation()` hook 만 import. fetch 는 api 레이어.

### Query hook (features/<f>/hooks)
```ts
const todoKeys = {
  all: ['todos'] as const,
  detail: (id: string) => ['todos', id] as const,
}
export function useTodos() {
  return useQuery({ queryKey: todoKeys.all, queryFn: () => api.todos.list() })
}
```
- 캐시 키는 팩토리 객체로 통일 (string 흩뿌리기 금지 → invalidate 일관).
- queryFn 은 features/<f>/api 의 함수만. 컴포넌트 인라인 fetch 금지.

### Mutation + invalidate
```ts
const qc = useQueryClient()
export function useCreateTodo() {
  return useMutation({
    mutationFn: api.todos.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: todoKeys.all }),
  })
}
```

### 낙관적 업데이트 (명시적으로만)
```ts
onMutate: async (next) => {
  await qc.cancelQueries({ queryKey: todoKeys.all })
  const prev = qc.getQueryData(todoKeys.all)
  qc.setQueryData(todoKeys.all, (old) => [...old, next])
  return { prev }
},
onError: (_e, _v, ctx) => qc.setQueryData(todoKeys.all, ctx.prev),
onSettled: () => qc.invalidateQueries({ queryKey: todoKeys.all }),
```

### 인증 (401 refresh)
- api client(shared/api) 의 인터셉터 한 곳에서 401 → refresh → 재시도.
- 토큰은 메모리 + httpOnly 쿠키 권장 (localStorage 토큰은 XSS 위험).

### 금지
- 컴포넌트에서 fetch/axios 직접 호출, useEffect 로 수동 패칭
- 서버 데이터를 Zustand/useState 에 복제 (Query 캐시가 단일 소스)
- queryKey 문자열 하드코딩 흩뿌리기
