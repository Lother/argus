import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import './styles/global.css';

// Shape matches src/services/aggregationService.ts WorkspaceAggregate
interface PerDayAggregate {
  isoDate: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  totalCost: number;
  sessionCount: number;
}
interface PerProjectAggregate {
  project: string;
  sessionCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  totalCost: number;
  lastActivity: number;
  modelBreakdown: Record<string, number>;
}
interface PerModelAggregate {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  totalCost: number;
}
interface PerSessionAggregate {
  sessionId: string;
  project: string;
  model: string;
  lastTimestamp: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  registryName?: string;
  registrySection?: string;
}
interface WorkspaceAggregate {
  windowFrom: number;
  windowTo: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreateTokens: number;
  perDay: PerDayAggregate[];
  perProject: PerProjectAggregate[];
  perModel: PerModelAggregate[];
  perSession: PerSessionAggregate[];
  scannedFileCount: number;
  scannedAt: number;
}

type Tab = 'week' | 'projects';
type WindowKey = '7d' | '30d' | 'mtd' | 'all';

const MODEL_COLORS: Record<string, string> = {
  opus: '#c084fc',
  sonnet: '#60a5fa',
  haiku: '#34d399',
  unknown: '#94a3b8',
};

function normalizeModel(m: string): string {
  if (!m) return 'unknown';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'unknown';
}

