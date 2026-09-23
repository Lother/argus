import { formatEffortLabel } from '../../../src/types/effort';
import { t } from '../i18n';

const EFFORT_KEYS: Record<string, string> = {
  low: 'effort.low',
  medium: 'effort.medium',
  high: 'effort.high',
  xhigh: 'effort.xhigh',
  max: 'effort.max',
};

/**
 * Localised badge label for a reasoning-effort value. Levels Argus has no
 * translation for keep `formatEffortLabel`'s capitalised raw text.
 */
export function effortLabel(effort: string): string {
  const key = EFFORT_KEYS[(effort || '').toLowerCase().trim()];
  return key ? t(key) : formatEffortLabel(effort);
}
