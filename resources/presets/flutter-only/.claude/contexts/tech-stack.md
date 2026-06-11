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
