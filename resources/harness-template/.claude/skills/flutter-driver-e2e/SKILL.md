---
name: flutter-driver-e2e
description: Use when writing Flutter integration/E2E tests or driving running simulators — Playwright-style patterns built on flutter_driver + mcp__dart tools.
---

# Flutter Driver E2E (Playwright-style for simulators)

시뮬레이터/디바이스에서 도는 Flutter 앱을 **외부에서 제어**하는 E2E 자동화 레이어.
web Playwright의 idiom을 Flutter에 이식하되, 핵심 엔진은 `flutter_driver` + `mcp__dart` 툴.

## When to use

| 상황 | 도구 |
|------|------|
| 단일 함수 / pure logic | `test` + mocktail (unit) |
| 단일 위젯 / 작은 트리 | `testWidgets` + `pumpWidget` (widget) |
| **실제 앱 런타임, 멀티 화면 플로우, OS 레벨 제스처, 네트워크 포함 시나리오** | **flutter_driver + mcp__dart (this skill)** |
| CI 병렬 × 스크린샷 회귀 | `integration_test/` 패키지 (flutter_driver 상위 호환) |

Rule of thumb: **"앱을 켠 뒤 사람처럼 흐름을 따라가야" 하면 이 스킬.** 그 외엔 widget test가 더 빠르고 안정적.

## 선택자 매핑 (Playwright ↔ flutter_driver)

| Playwright | Flutter Finder | 언제 |
|-----------|---------------|------|
| `page.locator('#login-btn')` | `find.byKey(Key('login-btn'))` | **1순위.** 모든 interactive 위젯에 `Key` 부여 |
| `page.getByText('로그인')` | `find.text('로그인')` | 다국어 텍스트 주의 — Key 우선 |
| `page.getByRole('button')` | `find.byType(ElevatedButton)` | 타입 모호할 땐 부모 Key로 scope |
| `page.getByTestId('foo')` | `find.byValueKey('foo')` (driver) | driver extension의 ValueKey 매칭 |
| `page.locator('form >> #email')` | `find.descendant(of: ..., matching: ...)` | ancestor/descendant 조합 |

**원칙:** Playwright에서 `data-testid` 쓰듯 Flutter에선 `Key('semantic-id')`를 위젯에 박아라. `find.text`는 로케일·copy 변경에 취약.

## Wait / Settle idiom

Playwright는 대부분 auto-wait. Flutter는 명시적으로 pump해야 함.

| Playwright | Flutter 등가 | 주의 |
|-----------|------------|------|
| auto-wait on action | `tester.pumpAndSettle()` (widget test) / `driver.waitUntilNoTransientCallbacks()` (driver) | 애니메이션/Future가 모두 끝날 때까지 |
| `page.waitForSelector` | `driver.waitFor(finder, timeout: ...)` | 조건 만족까지 폴링 |
| `expect(locator).toBeVisible()` | `driver.waitFor(finder).then(...)` 또는 `expectLater(find.X, findsOneWidget)` | 프레임 단위 vs wallclock 구분 |
| `page.waitForLoadState('networkidle')` | Flutter엔 없음 — **앱에서 로딩 끝 상태를 Key로 노출** (e.g. `Key('home-loaded')`) 후 waitFor | 네트워크 idle은 직접 신호화 |
| `page.waitForTimeout(ms)` | `Future.delayed` | **안티패턴.** 조건 대기로 바꿔라 |

**pumpAndSettle 함정:** 무한 애니메이션(shimmer, pulse)이 있으면 hang. 조건 waitFor로 갈아타거나 애니메이션 disable 플래그.

## mcp__dart 툴 오케스트레이션

하네스가 제공하는 `mcp__dart` MCP가 실제 시뮬레이터 제어권을 쥐고 있음. 전형적 체인:

```
1. list_devices                → 실행 가능한 시뮬레이터 확인
2. launch_app(path, device)    → 앱 실행 + VM service attach
3. set_widget_selection_mode   → DevTools 셀렉션 활성화 (디버그용)
4. get_widget_tree             → 현재 화면 위젯 덤프 (selector 검증)
5. flutter_driver({action})    → 실제 tap/enter/scroll
6. get_runtime_errors          → 상호작용 후 에러 즉시 수집
7. get_app_logs(since=...)     → print/logger 출력 수집
8. hot_reload                  → 빠른 반복 (코드 수정 후)
9. stop_app                    → 정리
```

**원칙:** 스크립트 한 줄로 `flutter test` 돌리지 말고, 단계별 MCP 툴 호출로 **관찰 + 판정 + 리커버리**를 세션 안에서 해라. 에러가 나면 즉시 `get_runtime_errors`로 원인 확인 → selector 교체 또는 waitFor 추가.

