# Git Workflow Rules

## 레포 구조 (모노레포 + 서브트리)

로컬은 **모노레포**로 작업하고, 원격은 **git subtree**로 각 스택별 독립 레포로 관리한다.

```
<project>/ (로컬 모노레포)
├── lib/        → 원격: app repo (Flutter)
├── server/     → 원격: server repo (NestJS)
├── prisma/     → 원격: server repo에 포함 또는 독립
├── cms/        → 원격: cms repo (Next.js)
└── docs/       → 모노레포 전용 (push 안 함)
```

### 서브트리 명령어

```bash
# 서브트리 추가 (최초 1회)
git remote add origin-app <app-repo-url>
git remote add origin-server <server-repo-url>
git remote add origin-cms <cms-repo-url>

# 서브트리 push (스택별 원격 레포로)
git subtree push --prefix=lib origin-app <branch>
git subtree push --prefix=server origin-server <branch>
git subtree push --prefix=cms origin-cms <branch>

# 서브트리 pull (원격에서 가져오기)
git subtree pull --prefix=lib origin-app <branch> --squash
git subtree pull --prefix=server origin-server <branch> --squash
git subtree pull --prefix=cms origin-cms <branch> --squash
```

### 서브트리 규칙

- 모노레포에서 작업 → 커밋 → 서브트리 push로 각 원격 레포에 배포
- 서브트리 pull 시 `--squash` 사용 (히스토리 정리)
- 크로스 스택 변경은 모노레포에서 한 커밋으로 → 서브트리 push는 스택별 분리
- 서브트리 push 전 해당 스택 빌드/테스트 통과 확인
- 각 원격 레포에도 동일한 dev/stg/prd 브랜치 구조 유지

## 환경 브랜치 (dev / stg / prd)

모노레포와 각 서브트리 원격 레포 모두 동일한 브랜치 구조:
- `prd` — 프로덕션. 직접 커밋 금지. stg에서 PR 머지만 허용.
- `stg` — 스테이징/QA. dev에서 PR 머지. 배포 전 최종 검증.
- `dev` — 개발 통합. 피처 브랜치에서 PR 머지.

## 피처 브랜치
- `feat/{name}` — 피처 개발 → dev로 PR
- `fix/{name}` — 버그 수정 → dev로 PR
- `hotfix/{name}` — 긴급 수정 → stg + prd 동시 PR
- `refactor/{name}` — 리팩토링 → dev로 PR

## 머지 + 배포 플로우

```
[모노레포]
feat/xxx → dev → stg → prd

[서브트리 push — 머지 후 각 원격 레포로]
dev 머지 → git subtree push --prefix=lib origin-app dev
           git subtree push --prefix=server origin-server dev
           git subtree push --prefix=cms origin-cms dev

stg 머지 → 각 원격 레포 stg로 subtree push
prd 머지 → 각 원격 레포 prd로 subtree push → 프로덕션 배포
```

## 커밋
- conventional commits 형식: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- 커밋 메시지는 한글 또는 영어 (혼용 OK)
- 하나의 커밋에 하나의 논리적 변경
- 코드젠 파일(.g.dart, .freezed.dart)은 별도 커밋
- .env, 시크릿 파일 절대 커밋 금지
- 크로스 스택 변경 시 커밋 메시지에 영향 스택 명시: `feat(server,app): 로그인 API + UI`

## PR
- PR 제목: conventional commits 형식
- PR 본문: Summary + Test Plan + 영향 스택
- dev → stg: 리뷰 3종 통과 필수 (code-reviewer + security-auditor + spec-verifier)
- stg → prd: QA 승인 + CI 전체 통과 필수
- 서브트리 원격 레포 PR: 해당 스택 CI만 통과

## 환경별 .env
- `.env.dev` — 개발 환경 (로컬/개발 서버)
- `.env.stg` — 스테이징 환경 (QA 서버)
- `.env.prd` — 프로덕션 환경 (실서버)
- 모든 .env 파일 git 커밋 금지 (.gitignore 필수)
- 각 서브트리 원격 레포에도 별도 .env 관리

## 위험 명령 금지
- `git push --force` 금지
- `git reset --hard` 금지
- `git commit --no-verify` 금지
- stg, prd 브랜치 직접 push 금지 → PR만 허용
- `git subtree split` 함부로 하지 마라 → 히스토리 꼬임 위험
