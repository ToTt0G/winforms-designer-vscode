import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import Module from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import type * as vscodeTypes from 'vscode';
import type { DesignDocument } from '../../src/shared/model';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../src/shared/protocol';

// ---------------------------------------------------------------------------
// Lightweight Mock `vscode` Module
// ---------------------------------------------------------------------------

class MockUri {
  public readonly scheme: string;
  public readonly fsPath: string;
  public readonly path: string;

  constructor(scheme: string, fsPath: string) {
    this.scheme = scheme;
    this.fsPath = fsPath;
    this.path = fsPath.replace(/\\/g, '/');
  }

  public toString(): string {
    return `${this.scheme}://${this.path}`;
  }

  public static file(fsPath: string): MockUri {
    return new MockUri('file', path.resolve(fsPath));
  }

  public static parse(raw: string): MockUri {
    const idx = raw.indexOf('://');
    if (idx !== -1) {
      return new MockUri(raw.slice(0, idx), raw.slice(idx + 3));
    }
    return new MockUri('untitled', raw);
  }

  public static joinPath(base: MockUri, ...segments: string[]): MockUri {
    return new MockUri(base.scheme, path.join(base.fsPath, ...segments));
  }
}

class MockPosition {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

class MockRange {
  constructor(
    public readonly start: MockPosition,
    public readonly end: MockPosition
  ) {}
}

class MockSelection {
  public readonly anchor: MockPosition;
  public readonly active: MockPosition;
  constructor(anchor: MockPosition, active: MockPosition) {
    this.anchor = anchor;
    this.active = active;
  }
}

class MockWorkspaceEdit {
  public readonly replacements: Array<{ uri: MockUri; range: MockRange; newText: string }> = [];
  public replace(uri: MockUri, range: MockRange, newText: string): void {
    this.replacements.push({ uri, range, newText });
  }
}

type Listener<T> = (e: T) => void;

class MockEventEmitter<T> {
  private listeners = new Set<Listener<T>>();
  public event = (listener: Listener<T>): { dispose: () => void } => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };
  public fire(data: T): void {
    for (const listener of [...this.listeners]) {
      listener(data);
    }
  }
  public clear(): void {
    this.listeners.clear();
  }
  public listenerCount(): number {
    return this.listeners.size;
  }
}

interface MockTextDocument {
  uri: MockUri;
  version: number;
  lineCount: number;
  getText(): string;
  setText(next: string): void;
  positionAt(offset: number): MockPosition;
}

function createMockTextDocument(uri: MockUri, initialText: string): MockTextDocument {
  let text = initialText;
  const doc: MockTextDocument = {
    uri,
    version: 1,
    get lineCount() {
      return text.split(/\r?\n/).length;
    },
    getText() {
      return text;
    },
    setText(next: string) {
      text = next;
      doc.version += 1;
    },
    positionAt(offset: number) {
      const clamped = Math.max(0, Math.min(offset, text.length));
      const before = text.slice(0, clamped);
      const lines = before.split('\n');
      return new MockPosition(lines.length - 1, lines[lines.length - 1].length);
    },
  };
  return doc;
}

interface MockTextEditor {
  document: MockTextDocument;
  selection: MockSelection;
  revealedRanges: Array<{ range: MockRange; revealType?: number }>;
  revealRange(range: MockRange, revealType?: number): void;
}

function createMockTextEditor(document: MockTextDocument): MockTextEditor {
  const editor: MockTextEditor = {
    document,
    selection: new MockSelection(new MockPosition(0, 0), new MockPosition(0, 0)),
    revealedRanges: [],
    revealRange(range: MockRange, revealType?: number) {
      editor.revealedRanges.push({ range, revealType });
    },
  };
  return editor;
}

interface MockState {
  configValues: Record<string, unknown>;
  workspaceConfigValues: Record<string, unknown>;
  configUpdates: Array<{ key: string; value: unknown; target: number }>;
  registeredCommands: Map<string, (...args: unknown[]) => unknown>;
  registeredEditors: Map<string, { provider: unknown; options: unknown }>;
  executedCommands: Array<{ command: string; args: unknown[] }>;
  infoMessages: string[];
  warningMessages: string[];
  errorMessages: string[];
  nextInfoChoice?: string;
  nextInputBoxValue?: string;
  lastInputBoxOptions?: vscodeTypes.InputBoxOptions;
  nextQuickPickIndex?: number;
  lastQuickPickItems?: Array<{ label: string; description?: string; template?: string }>;
  applyEditDelayMs?: number;
  applyEditShouldFail?: boolean;
  lastConfigResource?: MockUri;
  nextOpenDialogResult?: MockUri[];
  activeTextEditor?: MockTextEditor;
  openedEditors: Array<{ editor: MockTextEditor; options?: unknown }>;
  textDocuments: MockTextDocument[];
  workspaceFolders: Array<{ uri: MockUri }>;
  activeColorTheme: { kind: number };
  appliedEdits: MockWorkspaceEdit[];
  textChangeEmitter: MockEventEmitter<{
    document: MockTextDocument;
    contentChanges: Array<{ text: string }>;
    reason?: number;
  }>;
  configChangeEmitter: MockEventEmitter<{ affectsConfiguration(section: string): boolean }>;
  themeChangeEmitter: MockEventEmitter<{ kind: number }>;
}

const mockState: MockState = {
  configValues: {},
  workspaceConfigValues: {},
  configUpdates: [],
  registeredCommands: new Map(),
  registeredEditors: new Map(),
  executedCommands: [],
  infoMessages: [],
  warningMessages: [],
  errorMessages: [],
  openedEditors: [],
  textDocuments: [],
  workspaceFolders: [],
  activeColorTheme: { kind: 2 }, // Dark
  appliedEdits: [],
  textChangeEmitter: new MockEventEmitter(),
  configChangeEmitter: new MockEventEmitter(),
  themeChangeEmitter: new MockEventEmitter(),
};

function resetMockState(): void {
  mockState.configValues = {};
  mockState.workspaceConfigValues = {};
  mockState.configUpdates = [];
  mockState.registeredCommands.clear();
  mockState.registeredEditors.clear();
  mockState.executedCommands = [];
  mockState.infoMessages = [];
  mockState.warningMessages = [];
  mockState.errorMessages = [];
  mockState.nextInfoChoice = undefined;
  mockState.nextInputBoxValue = undefined;
  mockState.lastInputBoxOptions = undefined;
  mockState.nextQuickPickIndex = undefined;
  mockState.lastQuickPickItems = undefined;
  mockState.applyEditDelayMs = undefined;
  mockState.applyEditShouldFail = undefined;
  mockState.lastConfigResource = undefined;
  mockState.nextOpenDialogResult = undefined;
  mockState.activeTextEditor = undefined;
  mockState.openedEditors = [];
  mockState.textDocuments = [];
  mockState.workspaceFolders = [];
  mockState.activeColorTheme = { kind: 2 };
  mockState.appliedEdits = [];
  mockState.textChangeEmitter.clear();
  mockState.configChangeEmitter.clear();
  mockState.themeChangeEmitter.clear();
}

