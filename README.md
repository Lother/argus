<p align="center">
  <img src="logo.png" alt="Argus logo" width="180" />
</p>

<p align="center"><strong>Argus — VS Code 裡的 Claude Code agent 監控與觀測（繁體中文版）</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-1.80%2B-0078d7?logo=visualstudiocode&logoColor=white" alt="VS Code 1.80+" />
  <img src="https://img.shields.io/badge/runtime-TypeScript-3178c6?logo=typescript&logoColor=white" alt="TypeScript runtime" />
  <img src="https://img.shields.io/badge/webview-React%2019-61dafb?logo=react&logoColor=black" alt="React 19 webview" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-f28c28" alt="macOS, Linux, Windows" />
  <img src="https://img.shields.io/badge/license-MIT-0f7ae5" alt="MIT license" />
</p>

# Argus 繁體中文版

**Argus** 是一個開源 VS Code 擴充功能，把 Claude Code 的 agent 工作階段變成看得見、查得到的東西。它讀取 Claude Code 寫在 `~/.claude/projects/` 的 JSONL 逐字稿，解析每一次工具呼叫、每一段提示與每一顆 token，還原 agent 實際做了什麼——逐步驟、逐檔案、逐美元。不用登入、不上傳任何資料，逐字稿從頭到尾不離開你的機器。

