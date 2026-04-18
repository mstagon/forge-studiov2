---
name: riverpod-patterns
description: Riverpod 상태관리 패턴. provider/controller 작성 시 자동 참조.
globs: client/**/controllers/**, client/**/providers/**
---

## Riverpod 패턴 가이드

### AsyncNotifier (비동기 데이터)
```dart
@riverpod
class ProductList extends _$ProductList {
  @override
  FutureOr<List<Product>> build() => _fetch();

  Future<List<Product>> _fetch() async {
    final repo = ref.watch(productRepositoryProvider);
    return repo.getAll();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetch);
  }
}
```

### Notifier (동기 상태)
```dart
@riverpod
class CartState extends _$CartState {
  @override
  List<CartItem> build() => [];

  void add(CartItem item) {
    state = [...state, item];
  }
}
```

### 위젯 연결
```dart
class ProductListPage extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(productListProvider);
    return products.when(
      data: (list) => ListView.builder(...),
      loading: () => const CircularProgressIndicator(),
      error: (e, st) => ErrorWidget(e),
    );
  }
}
```

### 규칙
- ref.watch → build 안에서만
- ref.read → 콜백(onPressed, onTap) 안에서만
- autoDispose 기본 (keepAlive는 명시적으로)
- AsyncValue의 loading/error/data 3상태 반드시 처리
- select()로 불필요한 rebuild 방지
