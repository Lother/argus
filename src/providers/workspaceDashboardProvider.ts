import * as path from 'path';
import * as vscode from 'vscode';
import { AggregationService } from '../services/aggregationService';

type WindowKey = '7d' | '30d' | 'mtd' | 'all';

function windowRange(key: WindowKey): { from: number; to: number } {
  const now = Date.now();
  switch (key) {
    case '7d': return { from: now - 7 * 86400000, to: now };
    case '30d': return { from: now - 30 * 86400000, to: now };
    case 'mtd': {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      return { from: start, to: now };
    }
    case 'all':
    default:
      return { from: 0, to: now };
  }
}

/**
 * Opens (and reveals) the cross-session workspace dashboard webview panel.
 * The panel is a singleton — re-running the command focuses the existing one.
 */
export class WorkspaceDashboardProvider {
  private static _panel: vscode.WebviewPanel | undefined;

  static async show(
    context: vscode.ExtensionContext,
    aggregation: AggregationService,
  ): Promise<void> {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'argusWorkspaceDashboard',
      'Argus: Workspace',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'))],
      },
    );
    this._panel = panel;

    const webview = panel.webview;
    const webviewRoot = vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'main.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'workspace.js'));
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src ${webview.cspSource} data:; script-src ${webview.cspSource};`;

    webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <title>Argus Workspace</title>
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${jsUri}"></script>
</body>
</html>`;

    let currentWindow: WindowKey = '7d';
    let busy = false;

    const runAggregation = async () => {
      if (busy) return;
      busy = true;
      try {
        webview.postMessage({ type: 'workspaceLoading' });
        const { from, to } = windowRange(currentWindow);
        const data = await aggregation.aggregateAll(
          from,
          to,
          (done, total) => webview.postMessage({ type: 'workspaceProgress', done, total }),
        );
        webview.postMessage({ type: 'workspaceData', data });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage('Argus workspace aggregation failed: ' + msg);
      } finally {
        busy = false;
      }
    };

    webview.onDidReceiveMessage((message) => {
      if (message?.type === 'ready') {
        if (message.window) currentWindow = message.window as WindowKey;
        void runAggregation();
      } else if (message?.type === 'setWindow') {
        currentWindow = message.window as WindowKey;
        void runAggregation();
      } else if (message?.type === 'refresh') {
        void runAggregation();
      }
    });

    panel.onDidDispose(() => {
      this._panel = undefined;
    });

    context.subscriptions.push(panel);
  }
}
