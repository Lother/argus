/**
 * Webview i18n entry. The extension host renders the active locale into the
 * `lang` attribute of the webview's <html> element (see
 * sessionWebviewProviderReact.getWebviewContent). We read it from there rather
 * than from an injected inline <script>, because the webview CSP only allows
 * scripts from the extension's own resources — inline scripts are blocked.
 * Message tables live in src/i18n/messages/web.*.ts (shared with the host).
 */
import { Locale, Params, normalizeLocale, getT } from '../../src/i18n/index';

export const locale: Locale = normalizeLocale(
  typeof document !== 'undefined' ? document.documentElement.lang : undefined
);

const translate = getT(locale);

export function t(key: string, params?: Params): string {
  return translate(key, params);
}
