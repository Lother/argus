import { ReactNode, useMemo, useState } from 'react';
import { Step, Subagent } from '../types/session';
import { t } from '../i18n';
import {
  analyzeAgentTypes,
  analyzeCacheRebuilds,
  analyzeFailures,
  analyzeHeavyOutputs,
  analyzeTurns,
  cacheSpend,
  groupHeavyByTool,
  FailureGroup,
  HEAVY_MIN_TOKENS,
} from '../utils/insightTools';
import './InsightTools.css';

interface Props {
  /** The flattened timeline without harness events (`analyticSteps`). */
  flatSteps: Step[];
  subagents: Subagent[];
  onGoToStep: (globalIndex: number) => void;
}

const TOP_N = 10;
const OPEN_KEY = 'argus.insightTools.open';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function fmtCost(n: number): string {
  if (n >= 0.1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}

function fmtDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return t('insightTools.durSec', { value: sec });
  const min = Math.round(sec / 60);
  if (min < 60) return t('insightTools.durMin', { value: min });
  return t('insightTools.durHourMin', { hours: Math.floor(min / 60), minutes: min % 60 });
}

const pct = (part: number, whole: number): string =>
  whole > 0 ? ((part / whole) * 100).toFixed(part / whole >= 0.1 ? 0 : 1) : '0';