const mockVscode = {
  Uri: MockUri,
  Position: MockPosition,
  Range: MockRange,
  Selection: MockSelection,
  WorkspaceEdit: MockWorkspaceEdit,
  ViewColumn: {
    Active: -1,
    Beside: -2,
    One: 1,
    Two: 2,
  },
  TextEditorRevealType: {
    Default: 0,
    InCenter: 1,
    InCenterIfOutsideViewport: 2,
    AtTop: 3,
  },
  TextDocumentChangeReason: {
    Undo: 1,
    Redo: 2,
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  ColorThemeKind: {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
    HighContrastLight: 4,
  },
  workspace: {
    get textDocuments() {
      return mockState.textDocuments;
    },
    get workspaceFolders() {
      return mockState.workspaceFolders;
    },
    getWorkspaceFolder(uri: MockUri) {
      return mockState.workspaceFolders.find((folder) =>
        uri.fsPath.startsWith(folder.uri.fsPath)
      );
    },
    getConfiguration(section?: string, resource?: MockUri) {
      mockState.lastConfigResource = resource;
      const prefix = section ? `${section}.` : '';
      return {
        get<T>(key: string, defaultValue?: T): T {
          const fullKey = `${prefix}${key}`;
          if (fullKey in mockState.workspaceConfigValues) {
            return mockState.workspaceConfigValues[fullKey] as T;
          }
          if (fullKey in mockState.configValues) {
            return mockState.configValues[fullKey] as T;
          }
          return defaultValue as T;
        },
        inspect(key: string) {
          const fullKey = `${prefix}${key}`;
          return {
            globalValue: mockState.configValues[fullKey],
            workspaceValue: mockState.workspaceConfigValues[fullKey],
          };
        },
        async update(key: string, value: unknown, target: number) {
          const fullKey = `${prefix}${key}`;
          mockState.configUpdates.push({ key: fullKey, value, target });
          if (target === 2) {
            mockState.workspaceConfigValues[fullKey] = value;
          } else {
            mockState.configValues[fullKey] = value;
          }
        },
      };
    },
    async openTextDocument(uri: MockUri) {
      const existing = mockState.textDocuments.find(
        (d) => d.uri.fsPath === uri.fsPath
      );
      if (existing) {
        return existing;
      }
      const content = fs.existsSync(uri.fsPath) ? fs.readFileSync(uri.fsPath, 'utf8') : '';
      const doc = createMockTextDocument(uri, content);
      mockState.textDocuments.push(doc);
      return doc;
    },
    async applyEdit(edit: MockWorkspaceEdit) {
      if (mockState.applyEditDelayMs && mockState.applyEditDelayMs > 0) {
        await new Promise((r) => setTimeout(r, mockState.applyEditDelayMs));
      }
      if (mockState.applyEditShouldFail) {
        return false;
      }
      mockState.appliedEdits.push(edit);
      for (const rep of edit.replacements) {
        const doc = mockState.textDocuments.find(
          (d) => d.uri.toString() === rep.uri.toString()
        );
        if (doc) {
          doc.setText(rep.newText);
          mockState.textChangeEmitter.fire({
            document: doc,
            contentChanges: [{ text: rep.newText }],
          });
        }
      }
      return true;
    },
    onDidChangeTextDocument: mockState.textChangeEmitter.event,
    onDidChangeConfiguration: mockState.configChangeEmitter.event,
  },
  window: {
    get activeTextEditor() {
      return mockState.activeTextEditor;
    },
    get activeColorTheme() {
      return mockState.activeColorTheme;
    },
    registerCustomEditorProvider(viewType: string, provider: unknown, options: unknown) {
      mockState.registeredEditors.set(viewType, { provider, options });
      return { dispose: () => mockState.registeredEditors.delete(viewType) };
    },
    async showInformationMessage(message: string, ..._items: string[]) {
      mockState.infoMessages.push(message);
      return mockState.nextInfoChoice;
    },
    async showWarningMessage(message: string) {
      mockState.warningMessages.push(message);
      return undefined;
    },
    async showErrorMessage(message: string) {
      mockState.errorMessages.push(message);
      return undefined;
    },
    async showInputBox(options: vscodeTypes.InputBoxOptions) {
      mockState.lastInputBoxOptions = options;
      return mockState.nextInputBoxValue;
    },
    async showQuickPick(items: Array<{ label: string; description?: string; template?: string }>) {
      mockState.lastQuickPickItems = items;
      if (mockState.nextQuickPickIndex !== undefined) {
        return items[mockState.nextQuickPickIndex];
      }
      return undefined;
    },
    async showOpenDialog(_options: unknown) {
      return mockState.nextOpenDialogResult;
    },
    async showTextDocument(doc: MockTextDocument, options?: unknown) {
      const editor = createMockTextEditor(doc);
      mockState.activeTextEditor = editor;
      mockState.openedEditors.push({ editor, options });
      return editor;
    },
    onDidChangeActiveColorTheme: mockState.themeChangeEmitter.event,
  },
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown) {
      mockState.registeredCommands.set(command, callback);
      return { dispose: () => mockState.registeredCommands.delete(command) };
    },
    async executeCommand(command: string, ...args: unknown[]) {
      mockState.executedCommands.push({ command, args });
      return undefined;
    },
  },
  env: {
    openedExternals: [] as string[],
    async openExternal(uri: MockUri) {
      mockVscode.env.openedExternals.push(uri.toString());
      return true;
    },
  },
};

