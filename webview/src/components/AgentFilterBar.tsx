import { Subagent } from '../types/session';
import { TOTAL_FILTER, MAIN_FILTER, AgentFilter } from '../utils/agentFilter';
import { t } from '../i18n';
import './AgentFilterBar.css';

interface Props {
  subagents: Subagent[];
  value: AgentFilter;
  onChange: (filter: AgentFilter) => void;
}

// Disambiguates same-typed agents ("explore 1", "explore 2", …) without
// needing anything beyond the order they're already listed in.
function agentLabel(sub: Subagent, subagents: Subagent[]): string {
  const base = sub.agentType || t('steps.agentFallback');
  const sameType = subagents.filter(s => (s.agentType || t('steps.agentFallback')) === base);
  return sameType.length > 1 ? `${base} ${sameType.indexOf(sub) + 1}` : base;
}

// Past this many agents a row of buttons stops being scannable — a Workflow
// run alone can spawn well over a hundred — so the agents move into a select.
const MAX_AGENT_BUTTONS = 8;

// Workflow agents are grouped under their run, the rest listed first — the
// same order they already have in `subagents`.
const AgentSelect = ({ subagents, value, onChange }: Props) => {
  const plain = subagents.filter(s => !s.workflowRunId);
  const runs = new Map<string, Subagent[]>();
  for (const s of subagents) {
    if (!s.workflowRunId) continue;
    const list = runs.get(s.workflowRunId) ?? [];
    list.push(s);
    runs.set(s.workflowRunId, list);
  }
  const option = (sub: Subagent) => (
    <option key={sub.agentId} value={sub.agentId} title={sub.description || sub.prompt}>
      {agentLabel(sub, subagents)} · {sub.agentId}
    </option>
  );
  const picked = value !== TOTAL_FILTER && value !== MAIN_FILTER;
  return (
    <select
      className={`agent-filter-select${picked ? ' active' : ''}`}
      value={picked ? value : ''}
      onChange={e => onChange(e.target.value || TOTAL_FILTER)}
    >
      <option value="">{t('agentFilter.pickAgent', { count: subagents.length })}</option>
      {plain.map(option)}
      {[...runs.entries()].map(([runId, list]) => (
        <optgroup key={runId} label={t('agentFilter.workflowRun', { id: runId, count: list.length })}>
          {list.map(option)}
        </optgroup>
      ))}
    </select>
  );
};

const AgentFilterBar = ({ subagents, value, onChange }: Props) => {
  if (subagents.length === 0) return null;

  return (
    <div className="agent-filter-bar">
      <button
        className={`agent-filter-btn ${value === TOTAL_FILTER ? 'active' : ''}`}
        onClick={() => onChange(TOTAL_FILTER)}
      >
        {t('agentFilter.total')}
      </button>
      <button
        className={`agent-filter-btn ${value === MAIN_FILTER ? 'active' : ''}`}
        onClick={() => onChange(MAIN_FILTER)}
      >
        {t('agentFilter.main')}
      </button>
      {subagents.length > MAX_AGENT_BUTTONS ? (
        <AgentSelect subagents={subagents} value={value} onChange={onChange} />
      ) : subagents.map(sub => (
        <button
          key={sub.agentId}
          className={`agent-filter-btn ${value === sub.agentId ? 'active' : ''}`}
          title={sub.description || sub.prompt}
          onClick={() => onChange(sub.agentId)}
        >
          {agentLabel(sub, subagents)}
        </button>
      ))}
    </div>
  );
};

export default AgentFilterBar;
