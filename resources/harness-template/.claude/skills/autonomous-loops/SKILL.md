# Autonomous Loops

자율 반복 실행 패턴 — 파이프라인, PR 루프, DAG 오케스트레이션.

## 패턴 1: Sequential Pipeline

순차 실행. 한 단계 실패 시 중단.

```
[Stage 1] → [Stage 2] → [Stage 3] → DONE
    ↓ FAIL
  STOP + Report
```

용도: `/full-cycle`, `/pre-commit`

## 패턴 2: Fix Loop

실패 → 수정 → 재실행 반복.

```
[실행] → PASS → DONE
  ↓ FAIL
[분석] → [수정] → [재실행] → (최대 N회)
```

용도: `/build-fix`, `/verify`, `loop-operator`

## 패턴 3: Parallel Fan-Out

독립 작업을 병렬 실행 후 결과 수집.

```
         ┌→ [Agent A] →┐
[분배] → ├→ [Agent B] →├→ [수집] → DONE
         └→ [Agent C] →┘
```

용도: `/agent-team`, `/review` (3 에이전트), `/multi-execute`

## 패턴 4: DAG Orchestration

의존성 그래프 기반 실행. 의존성 없는 것은 병렬, 있는 것은 순차.

```
[Prisma] →→→→→→→→→ [NestJS] →→→ [Flutter DTO]
                        ↓              ↓
                   [NestJS Test]  [Flutter UI]
                                      ↓
                                 [Flutter Test]
```

용도: `/full-cycle`, `/multi-plan` + `/multi-execute`

## 패턴 5: Watch Loop

조건 충족까지 주기적 체크.

```
[체크] → 조건 충족? → YES → DONE
  ↑         ↓ NO
  └── [대기] ←┘
```

용도: CI 대기, 빌드 완료 대기

## 안전 장치
- 모든 루프에 최대 반복 횟수 필수
- 에러 발산 감지 (에러 수 증가 → 중단)
- 같은 에러 3회 연속 → 에스컬레이션
- 진행 없음 감지 (diff 없이 반복 → 중단)
