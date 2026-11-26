import * as assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import Module from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import type * as vscodeTypes from 'vscode';
import type {
  RunnerChildProcess,
  RunnerEnvironment,
} from '../../src/extension/projectRunner';

// ---------------------------------------------------------------------------
// Lightweight Mock `vscode` Module for projectRunner tests
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
}

class MockThemeColor {
  constructor(public readonly id: string) {}
}

class MockEventEmitter<T> {
  private listeners = new Set<(e: T) => void>();
  public event = (listener: (e: T) => void): { dispose: () => void } => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };
  public fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }
  public clear(): void {
    this.listeners.clear();
  }
}

interface MockStatusBarItem {
  alignment: number;
  priority: number;
  text: string;
  tooltip?: string;
  command?: string;
  backgroundColor?: MockThemeColor;
  visible: boolean;
  disposed: boolean;
  textHistory: string[];
  show(): void;
  hide(): void;
  dispose(): void;
}

interface MockOutputChannel {
  name: string;
  chunks: string[];
  showCalls: number;
  disposed: boolean;
  append(value: string): void;
  appendLine(value: string): void;
  show(preserveFocus?: boolean): void;
  dispose(): void;
}

class MockMemento {
  private store = new Map<string, unknown>();
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.store.has(key) ? (this.store.get(key) as T) : defaultValue;
  }
  public async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.store.delete(key);
    } else {
      this.store.set(key, value);
    }
  }
  public keys(): readonly string[] {
    return [...this.store.keys()];
  }
}

interface RunnerMockState {
  workspaceFolders: Array<{ uri: MockUri }>;
  activeTextEditor?: { document: { uri: MockUri } };
  saveAllCalls: boolean[];
  infoMessages: Array<{ message: string; buttons: string[] }>;
  warningMessages: Array<{ message: string; buttons: string[] }>;
  errorMessages: string[];
  nextInfoChoice?: string;
  nextWarningChoice?: string;
  nextQuickPickIndex?: number;
  quickPickCallCount: number;
  lastQuickPickItems?: Array<{ label: string; description?: string; detail?: string }>;
  openedExternals: string[];
  statusBarItems: MockStatusBarItem[];
  outputChannels: MockOutputChannel[];
  activeEditorEmitter: MockEventEmitter<unknown>;
  workspaceFoldersEmitter: MockEventEmitter<unknown>;
}

const mockState: RunnerMockState = {
  workspaceFolders: [],
  saveAllCalls: [],
  infoMessages: [],
  warningMessages: [],
  errorMessages: [],
  quickPickCallCount: 0,
  openedExternals: [],
  statusBarItems: [],
  outputChannels: [],
  activeEditorEmitter: new MockEventEmitter(),
  workspaceFoldersEmitter: new MockEventEmitter(),
};

function resetMockState(): void {
  mockState.workspaceFolders = [];
  mockState.activeTextEditor = undefined;
  mockState.saveAllCalls = [];
  mockState.infoMessages = [];
  mockState.warningMessages = [];
  mockState.errorMessages = [];
  mockState.nextInfoChoice = undefined;
  mockState.nextWarningChoice = undefined;
  mockState.nextQuickPickIndex = undefined;
  mockState.quickPickCallCount = 0;
  mockState.lastQuickPickItems = undefined;
  mockState.openedExternals = [];
  mockState.statusBarItems = [];
  mockState.outputChannels = [];
  mockState.activeEditorEmitter.clear();
  mockState.workspaceFoldersEmitter.clear();
}

const mockVscode = {
  Uri: MockUri,
  ThemeColor: MockThemeColor,
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  workspace: {
    get workspaceFolders() {
      return mockState.workspaceFolders;
    },
    async saveAll(includeUntitled?: boolean) {
      mockState.saveAllCalls.push(Boolean(includeUntitled));
      return true;
    },
    onDidChangeWorkspaceFolders: mockState.workspaceFoldersEmitter.event,
  },
  window: {
    get activeTextEditor() {
      return mockState.activeTextEditor;
    },
    createStatusBarItem(alignment = 1, priority = 0) {
      let currentText = '';
      const item: MockStatusBarItem = {
        alignment,
        priority,
        get text() {
          return currentText;
        },
        set text(val: string) {
          currentText = val;
          item.textHistory.push(val);
        },
        visible: false,
        disposed: false,
        textHistory: [],
        show() {
          item.visible = true;
        },
        hide() {
          item.visible = false;
        },
        dispose() {
          item.disposed = true;
        },
      };
      mockState.statusBarItems.push(item);
      return item;
    },
    createOutputChannel(name: string) {
      const channel: MockOutputChannel = {
        name,
        chunks: [],
        showCalls: 0,
        disposed: false,
        append(value: string) {
          channel.chunks.push(value);
        },
        appendLine(value: string) {
          channel.chunks.push(`${value}\n`);
        },
        show() {
          channel.showCalls += 1;
        },
        dispose() {
          channel.disposed = true;
        },
      };
      mockState.outputChannels.push(channel);
      return channel;
    },
    async showQuickPick(items: Array<{ label: string; description?: string; detail?: string }>) {
      mockState.quickPickCallCount += 1;
      mockState.lastQuickPickItems = items;
      if (mockState.nextQuickPickIndex !== undefined) {
        return items[mockState.nextQuickPickIndex];
      }
      return undefined;
    },
    async showInformationMessage(message: string, ...buttons: string[]) {
      mockState.infoMessages.push({ message, buttons });
      return mockState.nextInfoChoice;
    },
    async showWarningMessage(message: string, ...buttons: string[]) {
      mockState.warningMessages.push({ message, buttons });
      return mockState.nextWarningChoice;
    },
    async showErrorMessage(message: string) {
      mockState.errorMessages.push(message);
      return undefined;
    },
    onDidChangeActiveTextEditor: mockState.activeEditorEmitter.event,
  },
  env: {
    async openExternal(uri: MockUri) {
      mockState.openedExternals.push(uri.toString());
      return true;
    },
  },
};

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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runnerMod = require('../../src/extension/projectRunner') as typeof import('../../src/extension/projectRunner');

