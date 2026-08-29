import type { Messages } from '../core';

export const extZhTW: Messages = {
  // extension.ts
  'ext.sessionsRefreshed': '已重新整理工作階段（找到 {count} 個）',
  'ext.refreshFailed': '重新整理工作階段失敗：{error}',
  'ext.openFailed': '開啟工作階段失敗：{error}',
  'ext.loadFailed': '載入工作階段資料失敗',
  'ext.refreshingSessions': 'Argus：正在重新整理工作階段…',
  'ext.statusBarTooltip': 'Claude Code 工作階段除錯工具',

  // sessionListViewProvider.ts
  'sidebar.searchPlaceholder': '搜尋工作階段…',
  'sidebar.all': '全部',
  'sidebar.allModels': '全部模型',
  'sidebar.allTime': '全部時間',
  'sidebar.last1Hour': '最近 1 小時',
  'sidebar.last24Hours': '最近 24 小時',
  'sidebar.last7Days': '最近 7 天',
  'sidebar.last30Days': '最近 30 天',
  'sidebar.customRangeItem': '自訂範圍…',
  'sidebar.custom': '自訂',
  'sidebar.unknownProject': '未知專案',
  'sidebar.noSessionsFound': '找不到工作階段',
  'sidebar.untitledSession': '未命名工作階段',
  'sidebar.time.justNow': '剛剛',
  'sidebar.time.minutesAgo': '{n} 分鐘前',
  'sidebar.time.hoursAgo': '{n} 小時前',
  'sidebar.time.daysAgo': '{n} 天前',
  'sidebar.time.weeksAgo': '{n} 週前',
  'sidebar.time.monthsAgo': '{n} 個月前',
  'sidebar.calendarTitleFormat': '{year}年{month}',
  'sidebar.pillDateFormat': '{year}年{month}{day}日',
  'sidebar.months': '1月,2月,3月,4月,5月,6月,7月,8月,9月,10月,11月,12月',
  'sidebar.weekdays': '一,二,三,四,五,六,日',

  // datePickerPanel.ts (labels also reused by the sidebar's inline calendar)
  'datePicker.from': '起始',
  'datePicker.to': '結束',
  'datePicker.cancel': '取消',
  'datePicker.apply': '套用',
  'datePicker.panelTitle': '選擇日期範圍',
  'datePicker.customDateRange': '自訂日期範圍',

  // analyzerService.ts
  'analyzer.duplicateReads.title': '重複讀取的檔案',
  'analyzer.duplicateReads.description': '下列檔案被重複讀取：{files}',
  'analyzer.unusedReads.title': '可能未使用的讀取',
  'analyzer.unusedReads.description': '找到 {count} 個可能未被使用的檔案讀取',
  'analyzer.retryLoop.title': '偵測到重試迴圈',
  'analyzer.retryLoop.description': '工具「{tool}」連續失敗 {count} 次',
  'analyzer.failedTool.title': '工具呼叫失敗',
  'analyzer.failedTool.description': '找到 {count} 個失敗的工具呼叫',
  'analyzer.contextPressure.title': '高上下文壓力（{count} 個步驟）',
  'analyzer.contextPressure.description':
    '偵測到持續偏高的輸入 token 用量，平均 {avg} token（門檻：{threshold}）',
  'analyzer.compaction.title': '步驟 {step} 發生上下文壓縮',
  'analyzer.compaction.description':
    '偵測到 {tokens} token 的下降幅度（{pct}%）。壓縮後重新讀取了 {count} 個檔案。',
};
