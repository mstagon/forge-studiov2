# Tech Stack — Flutter App

| 영역 | 선택 | 비고 |
|------|------|------|
| Framework | Flutter 3.x (stable) | Material 3 |
| 상태관리 | Riverpod 2 (codegen) | setState 금지 |
| 라우팅 | go_router | Navigator.push 금지 |
| HTTP | dio + retrofit | http 패키지 금지 |
| 모델 | freezed + json_serializable | 코드젠 후 build_runner |
| 로컬 저장 | drift (구조적) / flutter_secure_storage (토큰) | SharedPreferences 는 단순 플래그만 |
| BaaS (선택) | Supabase (supabase_flutter) | `supabase-flutter` 스킬 참조 |
| 테스트 | flutter_test + mocktail / integration_test | 커버리지 80%+ |

## 빌드/검증 명령
```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter analyze && flutter test
flutter test integration_test   # 디바이스/시뮬레이터 필요
```

## 디자인 → 코드 (픽셀 퍼펙트)
Figma MCP 옵트인 (New Workspace) → `figma-pixel-perfect` 스킬: 토큰 추출 → 테마
매핑 → 정확한 측정 → **golden test 스크린샷 vs Figma get_image 대조 검증 루프**.

## API 연동
`flutter-api-integration` 스킬: 계약 → DTO(freezed) → retrofit 코드젠 → dio
인터셉터(auth refresh/retry) → Result 매핑 → repository(오프라인 캐시). 실제 네트워크
테스트 금지 (http_mock_adapter).
