---
name: error-handling
description: 상용 에러 핸들링 패턴. Result 타입, AppError 계층, ErrorBoundary, 사용자 에러 표시.
globs: lib/**/error/**, lib/**/result/**, lib/**/utils/result.dart, lib/**/core/**
---

## 에러 핸들링 패턴 (상용 서비스)

### Result 타입 (core/utils/result.dart)
```dart
@freezed
sealed class Result<T> with _$Result<T> {
  const factory Result.success(T data) = Success<T>;
  const factory Result.failure(AppError error) = Failure<T>;
}

extension ResultX<T> on Result<T> {
  T? get dataOrNull => switch (this) {
    Success(:final data) => data,
    Failure() => null,
  };

  AppError? get errorOrNull => switch (this) {
    Success() => null,
    Failure(:final error) => error,
  };

  Result<R> map<R>(R Function(T) transform) => switch (this) {
    Success(:final data) => Result.success(transform(data)),
    Failure(:final error) => Result.failure(error),
  };
}
```

### AppError 계층 (core/error/app_error.dart)
```dart
@freezed
sealed class AppError with _$AppError {
  /// 네트워크 에러 (타임아웃, 연결 없음)
  const factory AppError.network({
    required String message,
    int? statusCode,
    StackTrace? stackTrace,
  }) = NetworkError;

  /// 서버 에러 (4xx, 5xx)
  const factory AppError.server({
    required String message,
    required int statusCode,
    String? serverCode,
    StackTrace? stackTrace,
  }) = ServerError;

  /// 인증 에러 (401, 토큰 만료)
  const factory AppError.auth({
    required String message,
    StackTrace? stackTrace,
  }) = AuthError;

  /// 파싱/변환 에러
  const factory AppError.parse({
    required String message,
    StackTrace? stackTrace,
  }) = ParseError;

  /// 로컬 저장소 에러
  const factory AppError.cache({
    required String message,
    StackTrace? stackTrace,
  }) = CacheError;

  /// 비즈니스 로직 에러 (잔액 부족, 이미 구매 등)
  const factory AppError.business({
    required String message,
    required String code,
  }) = BusinessError;

  /// 알 수 없는 에러
  const factory AppError.unknown({
    required String message,
    Object? originalError,
    StackTrace? stackTrace,
  }) = UnknownError;
}
```

### DioException → AppError 변환
```dart
extension DioExceptionX on DioException {
  AppError toAppError() {
    switch (type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return AppError.network(
          message: '서버 응답이 느립니다. 다시 시도해주세요.',
          stackTrace: stackTrace,
        );
      case DioExceptionType.connectionError:
        return AppError.network(
          message: '인터넷 연결을 확인해주세요.',
          stackTrace: stackTrace,
        );
      case DioExceptionType.badResponse:
        final statusCode = response?.statusCode ?? 0;
        if (statusCode == 401) {
          return AppError.auth(
            message: '로그인이 필요합니다.',
            stackTrace: stackTrace,
          );
        }
        final serverMsg = response?.data?['message'] as String?;
        final serverCode = response?.data?['code'] as String?;
        if (serverCode != null) {
          return AppError.business(message: serverMsg ?? '요청 실패', code: serverCode);
        }
        return AppError.server(
          message: serverMsg ?? '서버 오류가 발생했습니다.',
          statusCode: statusCode,
          stackTrace: stackTrace,
        );
      default:
        return AppError.unknown(
          message: '알 수 없는 오류가 발생했습니다.',
          originalError: this,
          stackTrace: stackTrace,
        );
    }
  }
}
```

### AppError → 사용자 메시지
```dart
extension AppErrorX on AppError {
  String get userMessage => switch (this) {
    NetworkError(:final message) => message,
    ServerError(:final message) => message,
    AuthError() => '로그인이 필요합니다.',
    ParseError() => '데이터 처리 중 오류가 발생했습니다.',
    CacheError() => '저장소 오류가 발생했습니다.',
    BusinessError(:final message) => message,
    UnknownError() => '알 수 없는 오류가 발생했습니다.',
  };

  bool get isRetryable => switch (this) {
    NetworkError() => true,
    ServerError(:final statusCode) => statusCode >= 500,
    _ => false,
  };
}
```

### UI 에러 표시 패턴
```dart
// AsyncValue 에러 처리 (Riverpod)
asyncValue.when(
  data: (data) => ContentWidget(data: data),
  loading: () => const LoadingWidget(),
  error: (error, stack) {
    final appError = error is AppError ? error : AppError.unknown(
      message: error.toString(),
      originalError: error,
      stackTrace: stack,
    );
    return ErrorRetryWidget(
      message: appError.userMessage,
      onRetry: appError.isRetryable ? () => ref.invalidate(provider) : null,
    );
  },
);

// 스낵바 에러 표시 (일회성 액션)
final result = await ref.read(boardProvider.notifier).buyLand(tileId);
switch (result) {
  case Success(:final data):
    // 성공 처리
  case Failure(:final error):
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error.userMessage)),
    );
}
```

### 규칙
- catch에서 에러를 삼키지 마라 → 반드시 Result.failure로 전파하거나 로깅
- 사용자에게 스택 트레이스, 기술적 메시지 노출 금지
- 서버 에러 코드(code)로 비즈니스 에러 분기 (문자열 비교 금지)
- 401은 AuthError로 → 자동 토큰 갱신 또는 로그인 화면 이동
- isRetryable인 에러만 재시도 버튼 표시
- Repository 경계에서만 try-catch → Presentation은 Result로 받음