本倉庫是 [yessGlory17/argus](https://github.com/yessGlory17/argus)（經 Dees7/argus 維護分支）的**繁體中文在地化分支**，除了完整翻譯外也持續加入自己的功能與修正。

## 這個分支多了什麼

**繁體中文在地化**
- 介面、分析結果、設定說明全面 zh-TW，走 i18n 字典層而非硬替換，`argus.language` 可切 `auto` / `en` / `zh-TW`
- 日期與時間格式跟隨語系

**加強的即時監看**
- **執行中 agent 置頂狀態列**：正在跑的 sub-agent 釘在步驟分頁最上方，各顯示最新一則步驟；agent 結束後自動消失，也可手動「標記結束」
- 正確判定背景 agent 的結束時點（task-notification），被喚醒的 agent 會重新出現
- **Workflow 支援**：Workflow 派出的 agent（`subagents/workflows/<runId>/`）完整進時間軸、成本統計與置頂狀態列，run 進行中以 journal 即時判定狀態
- 步驟展開狀態改用穩定識別，多 agent 同時追加步驟時不再跑位
- 修正長時間監看的檔案描述符洩漏與重掃洪水——大型 workflow 跑數小時後側欄清空、面板凍結的問題已解決

**其他**
- 成本分頁涵蓋 sub-agent 花費
- 步驟列顯示所屬 agent 的類型徽章與 transcript id，可追回 `agent-<id>.jsonl`

## 截圖

<p align="center"><strong>步驟</strong> — 可搜尋、可過濾的執行紀錄</p>
<p align="center"><img src="screenshots/steps.png" alt="Steps tab" width="1280" /></p>

<p align="center"><strong>分析</strong> — 重複讀取、重試迴圈與最佳化建議</p>
<p align="center"><img src="screenshots/analysis.png" alt="Analysis tab" width="1280" /></p>

<p align="center"><strong>成本</strong> — 逐步驟 token 與美元拆帳、快取歸因</p>
<p align="center"><img src="screenshots/cost.png" alt="Cost tab" width="1280" /></p>

## 快速開始

### 需求

- VS Code `1.80` 以上
- 已安裝 Claude Code，工作階段寫在 `~/.claude/projects/`
- Node.js `18+`（僅從原始碼建置時需要）

### 從 VSIX 安裝（建議）

到 [Releases](https://github.com/Lother/argus/releases) 下載最新的 `.vsix`：

```bash
code --install-extension argus-claude-0.3.6-zh.vsix
```

打開 VS Code，點活動列的 **Argus** 眼睛圖示，既有的 Claude Code 工作階段會自動出現。

### 從原始碼建置

```bash
git clone https://github.com/Lother/argus.git
cd argus
npm install
npm run compile
npm run build:webview
npx @vscode/vsce package
code --install-extension argus-claude-0.3.6.vsix
```

## 使用方式

1. 點活動列的 **Argus** 眼睛圖示，側欄列出所有工作階段——可搜尋、過濾、分組。
2. 點任一工作階段開啟分析儀表板。
3. Claude Code 執行中時把儀表板開著：檔案監看會即時更新步驟、置頂 agent 狀態與成本。

儀表板分頁：**步驟**（完整執行紀錄）、**分析**（規則引擎的發現）、**成本**（token／美元拆帳）、**效能**（效率分數與浪費成本）、**流程**（檔案操作相依圖）、**上下文**（token 預算與快取表現）、**洞察**（模式觀察與建議）、**地圖**（工作階段拓撲鳥瞰）。

## 設定

| 設定 | 預設 | 說明 |
| --- | --- | --- |
| `argus.language` | `"auto"` | 介面與分析語言——`"auto"`、`"en"`、`"zh-TW"` |
| `argus.scanDepth` | `5` | 掃描 `.claude` 目錄的最大深度 |
| `argus.openLocation` | `"active"` | 工作階段開在哪——`"active"`（目前群組）或 `"beside"`（旁邊分割） |
| `argus.delete.useTrash` | `true` | 刪除工作階段時移到資源回收筒而非直接刪除 |
| `argus.searchBar.showModelSelector` | `true` | 搜尋框旁顯示模型選擇器 |
| `argus.sessionList.showModel` | `true` | 側欄列表顯示模型 |
| `argus.sessionList.showProject` | `true` | 側欄列表顯示專案 |
| `argus.steps.sortOrder` | `"newest"` | 步驟預設排序——`"newest"`、`"oldest"`、`"cost-desc"`、`"cost-asc"` |
| `argus.steps.autoExpand` | `[]` | 預設展開的步驟類型，支援 `*` 萬用字元（如 `["text", "mcp*"]`） |
| `argus.notes.hideNotes` | `false` | 隱藏工作階段筆記區 |
| `argus.analysis.realCompactsOnly` | `false` | 只在逐字稿實際標記壓縮處回報壓縮事件，而非從 token 驟降推斷 |

## 授權

MIT — 見 [LICENSE](LICENSE)。原專案版權歸原作者所有。

---

# Argus (original English README)

**Argus** is an open-source VS Code extension that brings deep monitoring and observability to your Claude Code agent sessions. It reads the JSONL transcripts that Claude Code writes to `~/.claude/projects/`, parses every tool call, prompt, and token, and turns them into a coherent, inspectable picture of what your agent actually did — step by step, file by file, dollar by dollar.

Instead of treating each agent run as an opaque black box, Argus makes the full execution trace first-class: every Read, Write, Edit, Bash, WebFetch, and subagent call is timestamped, costed, and linked into the dependency graph it produced. You see retry loops before they burn through tokens, duplicated reads before they pad the context window, failed tools before they cascade, and compaction events before they erase state. Sessions stream live as Claude Code runs, so monitoring is continuous rather than post-mortem, and everything stays inside the editor where the work is already happening.

Named after the hundred-eyed watchman of Greek mythology, Argus is built for developers, teams, and researchers who want to understand — not guess — how their Claude Code agents spend time, money, and context.

## Video
<div align="center">
  <a href="https://www.youtube.com/watch?v=HmHOI1PBn_M">
    <img src="https://img.youtube.com/vi/HmHOI1PBn_M/maxresdefault.jpg" alt="Argus video" style="width:100%;">
  </a>
</div>

## Features

### Monitoring & observability

| Capability | What it gives you |
| --- | --- |
| **Live session watcher** | File-watcher tails the active JSONL transcript and re-renders the dashboard as Claude Code writes new events |
| **Automatic discovery** | Recursively scans `~/.claude/projects/` and surfaces every session — no manual import |
| **Subagent tracking** | Detects spawned subagents (Task and Workflow), attributes their tool calls, and links them back to the parent step |
| **Cost telemetry** | Per-step and per-session token + USD cost, broken down by input / output / cache read / cache write |
| **Context-window metrics** | Cache-hit ratio, window utilization, and compaction-event detection |

### Built-in analysis rules

Argus ships with a rule-based analyzer that flags the patterns that quietly waste tokens and time:

- **Duplicate reads** — the same file pulled into context multiple times
- **Unused operations** — tool outputs the agent never referenced again
- **Retry loops** — repeated failing tool calls with identical arguments
- **Failed tools** — non-zero exits, parse errors, permission denials
- **Context pressure** — windows approaching their cap before compaction
- **Compaction events** — detects when Claude Code dropped earlier history

### Multi-tab analysis dashboard

| Tab | What's inside |
| --- | --- |
| **Steps** | Full execution log with text search, multi-tool filter, status filter, sort by time/cost, per-step duration, per-tool icons; user turns and compaction boundaries appear as their own rows; running agents pin their latest step to the top |
| **Analysis** | All findings from the rule engine with severity, evidence, and jump-to-step links |
| **Cost** | Token & USD breakdown (sub-agents included), model attribution, cache-hit ratio, spending charts |
| **Performance** | Efficiency score, wasted-cost estimate, bottleneck timing |
| **Flow** | D3-powered dependency graph of file Reads / Writes / Edits across steps |
| **Context** | Token budget, cache performance, I/O distribution, compaction markers |
| **Insights** | AI-derived recommendations and pattern observations |
| **Map** | Birds-eye view of the session topology |

### Sidebar & filtering

- Inline session search and model filter (Opus / Sonnet / Haiku)
- Date presets (1h / 3h / 6h / 24h / 7d / 30d) plus a custom calendar range picker
- Group by project, by model, or flat list
- Sticky headers, tabs, and filters that stay put while content scrolls
- Native dark-mode integration with the active VS Code theme

## Usage

1. Open VS Code with the Argus extension installed.
2. Click the **Argus** eye icon in the Activity Bar.
3. Your sessions are listed in the sidebar — search, filter, and group as needed.
4. Click any session to open the analysis dashboard in a new tab.
5. While Claude Code is running, leave the dashboard open: the live watcher updates it in real time.

### Commands

Available via Command Palette (`Ctrl/Cmd + Shift + P`):

| Command | Description |
| --- | --- |
| `Argus: Refresh Sessions` | Re-scan `~/.claude/projects/` with a progress indicator |
| `Argus: Open Session Detail` | Open the dashboard for a specific session |
| `Argus: Clear All Filters` | Reset every active sidebar filter |
| `Argus: Group by Project` | Group sessions by their project directory |
| `Argus: Group by Model` | Group sessions by Claude model |
| `Argus: Flat List` | Disable grouping |

### User turns in the Steps tab

What the user typed shows up as a `user` step. A turn is often split across
several content blocks — an `<ide_opened_file>` or `<system-reminder>` wrapper
glued to the front of the message — so Argus joins the blocks and drops the
injected ones; a turn that is nothing but injected context produces no step.
Slash commands collapse from their raw XML back to what was typed (`/context
all`). Tool results, which the transcript also stores as user events, are not
user turns and stay attached to the tool call that produced them.

### Compaction detection

A compaction is recorded in the transcript as a user event carrying the hand-off
summary that replaces the dropped history — there is no assistant message for
it. Argus turns that event into a `compact` step, so the boundary is visible in
the Steps tab as a dashed divider row; expanding it shows the summary the next
steps actually ran on. This is independent of the setting below.

By default the `Context Compaction` finding is inferred from a drop in
`input + cache_creation` tokens between consecutive steps. That signal is not
specific: an ordinary prompt-cache rotation — a step whose prompt had to be
rewritten into the cache, followed by one that reads it back — produces the same
near-100% drop with no context loss at all, so sessions that were never
compacted still collect findings.

`argus.analysis.realCompactsOnly` switches the rule to the `isCompactSummary`
marker Claude Code writes at a real compaction boundary, and measures the drop
on the full prompt (`input + cache_creation + cache_read`), which is what a
compaction actually shrinks. Only the Analysis tab changes — re-read detection,
wasted cost and every other finding behave the same. Leave it off for older
transcripts written before the marker existed.

### Auto-expanding steps

`argus.steps.autoExpand` takes a list of patterns matched against a step's tool
name (`Read`, `Bash`, `Edit`, …) or type (`text`, `thinking`). Matching is
case-insensitive and `*` is a wildcard, so `["*"]` expands every step,
`["mcp*"]` every MCP tool call, and `["mcp_chromium*"]` a single MCP server —
repeated underscores collapse, so that last pattern also matches
`mcp__chromium__navigate`. Steps stay clickable: expanding or collapsing one by
hand always wins over the setting. Changes apply to already-open sessions.

## Architecture

### Stack

- **Extension host** — TypeScript on the VS Code Extension API, streaming JSONL parser, async file-system scan, file watchers
- **Webview** — React 19 + Vite 7, Chart.js + Recharts for cost/perf charts, D3.js for the dependency graph, Lucide for tool-type icons
- **Analyzer** — Pluggable rule engine; each rule consumes the parsed step list and returns typed findings

### Project layout

```
argus/
├── src/                              # Extension host
│   ├── extension.ts                  # Entry point, command registration
│   ├── i18n/                         # Locale core + message tables (en / zh-TW)
│   ├── types/                        # Models, parser, filter state
│   ├── services/
│   │   ├── discoveryService.ts       # Session discovery + file system scan
│   │   ├── parserService.ts          # JSONL streaming parser, cost calc
│   │   └── analyzerService.ts        # Rule engine
│   └── providers/
│       ├── sessionListViewProvider.ts        # Sidebar webview
│       ├── sessionWebviewProviderReact.ts    # Detail webview + live watcher
│       └── datePickerPanel.ts                # Custom date range picker
│
├── webview/                          # React UI
│   └── src/
│       ├── App.tsx                   # Tab routing
│       └── components/               # Steps / Analysis / Cost / Flow / ...
│
├── resources/                        # Sidebar SVG icons
├── screenshots/                      # README assets
├── package.json                      # Extension manifest
├── tsconfig.json
└── vite.config.ts
```

### Analysis engine

```typescript
interface AnalysisRule {
  name: string;
  analyze(steps: Step[]): Finding[];
}
```

Built-in rules: `DuplicateReadRule`, `UnusedReadRule`, `RetryLoopRule`, `FailedToolRule`, `ContextPressureRule`, `CompactionDetectedRule`. Adding a new rule is a single file plus one entry in the analyzer registry.

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes — TypeScript on both extension host and webview
4. Run `npm run lint` and `npm run compile` before committing
5. Open a pull request describing the change and the motivation

For larger changes please open an issue first so we can align on direction.

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center"><sub>原作：<a href="https://github.com/yessGlory17/argus">yessGlory17/argus</a>（Ozgur Kurucan）· 繁中分支維護：<a href="https://github.com/Lother/argus">Lother</a></sub></p>
<p align="center"><sub>⭐ 如果 Argus 幫你省下 token、時間或理智，給個星星吧。</sub></p>
