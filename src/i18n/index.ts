/**
 * Locale-independent entry point. NO `vscode` import — the webview bundles
 * this file too. Extension-host code should import `./vscode` instead, which
 * adds locale resolution from settings / env.
 */
import { Locale, Messages, createT, TFunction } from './core';
import { extEn } from './messages/ext.en';
import { extZhTW } from './messages/ext.zh-TW';
import { webEn } from './messages/web.en';
import { webZhTW } from './messages/web.zh-TW';

export * from './core';

export const MESSAGES: Record<Locale, Messages> = {
  en: { ...extEn, ...webEn },
  'zh-TW': { ...extZhTW, ...webZhTW },
};

export function getT(locale: Locale): TFunction {
  return createT(locale, MESSAGES);
}
