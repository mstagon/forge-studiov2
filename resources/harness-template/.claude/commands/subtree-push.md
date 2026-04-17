"$ARGUMENTS" 스택의 서브트리를 원격 레포로 push한다.

## 사용법

- `/subtree-push all` — 전체 스택 push
- `/subtree-push app` — Flutter 앱만
- `/subtree-push server` — NestJS + Prisma
- `/subtree-push cms` — Next.js CMS

## 프로세스

1. **현재 브랜치 확인** (dev/stg/prd)
2. **해당 스택 빌드/테스트 통과 확인** (push 전 검증)
3. **서브트리 push 실행**:
   - app: `git subtree push --prefix=lib origin-app {branch}`
   - server: `git subtree push --prefix=server origin-server {branch}`
   - cms: `git subtree push --prefix=cms origin-cms {branch}`
4. **결과 보고**

## all 모드

전체 스택 순차 push:
```
1. git subtree push --prefix=lib origin-app {branch}
2. git subtree push --prefix=server origin-server {branch}
3. git subtree push --prefix=cms origin-cms {branch}
```

## 주의

- push 전 해당 스택 변경사항이 커밋되어 있어야 한다
- 원격 remote가 등록되어 있지 않으면 안내
- stg/prd 브랜치에서는 유저 확인 후 push
