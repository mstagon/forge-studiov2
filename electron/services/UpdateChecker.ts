import { app, net } from 'electron'

export interface UpdateInfo {
  current: string
  latest: string | null
  hasUpdate: boolean
  releaseUrl: string | null
  publishedAt: string | null
  notes: string | null
  checkedAt: string
  error: string | null
}

interface GithubRelease {
  tag_name?: string
  html_url?: string
  published_at?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
}

export class UpdateChecker {
  private static readonly REPO = 'mstagon/forge-studiov2'
  private static readonly TIMEOUT_MS = 8000

  async check(): Promise<UpdateInfo> {
    const current = app.getVersion()
    const checkedAt = new Date().toISOString()
    try {
      const data = await this.fetchLatest()
      const latest = data.tag_name ? data.tag_name.replace(/^v/, '') : null
      const hasUpdate = latest ? semverGreater(latest, current) : false
      return {
        current,
        latest,
        hasUpdate,
        releaseUrl: data.html_url ?? null,
        publishedAt: data.published_at ?? null,
        notes: data.body ?? null,
        checkedAt,
        error: null,
      }
    } catch (err) {
      return {
        current,
        latest: null,
        hasUpdate: false,
        releaseUrl: null,
        publishedAt: null,
        notes: null,
        checkedAt,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private fetchLatest(): Promise<GithubRelease> {
    return new Promise((resolve, reject) => {
      const req = net.request({
        method: 'GET',
        url: `https://api.github.com/repos/${UpdateChecker.REPO}/releases/latest`,
      })
      req.setHeader('User-Agent', `forge-studio/${app.getVersion()}`)
      req.setHeader('Accept', 'application/vnd.github+json')

      const timeout = setTimeout(() => {
        try { req.abort() } catch { /* noop */ }
        reject(new Error('GitHub API request timed out'))
      }, UpdateChecker.TIMEOUT_MS)

      let body = ''
      req.on('response', (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          clearTimeout(timeout)
          reject(new Error(`GitHub API returned status ${res.statusCode}`))
          return
        }
        res.on('data', (chunk: Buffer) => { body += chunk.toString('utf-8') })
        res.on('end', () => {
          clearTimeout(timeout)
          try {
            resolve(JSON.parse(body) as GithubRelease)
          } catch (e) {
            reject(e)
          }
        })
        res.on('error', (e: Error) => {
          clearTimeout(timeout)
          reject(e)
        })
      })
      req.on('error', (e) => {
        clearTimeout(timeout)
        reject(e)
      })
      req.end()
    })
  }
}

function semverGreater(a: string, b: string): boolean {
  // Strip pre-release / build metadata and compare numeric core only.
  const norm = (v: string) => v.split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0)
  const pa = norm(a)
  const pb = norm(b)
  const len = Math.max(pa.length, pb.length, 3)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}