## Canonical E2E flow (로그인 → 홈 → 상세)

```dart
// integration_test/login_flow_e2e.dart
import 'package:integration_test/integration_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:myapp/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('login → home → detail 플로우', (tester) async {
    // Arrange: 앱 부팅
    app.main();
    await tester.pumpAndSettle();

    // Act 1: 로그인
    await tester.enterText(find.byKey(const Key('login-email')), 'test@x.com');
    await tester.enterText(find.byKey(const Key('login-password')), 'pw1234');
    await tester.tap(find.byKey(const Key('login-submit')));
    await tester.pumpAndSettle(const Duration(seconds: 3));

    // Assert 1: 홈 도달
    expect(find.byKey(const Key('home-loaded')), findsOneWidget);

    // Act 2: 첫 아이템 탭
    await tester.tap(find.byKey(const Key('item-0')));
    await tester.pumpAndSettle();

    // Assert 2: 상세 도달
    expect(find.byKey(const Key('detail-screen')), findsOneWidget);
  });
}
```

실행:
```bash
flutter test integration_test/login_flow_e2e.dart -d <device-id>
```

또는 MCP 오케스트레이션 (대화형 디버깅):
```
mcp__dart__list_devices
mcp__dart__launch_app(path="client", device="<id>")
mcp__dart__get_widget_tree       # 현재 화면 구조 확인
mcp__dart__flutter_driver(...)   # 단계별 상호작용
mcp__dart__get_runtime_errors    # 단계마다 에러 검증
```

## Key 규칙 (성공의 90%)

신규 위젯 작성 시 **interactive + state-bearing 위젯엔 무조건 Key**:

```dart
// 1. Form 필드
TextField(key: Key('login-email'), ...)

// 2. 버튼
ElevatedButton(key: Key('login-submit'), onPressed: ..., ...)

// 3. 리스트 아이템 (인덱스 기반)
ListView.builder(
  itemBuilder: (_, i) => ItemCard(key: Key('item-$i'), ...),
)

// 4. 로딩/에러/성공 상태 분기 화면
if (loaded) Column(key: const Key('home-loaded'), ...)
else if (error) Column(key: const Key('home-error'), ...)
else Column(key: const Key('home-loading'), ...)
```

**Key 네이밍 컨벤션:** `{screen}-{role}` (`login-submit`, `home-loaded`, `item-$index`).
화면 단위 접두어 없는 `submit`, `button` 같은 이름 금지 — 다른 화면에서 충돌.

## 디버깅 플레이북

| 증상 | 첫 액션 |
|------|--------|
| `Finder found zero widgets` | `mcp__dart__get_widget_tree`로 실제 트리 덤프 → Key 존재 확인 |
| `pumpAndSettle timed out after 10s` | 무한 애니메이션 의심 → 구체적 `waitFor(finder)` 로 교체 |
| Tap 후 화면 전환 안 됨 | `get_runtime_errors` + `get_app_logs` 동시에 수집 — 예외가 silently 먹히는 중일 수 있음 |
| CI에선 실패, 로컬엔 성공 | 타이밍 이슈 99%. `pumpAndSettle(Duration(seconds: 5))` 대신 **상태 Key 기반 waitFor** |
| 텍스트 매칭 실패 | 로케일·공백·invisible char. `find.byKey`로 이전 |

## Anti-patterns

- `Future.delayed` + `pump` 조합으로 타이밍 맞추기 → CI에서 깨짐
- `find.text('버튼')`으로만 조회 → 다국어/카피 변경에 취약
- 한 테스트에서 5개 이상 화면 이동 → 실패 시 원인 규명 불가, 쪼개라
- `tester.tap` 후 `pump` (한 프레임만) → 네비게이션은 `pumpAndSettle` 필요
- 테스트에서 실제 API 호출 → mock / fake repository로 격리

## CI 통합

```yaml
# .github/workflows/e2e.yml 예시
- name: E2E (iOS simulator)
  run: |
    xcrun simctl boot "iPhone 15"
    flutter test integration_test/ -d "iPhone 15"
```

- 스크린샷 회귀: `integration_test`의 `binding.takeScreenshot(name)` 사용
- 실패 아티팩트: 로그 + 스크린샷 + 위젯 트리 덤프 업로드 (원인 규명의 전부)

## 연관

- 새 E2E 테스트 작성 → **tdd-workflow** 스킬 먼저 적용 (Red-Green-Refactor)
- 애니메이션 heavy 화면 E2E → **mobile-touch** 참조 (무한 애니 disable 플래그)
- CI/릴리즈 연동 → **deployment-patterns** 참조
