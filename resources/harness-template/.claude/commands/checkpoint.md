"$ARGUMENTS" 체크포인트를 관리한다.

## 사용법

```
/checkpoint save 안정적인_보드_구현      → 이름 붙인 체크포인트 생성
/checkpoint list                        → 체크포인트 목록
/checkpoint diff 보드_구현_완료          → 체크포인트와 현재 비교
/checkpoint restore 보드_구현_완료       → 체크포인트로 복원 (확인 필요)
```

## 동작

### save [이름]
1. 현재 dirty 상태 확인 (`git status`)
2. 모든 변경 사항 스테이징 + 커밋
   - 메시지: `checkpoint: [이름] — [YYYY-MM-DD HH:MM]`
3. 태그 생성: `checkpoint/[이름]`
4. 결과 출력:
   ```
   ✅ Checkpoint 저장: [이름]
   📍 커밋: abc1234
   🏷️ 태그: checkpoint/[이름]
   📁 변경 파일: N개
   ```

### list
1. `git tag -l 'checkpoint/*'` 실행
2. 각 태그의 커밋 날짜 + 메시지 포맷:
   ```
   📍 Checkpoints:
   1. checkpoint/auth-완료       2024-01-15 14:30  (3일 전, 12커밋 뒤)
   2. checkpoint/보드-구현       2024-01-18 09:00  (오늘, 2커밋 뒤)
   ```

### diff [이름]
1. `git diff checkpoint/[이름]..HEAD` 실행
2. 변경 요약:
   ```
   📊 checkpoint/[이름] → HEAD 차이:
   ├── 추가: +245줄 (8파일)
   ├── 삭제: -32줄 (3파일)
   └── 수정: 15파일
   ```

### restore [이름]
1. **반드시 유저에게 확인 요청** (AskUserQuestion)
   - "현재 커밋되지 않은 변경 N개가 있습니다. checkpoint/[이름]으로 복원하시겠습니까?"
2. 확인 후:
   - 현재 상태를 `checkpoint/before-restore-[timestamp]`로 자동 백업
   - `git checkout checkpoint/[이름]`
   - 새 브랜치 생성: `restored/[이름]`

## 규칙

- 이름에 공백 대신 하이픈(-) 또는 언더스코어(_) 사용
- restore는 항상 백업 체크포인트를 먼저 생성
- 체크포인트 태그는 `git push --tags`로만 리모트에 전송 (자동 push 안함)
