/**
 * Extension-host strings (sidebar HTML, analyzer findings, notifications,
 * date picker). Keys are `area.identifier`. Keep this file sorted by area.
 * Placeholders: `{name}`.
 */
import type { Messages } from '../core';

export const extEn: Messages = {
  // extension.ts
  'ext.sessionsRefreshed': 'Sessions refreshed ({count} found)',
  'ext.refreshFailed': 'Failed to refresh sessions: {error}',
  'ext.openFailed': 'Failed to open session: {error}',
  'ext.loadFailed': 'Failed to load session data',
};
