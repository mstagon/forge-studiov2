---
name: logging
description: 상용 로깅 패턴. 구조화된 로그, 레벨별 처리, Crashlytics 연동.
globs: client/**/logger/**, client/**/core/logger.dart, client/**/core/logging/**
---

## 로깅 패턴 (상용 서비스)

### Logger 설정 (core/logger.dart)
```dart
import 'package:logger/logger.dart';

/// 앱 전역 로거. print() 대신 반드시 이것을 사용.
final logger = Logger(
  printer: PrettyPrinter(
    methodCount: 2,
    errorMethodCount: 8,
    lineLength: 120,
    colors: true,
    printEmojis: true,
    dateTimeFormat: DateTimeFormat.onlyTimeAndSinceStart,
  ),
  level: kReleaseMode ? Level.warning : Level.debug,
);

/// Crashlytics 연동 로거 (릴리즈용)
class CrashlyticsLogOutput extends LogOutput {
  @override
  void output(OutputEvent event) {
    if (event.level.index >= Level.error.index) {
      FirebaseCrashlytics.instance.log(event.lines.join('\n'));
    }
  }
}
```

### 로그 레벨 기준
```dart
// 🔵 debug: 개발 중 디버깅 (릴리즈에서 무시됨)
logger.d('Board state: position=$position, dice=$dice');

// 🟢 info: 주요 사용자 액션, 상태 전환
logger.i('User rolled dice: result=$result, newPosition=$newPosition');

// 🟡 warning: 예상된 이상 상황, 복구 가능
logger.w('Token refresh failed, retrying...', error: e);

// 🔴 error: 예외 발생, 복구 시도 필요
logger.e('Failed to buy land', error: e, stackTrace: st);

// 💀 fatal: 앱 크래시 직전, Crashlytics 전송
logger.f('Unrecoverable auth state', error: e, stackTrace: st);
```

### API 로깅 인터셉터
```dart
class ApiLogInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    logger.d(
      '→ ${options.method} ${options.path}',
    );
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    logger.d(
      '← ${response.statusCode} ${response.requestOptions.path} '
      '[${response.requestOptions.extra['duration'] ?? ''}ms]',
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    logger.e(
      '✗ ${err.requestOptions.method} ${err.requestOptions.path} '
      '→ ${err.response?.statusCode ?? 'NO_RESPONSE'}',
      error: err,
      stackTrace: err.stackTrace,
    );
    handler.next(err);
  }
}
```

### Riverpod Provider 에러 로깅
```dart
class ProviderLogger extends ProviderObserver {
  @override
  void providerDidFail(
    ProviderBase provider,
    Object error,
    StackTrace stackTrace,
    ProviderContainer container,
  ) {
    logger.e(
      'Provider failed: ${provider.name ?? provider.runtimeType}',
      error: error,
      stackTrace: stackTrace,
    );
  }
}

// main.dart에서 등록
ProviderScope(
  observers: [ProviderLogger()],
  child: const MyApp(),
);
```

### Flutter 에러 바운더리
```dart
void main() {
  // Flutter 프레임워크 에러
  FlutterError.onError = (details) {
    logger.e('FlutterError', error: details.exception, stackTrace: details.stack);
    FirebaseCrashlytics.instance.recordFlutterFatalError(details);
  };

  // 비동기 에러 (Zone 밖)
  PlatformDispatcher.instance.onError = (error, stack) {
    logger.f('PlatformError', error: error, stackTrace: stack);
    FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
    return true;
  };

  runApp(const ProviderScope(
    observers: [ProviderLogger()],
    child: MyApp(),
  ));
}
```

### 로깅 규칙
- **print() 절대 금지** → logger.d/i/w/e/f 사용
- **민감정보 로깅 금지**: 토큰, 비밀번호, 개인정보는 마스킹
  ```dart
  // ❌ logger.d('Token: $token');
  // ✅ logger.d('Token: ${token.substring(0, 8)}...');
  ```
- **릴리즈 빌드**: Level.warning 이상만 출력 (debug/info 무시)
- **에러 로깅 시 반드시 stackTrace 포함** (Crashlytics 디버깅용)
- **API 요청/응답**: 바디 전체 로깅은 debug만 (릴리즈에서 자동 차단)
- **사용자 액션 로깅**: info 레벨로 주요 이벤트 (로그인, 주사위, 구매)
- **Firebase Crashlytics**: error/fatal 레벨은 자동 전송
