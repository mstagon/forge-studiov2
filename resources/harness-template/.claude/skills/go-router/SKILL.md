---
name: go-router
description: go_router 라우팅 패턴. 화면 추가, 딥링크, ShellRoute 작성 시 자동 참조.
globs: lib/**/router/**, lib/**/app.dart, lib/**/routes/**
---

## go_router 패턴 가이드

### 기본 라우트 정의
```dart
final router = GoRouter(
  initialLocation: '/',
  routes: [
    ShellRoute(
      builder: (context, state, child) => MainShell(child: child),
      routes: [
        GoRoute(
          path: '/board',
          name: 'board',
          builder: (context, state) => const BoardPage(),
          routes: [
            GoRoute(
              path: ':boardId',
              name: 'board-detail',
              builder: (context, state) {
                final boardId = state.pathParameters['boardId']!;
                return BoardDetailPage(boardId: boardId);
              },
            ),
          ],
        ),
      ],
    ),
  ],
);
```

### Riverpod 연동
```dart
@riverpod
GoRouter router(Ref ref) {
  final authState = ref.watch(authProvider);
  return GoRouter(
    refreshListenable: authState,
    redirect: (context, state) {
      final isLoggedIn = authState.isAuthenticated;
      final isLoginRoute = state.matchedLocation == '/login';
      if (!isLoggedIn && !isLoginRoute) return '/login';
      if (isLoggedIn && isLoginRoute) return '/board';
      return null;
    },
    routes: [...],
  );
}
```

### 네비게이션
```dart
// 이동
context.go('/board/123');
context.push('/board/123/land/5');

// 파라미터 전달
context.goNamed('board-detail', pathParameters: {'boardId': '123'});

// 뒤로가기
context.pop();
```

### 규칙
- Navigator.push 금지 → context.go / context.push 사용
- ShellRoute로 바텀 네비게이션 감싸기
- redirect로 인증 가드 처리
- pathParameters는 항상 String → 사용처에서 파싱
- 딥링크 대응: path 설계 시 웹 URL 구조 고려
