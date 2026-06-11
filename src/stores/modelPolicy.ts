// modelPolicy — 사용자 model 매핑 정책. localStorage 영속.
//
// agentId / role → model id 매핑. App.tsx 의 defaultModelFor() 가 이걸
// 우선 보고, 없으면 builtin fallback (GPT 강점 4명 / 그 외 Opus).
//
// 두 layer:
//   - byRole: 카테고리 단위 (Frontend/Backend/Database/Tests/Review/Architecture)
//     → 같은 카테고리 안의 모든 agentId 에 적용
//   - byAgent: agentId 단위 (override). byAgent 우선.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ModelRole = 'Frontend' | 'Backend' | 'Database' | 'Tests' | 'Review' | 'Architecture' | 'Other'

const DEFAULT_BY_ROLE: Record<ModelRole, string> = {
  Frontend: 'claude-opus-4-8',
  Backend: 'claude-opus-4-8',
  Database: 'gpt-5.5', // 정확성 강점
  Tests: 'claude-opus-4-8',
  Review: 'claude-opus-4-8',
  Architecture: 'claude-opus-4-8',
  Other: 'claude-opus-4-8',
}

/**
 * 에이전트 → 역할 매핑. Library 의 default 18개 에이전트 + 사용자 추가는
 * 'Other' 로 fallback. 사용자가 byAgent override 로 세부 조정.
 */
const ROLE_BY_AGENT: Record<string, ModelRole> = {
  'flutter-ui': 'Frontend',
  'riverpod-logic': 'Frontend',
  'dio-retrofit': 'Frontend',
  'nextjs-cms': 'Frontend',
  'nestjs-backend': 'Backend',
  'nestjs-auth': 'Backend',
  'prisma-data': 'Database',
  'postgres-patterns': 'Database',
  'test-writer': 'Tests',
  'tdd-guide': 'Tests',
  'flutter-driver-e2e': 'Tests',
  'code-reviewer': 'Review',
  'security-auditor': 'Review',
  'spec-verifier': 'Review',
  'refactor-cleaner': 'Review',
  'tech-architect': 'Architecture',
  'planner': 'Architecture',
  'doc-updater': 'Other',
  'docs-lookup': 'Other',
  'build-error-resolver': 'Other',
  'loop-operator': 'Other',
  'harness-optimizer': 'Other',
}

interface ModelPolicyState {
  byRole: Record<ModelRole, string>
  byAgent: Record<string, string>

  setRoleModel(role: ModelRole, model: string): void
  setAgentModel(agentId: string, model: string): void
  /** Resolve agentId → effective model. byAgent → byRole → builtin default. */
  resolveModel(agentId: string): string
  /** Reset 한 항목만 (또는 전부). */
  reset(scope: 'all' | { role: ModelRole } | { agentId: string }): void
}

export const useModelPolicyStore = create<ModelPolicyState>()(
  persist(
    (set, get) => ({
      byRole: { ...DEFAULT_BY_ROLE },
      byAgent: {},

      setRoleModel(role, model) {
        set({ byRole: { ...get().byRole, [role]: model } })
      },
      setAgentModel(agentId, model) {
        set({ byAgent: { ...get().byAgent, [agentId]: model } })
      },
      resolveModel(agentId) {
        const { byAgent, byRole } = get()
        if (byAgent[agentId]) return byAgent[agentId]
        const role = ROLE_BY_AGENT[agentId] ?? 'Other'
        return byRole[role] ?? DEFAULT_BY_ROLE[role]
      },
      reset(scope) {
        if (scope === 'all') {
          set({ byRole: { ...DEFAULT_BY_ROLE }, byAgent: {} })
          return
        }
        if ('role' in scope) {
          const next = { ...get().byRole }
          next[scope.role] = DEFAULT_BY_ROLE[scope.role]
          set({ byRole: next })
        }
        if ('agentId' in scope) {
          const next = { ...get().byAgent }
          delete next[scope.agentId]
          set({ byAgent: next })
        }
      },
    }),
    { name: 'forge-model-policy-v1' },
  ),
)

export function getRoleForAgent(agentId: string): ModelRole {
  return ROLE_BY_AGENT[agentId] ?? 'Other'
}
