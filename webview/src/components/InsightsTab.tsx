import { useMemo } from 'react';
import { Step, AnalysisResult } from '../types/session';
import { t } from '../i18n';
import './InsightsTab.css';

interface Props {
  steps: Step[];
  flatSteps: Step[];
  analysis?: AnalysisResult;
  filesRead: string[];
  filesWritten: string[];
  onGoToStep: (globalIndex: number) => void;
}

interface Insight {
  type: 'optimization' | 'warning' | 'success' | 'info';
  icon: string;
  title: string;
  description: string;
  potentialSavings?: number;
  // Already resolved to globalIndex — the step badges navigate with these.
  affectedSteps?: number[];
}

const InsightsTab = ({ steps, flatSteps, analysis, filesRead, filesWritten, onGoToStep }: Props) => {
  // Findings and main-session steps carry local indices; the timeline navigates
  // by globalIndex, so map one to the other before rendering step badges.
  const toGlobal = useMemo(() => {
    const main = new Map<number, number>();
    for (const s of flatSteps) {
      if (!s.agentId) main.set(s.index, s.globalIndex ?? s.index);
    }
    return (localIndices: number[]): number[] =>
      localIndices
        .map(idx => main.get(idx))
        .filter((gi): gi is number => gi !== undefined);
  }, [flatSteps]);

  const insights = useMemo((): Insight[] => {
    const results: Insight[] = [];

    // File read patterns
    const fileReadCount = new Map<string, number>();
    steps.forEach(step => {
      if (step.toolName === 'Read' && step.toolInput?.file_path) {
        const path = step.toolInput.file_path;
        fileReadCount.set(path, (fileReadCount.get(path) || 0) + 1);
      }
    });

    // Duplicate reads insight
    const duplicateReads = Array.from(fileReadCount.entries()).filter(([_, count]) => count > 3);
    if (duplicateReads.length > 0) {
      const [mostReadFile, count] = duplicateReads[0];
      const fileName = mostReadFile.split('/').pop() || mostReadFile;
      results.push({
        type: 'optimization',
        icon: '💡',
        title: t('insights.duplicateReadsTitle'),
        description: t('insights.duplicateReadsDesc', { file: fileName, count }),
        potentialSavings: 0.15 * (count - 1),
      });
    }

    // Retry loop patterns from findings
    const retryLoops = analysis?.findings?.filter(f => f.rule === 'retry_loop') || [];
    if (retryLoops.length > 0) {
      const totalWasted = retryLoops.reduce((sum, f) => sum + (f.wastedCost || 0), 0);
      results.push({
        type: 'warning',
        icon: '🔁',
        title: t(
          retryLoops.length > 1 ? 'insights.retryLoopTitleOther' : 'insights.retryLoopTitleOne',
          { count: retryLoops.length }
        ),
        description: t('insights.retryLoopDesc'),
        potentialSavings: totalWasted,
        affectedSteps: toGlobal(retryLoops.flatMap(f => f.steps || [])),
      });
    }

    // Context pressure insights
    const pressureFindings = analysis?.findings?.filter(f => f.rule === 'context_pressure') || [];
    if (pressureFindings.length > 0) {
      results.push({
        type: 'warning',
        icon: '⚠️',
        title: t('insights.contextPressureTitle'),
        description: t('insights.contextPressureDesc'),
        affectedSteps: toGlobal(pressureFindings.flatMap(f => f.steps || [])),
      });
    }

    // Compaction insights
    const compactionFindings = analysis?.findings?.filter(f => f.rule === 'compaction_detected') || [];
    if (compactionFindings.length > 0) {
      const totalWasted = compactionFindings.reduce((sum, f) => sum + (f.wastedCost || 0), 0);
      results.push({
        type: 'info',
        icon: '🗜️',
        title: t(
          compactionFindings.length > 1
            ? 'insights.compactionTitleOther'
            : 'insights.compactionTitleOne',
          { count: compactionFindings.length }
        ),
        description: t('insights.compactionDesc', {
          detail:
            totalWasted > 0
              ? t('insights.compactionDetailWasted', { cost: totalWasted.toFixed(4) })
              : t('insights.compactionDetailClean'),
        }),
        potentialSavings: totalWasted,
        affectedSteps: toGlobal(compactionFindings.flatMap(f => f.steps || [])),
      });
    }

    // Efficiency achievements
    const efficiency = analysis?.efficiency || 100;
    if (efficiency >= 90) {
      results.push({
        type: 'success',
        icon: '✨',
        title: t('insights.excellentEfficiencyTitle'),
        description: t('insights.excellentEfficiencyDesc', {
          percent: efficiency.toFixed(1),
        }),
      });
    } else if (efficiency < 70) {
      results.push({
        type: 'warning',
        icon: '📉',
        title: t('insights.lowEfficiencyTitle'),
        description: t('insights.lowEfficiencyDesc', { percent: efficiency.toFixed(1) }),
        potentialSavings: analysis?.wastedCost || 0,
      });
    }

    // Cache usage insights
    const cacheMetrics = analysis?.contextMetrics;
    if (cacheMetrics && cacheMetrics.cacheHitRatio > 0) {
      const ratio = (cacheMetrics.cacheHitRatio * 100).toFixed(1);
      if (cacheMetrics.cacheHitRatio > 0.3) {
        results.push({
          type: 'success',
          icon: '💾',
          title: t('insights.effectiveCacheTitle'),
          description: t('insights.effectiveCacheDesc', { percent: ratio }),
        });
      } else {
        results.push({
          type: 'info',
          icon: '💾',
          title: t('insights.lowCacheTitle'),
          description: t('insights.lowCacheDesc', { percent: ratio }),
        });
      }
    }

    // Edit patterns
    const editSteps = steps.filter(s => s.toolName === 'Edit');
    if (editSteps.length > 10) {
      results.push({
        type: 'info',
        icon: '✏️',
        title: t('insights.manyEditsTitle'),
        description: t('insights.manyEditsDesc', { count: editSteps.length }),
      });
    }

    // Bash command patterns
    const bashSteps = steps.filter(s => s.toolName === 'Bash');
    const bashFailures = bashSteps.filter(s => s.toolSuccess === false);
    if (bashFailures.length > 0) {
      results.push({
        type: 'warning',
        icon: '🐚',
        title: t(
          bashFailures.length > 1
            ? 'insights.failedBashTitleOther'
            : 'insights.failedBashTitleOne',
          { count: bashFailures.length }
        ),
        description: t('insights.failedBashDesc'),
        affectedSteps: toGlobal(bashFailures.map(s => s.index)),
      });
    }

    // File write/read ratio
    if (filesWritten.length > 0) {
      const ratio = filesRead.length / filesWritten.length;
      if (ratio > 10) {
        results.push({
          type: 'optimization',
          icon: '📖',
          title: t('insights.readHeavyTitle'),
          description: t('insights.readHeavyDesc', {
            read: filesRead.length,
            written: filesWritten.length,
            ratio: ratio.toFixed(1),
          }),
        });
      } else if (ratio < 2) {
        results.push({
          type: 'info',
          icon: '✍️',
          title: t('insights.writeHeavyTitle'),
          description: t('insights.writeHeavyDesc', {
            written: filesWritten.length,
            read: filesRead.length,
          }),
        });
      }
    }

    return results;
  }, [steps, analysis, filesRead, filesWritten, toGlobal]);

  const renderInsight = (insight: Insight, index: number) => (
    <div key={index} className={`insight-card ${insight.type}`}>
      <div className="insight-header">
        <span className="insight-icon">{insight.icon}</span>
        <h3 className="insight-title">{insight.title}</h3>
      </div>
      <p className="insight-description">{insight.description}</p>
      {insight.potentialSavings !== undefined && insight.potentialSavings > 0 && (
        <div className="insight-savings">
          <span className="savings-label">{t('insights.potentialSavings')}</span>
          <span className="savings-value">${insight.potentialSavings.toFixed(4)}</span>
        </div>
      )}
      {insight.affectedSteps && insight.affectedSteps.length > 0 && (
        <div className="insight-steps">
          <span className="steps-label">{t('insights.steps')}</span>
          {insight.affectedSteps.slice(0, 10).map(idx => (
            <button key={idx} className="step-badge" onClick={() => onGoToStep(idx)}>
              #{idx}
            </button>
          ))}
          {insight.affectedSteps.length > 10 && (
            <span className="steps-more">+{insight.affectedSteps.length - 10}</span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="insights-tab">
      {insights.length === 0 ? (
        <div className="no-insights">
          <span className="no-insights-icon">✨</span>
          <h3>{t('insights.emptyTitle')}</h3>
          <p>{t('insights.emptyDesc')}</p>
        </div>
      ) : (
        <div className="insights-grid">
          {insights.map((insight, index) => renderInsight(insight, index))}
        </div>
      )}
    </div>
  );
};

export default InsightsTab;
