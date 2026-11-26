// Webview entry: VS Code bridge or standalone browser harness (E2E / screenshots).

import { createRoot } from 'react-dom/client';
import type { HostToWebviewMessage, ThemeKind, WebviewToHostMessage } from '../shared/protocol';
import { App, recentLocal } from './App';
import { createDemoInitMessage } from './demoDocument';
import { DesignerStore, setStore } from './state/designerStore';
import './styles/designer.css';

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export interface StandaloneDesignerApi {
  dispatchHostMessage(msg: HostToWebviewMessage): void;
  getSentMessages(): WebviewToHostMessage[];
  clearSentMessages(): void;
  getState(): {
    document: unknown;
    selection: string[];
    zoom: number;
    tabOrderMode: boolean;
    themeKind: ThemeKind;
    renderStyle: 'fluent' | 'classic';
  };
  setTheme(theme: ThemeKind): void;
  openPreviewModal(open: boolean): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    __WINFORMS_DESIGNER__?: StandaloneDesignerApi;
  }
}

const isVsCode = typeof (window as unknown as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === 'function';
const vscode = isVsCode ? window.acquireVsCodeApi!() : null;
const sent: WebviewToHostMessage[] = [];

function post(msg: WebviewToHostMessage) {
  if (vscode) vscode.postMessage(msg);
  else {
    sent.push(JSON.parse(JSON.stringify(msg)) as WebviewToHostMessage);
    if (msg.type === 'pickImage') standalonePickImage(msg.requestId, msg.controlName, msg.propertyName);
    if (msg.type === 'navigateToEvent') {
      queueMicrotask(() =>
        dispatch({
          type: 'eventHandlerReady',
          nodeId: msg.nodeId,
          eventName: msg.eventName,
          methodName: msg.methodName,
          success: true,
          codeBehindHandlers: [
            ...store.getState().codeBehindHandlers.filter((h) => h.name !== msg.methodName),
            { name: msg.methodName, line: 40, column: 9, parameters: 'object? sender, EventArgs e', isEventHandlerLike: true },
          ],
        })
      );
    }
  }
}

const store = new DesignerStore(post, !isVsCode);
setStore(store);

function dispatch(msg: HostToWebviewMessage) {
  if (msg.type === 'command' && (msg.command === 'undo' || msg.command === 'redo') && Date.now() - recentLocal[msg.command] < 400) return;
  store.handleHostMessage(msg);
}

/** Standalone image picking: lets a browser user choose a local file. */
function standalonePickImage(requestId: string, controlName: string, propertyName: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.ico';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return dispatch({ type: 'imagePicked', requestId, cancelled: true });
    const reader = new FileReader();
    reader.onload = () =>
      dispatch({
        type: 'imagePicked',
        requestId,
        resource: { kind: 'resource', resourceName: `${controlName}.${propertyName}`, resourceType: propertyName === 'Icon' ? 'Icon' : 'Image' },
        dataUri: String(reader.result),
      });
    reader.readAsDataURL(file);
  });
  input.click();
}

let initReceived = false;
window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as HostToWebviewMessage | undefined;
  if (!msg || typeof msg !== 'object' || typeof (msg as { type?: unknown }).type !== 'string') return;
  if (msg.type === 'init') initReceived = true;
  dispatch(msg);
});

if (!isVsCode) {
  const params = new URLSearchParams(location.search);
  const initialTheme = (params.get('theme') as ThemeKind | null) ?? (matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = initialTheme;
  document.documentElement.dataset.standalone = 'true';
  window.__WINFORMS_DESIGNER__ = {
    dispatchHostMessage: (msg) => {
      if (msg.type === 'init') initReceived = true;
      dispatch(msg);
    },
    getSentMessages: () => sent.slice(),
    clearSentMessages: () => {
      sent.length = 0;
    },
    getState: () => {
      const s = store.getState();
      return {
        document: s.doc,
        selection: s.selection.slice(),
        zoom: s.zoom,
        tabOrderMode: s.tabOrderMode,
        themeKind: s.themeKind,
        renderStyle: s.settings.renderStyle,
      };
    },
    setTheme: (theme) => {
      document.documentElement.dataset.theme = theme;
      store.handleHostMessage({ type: 'themeChanged', themeKind: theme });
    },
    openPreviewModal: (open) => store.setState({ previewOpen: open }),
  };
  setTimeout(() => {
    if (!initReceived) {
      initReceived = true;
      store.handleHostMessage(createDemoInitMessage(initialTheme));
    }
  }, 100);
} else {
  vscode!.postMessage({ type: 'ready' } satisfies WebviewToHostMessage);
}

const container = document.getElementById('root') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'root' }));
createRoot(container).render(<App store={store} />);