// Hook Node's Module._load BEFORE requiring any module that imports 'vscode'
const moduleInternal = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalModuleLoad = moduleInternal._load;
moduleInternal._load = function patchedLoad(
  request: string,
  parent: unknown,
  isMain: boolean
): unknown {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

// Require extension modules after mock hook is active
// eslint-disable-next-line @typescript-eslint/no-require-imports
const configMod = require('../../src/extension/config') as typeof import('../../src/extension/config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const customEditorMod = require('../../src/extension/customEditor') as typeof import('../../src/extension/customEditor');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const extensionMod = require('../../src/extension/extension') as typeof import('../../src/extension/extension');

after(() => {
  moduleInternal._load = originalModuleLoad;
});

function createMockContext(extensionDir: string): vscodeTypes.ExtensionContext {
  return {
    extensionUri: MockUri.file(extensionDir) as unknown as vscodeTypes.Uri,
    subscriptions: [],
  } as unknown as vscodeTypes.ExtensionContext;
}

function createSampleDesignDoc(className = 'Form1'): DesignDocument {
  return {
    namespaceName: 'TestApp',
    fileScopedNamespace: true,
    className,
    baseType: 'Form',
    form: {
      id: 'form-root',
      name: className,
      type: 'Form',
      properties: { Text: className },
      events: {},
      children: [],
    },
    components: [],
    resources: {},
    parseDiagnostics: [],
    metadata: {
      eol: '\n',
      indent: '    ',
      useThisQualifier: true,
      useShorthandEvents: true,
      usesComponentResourceManager: false,
      usesContainerComponents: false,
      hasSuspendResumeLayout: true,
      originalSource: '',
      existingFieldDeclarations: {},
      unhandledTopLevelStatements: [],
      usingDirectives: [],
    },
  };
}

function createMockWebviewPanel() {
  const receiveMessageEmitter = new MockEventEmitter<WebviewToHostMessage>();
  const viewStateEmitter = new MockEventEmitter<{ webviewPanel: unknown }>();
  const disposeEmitter = new MockEventEmitter<void>();
  const postedMessages: HostToWebviewMessage[] = [];

  const panel = {
    active: true,
    visible: true,
    webview: {
      cspSource: 'vscode-webview://mock-origin',
      options: {} as Record<string, unknown>,
      html: '',
      asWebviewUri(uri: MockUri) {
        return new MockUri('vscode-webview-resource', uri.fsPath);
      },
      async postMessage(msg: HostToWebviewMessage) {
        postedMessages.push(msg);
        return true;
      },
      onDidReceiveMessage: receiveMessageEmitter.event,
    },
    onDidChangeViewState: viewStateEmitter.event,
    onDidDispose: disposeEmitter.event,
    // Test helpers
    _postedMessages: postedMessages,
    _sendFromWebview(msg: WebviewToHostMessage) {
      receiveMessageEmitter.fire(msg);
    },
    _setActive(active: boolean) {
      panel.active = active;
      viewStateEmitter.fire({ webviewPanel: panel });
    },
    _dispose() {
      disposeEmitter.fire();
    },
  };

  return panel;
}

describe('extension host', () => {
  let tempDir: string;

  beforeEach(() => {
    resetMockState();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winforms-ext-test-'));
    mockState.workspaceFolders = [{ uri: MockUri.file(tempDir) }];
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('config.ts', () => {
    it('returns exact default DesignerSettings matching package.json', () => {
      const settings = configMod.getDesignerSettings();
      assert.deepEqual(settings, {
        gridSize: 8,
        layoutMode: 'snaplines',
        showGrid: true,
        renderStyle: 'fluent',
        useThisQualifier: 'auto',
        eventHandlerStyle: 'auto',
      });
    });

    it('reads configured settings and maps codeStyle keys properly', () => {
      mockState.configValues = {
        'winformsDesigner.gridSize': 12,
        'winformsDesigner.layoutMode': 'grid',
        'winformsDesigner.showGrid': false,
        'winformsDesigner.renderStyle': 'classic',
        'winformsDesigner.codeStyle.useThisQualifier': 'always',
        'winformsDesigner.codeStyle.eventHandlerStyle': 'explicitDelegate',
      };

      const settings = configMod.getDesignerSettings();
      assert.deepEqual(settings, {
        gridSize: 12,
        layoutMode: 'grid',
        showGrid: false,
        renderStyle: 'classic',
        useThisQualifier: 'always',
        eventHandlerStyle: 'explicitDelegate',
      });
    });

    it('persists updates to exact VS Code configuration paths', async () => {
      await configMod.updateDesignerSetting('gridSize', 16);
      await configMod.updateDesignerSetting('useThisQualifier', 'never');
      await configMod.updateDesignerSetting('eventHandlerStyle', 'shorthand');

      assert.deepEqual(
        mockState.configUpdates.map((u) => [u.key, u.value]),
        [
          ['winformsDesigner.gridSize', 16],
          ['winformsDesigner.codeStyle.useThisQualifier', 'never'],
          ['winformsDesigner.codeStyle.eventHandlerStyle', 'shorthand'],
        ]
      );
    });

    it('maps VS Code ColorThemeKind to ThemeKind', () => {
      assert.equal(configMod.getThemeKind({ kind: 2 } as vscodeTypes.ColorTheme), 'dark');
      assert.equal(configMod.getThemeKind({ kind: 1 } as vscodeTypes.ColorTheme), 'light');
      assert.equal(
        configMod.getThemeKind({ kind: 3 } as vscodeTypes.ColorTheme),
        'high-contrast'
      );
      assert.equal(
        configMod.getThemeKind({ kind: 4 } as vscodeTypes.ColorTheme),
        'high-contrast'
      );
    });

    it('strictly validates gridSize (falling back to 8 for 0.2 or unsupported numbers) and forwards resource URI', async () => {
      const docUri = MockUri.file(path.join(tempDir, 'Form1.Designer.cs'));
      mockState.configValues = {
        'winformsDesigner.gridSize': 0.2,
      };
      const settings = configMod.getDesignerSettings(docUri as unknown as vscodeTypes.Uri);
      assert.equal(settings.gridSize, 8);
      assert.equal(mockState.lastConfigResource?.fsPath, docUri.fsPath);

      mockState.configValues = { 'winformsDesigner.gridSize': 5 };
      assert.equal(configMod.getDesignerSettings().gridSize, 8);

      mockState.configUpdates = [];
      await configMod.updateDesignerSetting('gridSize', 0.2, docUri as unknown as vscodeTypes.Uri);
      assert.equal(mockState.configUpdates.length, 0, 'Invalid gridSize must not be persisted');

      await configMod.updateDesignerSetting('gridSize', 12, docUri as unknown as vscodeTypes.Uri);
      assert.equal(mockState.configUpdates.length, 1);
      assert.equal(mockState.configUpdates[0].value, 12);
      assert.equal(mockState.lastConfigResource?.fsPath, docUri.fsPath);
    });
  });

  describe('commands & activation', () => {
    it('registers custom editor provider and all 5 WinForms commands', () => {
      const ctx = createMockContext(tempDir);
      extensionMod.activateWithDeps(ctx);

      assert.ok(mockState.registeredEditors.has('winformsDesigner.editor'));
      assert.deepEqual(
        (mockState.registeredEditors.get('winformsDesigner.editor')?.options as Record<string, unknown>),
        { webviewOptions: { retainContextWhenHidden: true } }
      );

      for (const cmd of [
        'winforms.openDesigner',
        'winforms.viewCode',
        'winforms.viewDesignerCode',
        'winforms.newForm',
        'winforms.newUserControl',
      ]) {
        assert.ok(mockState.registeredCommands.has(cmd), `Expected command ${cmd} to be registered`);
      }
    });

    it('openDesigner routes Form.cs -> Form.Designer.cs and Designer.cs directly', async () => {
      const ctx = createMockContext(tempDir);
      extensionMod.activateWithDeps(ctx);

      const formCs = path.join(tempDir, 'Form1.cs');
      const designerCs = path.join(tempDir, 'Form1.Designer.cs');
      fs.writeFileSync(formCs, 'public partial class Form1 : Form {}', 'utf8');
      fs.writeFileSync(designerCs, 'partial class Form1 {}', 'utf8');

      const openCmd = mockState.registeredCommands.get('winforms.openDesigner')!;
      await openCmd(MockUri.file(formCs));

      assert.equal(mockState.executedCommands.length, 1);
      assert.equal(mockState.executedCommands[0].command, 'vscode.openWith');
      assert.equal((mockState.executedCommands[0].args[0] as MockUri).fsPath, designerCs);
      assert.equal(mockState.executedCommands[0].args[1], 'winformsDesigner.editor');

      // Now invoke directly on Form1.Designer.cs
      mockState.executedCommands = [];
      await openCmd(MockUri.file(designerCs));
      assert.equal(mockState.executedCommands.length, 1);
      assert.equal((mockState.executedCommands[0].args[0] as MockUri).fsPath, designerCs);
    });

    it('openDesigner rejects non-file URIs and non-.cs files', async () => {
      const ctx = createMockContext(tempDir);
      extensionMod.activateWithDeps(ctx);
      const openCmd = mockState.registeredCommands.get('winforms.openDesigner')!;

      await openCmd(MockUri.parse('untitled:Form1.cs'));
      assert.equal(mockState.executedCommands.length, 0);
      assert.match(mockState.warningMessages[0] ?? '', /local files/i);

      const txtPath = path.join(tempDir, 'notes.txt');
      fs.writeFileSync(txtPath, 'hello', 'utf8');
      await openCmd(MockUri.file(txtPath));
      assert.equal(mockState.executedCommands.length, 0);
      assert.match(mockState.warningMessages[1] ?? '', /\.cs/i);
    });

    it('openDesigner offers to scaffold missing .Designer.cs for Form class and rejects non-Form .cs', async () => {
      const scaffoldCalls: unknown[] = [];
      const ctx = createMockContext(tempDir);
      extensionMod.activateWithDeps(ctx, {
        parseCodeBehind: (source) => {
          if (source.includes(': Form')) {
            return {
              className: 'InvoiceForm',
              baseType: 'Form',
              namespaceName: 'BillingApp',
              fileScopedNamespace: true,
              methods: [],
            };
          }
          return {
            className: 'Program',
            baseType: 'object',
            namespaceName: 'BillingApp',
            fileScopedNamespace: true,
            methods: [],
          };
        },
        scaffoldFormFiles: (opts) => {
          scaffoldCalls.push(opts);
          return {
            codeBehind: `// code-behind for ${opts.className}`,
            designer: `namespace ${opts.namespaceName};\npartial class ${opts.className} { }`,
          };
        },
      });

      const openCmd = mockState.registeredCommands.get('winforms.openDesigner')!;

      // Case 1: non-Form C# file
      const programPath = path.join(tempDir, 'Program.cs');
      fs.writeFileSync(programPath, 'static class Program { static void Main() {} }', 'utf8');
      await openCmd(MockUri.file(programPath));
      assert.equal(mockState.executedCommands.length, 0);
      assert.match(mockState.warningMessages[0] ?? '', /No companion \.Designer\.cs/i);

      // Case 2: Form class missing Designer file -> user clicks "Create Designer File"
      const invoiceCs = path.join(tempDir, 'InvoiceForm.cs');
      fs.writeFileSync(invoiceCs, 'namespace BillingApp;\npublic partial class InvoiceForm : Form {}', 'utf8');
      mockState.nextInfoChoice = 'Create Designer File';

      await openCmd(MockUri.file(invoiceCs));
      const expectedDesigner = path.join(tempDir, 'InvoiceForm.Designer.cs');
      assert.equal(fs.existsSync(expectedDesigner), true);
      assert.equal(scaffoldCalls.length, 1);
      assert.equal(mockState.executedCommands.length, 1);
      assert.equal((mockState.executedCommands[0].args[0] as MockUri).fsPath, expectedDesigner);
    });

    it('viewCode and viewDesignerCode use active designer session URI', async () => {
      const ctx = createMockContext(tempDir);
      const provider = extensionMod.activateWithDeps(ctx, {
        parseDesignerCs: () => createSampleDesignDoc('DashboardForm'),
        parseCodeBehind: () => ({
          className: 'DashboardForm',
          baseType: 'Form',
          namespaceName: 'TestApp',
          fileScopedNamespace: true,
          methods: [],
        }),
      });

      const formCs = path.join(tempDir, 'DashboardForm.cs');
      const designerCs = path.join(tempDir, 'DashboardForm.Designer.cs');
      fs.writeFileSync(formCs, 'public partial class DashboardForm : Form {}', 'utf8');
      fs.writeFileSync(designerCs, 'partial class DashboardForm {}', 'utf8');

      const doc = createMockTextDocument(MockUri.file(designerCs), 'partial class DashboardForm {}');
      mockState.textDocuments.push(doc);
      const panel = createMockWebviewPanel();

      await provider.resolveCustomTextEditor(
        doc as unknown as vscodeTypes.TextDocument,
        panel as unknown as vscodeTypes.WebviewPanel,
        {} as vscodeTypes.CancellationToken
      );

      // No active text editor is open, only the custom editor panel!
      mockState.activeTextEditor = undefined;

      await mockState.registeredCommands.get('winforms.viewCode')!();
      assert.equal(mockState.openedEditors.length, 1);
      assert.equal(mockState.openedEditors[0].editor.document.uri.fsPath, formCs);

      await mockState.registeredCommands.get('winforms.viewDesignerCode')!();
      assert.equal(mockState.executedCommands.length, 1);
      assert.equal(mockState.executedCommands[0].command, 'vscode.openWith');
      assert.equal((mockState.executedCommands[0].args[0] as MockUri).fsPath, designerCs);
      assert.equal(mockState.executedCommands[0].args[1], 'default');
      assert.deepEqual(mockState.executedCommands[0].args[2], {
        viewColumn: mockVscode.ViewColumn.Beside,
        preserveFocus: false,
      });
    });

    it('newForm and newUserControl scaffold files using .csproj context and refuse to overwrite', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'ShopApp.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0-windows</TargetFramework>
    <RootNamespace>Shop.UI</RootNamespace>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>`,
        'utf8'
      );

      const scaffoldedRequests: unknown[] = [];
      const ctx = createMockContext(tempDir);
      extensionMod.activateWithDeps(ctx, {
        scaffoldFormFiles: (opts) => {
          scaffoldedRequests.push(opts);
          return {
            codeBehind: `namespace ${opts.namespaceName};\npublic partial class ${opts.className} : ${opts.baseType} {}`,
            designer: `namespace ${opts.namespaceName};\npartial class ${opts.className} {}`,
          };
        },
      });

      const subDir = path.join(tempDir, 'Dialogs');
      fs.mkdirSync(subDir);

      // Create new Form
      mockState.nextInputBoxValue = 'CheckoutDialog';
      await mockState.registeredCommands.get('winforms.newForm')!(MockUri.file(subDir));

      assert.equal(mockState.lastInputBoxOptions?.value, 'Form2');
      assert.equal(fs.existsSync(path.join(subDir, 'CheckoutDialog.cs')), true);
      assert.equal(fs.existsSync(path.join(subDir, 'CheckoutDialog.Designer.cs')), true);
      assert.deepEqual(scaffoldedRequests[0], {
        className: 'CheckoutDialog',
        namespaceName: 'Shop.UI.Dialogs',
        baseType: 'Form',
        fileScopedNamespace: true,
        nullable: true,
      });
      assert.equal(mockState.executedCommands[0].command, 'vscode.openWith');
      assert.equal(
        (mockState.executedCommands[0].args[0] as MockUri).fsPath,
        path.join(subDir, 'CheckoutDialog.Designer.cs')
      );

      // Attempting to overwrite existing CheckoutDialog should be rejected
      mockState.nextInputBoxValue = 'CheckoutDialog';
      mockState.executedCommands = [];
      await mockState.registeredCommands.get('winforms.newForm')!(MockUri.file(subDir));
      assert.equal(mockState.executedCommands.length, 0);
      assert.match(mockState.errorMessages[0] ?? '', /overwrite/i);

      // Create new UserControl
      mockState.nextInputBoxValue = 'OrderSummaryCard';
      await mockState.registeredCommands.get('winforms.newUserControl')!(MockUri.file(subDir));
      assert.equal(mockState.lastInputBoxOptions?.value, 'UserControl1');
      assert.equal(fs.existsSync(path.join(subDir, 'OrderSummaryCard.cs')), true);
      assert.equal(fs.existsSync(path.join(subDir, 'OrderSummaryCard.Designer.cs')), true);
      assert.equal(
        (scaffoldedRequests[1] as { baseType: string }).baseType,
        'UserControl'
      );
    });
  });

  describe('WinFormsCustomEditorProvider', () => {
    it('builds strict CSP HTML with 32-char cryptographic nonce and root container', () => {
      const panel = createMockWebviewPanel();
      const nonce = customEditorMod.generateNonce();
      assert.equal(nonce.length, 32);
      assert.match(nonce, /^[0-9a-f]{32}$/);

      const html = customEditorMod.buildWebviewHtml(
        panel.webview as unknown as vscodeTypes.Webview,
        MockUri.file(tempDir) as unknown as vscodeTypes.Uri,
        nonce
      );

      assert.ok(html.includes(`default-src 'none'`));
      assert.ok(html.includes(`script-src 'nonce-${nonce}'`));
      assert.ok(html.includes(`img-src vscode-webview://mock-origin data: blob:`));
      assert.ok(!html.includes('unsafe-eval'));
      assert.ok(html.includes('<div id="root"></div>'));
      assert.ok(html.includes(`nonce="${nonce}"`));
      assert.ok(html.includes('webview.js'));
      assert.ok(html.includes('webview.css'));
    });

    it('resolves fileRef and base64 resources into data URIs', () => {
      const resourcesDir = path.join(tempDir, 'Resources');
      fs.mkdirSync(resourcesDir, { recursive: true });
      // Minimal 8-byte PNG header
      const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      fs.writeFileSync(path.join(resourcesDir, 'logo.png'), pngBytes);

      const dataUris = customEditorMod.resolveResourceDataUris(
        {
          'pictureBox1.Image': {
            name: 'pictureBox1.Image',
            kind: 'fileRef',
            value: 'Resources\\logo.png;System.Drawing.Bitmap',
            filePath: 'Resources\\logo.png',
          },
          'button1.Image': {
            name: 'button1.Image',
            kind: 'base64',
            value: pngBytes.toString('base64'),
          },
        },
        tempDir
      );

      assert.equal(
        dataUris['pictureBox1.Image'],
        `data:image/png;base64,${pngBytes.toString('base64')}`
      );
      assert.equal(
        dataUris['button1.Image'],
        `data:image/png;base64,${pngBytes.toString('base64')}`
      );
    });

    it('handles ready, applyDocument (without self-edit echo), navigateToEvent, pickImage, clearImage, settings & theme changes', async () => {
      const formCs = path.join(tempDir, 'Form1.cs');
      const designerCs = path.join(tempDir, 'Form1.Designer.cs');
      const resxPath = path.join(tempDir, 'Form1.resx');
      fs.writeFileSync(
        path.join(tempDir, 'Demo.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0-windows</TargetFramework><Nullable>enable</Nullable></PropertyGroup></Project>`,
        'utf8'
      );
      fs.writeFileSync(
        formCs,
        'namespace Demo;\npublic partial class Form1 : Form\n{\n}\n',
        'utf8'
      );
      fs.writeFileSync(designerCs, '// initial designer', 'utf8');

      const docModel = createSampleDesignDoc('Form1');
      let generatedCount = 0;
      const removedResources: string[] = [];

      const provider = new customEditorMod.WinFormsCustomEditorProvider(
        createMockContext(tempDir),
        {
          parseDesignerCs: () => docModel,
          generateDesignerCs: (_doc, opts) => {
            generatedCount += 1;
            return `// generated #${generatedCount} (${opts?.useThisQualifier})`;
          },
          parseCodeBehind: (src) => ({
            className: 'Form1',
            baseType: 'Form',
            namespaceName: 'Demo',
            fileScopedNamespace: true,
            methods: src.includes('button1_Click')
              ? [
                  {
                    name: 'button1_Click',
                    line: 3,
                    column: 4,
                    parameters: 'object? sender, EventArgs e',
                    isEventHandlerLike: true,
                  },
                ]
              : [],
          }),
          ensureEventHandlerInCodeBehind: (src, req) => {
            assert.equal(req.nullable, true);
            const updated = `${src}\n    private void ${req.methodName}(object? sender, EventArgs e)\n    {\n        \n    }\n`;
            return {
              updatedSource: updated,
              line: 5,
              column: 8,
              created: true,
            };
          },
          updateResxResource: (_xml, entry) =>
            `<root><data name="${entry.name}"><value>${entry.value}</value></data></root>`,
          removeResxResource: (xml, name) => {
            removedResources.push(name);
            return xml.replace(name, 'REMOVED');
          },
        }
      );

      const textDoc = createMockTextDocument(MockUri.file(designerCs), '// initial designer');
      mockState.textDocuments.push(textDoc);
      const panel = createMockWebviewPanel();

      await provider.resolveCustomTextEditor(
        textDoc as unknown as vscodeTypes.TextDocument,
        panel as unknown as vscodeTypes.WebviewPanel,
        {} as vscodeTypes.CancellationToken
      );

      // 1. ready -> init
      panel._sendFromWebview({ type: 'ready' });
      await new Promise((r) => setTimeout(r, 10));
      const initMsg = panel._postedMessages.find((m) => m.type === 'init');
      assert.ok(initMsg && initMsg.type === 'init');
      assert.equal(initMsg.fileName, 'Form1.Designer.cs');
      assert.equal(initMsg.codeBehindFileName, 'Form1.cs');
      assert.equal(initMsg.hasCodeBehind, true);
      assert.equal(initMsg.themeKind, 'dark');

      // 2. applyDocument -> edits doc, does NOT echo documentUpdated back
      panel._postedMessages.length = 0;
      panel._sendFromWebview({ type: 'applyDocument', document: docModel });
      await new Promise((r) => setTimeout(r, 250));
      assert.equal(textDoc.getText(), '// generated #1 (auto)');
      assert.equal(
        panel._postedMessages.filter((m) => m.type === 'documentUpdated').length,
        0,
        'Self-edit must not echo back documentUpdated'
      );

      // 3. External edit -> triggers debounced documentUpdated
      textDoc.setText('// edited externally by user');
      mockState.textChangeEmitter.fire({
        document: textDoc,
        contentChanges: [{ text: '// edited externally by user' }],
      });
      await new Promise((r) => setTimeout(r, 260));
      const extMsg = panel._postedMessages.find((m) => m.type === 'documentUpdated');
      assert.ok(extMsg && extMsg.type === 'documentUpdated');
      assert.equal(extMsg.source, 'external');

      // 4. navigateToEvent -> patches Form1.cs, reveals 0-based cursor at (4, 7) for 1-based (5, 8), posts eventHandlerReady
      panel._postedMessages.length = 0;
      panel._sendFromWebview({
        type: 'navigateToEvent',
        nodeId: 'btn1',
        controlName: 'button1',
        controlType: 'Button',
        eventName: 'Click',
        methodName: 'button1_Click',
        createIfMissing: true,
      });
      await new Promise((r) => setTimeout(r, 20));
      const latestEditor = mockState.openedEditors[mockState.openedEditors.length - 1]?.editor;
      assert.ok(latestEditor);
      assert.equal(latestEditor.document.uri.fsPath, formCs);
      assert.equal(latestEditor.selection.active.line, 4);
      assert.equal(latestEditor.selection.active.character, 7);
      assert.equal(latestEditor.revealedRanges.length, 1);

      const readyEvt = panel._postedMessages.find((m) => m.type === 'eventHandlerReady');
      assert.ok(readyEvt && readyEvt.type === 'eventHandlerReady');
      assert.equal(readyEvt.methodName, 'button1_Click');
      assert.equal(readyEvt.codeBehindHandlers.length, 1);

      // 5. pickImage -> copies outside image into Resources/, writes Form1.resx, returns imagePicked
      const externalImgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winforms-img-src-'));
      try {
        const externalImg = path.join(externalImgDir, 'banner.png');
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        fs.writeFileSync(externalImg, pngBytes);
        mockState.nextOpenDialogResult = [MockUri.file(externalImg)];

        panel._postedMessages.length = 0;
        panel._sendFromWebview({
          type: 'pickImage',
          requestId: 'req-1',
          nodeId: 'pic1',
          controlName: 'pictureBox1',
          propertyName: 'Image',
        });
        await new Promise((r) => setTimeout(r, 20));

        const pickedMsg = panel._postedMessages.find((m) => m.type === 'imagePicked');
        assert.ok(pickedMsg && pickedMsg.type === 'imagePicked');
        assert.equal(pickedMsg.requestId, 'req-1');
        assert.equal(pickedMsg.resource?.resourceName, 'pictureBox1.Image');
        assert.equal(pickedMsg.resource?.relativePath, 'Resources/banner.png');
        assert.ok(pickedMsg.dataUri?.startsWith('data:image/png;base64,'));
        assert.equal(fs.existsSync(path.join(tempDir, 'Resources', 'banner.png')), true);
        assert.equal(fs.existsSync(resxPath), true);

        // 6. clearImage -> preserves .resx entry so Undo restores image cleanly
        panel._sendFromWebview({
          type: 'clearImage',
          nodeId: 'pic1',
          propertyName: 'Image',
          resourceName: 'pictureBox1.Image',
        });
        await new Promise((r) => setTimeout(r, 10));
        assert.deepEqual(removedResources, []);
      } finally {
        fs.rmSync(externalImgDir, { recursive: true, force: true });
      }

      // 7. showMessage & updateSetting
      panel._sendFromWebview({ type: 'showMessage', level: 'warning', message: 'Check layout' });
      panel._sendFromWebview({ type: 'updateSetting', key: 'showGrid', value: false });
      await new Promise((r) => setTimeout(r, 10));
      assert.ok(mockState.warningMessages.includes('Check layout'));
      assert.ok(
        mockState.configUpdates.some(
          (u) => u.key === 'winformsDesigner.showGrid' && u.value === false
        )
      );

      // 8. configuration & theme change notifications
      panel._postedMessages.length = 0;
      mockState.configChangeEmitter.fire({
        affectsConfiguration: (s) => s === 'winformsDesigner',
      });
      mockState.themeChangeEmitter.fire({ kind: 1 });
      assert.ok(panel._postedMessages.some((m) => m.type === 'settingsChanged'));
      const themeMsg = panel._postedMessages.find((m) => m.type === 'themeChanged');
      assert.ok(themeMsg && themeMsg.type === 'themeChanged' && themeMsg.themeKind === 'light');

      // 9. disposal cleans up listeners and active URI
      panel._dispose();
      assert.equal(provider.getActiveDesignerUri(), undefined);
      assert.equal(mockState.textChangeEmitter.listenerCount(), 0);
      assert.equal(mockState.configChangeEmitter.listenerCount(), 0);
      assert.equal(mockState.themeChangeEmitter.listenerCount(), 0);
    });

    it('positions cursor strictly inside newly generated event handler body (0-based conversion with real codeBehind)', async () => {
      const formCs = path.join(tempDir, 'LoginForm.cs');
      const designerCs = path.join(tempDir, 'LoginForm.Designer.cs');
      fs.writeFileSync(
        formCs,
        [
          'namespace Demo;',
          '',
          'public partial class LoginForm : Form',
          '{',
          '    public LoginForm()',
          '    {',
          '        InitializeComponent();',
          '    }',
          '}',
          '',
        ].join('\n'),
        'utf8'
      );
      fs.writeFileSync(designerCs, 'namespace Demo;\npartial class LoginForm {}\n', 'utf8');

      // Use real core dependencies (no mocked ensureEventHandlerInCodeBehind!)
      const provider = new customEditorMod.WinFormsCustomEditorProvider(createMockContext(tempDir));
      const textDoc = createMockTextDocument(MockUri.file(designerCs), fs.readFileSync(designerCs, 'utf8'));
      mockState.textDocuments.push(textDoc);
      const panel = createMockWebviewPanel();

      await provider.resolveCustomTextEditor(
        textDoc as unknown as vscodeTypes.TextDocument,
        panel as unknown as vscodeTypes.WebviewPanel,
        {} as vscodeTypes.CancellationToken
      );

      panel._sendFromWebview({
        type: 'navigateToEvent',
        nodeId: 'buttonSignIn',
        controlName: 'buttonSignIn',
        controlType: 'Button',
        eventName: 'Click',
        methodName: 'buttonSignIn_Click',
        createIfMissing: true,
      });
      await new Promise((r) => setTimeout(r, 30));

      const editor = mockState.openedEditors[mockState.openedEditors.length - 1]?.editor;
      assert.ok(editor);
      const lines = editor.document.getText().split('\n');
      const cursorLineText = lines[editor.selection.active.line];
      assert.equal(cursorLineText, '        ', 'Cursor must land on indented empty body line, not on closing brace');
      assert.equal(editor.selection.active.character, 8);
      assert.equal(lines[editor.selection.active.line - 1], '    {');
      assert.equal(lines[editor.selection.active.line + 1], '    }');

      panel._dispose();
    });

    it('serializes rapid sequential applyDocument calls without triggering spurious external refreshes', async () => {
      const designerCs = path.join(tempDir, 'RapidForm.Designer.cs');
      fs.writeFileSync(designerCs, '// initial', 'utf8');
      mockState.applyEditDelayMs = 15;

      const appliedSequence: string[] = [];
      const provider = new customEditorMod.WinFormsCustomEditorProvider(
        createMockContext(tempDir),
        {
          parseDesignerCs: () => createSampleDesignDoc('RapidForm'),
          generateDesignerCs: (doc) => {
            const text = `// edit: ${String(doc.form.properties.Text)}`;
            appliedSequence.push(text);
            return text;
          },
        }
      );

      const textDoc = createMockTextDocument(MockUri.file(designerCs), '// initial');
      mockState.textDocuments.push(textDoc);
      const panel = createMockWebviewPanel();

      await provider.resolveCustomTextEditor(
        textDoc as unknown as vscodeTypes.TextDocument,
        panel as unknown as vscodeTypes.WebviewPanel,
        {} as vscodeTypes.CancellationToken
      );

      // Fire 6 rapid edits synchronously (simulating arrow-key nudging / dragging)
      for (let i = 1; i <= 6; i++) {
        const nextDoc = createSampleDesignDoc('RapidForm');
        nextDoc.form.properties.Text = `Step ${i}`;
        panel._sendFromWebview({ type: 'applyDocument', document: nextDoc });
      }

      // Wait for all serialized edits + external debounce window to pass
      await new Promise((r) => setTimeout(r, 420));

      assert.equal(textDoc.getText(), '// edit: Step 6');
      assert.deepEqual(appliedSequence, [
        '// edit: Step 1',
        '// edit: Step 2',
        '// edit: Step 3',
        '// edit: Step 4',
        '// edit: Step 5',
        '// edit: Step 6',
      ]);
      assert.equal(
        panel._postedMessages.filter((m) => m.type === 'documentUpdated').length,
        0,
        'Rapid sequential self-edits must never trigger spurious external refresh'
      );

      panel._dispose();
    });

    it('resolves Properties.Resources.* fileRef and base64 images from project Properties/Resources.resx', () => {
      fs.writeFileSync(
        path.join(tempDir, 'MyApp.csproj'),
        '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0-windows</TargetFramework></PropertyGroup></Project>',
        'utf8'
      );
      const formsDir = path.join(tempDir, 'Forms');
      const propsDir = path.join(tempDir, 'Properties');
      const resDir = path.join(tempDir, 'Resources');
      fs.mkdirSync(formsDir, { recursive: true });
      fs.mkdirSync(propsDir, { recursive: true });
      fs.mkdirSync(resDir, { recursive: true });

      const logoPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
      const savePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x02]);
      fs.writeFileSync(path.join(resDir, 'Logo.png'), logoPng);

      fs.writeFileSync(
        path.join(propsDir, 'Resources.resx'),
        `<?xml version="1.0" encoding="utf-8"?>
<root>
  <data name="Logo" type="System.Resources.ResXFileRef, System.Windows.Forms">
    <value>..\\Resources\\Logo.png;System.Drawing.Bitmap, System.Drawing</value>
  </data>
  <data name="SaveIcon" mimetype="application/x-microsoft.net.object.binary.base64">
    <value>${savePng.toString('base64')}</value>
  </data>
</root>`,
        'utf8'
      );

      const designerCs = path.join(formsDir, 'MainForm.Designer.cs');
      const designerSrc = `namespace MyApp.Forms;

partial class MainForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.pictureBox1 = new System.Windows.Forms.PictureBox();
        this.buttonSave = new System.Windows.Forms.Button();
        this.SuspendLayout();
        this.pictureBox1.Image = global::MyApp.Properties.Resources.Logo;
        this.pictureBox1.Name = "pictureBox1";
        this.buttonSave.Image = Properties.Resources.SaveIcon;
        this.buttonSave.Name = "buttonSave";
        this.ClientSize = new System.Drawing.Size(400, 300);
        this.Controls.Add(this.pictureBox1);
        this.Controls.Add(this.buttonSave);
        this.ResumeLayout(false);
    }
    #endregion

    private System.Windows.Forms.PictureBox pictureBox1;
    private System.Windows.Forms.Button buttonSave;
}
`;
      fs.writeFileSync(designerCs, designerSrc, 'utf8');

      const provider = new customEditorMod.WinFormsCustomEditorProvider(createMockContext(tempDir));
      const textDoc = createMockTextDocument(MockUri.file(designerCs), designerSrc);
      const payload = provider.buildPayloadForDocument(textDoc as unknown as vscodeTypes.TextDocument);

      assert.equal(
        payload.resourceDataUris['Properties.Resources.Logo'],
        `data:image/png;base64,${logoPng.toString('base64')}`
      );
      assert.equal(
        payload.resourceDataUris['Logo'],
        `data:image/png;base64,${logoPng.toString('base64')}`
      );
      assert.equal(
        payload.resourceDataUris['Properties.Resources.SaveIcon'],
        `data:image/png;base64,${savePng.toString('base64')}`
      );
      assert.equal(
        payload.resourceDataUris['SaveIcon'],
        `data:image/png;base64,${savePng.toString('base64')}`
      );
    });

    it('newForm passes chosen QuickPick template to scaffoldFormFiles and falls back to blank when skipped', async () => {
      const scaffoldedRequests: unknown[] = [];
      const ctx = createMockContext(tempDir);
      extensionMod.activateWithDeps(ctx, {
        scaffoldFormFiles: (opts) => {
          scaffoldedRequests.push(opts);
          return {
            codeBehind: `namespace ${opts.namespaceName};\npublic partial class ${opts.className} : Form {}`,
            designer: `namespace ${opts.namespaceName};\npartial class ${opts.className} {}`,
          };
        },
      });

      // Pick 'Dialog' (index 1 in FORM_TEMPLATES)
      mockState.nextInputBoxValue = 'ConfirmDialog';
      mockState.nextQuickPickIndex = 1;
      await mockState.registeredCommands.get('winforms.newForm')!(MockUri.file(tempDir));

      assert.ok(mockState.lastQuickPickItems && mockState.lastQuickPickItems.length === 6);
      assert.equal(mockState.lastQuickPickItems![0].label, 'Blank Form');
      assert.equal((scaffoldedRequests[0] as { template?: string }).template, 'dialog');
    });

    it('rejects path traversal, absolute paths, outside symlinks, and non-image files in resolveResourceDataUris', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winforms-outside-'));
      try {
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const projectDir = path.join(tempDir, 'App');
        const resDir = path.join(projectDir, 'Resources');
        fs.mkdirSync(resDir, { recursive: true });

        // Valid image inside project
        fs.writeFileSync(path.join(resDir, 'ok.png'), pngBytes);
        // Non-image file inside project
        fs.writeFileSync(path.join(resDir, 'secret.txt'), 'TOP_SECRET=123', 'utf8');
        // Outside image + symlink inside project pointing outside
        const outsidePng = path.join(outsideDir, 'escape.png');
        fs.writeFileSync(outsidePng, pngBytes);
        const symlinkPath = path.join(resDir, 'symlink.png');
        fs.symlinkSync(outsidePng, symlinkPath);

        const relTraversal = path.relative(projectDir, outsidePng).replace(/\\/g, '/');

        const uris = customEditorMod.resolveResourceDataUris(
          {
            valid: { name: 'valid', kind: 'fileRef', value: 'Resources/ok.png;System.Drawing.Bitmap', filePath: 'Resources/ok.png' },
            traversal: { name: 'traversal', kind: 'fileRef', value: `${relTraversal};System.Drawing.Bitmap`, filePath: relTraversal },
            etcPasswdTraversal: { name: 'etcPasswdTraversal', kind: 'fileRef', value: '../../../../../../etc/passwd;System.Drawing.Bitmap', filePath: '../../../../../../etc/passwd' },
            absolutePath: { name: 'absolutePath', kind: 'fileRef', value: '/etc/passwd;System.Drawing.Bitmap', filePath: '/etc/passwd' },
            outsideSymlink: { name: 'outsideSymlink', kind: 'fileRef', value: 'Resources/symlink.png;System.Drawing.Bitmap', filePath: 'Resources/symlink.png' },
            nonImageTxt: { name: 'nonImageTxt', kind: 'fileRef', value: 'Resources/secret.txt;System.Drawing.Bitmap', filePath: 'Resources/secret.txt' },
          },
          projectDir,
          [projectDir]
        );

        assert.ok(uris.valid?.startsWith('data:image/png;base64,'));
        assert.equal(uris.traversal, undefined, 'Relative traversal outside root must be rejected');
        assert.equal(uris.etcPasswdTraversal, undefined, '../../etc/passwd must be rejected');
        assert.equal(uris.absolutePath, undefined, 'Absolute /etc/passwd must be rejected');
        assert.equal(uris.outsideSymlink, undefined, 'Symlink escaping root must be rejected');
        assert.equal(uris.nonImageTxt, undefined, 'Non-image .txt file must be rejected');
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('detects stale baseDocumentVersion conflicts, rolls back failed applyEdit, blocks read-only edits, and syncs native Undo/Redo', async () => {
      const designerCs = path.join(tempDir, 'SyncForm.Designer.cs');
      const initialSrc = `namespace SyncApp;

partial class SyncForm
{
    #region Windows Form Designer generated code
    private void InitializeComponent()
    {
        this.SuspendLayout();
        this.ClientSize = new System.Drawing.Size(300, 200);
        this.Name = "SyncForm";
        this.Text = "Initial";
        this.ResumeLayout(false);
    }
    #endregion
}
`;
      fs.writeFileSync(designerCs, initialSrc, 'utf8');

      const provider = new customEditorMod.WinFormsCustomEditorProvider(createMockContext(tempDir));
      const textDoc = createMockTextDocument(MockUri.file(designerCs), initialSrc);
      mockState.textDocuments.push(textDoc);
      const panel = createMockWebviewPanel();

      await provider.resolveCustomTextEditor(
        textDoc as unknown as vscodeTypes.TextDocument,
        panel as unknown as vscodeTypes.WebviewPanel,
        {} as vscodeTypes.CancellationToken
      );

      // Tighten localResourceRoots check
      const roots = (panel.webview.options as { localResourceRoots?: MockUri[] }).localResourceRoots ?? [];
      assert.equal(roots.length, 1);
      assert.ok(roots[0].fsPath.endsWith(`${path.sep}dist`));

      // 1. ready -> init includes documentVersion
      panel._sendFromWebview({ type: 'ready' });
      await new Promise((r) => setTimeout(r, 10));
      const initMsg = panel._postedMessages.find((m) => m.type === 'init');
      assert.ok(initMsg && initMsg.type === 'init');
      assert.equal(initMsg.documentVersion, 1);
      const initialDoc = initMsg.document;

      // 2. Simulate external side-by-side edit bumping version to 2, then webview sends stale baseDocumentVersion=1
      const externalSrc = initialSrc.replace('this.Text = "Initial";', 'this.Text = "ExternalEdit";');
      textDoc.setText(externalSrc); // version is now 2
      panel._postedMessages.length = 0;

      const staleDoc = structuredClone(initialDoc);
      staleDoc.form.properties.Text = 'StaleWebviewEdit';
      panel._sendFromWebview({
        type: 'applyDocument',
        document: staleDoc,
        baseDocumentVersion: 1,
        revision: 42,
      });
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(textDoc.getText(), externalSrc, 'Stale edit must NOT overwrite newer side-by-side edit');
      const conflictAck = panel._postedMessages.find((m) => m.type === 'applyAck');
      assert.ok(conflictAck && conflictAck.type === 'applyAck');
      assert.equal(conflictAck.accepted, false);
      assert.equal(conflictAck.reason, 'conflict');
      assert.equal(conflictAck.revision, 42);
      assert.equal(conflictAck.documentVersion, 2);
      const conflictRefresh = panel._postedMessages.find((m) => m.type === 'documentUpdated');
      assert.ok(conflictRefresh && conflictRefresh.type === 'documentUpdated');
      assert.equal(conflictRefresh.reason, 'conflict');

      // 3. Valid edit succeeds -> applyAck accepted: true
      panel._postedMessages.length = 0;
      const freshDoc = structuredClone(conflictRefresh.document);
      freshDoc.form.properties.Text = 'SavedFromCanvas';
      panel._sendFromWebview({
        type: 'applyDocument',
        document: freshDoc,
        baseDocumentVersion: 2,
        revision: 43,
      });
      await new Promise((r) => setTimeout(r, 20));
      const okAck = panel._postedMessages.find((m) => m.type === 'applyAck');
      assert.ok(okAck && okAck.type === 'applyAck');
      assert.equal(okAck.accepted, true);
      assert.equal(okAck.documentVersion, 3);
      assert.ok(textDoc.getText().includes('this.Text = "SavedFromCanvas";'));

      // 4. Native Undo back to previous text MUST NOT be suppressed as self-edit!
      panel._postedMessages.length = 0;
      textDoc.setText(externalSrc); // version 4
      mockState.textChangeEmitter.fire({
        document: textDoc,
        contentChanges: [{ text: externalSrc }],
        reason: mockVscode.TextDocumentChangeReason.Undo,
      });
      const undoMsg = panel._postedMessages.find((m) => m.type === 'documentUpdated');
      assert.ok(undoMsg && undoMsg.type === 'documentUpdated', 'Native Undo must immediately push documentUpdated');
      assert.equal(undoMsg.reason, 'undo');
      assert.equal(undoMsg.documentVersion, 4);

      // 5. Failed workspace.applyEdit -> rejected applyAck + host rollback documentUpdated
      mockState.applyEditShouldFail = true;
      panel._postedMessages.length = 0;
      const doomedDoc = structuredClone(undoMsg.document);
      doomedDoc.form.properties.Text = 'WillFail';
      panel._sendFromWebview({
        type: 'applyDocument',
        document: doomedDoc,
        baseDocumentVersion: 4,
        revision: 44,
      });
      await new Promise((r) => setTimeout(r, 20));
      const rejAck = panel._postedMessages.find((m) => m.type === 'applyAck');
      assert.ok(rejAck && rejAck.type === 'applyAck');
      assert.equal(rejAck.accepted, false);
      assert.equal(rejAck.reason, 'rejected');
      const rollbackMsg = panel._postedMessages.find((m) => m.type === 'documentUpdated');
      assert.ok(rollbackMsg && rollbackMsg.type === 'documentUpdated');
      assert.equal(rollbackMsg.source, 'host');
      assert.equal(rollbackMsg.reason, 'rejected');

      // 6. navigateToEvent reports success: false when applyEdit fails
      const formCs = path.join(tempDir, 'SyncForm.cs');
      fs.writeFileSync(formCs, 'namespace SyncApp;\npublic partial class SyncForm : Form { }\n', 'utf8');
      panel._postedMessages.length = 0;
      panel._sendFromWebview({
        type: 'navigateToEvent',
        nodeId: 'btn1',
        controlName: 'btn1',
        controlType: 'Button',
        eventName: 'Click',
        methodName: 'btn1_Click',
        createIfMissing: true,
      });
      await new Promise((r) => setTimeout(r, 20));
      const failEvt = panel._postedMessages.find((m) => m.type === 'eventHandlerReady');
      assert.ok(failEvt && failEvt.type === 'eventHandlerReady');
      assert.equal(failEvt.success, false);
      assert.ok(failEvt.error);
      mockState.applyEditShouldFail = false;

      panel._dispose();

      // 7. Read-only document (expression-bodied InitializeComponent) rejects applyDocument cleanly
      const roPath = path.join(tempDir, 'ReadOnlyForm.Designer.cs');
      const roSrc = 'namespace RoApp;\npartial class ReadOnlyForm { private void InitializeComponent() => this.Text = "RO"; }\n';
      fs.writeFileSync(roPath, roSrc, 'utf8');
      const roTextDoc = createMockTextDocument(MockUri.file(roPath), roSrc);
      mockState.textDocuments.push(roTextDoc);
      const roPanel = createMockWebviewPanel();
      await provider.resolveCustomTextEditor(
        roTextDoc as unknown as vscodeTypes.TextDocument,
        roPanel as unknown as vscodeTypes.WebviewPanel,
        {} as vscodeTypes.CancellationToken
      );
      roPanel._sendFromWebview({ type: 'ready' });
      await new Promise((r) => setTimeout(r, 10));
      const roInit = roPanel._postedMessages.find((m) => m.type === 'init');
      assert.ok(roInit && roInit.type === 'init');
      assert.ok(roInit.document.metadata.readOnlyReason);

      roPanel._postedMessages.length = 0;
      mockState.warningMessages.length = 0;
      roPanel._sendFromWebview({
        type: 'applyDocument',
        document: roInit.document,
        baseDocumentVersion: roInit.documentVersion,
        revision: 99,
      });
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(roTextDoc.getText(), roSrc, 'Read-only buffer must never be overwritten');
      const roAck = roPanel._postedMessages.find((m) => m.type === 'applyAck');
      assert.ok(roAck && roAck.type === 'applyAck');
      assert.equal(roAck.accepted, false);
      assert.ok(roAck.reason && /block-bodied/i.test(roAck.reason));
      assert.ok(mockState.warningMessages.some((m) => /block-bodied/i.test(m)));
      roPanel._dispose();
    });

    it('openDesigner warns when Form class is not partial and preserves global namespace when creating missing Designer file', async () => {
      const ctx = createMockContext(tempDir);
      extensionMod.activateWithDeps(ctx);
      const openCmd = mockState.registeredCommands.get('winforms.openDesigner')!;

      // Non-partial Form -> warns and does NOT create Designer file
      const nonPartialCs = path.join(tempDir, 'NonPartialForm.cs');
      fs.writeFileSync(nonPartialCs, 'public class NonPartialForm : System.Windows.Forms.Form {}\n', 'utf8');
      mockState.nextInfoChoice = 'Create Designer File';
      await openCmd(MockUri.file(nonPartialCs));
      assert.equal(fs.existsSync(path.join(tempDir, 'NonPartialForm.Designer.cs')), false);
      assert.ok(mockState.warningMessages.some((m) => /partial/i.test(m)));

      // Global-namespace partial Form -> preserves empty namespace in generated Designer file
      const globalCs = path.join(tempDir, 'GlobalNsForm.cs');
      fs.writeFileSync(globalCs, 'public partial class GlobalNsForm : System.Windows.Forms.Form {}\n', 'utf8');
      mockState.nextInfoChoice = 'Create Designer File';
      await openCmd(MockUri.file(globalCs));
      const globalDesigner = path.join(tempDir, 'GlobalNsForm.Designer.cs');
      assert.equal(fs.existsSync(globalDesigner), true);
      const designerContent = fs.readFileSync(globalDesigner, 'utf8');
      assert.ok(!designerContent.includes('namespace '), 'Global namespace must be preserved as empty');
    });

    it('accepts rapid sequential applyDocument messages sharing baseDocumentVersion while rejecting stale edits after external change', async () => {
      const designerCs = path.join(tempDir, 'RapidForm.Designer.cs');
      const initialSrc = [
        'namespace RapidApp;',
        'partial class RapidForm',
        '{',
        '    #region Windows Form Designer generated code',
        '    private void InitializeComponent()',
        '    {',
        '        this.ClientSize = new System.Drawing.Size(400, 300);',
        '        this.Text = "Initial";',
        '    }',
        '    #endregion',
        '}',
        '',
      ].join('\n');
      fs.writeFileSync(designerCs, initialSrc, 'utf8');

      const doc = createMockTextDocument(MockUri.file(designerCs), initialSrc);
      mockState.textDocuments.push(doc);
      const panel = createMockWebviewPanel();
      const ctx = createMockContext(tempDir);
      const provider = new customEditorMod.WinFormsCustomEditorProvider(ctx);
      await provider.resolveCustomTextEditor(
        doc as unknown as vscodeTypes.TextDocument,
        panel as unknown as vscodeTypes.WebviewPanel,
        {} as vscodeTypes.CancellationToken
      );

      panel._sendFromWebview({ type: 'ready' });
      await new Promise((r) => setTimeout(r, 10));
      const initMsg = panel._postedMessages.find((m) => m.type === 'init');
      assert.ok(initMsg && initMsg.type === 'init');
      const baseVer = initMsg.documentVersion!;

      panel._postedMessages.length = 0;

      // Fire 3 rapid edits all carrying the SAME baseDocumentVersion before acks arrive
      for (const [idx, title] of ['Step 1', 'Step 2', 'Step 3'].entries()) {
        const nextDoc = structuredClone(initMsg.document);
        nextDoc.form.properties.Text = title;
        delete nextDoc.form.rawPropertyExpressions?.Text;
        panel._sendFromWebview({
          type: 'applyDocument',
          document: nextDoc,
          baseDocumentVersion: baseVer,
          revision: idx + 1,
        });
      }

      await new Promise((r) => setTimeout(r, 40));
      const acks = panel._postedMessages.filter((m) => m.type === 'applyAck');
      assert.equal(acks.length, 3);
      assert.ok(acks.every((a) => a.type === 'applyAck' && a.accepted === true));
      assert.match(doc.getText(), /this\.Text = "Step 3";/);

      // Now simulate an external side-by-side edit before the 200ms debounce fires
      const extText = doc.getText().replace('"Step 3"', '"External Edit"');
      doc.setText(extText);
      mockState.textChangeEmitter.fire({
        document: doc,
        contentChanges: [{ text: 'External Edit' }],
      });

      panel._postedMessages.length = 0;
      const staleDoc = structuredClone(initMsg.document);
      staleDoc.form.properties.Text = 'Stale Visual Edit';
      delete staleDoc.form.rawPropertyExpressions?.Text;
      panel._sendFromWebview({
        type: 'applyDocument',
        document: staleDoc,
        baseDocumentVersion: baseVer,
        revision: 4,
      });

      await new Promise((r) => setTimeout(r, 30));
      const conflictAck = panel._postedMessages.find((m) => m.type === 'applyAck');
      assert.ok(conflictAck && conflictAck.type === 'applyAck');
      assert.equal(conflictAck.accepted, false);
      assert.equal(conflictAck.reason, 'conflict');
      assert.match(doc.getText(), /"External Edit"/);

      panel._dispose();
    });

    it('emits showStarPrompt after sustained visual edits and opens GitHub on starPromptAction', async () => {
      mockVscode.env.openedExternals.length = 0;
      const designerCs = path.join(tempDir, 'StarForm.Designer.cs');
      const initialSrc = [
        'namespace StarApp;',
        'partial class StarForm',
        '{',
        '    private System.ComponentModel.IContainer? components = null;',
        '    #region Windows Form Designer generated code',
        '    private void InitializeComponent()',
        '    {',
        '        this.SuspendLayout();',
        '        this.ClientSize = new System.Drawing.Size(400, 300);',
        '        this.Name = "StarForm";',
        '        this.Text = "Initial";',
        '        this.ResumeLayout(false);',
        '    }',
        '    #endregion',
        '}',
        '',
      ].join('\n');
      fs.writeFileSync(designerCs, initialSrc, 'utf8');

      const memStore = new Map<string, unknown>();
      const ctx = {
        ...createMockContext(tempDir),
        globalState: {
          get: <T>(k: string) => memStore.get(k) as T | undefined,
          update: async (k: string, v: unknown) => {
            memStore.set(k, v);
          },
        },
        extension: { packageJSON: { version: '1.0.1' } },
      } as unknown as vscodeTypes.ExtensionContext;

      const doc = createMockTextDocument(MockUri.file(designerCs), initialSrc);
      mockState.textDocuments.push(doc);
      const panel = createMockWebviewPanel();
      const provider = new customEditorMod.WinFormsCustomEditorProvider(ctx);
      await provider.resolveCustomTextEditor(
        doc as unknown as vscodeTypes.TextDocument,
        panel as unknown as vscodeTypes.WebviewPanel,
        {} as vscodeTypes.CancellationToken
      );

      panel._sendFromWebview({ type: 'ready' });
      await new Promise((r) => setTimeout(r, 15));
      const initMsg = panel._postedMessages.find((m) => m.type === 'init');
      assert.ok(initMsg && initMsg.type === 'init');

      // Perform 12 real visual edits
      let latestVersion = initMsg.documentVersion!;
      for (let i = 1; i <= 12; i++) {
        const nextDoc = structuredClone(initMsg.document);
        nextDoc.form.properties.Text = `Edit ${i}`;
        delete nextDoc.form.rawPropertyExpressions?.Text;
        panel._sendFromWebview({
          type: 'applyDocument',
          document: nextDoc,
          baseDocumentVersion: latestVersion,
          revision: i,
        });
        await new Promise((r) => setTimeout(r, 10));
        const lastAck = [...panel._postedMessages].reverse().find((m) => m.type === 'applyAck');
        if (lastAck && lastAck.type === 'applyAck') {
          latestVersion = lastAck.documentVersion;
        }
      }

      await new Promise((r) => setTimeout(r, 30));
      const starPrompts = panel._postedMessages.filter((m) => m.type === 'showStarPrompt');
      assert.equal(starPrompts.length, 1, 'Should emit showStarPrompt exactly once on 12th edit');
      assert.equal(
        starPrompts[0].type === 'showStarPrompt' ? starPrompts[0].repoUrl : '',
        'https://github.com/ToTt0G/winforms-designer-vscode'
      );

      panel._sendFromWebview({ type: 'starPromptAction', action: 'star' });
      await new Promise((r) => setTimeout(r, 15));
      assert.deepEqual(mockVscode.env.openedExternals, [
        'https://github.com/ToTt0G/winforms-designer-vscode',
      ]);

      panel._dispose();
    });
  });
});
