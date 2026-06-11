# contracts/ — API 계약의 단일 소스 (contract-first)

크로스-스택 피처 (DB ↔ API ↔ 앱) 는 **코드보다 계약을 먼저** 쓴다.
서버 DTO 와 클라이언트 DTO 가 각자 진화해서 어긋나는 것을 막는 장치 —
특히 팀 모드에서 backend / frontend 멤버가 격리 worktree 로 병렬 작업할 때.

## 룰

1. **풀스택 피처는 `contracts/<domain>.contract.md` 작성이 Phase 1 보다 먼저다.**
   메인 세션 (orchestrator) 이 plan 단계에서 작성하거나, Council 팀의 산출물로 만든다.
2. **계약이 원본이다.** NestJS DTO 도, Flutter DTO 도 계약을 따른다.
   계약에 없는 필드를 코드에 추가하지 마라 — 계약 먼저 수정 후 양쪽 반영.
3. **멤버는 contracts/ 를 read-only 로 본다.** 변경이 필요하면 inbox 로 메인에게 요청.
   (계약 변경은 영향 범위가 크므로 orchestrator 가 중재)
4. 계약 파일이 변경되면 `forge-dto-broadcast.sh` 가 다른 멤버에게 자동 공지한다.
5. `/api-sync` 검증은 server DTO ↔ client DTO ↔ contracts 3자 대조다.

## 파일 형식

`<domain>.contract.md` — 사람과 LLM 모두 읽기 좋은 마크다운 + 타입 블록.

```markdown
# Contract: auth

## POST /auth/login

### Request
| 필드 | 타입 | 필수 | 제약 |
|------|------|------|------|
| email | string | ✔ | email 형식 |
| password | string | ✔ | 8자+ |

### Response 200
| 필드 | 타입 | 필수 | 비고 |
|------|------|------|------|
| accessToken | string | ✔ | JWT, 15분 |
| refreshToken | string | ✔ | 30일 |
| user | UserSummary | ✔ | 아래 공유 타입 |

### Errors
| status | code | 조건 |
|--------|------|------|
| 401 | INVALID_CREDENTIALS | 이메일/비번 불일치 |
| 429 | RATE_LIMITED | 로그인 5회 실패 |

## 공유 타입

### UserSummary
| 필드 | 타입 | 필수 |
|------|------|------|
| id | string | ✔ |
| nickname | string | ✔ |
| avatarUrl | string? | |
```

- JSON key 는 **camelCase** 통일 (서버/클라 동일)
- enum 은 값 목록을 계약에 명시 — 양쪽 코드가 같은 리터럴 사용
- 버전이 갈리면 섹션에 `(v2)` 마킹 후 deprecated 필드는 취소선
