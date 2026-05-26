import React from 'react';
import ReactDOM from 'react-dom/client';
import WorkspaceApp from './WorkspaceApp';

const vscode = acquireVsCodeApi();
window.vscodeApi = vscode;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceApp />
  </React.StrictMode>
);

declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};