after(() => {
  moduleInternal._load = originalModuleLoad;
});

class FakeChildProcess extends EventEmitter implements RunnerChildProcess {
  public readonly pid: number;
  public readonly stdout = new PassThrough();
  public readonly stderr = new PassThrough();
  public killedSignals: Array<NodeJS.Signals | number | undefined> = [];

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  public kill(signal?: NodeJS.Signals | number): boolean {
    this.killedSignals.push(signal);
    return true;
  }

  public emitClose(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
    this.stdout.end();
    this.stderr.end();
    this.emit('close', code, signal);
  }
}

describe('projectRunner', () => {
  let tempDir: string;

  beforeEach(() => {
    resetMockState();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winforms-runner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('inspectCsproj & parseCsprojXml', () => {
    it('parses SDK-style net10.0-windows WinForms project with custom AssemblyName', () => {
      const csprojPath = path.join(tempDir, 'OrderApp.csproj');
      fs.writeFileSync(
        csprojPath,
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- <OutputType>Library</OutputType> -->
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0-windows</TargetFramework>
    <AssemblyName>OrderManager</AssemblyName>
    <UseWindowsForms>true</UseWindowsForms>
  </PropertyGroup>
</Project>`,
        'utf8'
      );

      const info = runnerMod.inspectCsproj(csprojPath);
      assert.equal(info.isSdkStyle, true);
      assert.equal(info.sdk, 'Microsoft.NET.Sdk');
      assert.equal(info.outputType, 'WinExe');
      assert.equal(info.targetFramework, 'net10.0-windows');
      assert.deepEqual(info.targetFrameworks, ['net10.0-windows']);
      assert.equal(info.assemblyName, 'OrderManager');
      assert.equal(info.useWindowsForms, true);
      assert.equal(info.isRunnable, true);
      assert.equal(info.isWinFormsApp, true);
    });

    it('parses SDK-style net48 and multi-targeted projects with AssemblyName fallback', () => {
      const net48Path = path.join(tempDir, 'ClassicSdkApp.csproj');
      fs.writeFileSync(
        net48Path,
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>net8.0-windows;net48</TargetFrameworks>
    <UseWindowsForms>true</UseWindowsForms>
  </PropertyGroup>
</Project>`,
        'utf8'
      );

      const info = runnerMod.inspectCsproj(net48Path);
      assert.equal(info.isSdkStyle, true);
      assert.equal(info.targetFramework, 'net8.0-windows');
      assert.deepEqual(info.targetFrameworks, ['net8.0-windows', 'net48']);
      assert.equal(info.assemblyName, 'ClassicSdkApp');
      assert.equal(info.useWindowsForms, true);
      assert.equal(info.isRunnable, true);
      assert.equal(info.isWinFormsApp, true);
    });

    it('parses legacy non-SDK ToolsVersion .NET Framework .csproj', () => {
      const legacyPath = path.join(tempDir, 'LegacyBilling.csproj');
      fs.writeFileSync(
        legacyPath,
        `<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <AssemblyName>BillingClient</AssemblyName>
    <TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="System.Windows.Forms" />
  </ItemGroup>
</Project>`,
        'utf8'
      );

      const info = runnerMod.inspectCsproj(legacyPath);
      assert.equal(info.isSdkStyle, false);
      assert.equal(info.toolsVersion, '15.0');
      assert.equal(info.outputType, 'WinExe');
      assert.equal(info.targetFramework, 'v4.7.2');
      assert.equal(info.targetFrameworkVersion, 'v4.7.2');
      assert.equal(info.assemblyName, 'BillingClient');
      assert.equal(info.referencesWinForms, true);
      assert.equal(info.isRunnable, true);
      assert.equal(info.isWinFormsApp, true);
    });

    it('marks Class Library projects as non-runnable even when UseWindowsForms is true', () => {
      const libPath = path.join(tempDir, 'SharedControls.csproj');
      fs.writeFileSync(
        libPath,
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Library</OutputType>
    <TargetFramework>net9.0-windows</TargetFramework>
    <UseWindowsForms>true</UseWindowsForms>
  </PropertyGroup>
</Project>`,
        'utf8'
      );

      const info = runnerMod.inspectCsproj(libPath);
      assert.equal(info.isSdkStyle, true);
      assert.equal(info.outputType, 'Library');
      assert.equal(info.useWindowsForms, true);
      assert.equal(info.isRunnable, false);
      assert.equal(info.isWinFormsApp, false);
    });
  });

  describe('resolveRunnableProject', () => {
    it('returns the nearest runnable WinExe .csproj directly', async () => {
      const appDir = path.join(tempDir, 'MyWinApp');
      const formsDir = path.join(appDir, 'Forms');
      fs.mkdirSync(formsDir, { recursive: true });
      const csproj = path.join(appDir, 'MyWinApp.csproj');
      fs.writeFileSync(
        csproj,
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net9.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );
      const formPath = path.join(formsDir, 'MainForm.Designer.cs');
      fs.writeFileSync(formPath, 'partial class MainForm {}', 'utf8');

      const folders = [{ uri: MockUri.file(tempDir) }] as unknown as vscodeTypes.WorkspaceFolder[];
      const resolved = await runnerMod.resolveRunnableProject(
        MockUri.file(formPath) as unknown as vscodeTypes.Uri,
        folders
      );

      assert.ok(resolved);
      assert.equal(resolved.csprojPath, csproj);
    });

    it('resolves sibling WinExe in workspace when active file belongs to a Class Library and skips bin/obj', async () => {
      const libDir = path.join(tempDir, 'ControlsLib');
      const appDir = path.join(tempDir, 'DesktopHost');
      const binDir = path.join(tempDir, 'bin', 'FakeApp');
      fs.mkdirSync(libDir, { recursive: true });
      fs.mkdirSync(appDir, { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });

      fs.writeFileSync(
        path.join(libDir, 'ControlsLib.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Library</OutputType><TargetFramework>net9.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );
      const controlFile = path.join(libDir, 'AddressBox.Designer.cs');
      fs.writeFileSync(controlFile, 'partial class AddressBox {}', 'utf8');

      const hostCsproj = path.join(appDir, 'DesktopHost.csproj');
      fs.writeFileSync(
        hostCsproj,
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net9.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );

      // Should be ignored because it is under bin/
      fs.writeFileSync(
        path.join(binDir, 'Ignored.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );

      const folders = [{ uri: MockUri.file(tempDir) }] as unknown as vscodeTypes.WorkspaceFolder[];
      const resolved = await runnerMod.resolveRunnableProject(
        MockUri.file(controlFile) as unknown as vscodeTypes.Uri,
        folders
      );

      assert.ok(resolved);
      assert.equal(resolved.csprojPath, hostCsproj);
      assert.equal(mockState.quickPickCallCount, 0);
    });

    it('prompts QuickPick when multiple runnable projects exist and remembers selection in workspaceState', async () => {
      const libDir = path.join(tempDir, 'SharedLib');
      const appADir = path.join(tempDir, 'AppAlpha');
      const appBDir = path.join(tempDir, 'AppBeta');
      fs.mkdirSync(libDir, { recursive: true });
      fs.mkdirSync(appADir, { recursive: true });
      fs.mkdirSync(appBDir, { recursive: true });

      fs.writeFileSync(
        path.join(libDir, 'SharedLib.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Library</OutputType><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );
      const libFile = path.join(libDir, 'Widget.Designer.cs');
      fs.writeFileSync(libFile, 'partial class Widget {}', 'utf8');

      fs.writeFileSync(
        path.join(appADir, 'AppAlpha.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net9.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );
      const appBCsproj = path.join(appBDir, 'AppBeta.csproj');
      fs.writeFileSync(
        appBCsproj,
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net10.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );

      const folders = [{ uri: MockUri.file(tempDir) }] as unknown as vscodeTypes.WorkspaceFolder[];
      const state = new MockMemento();

      // First call shows QuickPick and selects AppBeta (index 1)
      mockState.nextQuickPickIndex = 1;
      const first = await runnerMod.resolveRunnableProject(
        MockUri.file(libFile) as unknown as vscodeTypes.Uri,
        folders,
        state as unknown as vscodeTypes.Memento
      );
      assert.ok(first);
      assert.equal(first.csprojPath, appBCsproj);
      assert.equal(mockState.quickPickCallCount, 1);

      // Second call uses remembered choice without prompting again
      mockState.nextQuickPickIndex = 0;
      const second = await runnerMod.resolveRunnableProject(
        MockUri.file(libFile) as unknown as vscodeTypes.Uri,
        folders,
        state as unknown as vscodeTypes.Memento
      );
      assert.ok(second);
      assert.equal(second.csprojPath, appBCsproj);
      assert.equal(mockState.quickPickCallCount, 1);
    });
  });

  describe('planProjectCommand & detectIsWsl', () => {
    const winSdkInfo = runnerMod.parseCsprojXml(
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net10.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
      'C:\\Work\\DemoApp\\DemoApp.csproj'
    );

    const winLegacyInfo = runnerMod.parseCsprojXml(
      `<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><PropertyGroup><OutputType>WinExe</OutputType><AssemblyName>LegacyExe</AssemblyName><TargetFrameworkVersion>v4.8</TargetFrameworkVersion></PropertyGroup></Project>`,
      'C:\\Work\\LegacyApp\\LegacyApp.csproj'
    );

    const unixSdkInfo = runnerMod.parseCsprojXml(
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net9.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
      '/home/dev/DemoApp/DemoApp.csproj'
    );

    it('plans Windows SDK-style build, run, and missing-sdk guidance', () => {
      const winEnv: RunnerEnvironment = {
        platform: 'win32',
        isWsl: false,
        dotnetPath: 'C:\\Program Files\\dotnet\\dotnet.exe',
      };

      const buildPlan = runnerMod.planProjectCommand(winSdkInfo, 'build', winEnv);
      assert.equal(buildPlan.kind, 'execute');
      assert.equal(buildPlan.mode, 'dotnet-sdk');
      assert.deepEqual(buildPlan.steps, [
        {
          command: 'C:\\Program Files\\dotnet\\dotnet.exe',
          args: ['build', 'C:\\Work\\DemoApp\\DemoApp.csproj'],
          cwd: 'C:\\Work\\DemoApp',
          label: 'Build DemoApp',
        },
      ]);

      const runPlan = runnerMod.planProjectCommand(winSdkInfo, 'run', winEnv);
      assert.equal(runPlan.kind, 'execute');
      assert.equal(runPlan.mode, 'dotnet-sdk');
      assert.deepEqual(runPlan.steps[0].args, ['run', '--project', 'C:\\Work\\DemoApp\\DemoApp.csproj']);

      const missingPlan = runnerMod.planProjectCommand(winSdkInfo, 'run', {
        platform: 'win32',
        isWsl: false,
      });
      assert.equal(missingPlan.kind, 'missing-sdk');
      assert.equal(missingPlan.missingTool, 'dotnet');
      assert.equal(missingPlan.downloadUrl, 'https://dotnet.microsoft.com/download');
    });

    it('plans Windows legacy .NET Framework MSBuild build and 2-step run launching bin\\Debug\\<AssemblyName>.exe', () => {
      const msbuild = 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe';
      const env: RunnerEnvironment = {
        platform: 'win32',
        isWsl: false,
        msbuildPath: msbuild,
      };

      const buildPlan = runnerMod.planProjectCommand(winLegacyInfo, 'build', env);
      assert.equal(buildPlan.kind, 'execute');
      assert.equal(buildPlan.mode, 'msbuild-legacy');
      assert.equal(buildPlan.steps.length, 1);
      assert.equal(buildPlan.steps[0].command, msbuild);
      assert.deepEqual(buildPlan.steps[0].args, [
        'C:\\Work\\LegacyApp\\LegacyApp.csproj',
        '/p:Configuration=Debug',
        '/nologo',
        '/v:minimal',
      ]);

      const runPlan = runnerMod.planProjectCommand(winLegacyInfo, 'run', env);
      assert.equal(runPlan.kind, 'execute');
      assert.equal(runPlan.mode, 'msbuild-legacy');
      assert.equal(runPlan.steps.length, 2);
      assert.equal(runPlan.steps[0].command, msbuild);
      assert.equal(runPlan.steps[1].command, 'C:\\Work\\LegacyApp\\bin\\Debug\\LegacyExe.exe');
      assert.equal(runPlan.steps[1].cwd, 'C:\\Work\\LegacyApp\\bin\\Debug');

      const missingMsbuild = runnerMod.planProjectCommand(winLegacyInfo, 'build', {
        platform: 'win32',
        isWsl: false,
      });
      assert.equal(missingMsbuild.kind, 'missing-sdk');
      assert.equal(missingMsbuild.missingTool, 'msbuild');
    });

    it('plans WSL with Windows dotnet.exe + wslpath translation and fallback when dotnet.exe is absent', () => {
      const wslWithInterop: RunnerEnvironment = {
        platform: 'linux',
        isWsl: true,
        dotnetPath: '/usr/bin/dotnet',
        windowsDotnetPath: '/mnt/c/Program Files/dotnet/dotnet.exe',
        wslPathConvert: (p) => `\\\\wsl$\\Ubuntu${p.replace(/\//g, '\\')}`,
      };

      const runPlan = runnerMod.planProjectCommand(unixSdkInfo, 'run', wslWithInterop);
      assert.equal(runPlan.kind, 'execute');
      assert.equal(runPlan.mode, 'wsl-windows-dotnet');
      assert.equal(runPlan.steps[0].command, '/mnt/c/Program Files/dotnet/dotnet.exe');
      assert.deepEqual(runPlan.steps[0].args, [
        'run',
        '--project',
        '\\\\wsl$\\Ubuntu\\home\\dev\\DemoApp\\DemoApp.csproj',
      ]);

      const buildPlan = runnerMod.planProjectCommand(unixSdkInfo, 'build', wslWithInterop);
      assert.equal(buildPlan.kind, 'execute');
      assert.deepEqual(buildPlan.steps[0].args, [
        'build',
        '\\\\wsl$\\Ubuntu\\home\\dev\\DemoApp\\DemoApp.csproj',
      ]);

      // Fallback when Windows dotnet.exe is unavailable
      const wslNoWinDotnet: RunnerEnvironment = {
        platform: 'linux',
        isWsl: true,
        dotnetPath: '/usr/bin/dotnet',
      };
      const fallbackBuild = runnerMod.planProjectCommand(unixSdkInfo, 'build', wslNoWinDotnet);
      assert.equal(fallbackBuild.kind, 'execute');
      assert.equal(fallbackBuild.mode, 'cross-platform-compile-check');
      assert.deepEqual(fallbackBuild.steps[0].args, [
        'build',
        '/home/dev/DemoApp/DemoApp.csproj',
        '-p:EnableWindowsTargeting=true',
      ]);

      const fallbackRun = runnerMod.planProjectCommand(unixSdkInfo, 'run', wslNoWinDotnet);
      assert.equal(fallbackRun.kind, 'unsupported-os-run');
      assert.equal(fallbackRun.canCompileCheck, true);
      assert.equal(fallbackRun.isWsl, true);
    });

    it('plans native macOS and Linux compile-check (-p:EnableWindowsTargeting=true) and graceful run fallback', () => {
      for (const platform of ['darwin', 'linux'] as const) {
        const env: RunnerEnvironment = {
          platform,
          isWsl: false,
          dotnetPath: '/usr/local/share/dotnet/dotnet',
        };

        const buildPlan = runnerMod.planProjectCommand(unixSdkInfo, 'build', env);
        assert.equal(buildPlan.kind, 'execute');
        assert.equal(buildPlan.mode, 'cross-platform-compile-check');
        assert.deepEqual(buildPlan.steps[0].args, [
          'build',
          '/home/dev/DemoApp/DemoApp.csproj',
          '-p:EnableWindowsTargeting=true',
        ]);

        const runPlan = runnerMod.planProjectCommand(unixSdkInfo, 'run', env);
        assert.equal(runPlan.kind, 'unsupported-os-run');
        assert.equal(runPlan.canCompileCheck, true);
        assert.equal(runPlan.isWsl, false);

        const runNoDotnet = runnerMod.planProjectCommand(unixSdkInfo, 'run', {
          platform,
          isWsl: false,
        });
        assert.equal(runNoDotnet.kind, 'unsupported-os-run');
        assert.equal(runNoDotnet.canCompileCheck, false);
      }
    });

    it('detects WSL via WSL_DISTRO_NAME or /proc/version', () => {
      assert.equal(runnerMod.detectIsWsl('darwin', { WSL_DISTRO_NAME: 'Ubuntu' }), false);
      assert.equal(runnerMod.detectIsWsl('linux', { WSL_DISTRO_NAME: 'Ubuntu' }), true);
      assert.equal(
        runnerMod.detectIsWsl('linux', {}, () => 'Linux version 5.15.90.1-microsoft-standard-WSL2'),
        true
      );
      assert.equal(
        runnerMod.detectIsWsl('linux', {}, () => 'Linux version 6.8.0-generic (buildd@ubuntu)'),
        false
      );
    });
  });

  describe('WinFormsProjectRunner lifecycle, stop/restart, status bar & cross-platform prompts', () => {
    it('auto-saves dirty files, streams output, transitions status bar, and cleanly stops previous process on restart', async () => {
      const appDir = path.join(tempDir, 'DemoWinApp');
      fs.mkdirSync(appDir, { recursive: true });
      const csprojPath = path.join(appDir, 'DemoWinApp.csproj');
      fs.writeFileSync(
        csprojPath,
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net10.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );
      const formUri = MockUri.file(path.join(appDir, 'MainForm.Designer.cs'));

      const spawned: Array<{ command: string; args: readonly string[]; proc: FakeChildProcess }> =
        [];
      const killedPids: number[] = [];
      let nextPid = 1001;

      const runner = new runnerMod.WinFormsProjectRunner({
        restartDelayMs: 0,
        detectEnvironment: () => ({
          platform: 'win32',
          isWsl: false,
          dotnetPath: 'dotnet',
        }),
        spawnProcess: (command, args) => {
          const proc = new FakeChildProcess(nextPid++);
          spawned.push({ command, args, proc });
          return proc;
        },
        killProcessTree: (proc) => {
          if (proc.pid !== undefined) {
            killedPids.push(proc.pid);
          }
          (proc as FakeChildProcess).emitClose(null, 'SIGTERM');
        },
      });

      const statusBar = mockState.statusBarItems[0];
      const output = mockState.outputChannels[0];
      assert.ok(statusBar);
      assert.ok(output);
      assert.equal(output.name, 'WinForms Runner');
      assert.equal(statusBar.text, '$(play) Run WinForms');
      assert.equal(statusBar.command, 'winforms.runApp');

      // 1. Run starts app and moves status bar to running
      const startedFirst = await runner.run(formUri as unknown as vscodeTypes.Uri);
      assert.equal(startedFirst, true);
      assert.equal(mockState.saveAllCalls.length, 1);
      assert.equal(mockState.saveAllCalls[0], false);
      assert.equal(runner.getState(), 'running');
      assert.equal(statusBar.text, '$(debug-stop) Stop WinForms');
      assert.equal(statusBar.command, 'winforms.stopApp');
      assert.equal(statusBar.backgroundColor?.id, 'statusBarItem.warningBackground');
      assert.equal(spawned.length, 1);
      assert.deepEqual(spawned[0].args, ['run', '--project', csprojPath]);

      // Stream stdout/stderr into WinForms Runner output channel
      spawned[0].proc.stdout.write('App started\n');
      spawned[0].proc.stderr.write('Minor warning\n');
      await new Promise((r) => setTimeout(r, 10));
      assert.ok(output.chunks.join('').includes('App started'));
      assert.ok(output.chunks.join('').includes('Minor warning'));

      // 2. Clicking Run again stops previous process tree before relaunching (avoids MSB3027 locks)
      const startedSecond = await runner.run(formUri as unknown as vscodeTypes.Uri);
      assert.equal(startedSecond, true);
      assert.deepEqual(killedPids, [1001]);
      assert.equal(spawned.length, 2);
      assert.equal(runner.getState(), 'running');
      assert.equal(statusBar.text, '$(debug-stop) Stop WinForms');

      // 3. Clicking Stop terminates second process and returns status bar to idle
      await runner.stop();
      assert.deepEqual(killedPids, [1001, 1002]);
      assert.equal(runner.getState(), 'idle');
      assert.equal(statusBar.text, '$(play) Run WinForms');
      assert.equal(statusBar.command, 'winforms.runApp');
      assert.equal(statusBar.backgroundColor, undefined);

      runner.dispose();
      assert.equal(statusBar.disposed, true);
      assert.equal(output.disposed, true);
    });

    it('runs 2-step legacy MSBuild build then launches exe and resets on process close', async () => {
      const appDir = path.join(tempDir, 'LegacyWinApp');
      fs.mkdirSync(appDir, { recursive: true });
      const csprojPath = path.join(appDir, 'LegacyWinApp.csproj');
      fs.writeFileSync(
        csprojPath,
        `<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><PropertyGroup><OutputType>WinExe</OutputType><AssemblyName>CustomLegacy</AssemblyName><TargetFrameworkVersion>v4.8</TargetFrameworkVersion></PropertyGroup></Project>`,
        'utf8'
      );

      const spawned: Array<{ command: string; args: readonly string[]; proc: FakeChildProcess }> =
        [];
      const statesSeen: string[] = [];

      const runner = new runnerMod.WinFormsProjectRunner({
        restartDelayMs: 0,
        detectEnvironment: () => ({
          platform: 'win32',
          isWsl: false,
          msbuildPath: 'C:\\MSBuild\\MSBuild.exe',
        }),
        spawnProcess: (command, args) => {
          const proc = new FakeChildProcess(2000 + spawned.length);
          spawned.push({ command, args, proc });
          statesSeen.push(runner.getState());
          // Complete MSBuild step 0 cleanly on next tick
          if (spawned.length === 1) {
            setImmediate(() => proc.emitClose(0));
          }
          return proc;
        },
        killProcessTree: (proc) => {
          (proc as FakeChildProcess).emitClose(0);
        },
      });

      const ok = await runner.run(MockUri.file(csprojPath) as unknown as vscodeTypes.Uri);
      assert.equal(ok, true);
      assert.equal(spawned.length, 2);
      assert.equal(spawned[0].command, 'C:\\MSBuild\\MSBuild.exe');
      assert.ok(spawned[1].command.endsWith('CustomLegacy.exe'));
      assert.equal(statesSeen[0], 'building');
      assert.equal(runner.getState(), 'running');

      // When user closes the WinForms window, status bar automatically returns to idle
      spawned[1].proc.emitClose(0);
      assert.equal(runner.getState(), 'idle');
      assert.equal(mockState.statusBarItems[0].text, '$(play) Run WinForms');

      runner.dispose();
    });

    it('offers Compile-Check Now and Open Live Preview on macOS/Linux run, and Download link on missing SDK', async () => {
      const appDir = path.join(tempDir, 'CrossPlatApp');
      fs.mkdirSync(appDir, { recursive: true });
      const csprojPath = path.join(appDir, 'CrossPlatApp.csproj');
      fs.writeFileSync(
        csprojPath,
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net9.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );

      const spawnedArgs: Array<readonly string[]> = [];
      let previewOpened = 0;

      const runner = new runnerMod.WinFormsProjectRunner({
        restartDelayMs: 0,
        detectEnvironment: () => ({
          platform: 'darwin',
          isWsl: false,
          dotnetPath: '/usr/local/share/dotnet/dotnet',
        }),
        spawnProcess: (_cmd, args) => {
          spawnedArgs.push(args);
          const proc = new FakeChildProcess(3001);
          setImmediate(() => proc.emitClose(0));
          return proc;
        },
        onOpenLivePreview: () => {
          previewOpened += 1;
        },
      });

      // Clicking "Compile-Check Now" triggers cross-platform dotnet build
      mockState.nextInfoChoice = 'Compile-Check Now';
      const compiled = await runner.run(MockUri.file(csprojPath) as unknown as vscodeTypes.Uri);
      assert.equal(compiled, true);
      assert.deepEqual(mockState.infoMessages[0].buttons, [
        'Compile-Check Now',
        'Open Live Preview',
      ]);
      assert.deepEqual(spawnedArgs[0], ['build', csprojPath, '-p:EnableWindowsTargeting=true']);

      // Clicking "Open Live Preview" invokes preview callback
      mockState.nextInfoChoice = 'Open Live Preview';
      await runner.run(MockUri.file(csprojPath) as unknown as vscodeTypes.Uri);
      assert.equal(previewOpened, 1);

      runner.dispose();

      // Missing SDK opens download link
      const missingRunner = new runnerMod.WinFormsProjectRunner({
        detectEnvironment: () => ({
          platform: 'win32',
          isWsl: false,
        }),
      });
      mockState.nextWarningChoice = 'Download .NET SDK';
      const missingOk = await missingRunner.build(
        MockUri.file(csprojPath) as unknown as vscodeTypes.Uri
      );
      assert.equal(missingOk, false);
      assert.deepEqual(mockState.openedExternals, ['https://dotnet.microsoft.com/download']);
      missingRunner.dispose();
    });

    it('reports build failure without launching legacy exe and supports cancelling mid-build via stop()', async () => {
      const appDir = path.join(tempDir, 'LegacyFailApp');
      fs.mkdirSync(appDir, { recursive: true });
      const csprojPath = path.join(appDir, 'LegacyFailApp.csproj');
      fs.writeFileSync(
        csprojPath,
        `<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><PropertyGroup><OutputType>WinExe</OutputType><AssemblyName>LegacyFailApp</AssemblyName></PropertyGroup></Project>`,
        'utf8'
      );

      let spawnCount = 0;
      let activeProc: FakeChildProcess | undefined;

      const runner = new runnerMod.WinFormsProjectRunner({
        restartDelayMs: 0,
        detectEnvironment: () => ({
          platform: 'win32',
          isWsl: false,
          msbuildPath: 'C:\\MSBuild\\MSBuild.exe',
        }),
        spawnProcess: () => {
          spawnCount += 1;
          const proc = new FakeChildProcess(5000 + spawnCount);
          activeProc = proc;
          if (spawnCount === 1) {
            setImmediate(() => proc.emitClose(1));
          }
          return proc;
        },
        killProcessTree: (proc) => {
          (proc as FakeChildProcess).emitClose(null, 'SIGTERM');
        },
      });

      // 1. Failing MSBuild step must not launch the .exe and must reset to idle + show error
      const failedRun = await runner.run(MockUri.file(csprojPath) as unknown as vscodeTypes.Uri);
      assert.equal(failedRun, false);
      assert.equal(spawnCount, 1);
      assert.equal(runner.getState(), 'idle');
      assert.equal(mockState.errorMessages.length, 1);

      // 2. Stopping mid-build cancels the pipeline and resets to idle without error
      const pendingRun = runner.run(MockUri.file(csprojPath) as unknown as vscodeTypes.Uri);
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(runner.getState(), 'building');
      assert.ok(activeProc);
      await runner.stop();
      const cancelledResult = await pendingRun;
      assert.equal(cancelledResult, false);
      assert.equal(spawnCount, 2);
      assert.equal(runner.getState(), 'idle');

      runner.dispose();
    });

    it('serializes overlapping run() calls without orphaning processes and honors explicit .csproj & build nearest project', async () => {
      const libDir = path.join(tempDir, 'ControlsLib');
      const appDir = path.join(tempDir, 'DesktopApp');
      fs.mkdirSync(libDir, { recursive: true });
      fs.mkdirSync(appDir, { recursive: true });

      const libCsproj = path.join(libDir, 'ControlsLib.csproj');
      const libForm = path.join(libDir, 'Widget.Designer.cs');
      const appCsproj = path.join(appDir, 'DesktopApp.csproj');
      const secondCsproj = path.join(appDir, 'ZExtraApp.csproj');

      fs.writeFileSync(
        libCsproj,
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Library</OutputType><TargetFramework>net9.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );
      fs.writeFileSync(libForm, 'partial class Widget {}', 'utf8');
      fs.writeFileSync(
        appCsproj,
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFrameworks>net8.0-windows;net10.0-windows</TargetFrameworks><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );
      fs.writeFileSync(
        secondCsproj,
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>WinExe</OutputType><TargetFramework>net9.0-windows</TargetFramework><UseWindowsForms>true</UseWindowsForms></PropertyGroup></Project>`,
        'utf8'
      );

      // 1. Explicit .csproj URI must not be reduced to parent directory's first sorted project
      assert.equal(
        runnerMod.findNearestCsprojPath(MockUri.file(secondCsproj) as unknown as vscodeTypes.Uri),
        path.resolve(secondCsproj)
      );

      // 2. Multi-target plan must pass -f net10.0-windows on dotnet run
      const multiInfo = runnerMod.inspectCsproj(appCsproj);
      const multiPlan = runnerMod.planProjectCommand(multiInfo, 'run', {
        platform: 'win32',
        isWsl: false,
        dotnetPath: 'C:\\dotnet.exe',
      });
      assert.equal(multiPlan.kind, 'execute');
      assert.deepEqual(multiPlan.steps[0].args, ['run', '--project', appCsproj, '-f', 'net10.0-windows']);

      // 3. Build on a Class Library form builds the library itself (not the unrelated WinExe)
      const spawned: Array<{ args: readonly string[]; proc: FakeChildProcess }> = [];
      let releaseKill: (() => void) | undefined;

      const runner = new runnerMod.WinFormsProjectRunner({
        restartDelayMs: 0,
        detectEnvironment: () => ({
          platform: 'win32',
          isWsl: false,
          dotnetPath: 'C:\\dotnet.exe',
        }),
        spawnProcess: (_cmd, args) => {
          const proc = new FakeChildProcess(7000 + spawned.length);
          spawned.push({ args, proc });
          if (args[0] === 'build') {
            setImmediate(() => proc.emitClose(0));
          }
          return proc;
        },
        killProcessTree: (proc) =>
          new Promise<boolean>((resolve) => {
            releaseKill = () => {
              (proc as FakeChildProcess).emitClose(null, 'SIGTERM');
              resolve(true);
            };
          }),
      });

      const buildLibOk = await runner.build(MockUri.file(libForm) as unknown as vscodeTypes.Uri);
      assert.equal(buildLibOk, true);
      assert.equal(spawned[0].args[0], 'build');
      assert.equal(spawned[0].args[1], libCsproj);

      // 4. Overlapping run() calls while an active process is stopping must only spawn ONE replacement
      const firstRun = await runner.run(MockUri.file(appCsproj) as unknown as vscodeTypes.Uri);
      assert.equal(firstRun, true);
      assert.equal(spawned.length, 2);

      const overlapA = runner.run(MockUri.file(appCsproj) as unknown as vscodeTypes.Uri);
      const overlapB = runner.run(MockUri.file(appCsproj) as unknown as vscodeTypes.Uri);
      await new Promise((r) => setTimeout(r, 10));
      assert.ok(releaseKill, 'Old process kill must be awaited');
      releaseKill();

      const [resA, resB] = await Promise.all([overlapA, overlapB]);
      assert.equal(resA, false, 'Superseded run request must abort without spawning');
      assert.equal(resB, true, 'Latest run request must spawn cleanly');
      assert.equal(spawned.length, 3, 'Exactly ONE replacement process should be spawned (zero orphans)');
      assert.equal(runner.getState(), 'running');

      const stopPromise = runner.stop();
      await new Promise((r) => setTimeout(r, 5));
      releaseKill?.();
      await stopPromise;
      runner.dispose();
    });
  });
});
