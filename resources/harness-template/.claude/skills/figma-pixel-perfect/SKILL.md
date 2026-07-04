---
name: figma-pixel-perfect
description: Figma MCP 로 디자인을 픽셀 퍼펙트로 구현. 토큰 추출 → 테마 매핑 → 정확한 레이아웃 → 스크린샷 diff 검증 루프. Flutter/React 공용.
globs: client/**/presentation/**, client/**/widgets/**, client/**/screens/**, client/**/theme/**, client/src/features/**, client/src/shared/**
---

## 목표: "대충 비슷"이 아니라 **픽셀 퍼펙트**

Figma 를 눈으로 보고 손으로 옮기면 간격/폰트/색이 미묘하게 어긋난다. MCP 로
**정확한 값을 뽑아서** 구현하고, **렌더 결과를 Figma 이미지와 대조**하는 검증
루프로 일치를 강제한다.

## Figma MCP 연결 (둘 중 하나 — New Workspace 옵트인 또는 수동)

- **공식 remote (권장)** — pixel-perfect 에 최적 (이미지/변수/코드 전부):
  `claude mcp add --transport http figma https://mcp.figma.com/mcp` → `/mcp` 로 인증.
  Figma 데스크톱 불필요. Dev/Full seat 필요.
- **공식 desktop** — `http://127.0.0.1:3845/mcp` (Figma 앱 Dev Mode 에서 "Enable MCP server").
- **Framelink (포터블/무료 토큰)** — `npx -y figma-developer-mcp --stdio` + `FIGMA_API_KEY`
  (Figma personal access token). tools: `get_figma_data`, `download_figma_images`.

연결된 MCP 가 노출하는 도구 이름은 서버마다 다르다. 아래 **역할**로 매핑해서 사용:
- **디자인 변수/토큰** (색·타이포·간격·radius): `get_variable_defs` / `get_figma_data`
- **레퍼런스 이미지** (프레임 렌더): `get_image` / `get_screenshot` / `download_figma_images`
- **코드/구조 힌트**: `get_code` / `get_metadata`
- **컴포넌트↔코드 매핑**: `get_code_connect_map`

## 워크플로 (순서 고정)

### 0. 프레임 선택 확인
사용자에게 Figma 에서 대상 프레임을 선택하게 하거나 node-id/URL 을 받는다.
`get_metadata` 로 프레임 크기(px) + 트리 구조 파악.

### 1. 토큰 먼저 (매직 넘버 금지)
`get_variable_defs` 로 **색상·타이포그래피·간격·radius·shadow** 를 추출 →
프로젝트 **디자인 토큰 레이어**에 매핑. 위젯/컴포넌트에 hex/px 를 직접 박지 마라.
- Flutter: `theme/` 의 `ColorScheme` + `TextTheme` + spacing 상수 (`AppSpacing`)로.
  색은 `Color(0xFFRRGGBB)` 정확값. 타이포는 fontFamily/fontWeight/fontSize/height/letterSpacing 전부.
- React: Tailwind `theme.extend` 또는 CSS 변수 토큰. shadcn 토큰과 정렬.
- **Figma 변수 이름 → 토큰 이름 1:1 대응표**를 주석/파일로 남겨 추적.

### 2. 레이아웃 = 정확한 측정값
`get_code`/`get_metadata` 로 auto-layout(방향·gap·padding·정렬)·constraint·크기를 읽는다.
- Figma px ≈ Flutter logical px (1:1, mdpi 기준). React 는 px 그대로 (또는 rem 환산 일관).
- Figma **auto-layout** → Flutter `Row`/`Column` + `MainAxisAlignment` + `spacing`(gap),
  React 는 flex + gap. **constraint(hug/fill/fixed)** → `Expanded`/`Flexible`/고정 크기.
- 8pt 그리드 정렬 확인. effect(shadow/blur) → `BoxShadow`/`BackdropFilter` (React: box-shadow/backdrop-filter).
- 이미지/아이콘 asset 은 `download_figma_images` 로 export (SVG 우선, 없으면 2x/3x PNG).

### 3. 구현
토큰 + 측정값으로 위젯/컴포넌트 트리 작성. 재사용 단위 분리. const/RepaintBoundary(Flutter).

### 4. ⭐ 스크린샷 diff 검증 루프 (핵심 — 이걸 빼면 픽셀 퍼펙트 아님)
1. **레퍼런스**: `get_image` 로 Figma 프레임 이미지 저장.
2. **렌더**: 구현 화면을 실제로 렌더해서 스크린샷:
   - Flutter: golden test (`matchesGoldenFile`) 로 위젯 렌더, 또는 시뮬레이터에서
     `integration_test` + `takeScreenshot` / 디바이스 스크린샷. `flutter-driver-e2e` 스킬 참조.
   - React: Playwright `page.screenshot()` (playwright MCP 또는 e2e).
3. **대조**: 두 이미지를 나란히 보고 **차이를 구체적으로 지목** — "버튼 상단 간격
   16→20px", "제목 폰트 weight 600→700", "카드 그림자 blur 부족", "primary 색 한 톤 밝음".
   추측하지 말고 1번에서 뽑은 토큰/측정값과 비교.
4. **수정 → 2번부터 반복**. 눈에 띄는 차이가 없을 때까지.
5. **golden test 로 잠금**: 일치한 렌더를 golden 파일로 커밋 → 회귀 방지.

### 5. 보고
"Figma 대비 일치 항목 / 남은 차이(있으면 사유) / 잠근 golden 목록"을 명시.

## 규칙

- **토큰 우선, 매직 넘버 금지**. Figma 변수 없는 값은 임의로 만들지 말고 사용자에 확인.
- 폰트는 **정확히** — family/weight/size/line-height/letter-spacing 전부. 폰트 파일 없으면 pubspec/asset 등록.
- 반응형: Figma constraint 를 Flex/Expanded(Flutter) · flex/grid(React) 로. 하드코딩 폭 지양.
- 다크모드 변수 있으면 라이트/다크 토큰 둘 다 매핑.
- 검증 루프를 **반드시** 돈다. "구현했으니 됐다"로 끝내지 마라 — 이미지 대조가 완료 조건.
- 접근성(Semantics/aria)은 디자인과 별개로 필수.
