<!--
  PR Template — keep the title in Conventional Commits form
  (`{type}(scope): {subject}`, e.g. `feat(authoring): agent 편집기 추가`).
  300줄 넘으면 쪼갤 수 있는지 먼저 검토해주세요.
-->

closes #<issue-number>

## Summary

<!-- 왜 이 변경이 필요한가? 1~3 문장으로. -->

## What changed

<!-- 코드/UX/문서 관점에서 핵심 변경점을 불릿으로. -->

-
-
-

## Test plan

<!--
  검증한 항목을 체크리스트로 적어주세요.
  자동 테스트가 가능하면 명령어를 그대로 적습니다 (예: npm run typecheck).
-->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] 수동 검증: <어떤 시나리오를 어떤 기기/OS 에서 확인했는지>

## 영향 스택

- [ ] Renderer UI (`src/`)
- [ ] Electron main / IPC (`electron/`)
- [ ] Harness template (`resources/harness-template/`)
- [ ] Bundled tools / scripts (`scripts/`, `resources/bundled-tools/`)
- [ ] Documentation only

## Screenshots / GIF (UI 변경 시 필수)

<!-- 변경 전·후 비교 또는 동작 GIF 첨부 -->

## Notes for reviewer

<!-- 특별히 봐줬으면 하는 부분, 의도적 trade-off, 후속 PR 계획 -->