function fmtUSD(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDate(iso: string): string {
  // "2026-05-26" -> "May 26"
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function fmtProject(project: string): string {
  // discoveryService stores project as the directory slug "C--Users-mered-..."
  // -> trim to last path token for readability.
  const parts = project.replace(/^C--/, '').split('-');
  return parts.slice(-3).join('-') || project;
}

export default function WorkspaceApp() {
  const [data, setData] = useState<WorkspaceAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [tab, setTab] = useState<Tab>('week');
  const [windowKey, setWindowKey] = useState<WindowKey>('7d');
  const [projectSort, setProjectSort] = useState<'cost' | 'sessions' | 'recent'>('cost');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'workspaceData') {
        setData(msg.data);
        setLoading(false);
        setProgress(null);
      } else if (msg.type === 'workspaceProgress') {
        setProgress({ done: msg.done, total: msg.total });
      } else if (msg.type === 'workspaceLoading') {
        setLoading(true);
      }
    };
    window.addEventListener('message', handler);
    window.vscodeApi?.postMessage({ type: 'ready', window: windowKey });
    return () => window.removeEventListener('message', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requestWindow = (w: WindowKey) => {
    setWindowKey(w);
    setLoading(true);
    setData(null);
    window.vscodeApi?.postMessage({ type: 'setWindow', window: w });
  };

  const refresh = () => {
    setLoading(true);
    setData(null);
    window.vscodeApi?.postMessage({ type: 'refresh' });
  };

  const sortedProjects = useMemo(() => {
    if (!data) return [];
    const arr = [...data.perProject];
    if (projectSort === 'sessions') arr.sort((a, b) => b.sessionCount - a.sessionCount);
    else if (projectSort === 'recent') arr.sort((a, b) => b.lastActivity - a.lastActivity);
    else arr.sort((a, b) => b.totalCost - a.totalCost);
    return arr;
  }, [data, projectSort]);

  const modelPieData = useMemo(() => {
    if (!data) return [];
    return data.perModel.map((m) => ({
      name: normalizeModel(m.model),
      fullModel: m.model,
      value: m.totalCost,
    }));
  }, [data]);

  return (
    <div className="ws-root">
      <header className="ws-header">
        <div className="ws-title">
          <span className="ws-title-main">Workspace</span>
          <span className="ws-title-sep">·</span>
          <span className="ws-title-sub">Cross-session token + cost rollup</span>
        </div>
        <div className="ws-window">
          {(['7d', '30d', 'mtd', 'all'] as WindowKey[]).map((w) => (
            <button
              key={w}
              className={`ws-window-btn${windowKey === w ? ' active' : ''}`}
              onClick={() => requestWindow(w)}
              type="button"
            >
              {w === '7d' ? 'Last 7 days' : w === '30d' ? 'Last 30 days' : w === 'mtd' ? 'Month to date' : 'All time'}
            </button>
          ))}
          <button className="ws-refresh" onClick={refresh} type="button" title="Re-scan all JSONLs">
            ↻
          </button>
        </div>
      </header>

      <nav className="ws-tabs">
        <button className={`ws-tab${tab === 'week' ? ' active' : ''}`} onClick={() => setTab('week')} type="button">
          Window summary
        </button>
        <button className={`ws-tab${tab === 'projects' ? ' active' : ''}`} onClick={() => setTab('projects')} type="button">
          By project
        </button>
      </nav>

      {loading && (
        <div className="ws-loading">
          <div className="ws-spinner" />
          <div>
            Scanning JSONLs{progress ? ` (${progress.done} / ${progress.total})` : ''}…
          </div>
        </div>
      )}

      {!loading && data && tab === 'week' && (
        <section className="ws-section">
          <div className="ws-stat-grid">
            <Stat label="Total cost" value={fmtUSD(data.totalCost)} />
            <Stat label="Input tokens" value={fmtTokens(data.totalInputTokens)} />
            <Stat label="Output tokens" value={fmtTokens(data.totalOutputTokens)} />
            <Stat label="Cache read" value={fmtTokens(data.totalCacheReadTokens)} />
            <Stat label="Cache write" value={fmtTokens(data.totalCacheCreateTokens)} />
            <Stat label="Sessions scanned" value={String(data.scannedFileCount)} />
          </div>

          <div className="ws-row">
            <div className="ws-card ws-card-chart">
              <h3>Daily cost</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.perDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.18)" />
                  <XAxis
                    dataKey="isoDate"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 11 }}
                    stroke="rgba(128,128,128,0.6)"
                  />
                  <YAxis tickFormatter={(v) => fmtUSD(v)} tick={{ fontSize: 11 }} stroke="rgba(128,128,128,0.6)" />
                  <Tooltip
                    formatter={(v: number) => fmtUSD(v)}
                    labelFormatter={fmtDate}
                    contentStyle={{
                      background: 'var(--vscode-editor-background)',
                      border: '1px solid var(--vscode-widget-border)',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="totalCost" fill="var(--vscode-charts-blue, #60a5fa)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="ws-card ws-card-chart">
              <h3>Spend by model</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={modelPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {modelPieData.map((entry, i) => (
                      <Cell key={i} fill={MODEL_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, _name: any, props: any) => [fmtUSD(v), props?.payload?.fullModel]}
                    contentStyle={{
                      background: 'var(--vscode-editor-background)',
                      border: '1px solid var(--vscode-widget-border)',
                      fontSize: 12,
                    }}
                  />
                  <Legend formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ws-card">
            <h3>Top projects this window</h3>
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="num">Sessions</th>
                  <th className="num">Input</th>
                  <th className="num">Output</th>
                  <th className="num">Cache read</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.perProject.slice(0, 5).map((p) => (
                  <tr key={p.project}>
                    <td title={p.project}>{fmtProject(p.project)}</td>
                    <td className="num">{p.sessionCount}</td>
                    <td className="num">{fmtTokens(p.inputTokens)}</td>
                    <td className="num">{fmtTokens(p.outputTokens)}</td>
                    <td className="num">{fmtTokens(p.cacheReadTokens)}</td>
                    <td className="num">{fmtUSD(p.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && data && tab === 'projects' && (
        <section className="ws-section">
          <div className="ws-projectsort">
            Sort by:&nbsp;
            <button className={`ws-sortbtn${projectSort === 'cost' ? ' active' : ''}`} onClick={() => setProjectSort('cost')} type="button">Cost</button>
            <button className={`ws-sortbtn${projectSort === 'sessions' ? ' active' : ''}`} onClick={() => setProjectSort('sessions')} type="button">Sessions</button>
            <button className={`ws-sortbtn${projectSort === 'recent' ? ' active' : ''}`} onClick={() => setProjectSort('recent')} type="button">Most recent</button>
          </div>
          <div className="ws-card">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="num">Sessions</th>
                  <th className="num">Input</th>
                  <th className="num">Output</th>
                  <th className="num">Cache R</th>
                  <th className="num">Cache W</th>
                  <th className="num">Cost</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map((p) => (
                  <tr key={p.project}>
                    <td title={p.project}>{fmtProject(p.project)}</td>
                    <td className="num">{p.sessionCount}</td>
                    <td className="num">{fmtTokens(p.inputTokens)}</td>
                    <td className="num">{fmtTokens(p.outputTokens)}</td>
                    <td className="num">{fmtTokens(p.cacheReadTokens)}</td>
                    <td className="num">{fmtTokens(p.cacheCreateTokens)}</td>
                    <td className="num">{fmtUSD(p.totalCost)}</td>
                    <td>{fmtRelative(p.lastActivity)}</td>
                  </tr>
                ))}
                {sortedProjects.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '20px', opacity: 0.6 }}>No projects in this window.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ws-stat">
      <div className="ws-stat-label">{label}</div>
      <div className="ws-stat-value">{value}</div>
    </div>
  );
}
