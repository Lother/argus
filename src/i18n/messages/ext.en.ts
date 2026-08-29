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
  'ext.workspaceTitle': 'Argus: Workspace',
  'ext.workspaceAggregationFailed': 'Argus workspace aggregation failed: {error}',
  'ext.refreshingSessions': 'Argus: Refreshing sessions...',
  'ext.statusBarTooltip': 'Claude Code Session Debugger',

  // sessionWebviewProviderReact.ts
  'ext.deleteSessionFailed': 'Argus: failed to delete session: {error}',
  'ext.attachmentNotFoundInTranscript': 'Attachment not found in the transcript.',
  'ext.attachmentGone': 'Argus: attachment is no longer in the transcript.',
  'ext.attachmentOpenFailed': 'Argus: could not open the attachment: {error}',
  'ext.attachmentSaveFailed': 'Argus: could not save the attachment: {error}',
  'ext.saveAttachmentLabel': 'Save Attachment',
  'ext.sessionGone': 'Argus: session {sessionId} is no longer on disk.',
  'ext.cannotDeleteActiveSession': "Argus: can't delete an active session.",
  'ext.confirmMoveToTrash': 'Move session {sessionId} to the trash?',
  'ext.confirmDeletePermanently': 'Permanently delete session {sessionId}?',
  'ext.moveToTrashButton': 'Move to Trash',
  'ext.deletePermanentlyButton': 'Delete Permanently',
  'ext.trashFailed': 'Argus: could not move session {sessionId} to the trash.',
  'ext.deletePermanentlyPrompt': 'Delete permanently instead? This cannot be undone.',
  'ext.deleteSessionFailedDetailed': 'Argus: failed to delete session {sessionId}. {details}',

  // sessionListViewProvider.ts
  'sidebar.searchPlaceholder': 'Search title, project or id...',
  'sidebar.searchScopeTooltip': 'Search inside transcripts too (slower)',
  'sidebar.all': 'All',
  'sidebar.allModels': 'All Models',
  'sidebar.allTime': 'All Time',
  'sidebar.last1Hour': 'Last 1 hour',
  'sidebar.last3Hours': 'Last 3 hours',
  'sidebar.last6Hours': 'Last 6 hours',
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
  'sidebar.dateGroup.today': 'Today',
  'sidebar.dateGroup.yesterday': 'Yesterday',
  'sidebar.dateGroup.daysAgo': '{n} days ago',
  'sidebar.dateGroup.aWeekAgo': 'A week ago',
  'sidebar.dateGroup.weeksAgo': '{n} weeks ago',
  'sidebar.dateGroup.aMonthAgo': 'A month ago',
  'sidebar.dateGroup.monthsAgo': '{n} months ago',

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
  'analyzer.compaction.title': 'Context Compaction',
  'analyzer.compaction.dropDetected': 'Detected {tokens} token drop ({pct}%).',
  'analyzer.compaction.rereadCount': '{count} files re-read after compaction.',
};