const shortModel = (model?: string): string => (model ?? '').replace(/^claude-/, '');

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function loadOpen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(OPEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveOpen(open: Set<string>) {
  try {
    window.localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  } catch {
    // A webview without storage just forgets which panels were open.
  }
}

interface PanelProps {
  icon: string;
  title: string;
  headline: string;
  /** The one number worth seeing without opening the panel. */
  badge?: string;
  tone?: 'warning' | 'info' | 'neutral';
  empty: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const Panel = ({ icon, title, headline, badge, tone = 'neutral', empty, open, onToggle, children }: PanelProps) => (
  <div className={`it-panel tone-${tone} ${empty ? 'is-empty' : ''} ${open && !empty ? 'is-open' : ''}`}>
    <button className="it-panel-header" onClick={onToggle} disabled={empty} aria-expanded={open && !empty}>
      <span className="it-chevron" aria-hidden>
        {empty ? '' : open ? '▾' : '▸'}
      </span>
      <span className="it-icon" aria-hidden>
        {icon}
      </span>
      <span className="it-heading">
        <span className="it-title">{title}</span>
        <span className="it-headline">{headline}</span>
      </span>
      {badge && <span className="it-badge">{badge}</span>}
    </button>
    {open && !empty && <div className="it-panel-body">{children}</div>}
  </div>
);

const StepLink = ({ index, onGoToStep }: { index?: number; onGoToStep: (i: number) => void }) =>
  index === undefined ? null : (
    <button className="step-badge" onClick={() => onGoToStep(index)}>
      #{index}
    </button>
  );

const ShareBar = ({ value, max }: { value: number; max: number }) => (
  <span className="it-bar" aria-hidden>
    <span className="it-bar-fill" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
  </span>
);

const MoreToggle = ({ total, all, onToggle }: { total: number; all: boolean; onToggle: () => void }) =>
  total > TOP_N ? (
    <button className="it-more" onClick={onToggle}>
      {all ? t('insightTools.showLess', { count: TOP_N }) : t('insightTools.showAll', { count: total })}
    </button>
  ) : null;

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

const InsightTools = ({ flatSteps, subagents, onGoToStep }: Props) => {
  const [open, setOpen] = useState<Set<string>>(loadOpen);
  const [turnSort, setTurnSort] = useState<'cost' | 'order'>('cost');
  const [allTurns, setAllTurns] = useState(false);
  const [allRebuilds, setAllRebuilds] = useState(false);
  const [allHeavy, setAllHeavy] = useState(false);

  const toggle = (id: string) => {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveOpen(next);
      return next;
    });
  };

  const agentFallback = t('analysis.agentFallback');
  const agentLabel = useMemo(() => {
    const byId = new Map(subagents.map(s => [s.agentId, s.agentType || agentFallback]));
    return (agentId?: string) => (agentId ? byId.get(agentId) ?? agentFallback : t('insightTools.mainSession'));
  }, [subagents, agentFallback]);

  const turns = useMemo(() => analyzeTurns(flatSteps, subagents), [flatSteps, subagents]);
  const rebuilds = useMemo(() => analyzeCacheRebuilds(flatSteps), [flatSteps]);
  const heavy = useMemo(() => analyzeHeavyOutputs(flatSteps), [flatSteps]);
  const heavyByTool = useMemo(() => groupHeavyByTool(heavy), [heavy]);
  const cacheBill = useMemo(() => cacheSpend(flatSteps), [flatSteps]);
  const failures = useMemo(() => analyzeFailures(flatSteps), [flatSteps]);
  const agentTypes = useMemo(
    () => analyzeAgentTypes(flatSteps, subagents, agentFallback),
    [flatSteps, subagents, agentFallback]
  );

  // --- 1. cost per prompt -------------------------------------------------
  const turnPanel = (() => {
    const byCost = [...turns.turns].sort((a, b) => b.cost - a.cost);
    const top = byCost[0];
    const top3 = byCost.slice(0, 3).reduce((sum, row) => sum + row.cost, 0);
    const rows = turnSort === 'cost' ? byCost : turns.turns;
    const shown = allTurns ? rows : rows.slice(0, TOP_N);
    const maxCost = top?.cost ?? 0;
    const promptCount = turns.turns.filter(row => row.order > 0).length;
    return (
      <Panel
        icon="🧾"
        title={t('insightTools.turnsTitle')}
        headline={
          top
            ? t('insightTools.turnsHeadline', {
                count: promptCount,
                cost: top.cost.toFixed(2),
                percent: pct(top.cost, turns.total),
                top3: pct(top3, turns.total),
              })
            : t('insightTools.turnsEmpty')
        }
        badge={top ? fmtCost(top.cost) : undefined}
        empty={!top}
        open={open.has('turns')}
        onToggle={() => toggle('turns')}
      >
        <p className="it-hint">{t('insightTools.turnsHint')}</p>
        <div className="it-toolbar">
          <div className="it-segmented" role="group">
            <button className={turnSort === 'cost' ? 'active' : ''} onClick={() => setTurnSort('cost')}>
              {t('insightTools.sortByCost')}
            </button>
            <button className={turnSort === 'order' ? 'active' : ''} onClick={() => setTurnSort('order')}>
              {t('insightTools.sortByOrder')}
            </button>
          </div>
        </div>
        <div className="it-table-wrap">
          <table className="it-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="it-col-text">{t('insightTools.colPrompt')}</th>
                <th className="it-num">{t('insightTools.colCost')}</th>
                <th className="it-col-bar">{t('insightTools.colShare')}</th>
                <th className="it-num">{t('insightTools.colToolCalls')}</th>
                <th className="it-num">{t('insightTools.colAgents')}</th>
                <th className="it-num" title={t('insightTools.responseTimeTitle')}>{t('insightTools.colResponseTime')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(row => (
                <tr key={`${row.order}-${row.globalIndex ?? 'pre'}`}>
                  <td>
                    <StepLink index={row.globalIndex} onGoToStep={onGoToStep} />
                  </td>
                  <td className={`it-col-text ${row.fromHarness ? 'is-dim' : ''}`}>
                    {row.fromHarness && (
                      <span className="it-tag" title={t('insightTools.fromHarnessTitle')}>
                        {t('insightTools.fromHarness')}
                      </span>
                    )}
                    <span className="it-ellipsis" title={row.prompt.slice(0, 400)}>
                      {row.order === 0 ? t('insightTools.beforeFirstPrompt') : row.prompt || '—'}
                    </span>
                  </td>
                  <td className="it-num">
                    {fmtCost(row.cost)}
                    {row.agentCost > 0 && (
                      <span className="it-sub">{t('insightTools.agentCostNote', { cost: row.agentCost.toFixed(2) })}</span>
                    )}
                  </td>
                  <td className="it-col-bar">
                    <ShareBar value={row.cost} max={maxCost} />
                    <span className="it-bar-label">{pct(row.cost, turns.total)}%</span>
                  </td>
                  <td className="it-num">{row.toolCalls}</td>
                  <td className="it-num">{row.agents || '—'}</td>
                  <td className="it-num">{row.durationMs !== undefined ? fmtDuration(row.durationMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MoreToggle total={rows.length} all={allTurns} onToggle={() => setAllTurns(v => !v)} />
        {turns.unattributed > 0.005 && (
          <p className="it-footnote">{t('insightTools.unattributed', { cost: turns.unattributed.toFixed(2) })}</p>
        )}
      </Panel>
    );
  })();

  // --- 2. cache rebuilds --------------------------------------------------
  const rebuildPanel = (() => {
    const extra = rebuilds.reduce((sum, row) => sum + row.extraCost, 0);
    const shown = allRebuilds ? rebuilds : rebuilds.slice(0, TOP_N);
    const causeLabel = (cause: string) =>
      t(cause === 'idle' ? 'insightTools.causeIdle' : cause === 'model' ? 'insightTools.causeModel' : 'insightTools.causeUnknown');
    return (
      <Panel
        icon="♻️"
        title={t('insightTools.cacheTitle')}
        headline={
          rebuilds.length > 0
            ? t('insightTools.cacheHeadline', { count: rebuilds.length, cost: extra.toFixed(2) })
            : t('insightTools.cacheEmpty')
        }
        badge={rebuilds.length > 0 ? `+${fmtCost(extra)}` : undefined}
        tone={rebuilds.length > 0 ? 'warning' : 'neutral'}
        empty={rebuilds.length === 0}
        open={open.has('cache')}
        onToggle={() => toggle('cache')}
      >
        <p className="it-hint">{t('insightTools.cacheHint')}</p>
        <div className="it-table-wrap">
          <table className="it-table">
            <thead>
              <tr>
                <th>{t('insightTools.step')}</th>
                <th className="it-col-text">{t('insightTools.colAgent')}</th>
                <th>{t('insightTools.colCause')}</th>
                <th className="it-num">{t('insightTools.colGap')}</th>
                <th className="it-num">{t('insightTools.colRewritten')}</th>
                <th className="it-num">{t('insightTools.colExtra')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(row => (
                <tr key={row.globalIndex}>
                  <td>
                    <StepLink index={row.globalIndex} onGoToStep={onGoToStep} />
                  </td>
                  <td className="it-col-text">
                    <span className="it-ellipsis">{agentLabel(row.agentId)}</span>
                  </td>
                  <td>
                    <span
                      className={`it-tag cause-${row.cause}`}
                      title={
                        row.cause === 'idle'
                          ? t('insightTools.causeIdleTitle', { ttl: fmtDuration(row.ttlMs) })
                          : row.cause === 'model'
                            ? t('insightTools.causeModelTitle', {
                                from: shortModel(row.fromModel),
                                to: shortModel(row.toModel),
                              })
                            : t('insightTools.causeUnknownTitle')
                      }
                    >
                      {causeLabel(row.cause)}
                    </span>
                  </td>
                  <td className="it-num">{fmtDuration(row.gapMs)}</td>
                  <td className="it-num">{fmtTokens(row.tokens)}</td>
                  <td className="it-num it-cost-warn">+{fmtCost(row.extraCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MoreToggle total={rebuilds.length} all={allRebuilds} onToggle={() => setAllRebuilds(v => !v)} />
      </Panel>
    );
  })();

  // --- 3. heavy tool output -----------------------------------------------
  const heavyPanel = (() => {
    const total = heavy.reduce((sum, row) => sum + row.carryCost, 0);
    const shown = allHeavy ? heavy : heavy.slice(0, TOP_N);
    const maxTool = heavyByTool[0]?.cost ?? 0;
    return (
      <Panel
        icon="📦"
        title={t('insightTools.heavyTitle')}
        headline={
          heavy.length > 0
            ? t('insightTools.heavyHeadline', {
                count: heavy.length,
                min: fmtTokens(HEAVY_MIN_TOKENS),
                cost: total.toFixed(2),
                percent: pct(total, cacheBill),
              })
            : t('insightTools.heavyEmpty', { min: fmtTokens(HEAVY_MIN_TOKENS) })
        }
        badge={heavy.length > 0 ? fmtCost(total) : undefined}
        tone={heavy.length > 0 ? 'info' : 'neutral'}
        empty={heavy.length === 0}
        open={open.has('heavy')}
        onToggle={() => toggle('heavy')}
      >
        <p className="it-hint">{t('insightTools.heavyHint')}</p>
        <h4 className="it-subheading">{t('insightTools.heavyByTool')}</h4>
        <div className="it-table-wrap">
          <table className="it-table">
            <thead>
              <tr>
                <th className="it-col-text">{t('insightTools.colTool')}</th>
                <th className="it-num">{t('insightTools.colCount')}</th>
                <th className="it-num">{t('insightTools.colTokens')}</th>
                <th className="it-col-bar">{t('insightTools.colCarryCost')}</th>
                <th className="it-num">{t('insightTools.colWholeFile')}</th>
              </tr>
            </thead>
            <tbody>
              {heavyByTool.map(g => (
                <tr key={g.toolName}>
                  <td className="it-col-text">{g.toolName}</td>
                  <td className="it-num">{g.count}</td>
                  <td className="it-num">{fmtTokens(g.tokens)}</td>
                  <td className="it-col-bar">
                    <ShareBar value={g.cost} max={maxTool} />
                    <span className="it-bar-label">{fmtCost(g.cost)}</span>
                  </td>
                  <td className="it-num">{g.wholeFile || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4 className="it-subheading">{t('insightTools.heavyTop')}</h4>
        <div className="it-table-wrap">
          <table className="it-table">
            <thead>
              <tr>
                <th>{t('insightTools.step')}</th>
                <th>{t('insightTools.colTool')}</th>
                <th className="it-col-text">{t('insightTools.colWhat')}</th>
                <th className="it-num">{t('insightTools.colTokens')}</th>
                <th className="it-num">{t('insightTools.colResent')}</th>
                <th className="it-num">{t('insightTools.colCarryCost')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(row => (
                <tr key={row.globalIndex}>
                  <td>
                    <StepLink index={row.globalIndex} onGoToStep={onGoToStep} />
                  </td>
                  <td>{row.toolName}</td>
                  <td className="it-col-text">
                    {row.wholeFile && <span className="it-tag">{t('insightTools.wholeFile')}</span>}
                    {row.agentId && <span className="it-tag is-agent">{agentLabel(row.agentId)}</span>}
                    <span className="it-ellipsis it-code" title={row.label}>
                      {row.label || '—'}
                    </span>
                  </td>
                  <td className="it-num" title={row.measured ? undefined : t('insightTools.estimated')}>
                    {row.measured ? '' : '≈'}
                    {fmtTokens(row.tokens)}
                  </td>
                  <td className="it-num">×{row.carried}</td>
                  <td className="it-num">{fmtCost(row.carryCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MoreToggle total={heavy.length} all={allHeavy} onToggle={() => setAllHeavy(v => !v)} />
        <p className="it-footnote">{t('insightTools.heavyFootnote')}</p>
      </Panel>
    );
  })();

  // --- 4. failures --------------------------------------------------------
  const failurePanel = (() => {
    const count = failures.reduce((sum, g) => sum + g.count, 0);
    const first = failures[0];
    const deciders = (g: FailureGroup) =>
      Object.entries(g.deciders)
        .sort((a, b) => b[1] - a[1])
        .map(([who, n]) => `${t(`insightTools.decider_${who}`)} ×${n}`)
        .join(t('insightTools.listSep'));
    return (
      <Panel
        icon="🧯"
        title={t('insightTools.failTitle')}
        headline={
          first
            ? t('insightTools.failHeadline', {
                count,
                cause: t(`insightTools.cause_${first.cause}`),
                n: first.count,
              })
            : t('insightTools.failEmpty')
        }
        badge={first ? String(count) : undefined}
        tone={first ? 'warning' : 'neutral'}
        empty={!first}
        open={open.has('failures')}
        onToggle={() => toggle('failures')}
      >
        <div className="it-fail-list">
          {failures.map(g => (
            <div key={g.cause} className="it-fail">
              <div className="it-fail-head">
                <span className="it-fail-title">{t(`insightTools.cause_${g.cause}`)}</span>
                <span className="it-fail-count">{g.count}</span>
                <span className="it-fail-tools">
                  {Object.entries(g.tools)
                    .sort((a, b) => b[1] - a[1])
                    .map(([tool, n]) => (
                      <span key={tool} className="it-chip">
                        {tool} ×{n}
                      </span>
                    ))}
                </span>
              </div>
              {t(`insightTools.causeHint_${g.cause}`) && (
                <p className="it-hint">{t(`insightTools.causeHint_${g.cause}`)}</p>
              )}
              {Object.keys(g.deciders).length > 0 && (
                <p className="it-hint">{t('insightTools.deniedBy', { list: deciders(g) })}</p>
              )}
              {g.sample && (
                <div className="it-sample">
                  <span className="it-sample-label">{t('insightTools.failSample')}</span>
                  <code>{g.sample}</code>
                </div>
              )}
              <div className="insight-steps">
                {g.steps.slice(0, 8).map(idx => (
                  <StepLink key={idx} index={idx} onGoToStep={onGoToStep} />
                ))}
                {g.steps.length > 8 && <span className="steps-more">+{g.steps.length - 8}</span>}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    );
  })();

  // --- 5. sub-agents by type ----------------------------------------------
  const agentPanel = (() => {
    if (subagents.length === 0) return null;
    const agentCost = agentTypes.reduce((sum, row) => sum + row.cost, 0);
    const maxCost = agentTypes[0]?.cost ?? 0;
    const grouped = agentTypes.some(row => row.type.endsWith(':*'));
    return (
      <Panel
        icon="🤖"
        title={t('insightTools.agentsTitle')}
        headline={t('insightTools.agentsHeadline', {
          count: subagents.length,
          types: agentTypes.length,
          cost: agentCost.toFixed(2),
          percent: pct(agentCost, turns.total),
        })}
        badge={fmtCost(agentCost)}
        tone="info"
        empty={false}
        open={open.has('agents')}
        onToggle={() => toggle('agents')}
      >
        {grouped && <p className="it-hint">{t('insightTools.agentsHint')}</p>}
        <div className="it-table-wrap">
          <table className="it-table">
            <thead>
              <tr>
                <th className="it-col-text">{t('insightTools.colType')}</th>
                <th className="it-num">{t('insightTools.colCount')}</th>
                <th className="it-col-bar">{t('insightTools.colCost')}</th>
                <th className="it-num">{t('insightTools.colAvgCost')}</th>
                <th className="it-num">{t('insightTools.colAvgSteps')}</th>
                <th className="it-num">{t('insightTools.colAvgTime')}</th>
                <th className="it-num">{t('insightTools.colFailRate')}</th>
                <th>{t('insightTools.colModel')}</th>
                <th>{t('insightTools.colTop')}</th>
              </tr>
            </thead>
            <tbody>
              {agentTypes.map(row => (
                <tr key={row.type}>
                  <td className="it-col-text">
                    <span className="it-ellipsis" title={row.type}>
                      {row.type}
                    </span>
                    {row.unfinished > 0 && (
                      <span className="it-sub">{t('insightTools.unfinishedNote', { count: row.unfinished })}</span>
                    )}
                  </td>
                  <td className="it-num">{row.count}</td>
                  <td className="it-col-bar">
                    <ShareBar value={row.cost} max={maxCost} />
                    <span className="it-bar-label">{fmtCost(row.cost)}</span>
                  </td>
                  <td className="it-num">{fmtCost(row.avgCost)}</td>
                  <td className="it-num">{Math.round(row.avgSteps)}</td>
                  <td className="it-num">
                    {row.avgDurationMs !== undefined ? fmtDuration(row.avgDurationMs) : '—'}
                  </td>
                  <td className="it-num">
                    {row.toolCalls > 0 ? `${pct(row.toolFailures, row.toolCalls)}%` : '—'}
                  </td>
                  <td className="it-models">{row.models.map(shortModel).join(', ')}</td>
                  <td>
                    <StepLink index={row.topGlobalIndex} onGoToStep={onGoToStep} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  })();

  return (
    <section className="insight-tools">
      <h2 className="insight-tools-heading">{t('insightTools.heading')}</h2>
      {turnPanel}
      {rebuildPanel}
      {heavyPanel}
      {failurePanel}
      {agentPanel}
    </section>
  );
};

export default InsightTools;
