---
name: flutter-api-integration
description: Flutter 외부/BaaS API 연동 풀 파이프라인. 계약 → retrofit 코드젠 → dio 인터셉터(auth/retry) → Result 매핑 → repository → 오프라인 캐시. dio-retrofit 스킬 심화.
globs: client/**/data/remote/**, client/**/data/repository/**, client/**/core/network/**, client/**/data/**/dto/**
---

## 파이프라인 (계약 → 앱 도메인까지 한 줄)

```
contracts/<api>.contract.md (외부 API 스펙 원본)
  → DTO (freezed + json_serializable)
  → Retrofit 인터페이스 (@RestApi) + build_runner
  → Dio (interceptors: auth refresh · retry · logging · error 정규화)
  → Repository (remote + local 캐시, DTO → Entity 변환)
  → Result<T, AppError> (throw 대신 값으로 실패)
  → UseCase / Controller (Riverpod)
```

**핵심 규칙**: repository 경계 밖으로 예외를 던지지 않는다. 네트워크/파싱 실패는
전부 `Result` 로 감싸서 UI 가 값으로 다룬다. (`error-handling` 스킬의 Result/AppError)

## 1. 계약 먼저 (contract-first)

외부/서드파티 API 든 BaaS 든 `contracts/<api>.contract.md` 에 **엔드포인트 · 요청/
응답 필드 · 에러 코드**를 먼저 적는다 (OpenAPI 있으면 그걸 링크). DTO/인터페이스는
계약을 따른다 — 응답 형태 추측 금지. 서버 응답 샘플을 계약에 붙여 둔다.

## 2. DTO (freezed) — 응답 ≠ 도메인

```dart
@freezed
class UserDto with _$UserDto {
  const factory UserDto({
    required String id,
    required String nickname,
    @JsonKey(name: 'avatar_url') String? avatarUrl, // 스네이크 → 카멜 명시
  }) = _UserDto;
  factory UserDto.fromJson(Map<String, dynamic> j) => _$UserDtoFromJson(j);
}
// DTO → Entity 변환은 repository 또는 mapper 에. UI 는 Entity 만 본다.
```

## 3. Retrofit 인터페이스

```dart
@RestApi()
abstract class UserApi {
  factory UserApi(Dio dio, {String baseUrl}) = _UserApi;
  @GET('/users/{id}')
  Future<UserDto> getUser(@Path('id') String id);
  @GET('/users')
  Future<List<UserDto>> listUsers(@Query('cursor') String? cursor);
}
```
`dart run build_runner build --delete-conflicting-outputs` 후 사용. (`dio-retrofit` 스킬 의존성)

## 4. Dio 인터셉터 (한 곳에 조립)

```dart
Dio buildDio(TokenStore tokens) {
  final dio = Dio(BaseOptions(
    baseUrl: Env.apiBaseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
  ));
  dio.interceptors.addAll([
    AuthInterceptor(tokens),   // Authorization 주입 + 401 → refresh → 재시도 (단일 refresh, 큐잉)
    RetryInterceptor(retries: 2, backoff: exponential), // 네트워크/5xx 만, 멱등 요청 한정
    LoggingInterceptor(maskAuth: true), // 토큰/비번 마스킹 (민감정보 로깅 금지)
  ]);
  return dio;
}
```
- **401 refresh**: refresh 진행 중 들어온 요청은 큐잉 → 새 토큰으로 일괄 재시도.
  refresh 도 실패면 로그아웃 이벤트. refresh 중복 호출 방지 (동시성 락).
- **retry**: GET 등 멱등 요청 + 네트워크/5xx 에만. POST 는 기본 재시도 금지(중복 위험).
- 토큰은 `flutter_secure_storage`. 로깅에 Authorization/비밀번호 절대 금지.

## 5. Result 매핑 (throw 금지)

```dart
Future<Result<User, AppError>> getUser(String id) async {
  try {
    final dto = await _api.getUser(id);
    return Ok(dto.toEntity());
  } on DioException catch (e) {
    return Err(_mapDioError(e)); // timeout/네트워크/4xx/5xx → AppError 계층
  } on FormatException catch (_) {
    return Err(const AppError.parsing());
  }
}
```
`_mapDioError`: connectionTimeout → network, 401 → unauthorized, 4xx → client(code),
5xx → server, cancel → ignore. UI 는 AppError 종류로 분기 (`error-handling` 스킬).

## 6. Repository — 오프라인 우선

```dart
// 읽기: local(drift) 캐시 → remote 동기화 (stale-while-revalidate)
// 쓰기: write-through 또는 큐잉 후 재시도 (오프라인 대비)
```
- Riverpod provider 로 노출. 캐시 무효화 키 컨벤션 통일.
- BaaS(Supabase) 는 `supabase-flutter` 스킬 — RLS/리얼타임은 거기 규칙 따름.

## 7. 테스트 (실제 네트워크 금지)

- `http_mock_adapter` (DioAdapter) 로 dio 응답 모킹. 성공/타임아웃/401→refresh/파싱실패
  경로 전부 커버. repository 는 Result 반환 검증.
- 계약 변경 시 DTO/인터페이스/모킹 같이 갱신 (팀 모드면 `forge-dto-broadcast` 가 공지).

## 금지

- `http` 패키지 (dio+retrofit 만), repository 밖으로 예외 throw, 토큰/비번 로깅,
  POST 무분별 재시도, 응답 형태 추측(계약 우선), UI 에서 dio 직접 호출.
