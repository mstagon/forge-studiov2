---
name: supabase-flutter
description: Supabase BaaS 연동 패턴 (Flutter). 인증/DB/리얼타임/스토리지/RLS.
globs: lib/data/remote/**, lib/core/supabase/**, contracts/**
---

## Supabase Flutter 패턴

### 초기화 (main.dart 전에 1회)
```dart
await Supabase.initialize(url: Env.supabaseUrl, anonKey: Env.supabaseAnonKey);
final supabase = Supabase.instance.client; // data 레이어에서만 사용
```
- url/anonKey 는 --dart-define 또는 envied — 하드코딩 금지. service_role 키는 앱에 절대 금지.

### 인증
```dart
// data/remote/auth_remote.dart 에 격리
await supabase.auth.signInWithPassword(email: e, password: p);
supabase.auth.onAuthStateChange  // → Riverpod StreamProvider 로 단일 노출
```
- 세션 갱신은 SDK 가 자동 — 토큰 직접 저장 금지 (SDK 내부 secure storage 사용)

### DB 쿼리 (RLS 전제)
```dart
final rows = await supabase.from('todos').select().eq('user_id', uid).order('created_at');
```
- **모든 테이블에 RLS on + 정책 명시** — 정책 없는 테이블 접근은 보안 사고. 계약 파일에 정책 기록:
  `contracts/todos.contract.md` 에 컬럼 + RLS (`auth.uid() = user_id`) 같이.
- select 컬럼 명시 (over-fetch 금지). DTO 는 freezed + fromJson.

### 리얼타임
```dart
supabase.channel('todos').onPostgresChanges(
  event: PostgresChangeEvent.all, schema: 'public', table: 'todos',
  callback: (p) => ...).subscribe();
```
- 채널은 repository 가 소유 — dispose 에서 unsubscribe 필수 (누수 1순위)

### 스토리지
- 업로드 경로: `<bucket>/<uid>/<uuid>.<ext>` — uid prefix 가 RLS 정책의 기준
- public bucket 은 진짜 공개 자산만. signed URL 은 만료 짧게 (1h)

### 금지
- 위젯/컨트롤러에서 supabase client 직접 호출 (data/remote 경유)
- service_role 키 클라이언트 포함, RLS 끈 테이블, 토큰 수동 캐싱
