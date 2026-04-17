전체 스택의 빌드/코드젠을 실행한다.

변경된 스택을 자동 판별하여 해당 빌드만 실행.

## Flutter (코드젠)

```bash
dart run build_runner build --delete-conflicting-outputs
```
- 생성/갱신된 .g.dart, .freezed.dart 파일 목록 보고
- `flutter analyze` 통과 확인

## Prisma (클라이언트 생성)

```bash
npx prisma generate
```
- Prisma Client 재생성 확인

## NestJS (TypeScript 컴파일)

```bash
cd server && npm run build
```
- 컴파일 에러 보고

## Next.js (빌드)

```bash
cd cms && npm run build
```
- 빌드 에러 보고

## 결과

- 각 스택별 성공/실패 보고
- 실패 시 원인 분석 + 수정 방법 안내
