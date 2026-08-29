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
  'ext.refreshingSessions': 'Argus: Refreshing sessions...',
  'ext.statusBarTooltip': 'Claude Code Session Debugger',

  // sessionListViewProvider.ts
  'sidebar.searchPlaceholder': 'Search sessions...',
  'sidebar.all': 'All',
  'sidebar.allModels': 'All Models',
  'sidebar.allTime': 'All Time',
  'sidebar.last1Hour': 'Last 1 hour',
  'sidebar.last24Hours': 'Last 24 hours',
  'sidebar.last7Days': 'Last 7 days',
  'sidebar.last30Days': 'Last 30 days',
  'sidebar.customRangeItem': 'Custom range...',
  'sidebar.custom': 'Custom',
  'sidebar.unknownProject': 'Unknown Project',
  'sidebar.noSessionsFound': 'No sessions found',
  'sidebar.untitledSession': 'Untitled Session',
  'sidebar.time.justNow': 'just now',
  'sidebar.time.minutesAgo': '{n}m ago',
  'sidebar.time.hoursAgo': '{n}h ago',
  'sidebar.time.daysAgo': '{n}d ago',
  'sidebar.time.weeksAgo': '{n}w ago',
  'sidebar.time.monthsAgo': '{n}mo ago',
  'sidebar.calendarTitleFormat': '{month} {year}',
  'sidebar.pillDateFormat': '{month} {day}, {year}',
  'sidebar.months': 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
  'sidebar.weekdays': 'Mo,Tu,We,Th,Fr,Sa,Su',

  // datePickerPanel.ts (labels also reused by the sidebar's inline calendar)
  'datePicker.from': 'From',
  'datePicker.to': 'To',
  'datePicker.cancel': 'Cancel',
  'datePicker.apply': 'Apply',
  'datePicker.panelTitle': 'Select Date Range',
  'datePicker.customDateRange': 'Custom Date Range',

  // analyzerService.ts
  'analyzer.duplicateReads.title': 'Duplicate File Reads',
  'analyzer.duplicateReads.description':
    'The following files were read multiple times: {files}',
  'analyzer.unusedReads.title': 'Potentially Unused Reads',
  'analyzer.unusedReads.description':
    'Found {count} file reads that may not have been used',
  'analyzer.retryLoop.title': 'Retry Loop Detected',
  'analyzer.retryLoop.description': 'Tool "{tool}" failed {count} times in a row',
  'analyzer.failedTool.title': 'Failed Tool Calls',
  'analyzer.failedTool.description': 'Found {count} failed tool calls',
  'analyzer.contextPressure.title': 'High Context Pressure ({count} steps)',
  'analyzer.contextPressure.description':
    'Detected sustained high input token usage averaging {avg} tokens (threshold: {threshold})',
  'analyzer.compaction.title': 'Context Compaction at Step {step}',
  'analyzer.compaction.description':
    'Detected {tokens} token drop ({pct}%). {count} files re-read after compaction.',
};
