# MCP Usage Rules (MANDATORY)

## 글로벌 MCP (모든 프로젝트 공용)

- **github** — PR/이슈 관리, 코드 검색
- **pencil** — UI 디자인 (.pen 파일)

## 프로젝트 MCP (하네스 자동 포함, `.claude/mcp.json`)

| MCP | 용도 | 자동 활용 시점 |
|-----|------|---------------|
| `context7` | 공식 문서 조회 | 패키지 API 사용 전 필수 조회 |
| `dart` | Dart 언어 서버 | Dart/Flutter 코드 작성 시 |
| `serena` | 코드베이스 분석 | 아키텍처 파악, 리팩토링 시 |
| `sequential-thinking` | 체계적 추론 | 복잡한 설계/디버깅/아키텍처 결정 시 |
| `supabase` | DB 관리 | 스키마 변경, 데이터 조회, RLS 정책 |
| `playwright` | E2E 테스트 | CMS/웹 UI 테스트, 브라우저 자동화 |
| `exa-web-search` | 웹 검색 | 기술 조사, 라이브러리 비교 |
| `firecrawl` | 웹 스크래핑 | 문서 크롤링, 경쟁 분석 |
| `token-optimizer` | 컨텍스트 최적화 | 대규모 파일 분석 시 토큰 절약 |
| `jira` | 이슈 트래킹 | 티켓 조회/생성/업데이트 |
| `vercel` | CMS 배포 | Next.js CMS 배포/프리뷰 |
| `railway` | 서버 배포 | NestJS 서버 배포 |
| `fal-ai` | AI 생성 | 이미지/에셋 생성 |
| `evalview` | 회귀 테스트 | 에이전트 행동 스냅샷/검증 |

## MCP 자동 활용 규칙

1. 패키지 API 사용 → `context7`로 문서 확인 후 작성 (환각 금지)
2. DB 스키마/데이터 작업 → `supabase` MCP 활용
3. 복잡한 설계 결정 → `sequential-thinking`으로 추론 체인
4. UI 디자인 → `pencil`로 .pen 파일 확인 후 구현
5. E2E 테스트 → `playwright`로 브라우저 자동화
6. 배포 → CMS는 `vercel`, 서버는 `railway`
7. API 키 미설정 MCP → 무시하고 진행 (에러 시 사용자에게 설정 안내)

## Claude Code MCP 자동 인식

- Claude Code는 `<project>/.mcp.json` (root)만 자동 인식
- 우리 하네스는 `.claude/mcp.json`을 source of truth로 두고, root에 symlink 자동 생성
- Forge Studio의 WorkspaceManager가 워크스페이스 create + Update Harness 시 자동 처리
