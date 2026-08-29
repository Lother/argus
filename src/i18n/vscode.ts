/**
 * Extension-host i18n. Resolves the active locale from the `argus.language`
 * setting ("auto" → VS Code display language) and exposes `t()`.
 *
 * Do NOT import this from webview/ — it depends on the `vscode` module.
 */
import * as vscode from 'vscode';
import { Locale, Params, normalizeLocale, getT } from './index';

export function getLocale(): Locale {
  const setting = vscode.workspace.getConfiguration('argus').get<string>('language', 'auto');
  if (setting && setting !== 'auto') return normalizeLocale(setting);
  return normalizeLocale(vscode.env.language);
}

/** Translate with the currently active locale (re-resolved on every call so a settings change applies without reload). */
export function t(key: string, params?: Params): string {
  return getT(getLocale())(key, params);
}
