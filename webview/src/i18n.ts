/**
 * Webview i18n entry. The extension host injects the active locale as
 * `window.__ARGUS_LOCALE__` into the webview HTML before the bundle loads.
 * Message tables live in src/i18n/messages/web.*.ts (shared with the host).
 */
import { Locale, Params, normalizeLocale, getT } from '../../src/i18n/index';

declare global {
  interface Window {
    __ARGUS_LOCALE__?: string;
  }
}

export const locale: Locale = normalizeLocale(
  typeof window !== 'undefined' ? window.__ARGUS_LOCALE__ : undefined
);

const translate = getT(locale);

export function t(key: string, params?: Params): string {
  return translate(key, params);
}
