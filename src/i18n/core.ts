/**
 * Pure i18n core — NO `vscode` import here. This file is shared by the
 * extension host (tsc/commonjs) and the React webview (vite), so it must stay
 * runtime-agnostic.
 */

export type Locale = 'en' | 'zh-TW';
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'zh-TW'];
export const DEFAULT_LOCALE: Locale = 'en';

/** Flat key → template map. Templates use `{name}` placeholders. */
export type Messages = Record<string, string>;
export type Params = Record<string, string | number>;

/**
 * Map any raw language tag (VS Code `env.language`, a user setting, a browser
 * tag) onto a supported locale. Any Chinese variant → zh-TW; everything else →
 * en. Unknown / empty → DEFAULT_LOCALE.
 */
export function normalizeLocale(raw: string | undefined | null): Locale {
  const tag = (raw || '').trim().toLowerCase();
  if (!tag) return DEFAULT_LOCALE;
  if (tag === 'zh-tw' || tag === 'zh-hant' || tag.startsWith('zh')) return 'zh-TW';
  if (tag === 'en' || tag.startsWith('en-')) return 'en';
  return DEFAULT_LOCALE;
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m
  );
}

export type TFunction = (key: string, params?: Params) => string;

/**
 * Build a translator. Lookup order: requested locale → English → the key
 * itself (so a missing translation never renders as empty text).
 */
export function createT(
  locale: Locale,
  byLocale: Record<Locale, Messages>
): TFunction {
  const primary = byLocale[locale] || {};
  const fallback = byLocale[DEFAULT_LOCALE] || {};
  return (key, params) => {
    const template = primary[key] ?? fallback[key] ?? key;
    return interpolate(template, params);
  };
}
