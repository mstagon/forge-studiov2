---
name: dio-retrofit
description: Dio+Retrofit API 통신 패턴. API 클라이언트, 인터셉터 작성 시 자동 참조.
globs: client/**/remote/**, client/**/network/**, client/**/api/**
---

## ⚠️ MANDATORY — 기본 네트워크 스택

이 프로젝트는 **dio + retrofit만 사용**한다. `http` 패키지 사용 금지 (코딩 스타일 룰).

### 권장 의존성 (pubspec.yaml — 2026-04 기준 최신 stable)

```yaml
dependencies:
  dio: ^5.9.2
  retrofit: ^4.9.2
  json_annotation: ^4.11.0

dev_dependencies:
  retrofit_generator: ^10.2.5
  json_serializable: ^6.13.1
  build_runner: ^2.14.1
```

추가 후:
```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

## Dio + Retrofit 패턴 가이드

### Dio 인스턴스 설정
```dart
@riverpod
Dio dio(Ref ref) {
  final dio = Dio(BaseOptions(
    baseUrl: Environment.apiBaseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
    headers: {'Content-Type': 'application/json'},
  ));

  dio.interceptors.addAll([
    AuthInterceptor(ref),
    ApiLogInterceptor(),  // logger 패키지 기반 (print 금지)
  ]);

  return dio;
}
```

### Auth 인터셉터 (JWT + 자동 갱신)
```dart
class AuthInterceptor extends Interceptor {
  final Ref _ref;
  AuthInterceptor(this._ref);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _ref.read(authTokenProvider);
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      try {
        final newToken = await _ref.read(authProvider.notifier).refresh();
        if (newToken != null) {
          err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
          final response = await _ref.read(dioProvider).fetch(err.requestOptions);
          return handler.resolve(response);
        }
      } catch (e, st) {
        logger.e('Token refresh failed', error: e, stackTrace: st);
      }
      // refresh 실패 → 로그아웃
      _ref.read(authProvider.notifier).logout();
    }
    handler.next(err);
  }
}
```

### Retrofit 클라이언트
```dart
@RestApi()
abstract class BoardApi {
  factory BoardApi(Dio dio) = _BoardApi;

  @GET('/boards')
  Future<List<BoardDto>> getBoards();

  @GET('/boards/{boardId}')
  Future<BoardDetailDto> getBoardDetail(@Path() String boardId);

  @POST('/board/roll')
  Future<RollResultDto> rollDice();

  @POST('/board/buy')
  Future<BuyResultDto> buyLand(@Body() BuyLandRequest request);
}
```

### Repository 패턴 (Result + AppError)
```dart
class BoardRepositoryImpl implements BoardRepository {
  final BoardApi _api;
  BoardRepositoryImpl(this._api);

  @override
  Future<Result<List<Board>>> getBoards() async {
    try {
      final dtos = await _api.getBoards();
      return Result.success(dtos.map((d) => d.toEntity()).toList());
    } on DioException catch (e, st) {
      logger.e('getBoards failed', error: e, stackTrace: st);
      return Result.failure(e.toAppError());
    } on FormatException catch (e, st) {
      logger.e('getBoards parse error', error: e, stackTrace: st);
      return Result.failure(AppError.parse(message: e.message, stackTrace: st));
    }
  }
}
```

### 규칙
- API 키/URL 하드코딩 금지 → Environment config 사용
- 에러 핸들링: DioException → AppError (toAppError 확장 메서드)
- Repository는 반드시 Result<T> 반환 (throw 금지)
- 토큰은 flutter_secure_storage에 저장
- 401 시 자동 refresh → 실패 시 로그아웃
- 로깅: ApiLogInterceptor 사용 (LogInterceptor 대신, logger 패키지 기반)
- catch에서 stackTrace 반드시 캡처 (`catch (e, st)`)
- 코드젠 후 반드시: `dart run build_runner build --delete-conflicting-outputs`
