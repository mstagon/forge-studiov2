// ProviderRouter — model id 를 적절한 CLI launch 명령으로 매핑.
//
// 메인 세션과 멤버 spawn 시 어느 provider (Anthropic claude / OpenAI codex)
// CLI 를 쓸지 결정. v0.6.6 의 modelLaunchCommand 를 더 풍부한 매핑 + sandbox
// 옵션 + 환경 변수로 확장.
//
// Council 메커니즘 (v0.7.1+) 은 두 provider 를 동시에 spawn 해서 inbox 로
// 토론 — 그 메커니즘의 가장 안쪽 layer 가 이 라우터.

export type Provider = 'claude' | 'codex'

export interface ProviderSpec {
  /** Resolved provider id (claude / codex). */
  provider: Provider
  /** CLI binary name (claude or codex). */
  cli: string
  /** bypass-permissions launch flag. */
  bypassFlag: string
  /** Tmux send-keys command — ready to fire after `claude` / `codex` exits. */
  launchCommand: string
  /** Optional model id forwarded to the CLI (claude --model X, codex --model X). */
  modelArg?: string
}

/**
 * Resolve a model identifier to a provider + launch command. Examples:
 *   "claude-opus-4-8"   → claude, --dangerously-skip-permissions, --model claude-opus-4-8
 *   "claude-opus-4-7"   → claude, --dangerously-skip-permissions, --model claude-opus-4-7
 *   "opus"              → claude, --dangerously-skip-permissions
 *   "sonnet-4.6"        → claude, --dangerously-skip-permissions, --model sonnet-4.6
 *   "gpt-5.5"           → codex,  --dangerously-bypass-approvals-and-sandbox, --model gpt-5.5
 *   "o1-preview"        → codex,  --dangerously-bypass-approvals-and-sandbox, --model o1-preview
 *   "codex"             → codex,  --dangerously-bypass-approvals-and-sandbox
 *   undefined / ""      → claude (default — 최신 opus 자동 매핑)
 */
export function resolveProvider(model: string | undefined): ProviderSpec {
  const m = (model ?? '').trim().toLowerCase()
  // OpenAI / codex family
  if (
    m.startsWith('gpt') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('codex') ||
    m.startsWith('openai')
  ) {
    const modelArg = m.startsWith('codex') || m === 'gpt' ? undefined : (model ?? undefined)
    return {
      provider: 'codex',
      cli: 'codex',
      bypassFlag: '--dangerously-bypass-approvals-and-sandbox',
      launchCommand: modelArg
        ? `codex --dangerously-bypass-approvals-and-sandbox --model ${modelArg}`
        : 'codex --dangerously-bypass-approvals-and-sandbox',
      modelArg,
    }
  }

  // Anthropic / claude family (default)
  const isShortAlias = m === '' || m === 'claude' || m === 'opus' || m === 'sonnet' || m === 'haiku'
  const modelArg = isShortAlias ? undefined : (model ?? undefined)
  return {
    provider: 'claude',
    cli: 'claude',
    bypassFlag: '--dangerously-skip-permissions',
    launchCommand: modelArg
      ? `claude --dangerously-skip-permissions --model ${modelArg}`
      : 'claude --dangerously-skip-permissions',
    modelArg,
  }
}

/** Quick check: is this model id a Claude/Anthropic family member? */
export function isClaudeModel(model: string | undefined): boolean {
  return resolveProvider(model).provider === 'claude'
}

/** Quick check: is this model id an OpenAI/codex family member? */
export function isCodexModel(model: string | undefined): boolean {
  return resolveProvider(model).provider === 'codex'
}
