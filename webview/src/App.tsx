import { useState, useEffect, useMemo } from 'react';
import { SessionDetail, flattenSessionSteps } from './types/session';
import { t } from './i18n';
import StepsTab from './components/StepsTab';
import AnalysisTab from './components/AnalysisTab';
import CostTab from './components/CostTab';
import FlowTab from './components/FlowTab';
import ContextTab from './components/ContextTab';
import PerformanceTab from './components/PerformanceTab';
import InsightsTab from './components/InsightsTab';
import MapTab, { DirEntry } from './components/MapTab';
import SessionNotes from './components/SessionNotes';
import './styles/global.css';
import './styles/App.css';

type Tab = 'steps' | 'analysis' | 'cost' | 'flow' | 'map' | 'context' | 'performance' | 'insights';

function App() {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('steps');
  const [loading, setLoading] = useState(true);
  const [highlightStep, setHighlightStep] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mapCwd, setMapCwd] = useState<string>('');
  const [mapEntries, setMapEntries] = useState<DirEntry[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'sessionData') {
        setSession(message.data);
        setLoading(false);
        if (isLive) {
          setLastUpdate(new Date());
        }
      } else if (message.type === 'liveMode') {
        setIsLive(message.active);
      } else if (message.type === 'directoryTree') {
        setMapCwd(message.cwd || '');
        setMapEntries(Array.isArray(message.entries) ? message.entries : []);
      }
    };

    window.addEventListener('message', handleMessage);

    if (window.vscodeApi) {
      window.vscodeApi.postMessage({ type: 'ready' });
    }

    return () => window.removeEventListener('message', handleMessage);
  }, [isLive]);

  // Hooks must run unconditionally on every render (Rules of Hooks). Compute
  // the flattened timeline before any early returns.
  const flatSteps = useMemo(
    () => (session ? flattenSessionSteps(session) : []),
    [session]
  );

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>{t('app.loading')}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="error">
        <p>{t('app.noData')}</p>
      </div>
    );
  }

  const agentFindingCount = session.subagents.reduce(
    (acc, s) => acc + (s.analysis?.findings?.length ?? 0),
    0
  );
  const findingCount = (session.analysis?.findings?.length ?? 0) + agentFindingCount;
  const agentSubCost = session.subagents.reduce((acc, s) => acc + (s.totalCost || 0), 0);
  const totalCost =
    (session.analysis?.totalCost ?? session.totalCost ?? 0) + agentSubCost;

  const goToStep = (stepIndex: number) => {
    setActiveTab('steps');
    setHighlightStep(stepIndex);
  };

  const formatModel = (model: string): string => {
    if (!model) return '';
    if (model.includes('opus')) return 'Opus';
    if (model.includes('sonnet')) return 'Sonnet';
    if (model.includes('haiku')) return 'Haiku';
    return model;
  };

  const formatDuration = (ms: number): string => {
    if (!ms) return '';
    const sec = Math.round(ms / 1000);
    if (sec < 60) return t('fmt.durationSec', { value: sec });
    const min = Math.floor(sec / 60);
    const remainder = sec % 60;
    return t('fmt.durationMinSec', { minutes: min, seconds: remainder });
  };

  return (
    <div className="app">
      <div className="detail-header">
        <h2>{session.prompt}</h2>
        <div className="detail-meta">
          <span>{session.project}</span>
          <span className="meta-badge">{formatModel(session.model)}</span>
          <span>{formatDuration(session.durationMs)}</span>
          <span className="meta-dim">
            {t('app.stepCount', { count: flatSteps.length })}
            {session.subagents.length > 0 &&
              ` · ${t('app.agentCount', { count: session.subagents.length })}`}
          </span>
          {isLive && <span className="live-badge"><span className="live-dot"></span>{t('app.live')}</span>}
        </div>
      </div>

      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'steps' ? 'active' : ''}`}
          onClick={() => setActiveTab('steps')}
        >
          {t('app.tabSteps', { count: flatSteps.length })}
        </button>
        <button
          className={`tab ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('analysis')}
        >
          {t('app.tabAnalysis', { count: findingCount })}
        </button>
        <button
          className={`tab ${activeTab === 'cost' ? 'active' : ''}`}
          onClick={() => setActiveTab('cost')}
        >
          {t('app.tabCost', { cost: totalCost.toFixed(2) })}
        </button>
        <button
          className={`tab ${activeTab === 'flow' ? 'active' : ''}`}
          onClick={() => setActiveTab('flow')}
        >
          {t('app.tabFlow')}
        </button>
        <button
          className={`tab ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          {t('app.tabMap')}
        </button>
        <button
          className={`tab ${activeTab === 'context' ? 'active' : ''}`}
          onClick={() => setActiveTab('context')}
        >
          {t('app.tabContext')}
        </button>
        <button
          className={`tab ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance')}
        >
          {t('app.tabPerformance')}
        </button>
        <button
          className={`tab ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          {t('app.tabInsights')}
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'steps' && (
          <StepsTab
            steps={flatSteps}
            subagents={session.subagents}
            findings={session.analysis?.findings || []}
            highlightStep={highlightStep}
          />
        )}
        {activeTab === 'analysis' && (
          <AnalysisTab
            analysis={session.analysis}
            steps={session.steps}
            subagents={session.subagents}
            flatSteps={flatSteps}
            sessionTotalCost={session.totalCost}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'cost' && (
          <CostTab
            steps={session.steps}
            analysis={session.analysis}
            sessionTotalCost={session.totalCost}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'flow' && (
          <FlowTab
            steps={flatSteps}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'map' && (
          <MapTab
            steps={flatSteps}
            cwd={mapCwd || session.project}
            topLevelEntries={mapEntries}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'context' && (
          <ContextTab
            steps={session.steps}
            analysis={session.analysis}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'performance' && (
          <PerformanceTab
            steps={session.steps}
            onGoToStep={goToStep}
          />
        )}
        {activeTab === 'insights' && (
          <InsightsTab
            steps={session.steps}
            analysis={session.analysis}
            filesRead={session.filesRead}
            filesWritten={session.filesWritten}
            onGoToStep={goToStep}
          />
        )}

        {/* Session Notes */}
        <SessionNotes sessionId={session.sessionId} />
      </div>
    </div>
  );
}

export default App;

declare global {
  interface Window {
    vscodeApi?: {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}
