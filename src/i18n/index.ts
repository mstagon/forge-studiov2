/**
 * i18n stub — infrastructure-only.
 *
 * The actual i18next + react-i18next bootstrap is deferred until the user runs
 * `npm install` after merging — `package.json` already lists the dependencies.
 * This stub keeps `npm run typecheck` green and lets the app run without i18n
 * runtime, while components can still import { setLanguage, getLanguage }
 * against a stable API surface.
 *
 * Replace this file's body with the real i18next init once the dependencies
 * land. Components do NOT need to change.
 */

import ko from './locales/ko.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const STORAGE_KEY = 'forge-studio.language'
const DEFAULT_LANGUAGE: SupportedLanguage = 'ko'

type Dict = { [key: string]: string | Dict }
const RESOURCES: Record<SupportedLanguage, Dict> = { ko, en } as Record<SupportedLanguage, Dict>

function walk(dict: Dict, path: string[]): string | undefined {
  let cur: string | Dict | undefined = dict
  for (const seg of path) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Dict)[seg]
  }
  return typeof cur === 'string' ? cur : undefined
}

let currentLanguage: SupportedLanguage = readStoredLanguage()

function readStoredLanguage(): SupportedLanguage {
  try {
    const stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as SupportedLanguage
    }
  } catch {
    // localStorage may be blocked
  }
  return DEFAULT_LANGUAGE
}

export function setLanguage(lang: SupportedLanguage): void {
  currentLanguage = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // ignore
  }
}

export function getLanguage(): SupportedLanguage {
  return currentLanguage
}

/**
 * Look up a translation key. Walks dotted paths in the JSON resources;
 * returns the key itself if not found (matches i18next default behaviour).
 */
export function t(key: string, fallback?: string): string {
  const path = key.split('.')
  const found = walk(RESOURCES[currentLanguage], path)
  if (found !== undefined) return found
  const fb = walk(RESOURCES[DEFAULT_LANGUAGE], path)
  if (fb !== undefined) return fb
  return fallback ?? key
}

export default {
  setLanguage,
  getLanguage,
  t,
  SUPPORTED_LANGUAGES,
}
