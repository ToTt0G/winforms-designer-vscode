import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { detectProjectContext, sameFilePath } from './formResolver';

export const STARTUP_PROJECT_STATE_KEY = 'winformsDesigner.startupProjectPath';
export const DOTNET_DOWNLOAD_URL = 'https://dotnet.microsoft.com/download';
export const MSBUILD_DOWNLOAD_URL = 'https://visualstudio.microsoft.com/downloads/';

const PROJECT_SCAN_IGNORED_DIRS = new Set(['bin', 'obj', 'node_modules', '.git', '.vs']);
const DEFAULT_RESTART_DELAY_MS = 250;
const KILL_WAIT_TIMEOUT_MS = 1500;

export interface CsprojInfo {
  csprojPath: string;
  projectDir: string;
  projectName: string;
  isSdkStyle: boolean;
  sdk?: string;
  toolsVersion?: string;
  outputType?: string;
  targetFramework?: string;
  targetFrameworks: string[];
  targetFrameworkVersion?: string;
  assemblyName: string;
  useWindowsForms: boolean;
  referencesWinForms: boolean;
  isRunnable: boolean;
  isWinFormsApp: boolean;
}

export type ProjectAction = 'build' | 'run';

export interface RunnerEnvironment {
  platform: NodeJS.Platform;
  isWsl: boolean;
  dotnetPath?: string;
  windowsDotnetPath?: string;
  msbuildPath?: string;
  wslPathConvert?: (linuxPath: string) => string | undefined;
}

export interface PlannedStep {
  command: string;
  args: string[];
  cwd: string;
  label: string;
}

export type ProjectCommandPlan =
  | {
      kind: 'execute';
      mode:
        | 'dotnet-sdk'
        | 'msbuild-legacy'
        | 'wsl-windows-dotnet'
        | 'cross-platform-compile-check';
      steps: PlannedStep[];
      note?: string;
    }
  | {
      kind: 'missing-sdk';
      missingTool: 'dotnet' | 'msbuild';
      message: string;
      downloadUrl: string;
    }
  | {
      kind: 'unsupported-os-run';
      message: string;
      canCompileCheck: boolean;
      platform: NodeJS.Platform;
      isWsl: boolean;
    };

export type RunnerState = 'idle' | 'building' | 'running';

export interface RunnerChildProcess {
  pid?: number;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type SpawnProcessFn = (
  command: string,
  args: readonly string[],
  options: cp.SpawnOptions
) => RunnerChildProcess;

export type KillProcessTreeFn = (
  proc: RunnerChildProcess,
  platform: NodeJS.Platform
) => Promise<boolean | void> | boolean | void;

export interface WinFormsProjectRunnerOptions {
  workspaceState?: vscode.Memento;
  detectEnvironment?: () => RunnerEnvironment;
  spawnProcess?: SpawnProcessFn;
  killProcessTree?: KillProcessTreeFn;
  restartDelayMs?: number;
  onOpenLivePreview?: (contextUri?: vscode.Uri) => Promise<void> | void;
  hasActiveDesigner?: () => boolean;
}

function isWindowsStylePath(filePath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(filePath) || /^\\\\/.test(filePath);
}

function getPathApiForFile(filePath: string): typeof path.win32 | typeof path.posix {
  return isWindowsStylePath(filePath) ? path.win32 : path;
}

function stripXmlComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function readXmlTag(xml: string, tagName: string): string | undefined {
  const re = new RegExp(`<${tagName}\\b[^>]*>([^<]+)</${tagName}>`, 'i');
  const match = re.exec(xml);
  return match ? match[1].trim() : undefined;
}

function normalizeOutputType(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  switch (trimmed.toLowerCase()) {
    case 'winexe':
      return 'WinExe';
    case 'exe':
      return 'Exe';
    case 'library':
      return 'Library';
    default:
      return trimmed;
  }
}

/**
 * Pure parser for `.csproj` XML contents (SDK-style and legacy non-SDK).
 */
export function parseCsprojXml(rawXml: string, csprojPath: string): CsprojInfo {
  const pathApi = getPathApiForFile(csprojPath);
  const projectDir = pathApi.dirname(csprojPath);
  const projectName = pathApi.basename(csprojPath, pathApi.extname(csprojPath));
  const xml = stripXmlComments(rawXml);

  const projectTagMatch = /<Project\b([^>]*)>/i.exec(xml);
  const projectAttrs = projectTagMatch ? projectTagMatch[1] : '';

  const sdkAttrMatch = /\bSdk\s*=\s*["']([^"']+)["']/i.exec(projectAttrs);
  const toolsVersionMatch = /\bToolsVersion\s*=\s*["']([^"']+)["']/i.exec(projectAttrs);

  let sdk = sdkAttrMatch?.[1]?.trim();
  if (!sdk) {
    const sdkElementMatch = /<Sdk\b[^>]*\bName\s*=\s*["']([^"']+)["']/i.exec(xml);
    const importSdkMatch = /<Import\b[^>]*\bSdk\s*=\s*["']([^"']+)["']/i.exec(xml);
    sdk = sdkElementMatch?.[1]?.trim() ?? importSdkMatch?.[1]?.trim();
  }

  const toolsVersion = toolsVersionMatch?.[1]?.trim();
  const isSdkStyle = Boolean(sdk);

  const outputType = normalizeOutputType(readXmlTag(xml, 'OutputType'));

  const singleTfm = readXmlTag(xml, 'TargetFramework');
  const multiTfm = readXmlTag(xml, 'TargetFrameworks');
  const targetFrameworkVersion = readXmlTag(xml, 'TargetFrameworkVersion');

  let targetFrameworks: string[] = [];
  if (singleTfm) {
    targetFrameworks = [singleTfm];
  } else if (multiTfm) {
    targetFrameworks = multiTfm
      .split(';')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  } else if (targetFrameworkVersion) {
    targetFrameworks = [targetFrameworkVersion];
  }

  const targetFramework = targetFrameworks[0];
  const assemblyName = readXmlTag(xml, 'AssemblyName') || projectName;
  const useWindowsForms = readXmlTag(xml, 'UseWindowsForms')?.toLowerCase() === 'true';
  const referencesWinForms = /<Reference\b[^>]*\bInclude\s*=\s*["']System\.Windows\.Forms(?:[",'])/i.test(
    xml
  );

  const outputTypeLower = outputType?.toLowerCase();
  let isRunnable: boolean;
  if (outputTypeLower === 'winexe' || outputTypeLower === 'exe') {
    isRunnable = true;
  } else if (outputTypeLower === 'library') {
    isRunnable = false;
  } else {
    isRunnable = useWindowsForms;
  }

  const isWinFormsApp =
    isRunnable && (useWindowsForms || referencesWinForms || outputTypeLower === 'winexe');

  return {
    csprojPath,
    projectDir,
    projectName,
    isSdkStyle,
    sdk,
    toolsVersion,
    outputType,
    targetFramework,
    targetFrameworks,
    targetFrameworkVersion,
    assemblyName,
    useWindowsForms,
    referencesWinForms,
    isRunnable,
    isWinFormsApp,
  };
}

/**
 * Inspects a `.csproj` file on disk and returns structured project metadata.
 */
export function inspectCsproj(csprojPath: string): CsprojInfo {
  let xml = '';
  try {
    xml = fs.readFileSync(csprojPath, 'utf8');
  } catch {
    xml = '';
  }
  return parseCsprojXml(xml, csprojPath);
}

function findWorkspaceRootForUri(
  uri: vscode.Uri,
  workspaceFolders?: readonly vscode.WorkspaceFolder[]
): string | undefined {
  const folders = workspaceFolders ?? vscode.workspace.workspaceFolders ?? [];
  const normTarget = path.resolve(uri.fsPath);
  for (const folder of folders) {
    if (folder.uri.scheme !== 'file') continue;
    const normRoot = path.resolve(folder.uri.fsPath);
    const rel = path.relative(normRoot, normTarget);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return normRoot;
    }
  }
  return folders[0]?.uri.scheme === 'file' ? folders[0].uri.fsPath : undefined;
}

/**
 * Walks up from `contextUri` (bounded by its workspace folder if inside one) to find the nearest `.csproj`.
 */
export function findNearestCsprojPath(
  contextUri?: vscode.Uri,
  workspaceFolders?: readonly vscode.WorkspaceFolder[]
): string | undefined {
  if (!contextUri || contextUri.scheme !== 'file') {
    return undefined;
  }

  // Honor an explicitly selected .csproj file directly instead of scanning its parent directory.
  if (contextUri.fsPath.toLowerCase().endsWith('.csproj')) {
    try {
      if (fs.existsSync(contextUri.fsPath) && fs.statSync(contextUri.fsPath).isFile()) {
        return path.resolve(contextUri.fsPath);
      }
    } catch {
      // Fall through to directory walk
    }
  }

  let startDir = path.dirname(contextUri.fsPath);
  try {
    if (fs.existsSync(contextUri.fsPath) && fs.statSync(contextUri.fsPath).isDirectory()) {
      startDir = contextUri.fsPath;
    }
  } catch {
    // Keep dirname
  }

  const workspaceRoot = findWorkspaceRootForUri(contextUri, workspaceFolders);
  const ctx = detectProjectContext(startDir, workspaceRoot);
  return ctx.csprojPath;
}

/**
 * Scans workspace folders (skipping build/VCS directories, depth <= maxDepth) for `.csproj` files.
 */
export function scanWorkspaceCsprojs(
  workspaceFolders: readonly vscode.WorkspaceFolder[] = [],
  maxDepth = 4
): CsprojInfo[] {
  const foundPaths: string[] = [];

  for (const folder of workspaceFolders) {
    if (folder.uri.scheme !== 'file') continue;
    const rootDir = path.resolve(folder.uri.fsPath);
    const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];

    while (queue.length > 0) {
      const { dir, depth } = queue.shift()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      const csprojs = entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.csproj'))
        .map((e) => path.join(dir, e.name))
        .sort((a, b) => a.localeCompare(b));

      for (const csproj of csprojs) {
        if (!foundPaths.some((existing) => sameFilePath(existing, csproj))) {
          foundPaths.push(csproj);
        }
      }

      if (depth >= maxDepth) {
        continue;
      }

      const subdirs = entries
        .filter((e) => e.isDirectory() && !PROJECT_SCAN_IGNORED_DIRS.has(e.name.toLowerCase()))
        .map((e) => path.join(dir, e.name))
        .sort((a, b) => a.localeCompare(b));

      for (const sub of subdirs) {
        queue.push({ dir: sub, depth: depth + 1 });
      }
    }
  }

  foundPaths.sort((a, b) => a.localeCompare(b));
  return foundPaths.map((csprojPath) => inspectCsproj(csprojPath));
}

function formatWorkspaceRelativePath(
  filePath: string,
  workspaceFolders: readonly vscode.WorkspaceFolder[]
): string {
  for (const folder of workspaceFolders) {
    if (folder.uri.scheme !== 'file') continue;
    const rel = path.relative(folder.uri.fsPath, filePath);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.replace(/\\/g, '/');
    }
  }
  return filePath;
}

/**
 * Resolves the runnable WinForms startup `.csproj` for a given context URI and workspace.
 */
export async function resolveRunnableProject(
  contextUri?: vscode.Uri,
  workspaceFolders?: readonly vscode.WorkspaceFolder[],
  workspaceState?: vscode.Memento,
  options?: { onCancelled?: () => void }
): Promise<CsprojInfo | undefined> {
  const effectiveFolders = workspaceFolders ?? vscode.workspace.workspaceFolders ?? [];

  const nearestPath = findNearestCsprojPath(contextUri, effectiveFolders);
  if (nearestPath) {
    const nearestInfo = inspectCsproj(nearestPath);
    if (nearestInfo.isRunnable) {
      return nearestInfo;
    }
  }

  const allProjects = scanWorkspaceCsprojs(effectiveFolders, 4);
  const winFormsApps = allProjects.filter((project) => project.isWinFormsApp);
  const candidates =
    winFormsApps.length > 0 ? winFormsApps : allProjects.filter((project) => project.isRunnable);

  if (candidates.length === 0) {
    return undefined;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const rememberedPath = workspaceState?.get<string>(STARTUP_PROJECT_STATE_KEY);
  if (rememberedPath) {
    const remembered = candidates.find((c) => sameFilePath(c.csprojPath, rememberedPath));
    if (remembered) {
      return remembered;
    }
  }

  if (typeof vscode.window.showQuickPick !== 'function') {
    return candidates[0];
  }

  const items = candidates.map((info) => ({
    label: info.projectName,
    description: info.targetFramework ?? (info.isSdkStyle ? 'SDK-style' : '.NET Framework'),
    detail: formatWorkspaceRelativePath(info.csprojPath, effectiveFolders),
    info,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Select WinForms Startup Project',
    placeHolder: 'Choose which WinForms project to build and run',
  });

  if (!picked) {
    options?.onCancelled?.();
    return undefined;
  }

  if (workspaceState && typeof workspaceState.update === 'function') {
    await workspaceState.update(STARTUP_PROJECT_STATE_KEY, picked.info.csprojPath);
  }

  return picked.info;
}

/**
 * Detects whether the current Linux runtime is running inside Windows Subsystem for Linux (WSL).
 */
export function detectIsWsl(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  readProcVersion?: () => string | undefined
): boolean {
  if (platform !== 'linux') {
    return false;
  }
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) {
    return true;
  }
  try {
    const version = readProcVersion
      ? readProcVersion()
      : fs.existsSync('/proc/version')
        ? fs.readFileSync('/proc/version', 'utf8')
        : undefined;
    return typeof version === 'string' && /microsoft|wsl/i.test(version);
  } catch {
    return false;
  }
}

function isExistingFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findExecutableOnPath(
  names: readonly string[],
  pathEnv: string | undefined = process.env.PATH,
  pathSep: string = path.delimiter
): string | undefined {
  if (!pathEnv) {
    return undefined;
  }
  const dirs = pathEnv
    .split(pathSep)
    .map((segment) => segment.trim().replace(/^"(.*)"$/, '$1'))
    .filter((segment) => segment.length > 0);

  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (isExistingFile(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function detectWindowsMsbuildPath(): string | undefined {
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const vswherePath = path.win32.join(
    programFilesX86,
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe'
  );

  if (isExistingFile(vswherePath)) {
    try {
      const output = cp.execFileSync(
        vswherePath,
        [
          '-latest',
          '-products',
          '*',
          '-requires',
          'Microsoft.Component.MSBuild',
          '-find',
          'MSBuild\\**\\Bin\\MSBuild.exe',
        ],
        { encoding: 'utf8', timeout: 5000, windowsHide: true }
      );
      const firstMatch = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && isExistingFile(line));
      if (firstMatch) {
        return firstMatch;
      }
    } catch {
      // Fall through to PATH / .NET Framework MSBuild lookup
    }
  }

  const fromPath = findExecutableOnPath(['MSBuild.exe', 'msbuild.exe']);
  if (fromPath) {
    return fromPath;
  }

  const winDir = process.env.WINDIR || 'C:\\Windows';
  const frameworkCandidates = [
    path.win32.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'MSBuild.exe'),
    path.win32.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'MSBuild.exe'),
  ];
  for (const candidate of frameworkCandidates) {
    if (isExistingFile(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function detectDotnetPath(platform: NodeJS.Platform): string | undefined {
  if (platform === 'win32') {
    const fromPath = findExecutableOnPath(['dotnet.exe', 'dotnet']);
    if (fromPath) return fromPath;
    const candidates = [
      path.win32.join(process.env.ProgramFiles || 'C:\\Program Files', 'dotnet', 'dotnet.exe'),
      path.win32.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'dotnet',
        'dotnet.exe'
      ),
    ];
    return candidates.find((candidate) => isExistingFile(candidate));
  }

  const fromPath = findExecutableOnPath(['dotnet']);
  if (fromPath) return fromPath;

  const homeDir = os.homedir();
  const unixCandidates = [
    '/usr/local/share/dotnet/dotnet',
    '/opt/homebrew/bin/dotnet',
    '/usr/bin/dotnet',
    '/usr/share/dotnet/dotnet',
    path.join(homeDir, '.dotnet', 'dotnet'),
  ];
  return unixCandidates.find((candidate) => isExistingFile(candidate));
}

function detectWslWindowsDotnetPath(): string | undefined {
  const fromPath = findExecutableOnPath(['dotnet.exe']);
  if (fromPath) {
    return fromPath;
  }
  const candidates = [
    '/mnt/c/Program Files/dotnet/dotnet.exe',
    '/mnt/c/Program Files (x86)/dotnet/dotnet.exe',
  ];
  return candidates.find((candidate) => isExistingFile(candidate));
}

function convertWslPathToWindows(linuxPath: string): string | undefined {
  try {
    const converted = cp
      .execFileSync('wslpath', ['-w', linuxPath], { encoding: 'utf8', timeout: 5000 })
      .trim();
    return converted.length > 0 ? converted : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Probes the current host OS and available .NET / MSBuild toolchains.
 */
export function detectRunnerEnvironment(): RunnerEnvironment {
  const platform = process.platform;
  const isWsl = detectIsWsl(platform);
  const dotnetPath = detectDotnetPath(platform);

  if (platform === 'win32') {
    return {
      platform,
      isWsl: false,
      dotnetPath,
      msbuildPath: detectWindowsMsbuildPath(),
    };
  }

  if (isWsl) {
    return {
      platform,
      isWsl: true,
      dotnetPath,
      windowsDotnetPath: detectWslWindowsDotnetPath(),
      wslPathConvert: convertWslPathToWindows,
    };
  }

  return {
    platform,
    isWsl: false,
    dotnetPath,
  };
}

function selectRunnableFramework(info: CsprojInfo): string | undefined {
  if (info.targetFrameworks.length <= 1) {
    return undefined;
  }
  const scored = info.targetFrameworks.map((raw) => {
    const lower = raw.toLowerCase();
    const netMatch = /^net(\d+)(?:\.(\d+))?-windows/.exec(lower);
    let score = 0;
    if (netMatch) {
      score = 1000 + Number(netMatch[1]) * 10 + Number(netMatch[2] ?? 0);
    } else if (/^net4\d+/.test(lower)) {
      score = 500 + Number(lower.slice(3)) || 500;
    } else if (lower.includes('windows')) {
      score = 400;
    }
    return { raw, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.raw;
}

/**
 * Pure, unit-testable execution planner for building or running a WinForms `.csproj`
 * across Windows (.NET SDK & legacy .NET Framework MSBuild), WSL, macOS, and Linux.
 */
export function planProjectCommand(
  info: CsprojInfo,
  action: ProjectAction,
  env: RunnerEnvironment
): ProjectCommandPlan {
  const runFramework = action === 'run' ? selectRunnableFramework(info) : undefined;
  const runFrameworkArgs = runFramework ? ['-f', runFramework] : [];

  // 1. Native Windows
  if (env.platform === 'win32') {
    if (info.isSdkStyle) {
      if (!env.dotnetPath) {
        return {
          kind: 'missing-sdk',
          missingTool: 'dotnet',
          message:
            'The .NET SDK (dotnet) was not found. Install the .NET SDK to build and run WinForms projects.',
          downloadUrl: DOTNET_DOWNLOAD_URL,
        };
      }

      if (action === 'build') {
        return {
          kind: 'execute',
          mode: 'dotnet-sdk',
          steps: [
            {
              command: env.dotnetPath,
              args: ['build', info.csprojPath],
              cwd: info.projectDir,
              label: `Build ${info.projectName}`,
            },
          ],
        };
      }

      return {
        kind: 'execute',
        mode: 'dotnet-sdk',
        steps: [
          {
            command: env.dotnetPath,
            args: ['run', '--project', info.csprojPath, ...runFrameworkArgs],
            cwd: info.projectDir,
            label: `Run ${info.projectName}`,
          },
        ],
      };
    }

    // Legacy non-SDK .NET Framework project on Windows
    if (!env.msbuildPath) {
      return {
        kind: 'missing-sdk',
        missingTool: 'msbuild',
        message:
          'MSBuild.exe was not found. Install Visual Studio Build Tools or the .NET Framework Developer Pack to build legacy .NET Framework WinForms projects.',
        downloadUrl: MSBUILD_DOWNLOAD_URL,
      };
    }

    const buildStep: PlannedStep = {
      command: env.msbuildPath,
      args: [info.csprojPath, '/p:Configuration=Debug', '/nologo', '/v:minimal'],
      cwd: info.projectDir,
      label: `Build ${info.projectName} (MSBuild)`,
    };

    if (action === 'build') {
      return {
        kind: 'execute',
        mode: 'msbuild-legacy',
        steps: [buildStep],
      };
    }

    const debugDir = path.win32.join(info.projectDir, 'bin', 'Debug');
    const exePath = path.win32.join(debugDir, `${info.assemblyName}.exe`);
    const launchStep: PlannedStep = {
      command: exePath,
      args: [],
      cwd: debugDir,
      label: `Launch ${info.assemblyName}.exe`,
    };

    return {
      kind: 'execute',
      mode: 'msbuild-legacy',
      steps: [buildStep, launchStep],
    };
  }

  // 2. WSL (Linux with Windows interop)
  if (env.platform === 'linux' && env.isWsl) {
    const winCsprojPath =
      env.windowsDotnetPath && env.wslPathConvert
        ? env.wslPathConvert(info.csprojPath)
        : undefined;

    if (env.windowsDotnetPath && winCsprojPath) {
      const args =
        action === 'run'
          ? ['run', '--project', winCsprojPath, ...runFrameworkArgs]
          : ['build', winCsprojPath];
      return {
        kind: 'execute',
        mode: 'wsl-windows-dotnet',
        steps: [
          {
            command: env.windowsDotnetPath,
            args,
            cwd: info.projectDir,
            label:
              action === 'run'
                ? `Run ${info.projectName} on Windows (via WSL)`
                : `Build ${info.projectName} with Windows dotnet.exe`,
          },
        ],
        note: 'Using Windows dotnet.exe from WSL so the WinForms GUI launches on your Windows desktop.',
      };
    }

    if (action === 'build') {
      if (!env.dotnetPath) {
        return {
          kind: 'missing-sdk',
          missingTool: 'dotnet',
          message:
            'Neither Windows dotnet.exe nor Linux dotnet SDK was found. Install the .NET SDK on Windows (recommended for WSL WinForms GUI) or Linux.',
          downloadUrl: DOTNET_DOWNLOAD_URL,
        };
      }
      return {
        kind: 'execute',
        mode: 'cross-platform-compile-check',
        steps: [
          {
            command: env.dotnetPath,
            args: ['build', info.csprojPath, '-p:EnableWindowsTargeting=true'],
            cwd: info.projectDir,
            label: `Compile-check ${info.projectName}`,
          },
        ],
        note: 'Windows dotnet.exe was not detected; running Linux compile-check with EnableWindowsTargeting=true.',
      };
    }

    return {
      kind: 'unsupported-os-run',
      message:
        'WinForms apps run natively on Windows. Windows dotnet.exe was not detected from WSL — install the .NET SDK on Windows to launch the GUI from WSL, or run a compile-check / Live Preview here.',
      canCompileCheck: Boolean(env.dotnetPath),
      platform: env.platform,
      isWsl: true,
    };
  }

  // 3. Native macOS / Linux (non-WSL)
  if (action === 'build') {
    if (!env.dotnetPath) {
      return {
        kind: 'missing-sdk',
        missingTool: 'dotnet',
        message:
          'The .NET SDK (dotnet) was not found. Install the .NET SDK to compile-check WinForms projects on this OS.',
        downloadUrl: DOTNET_DOWNLOAD_URL,
      };
    }

    return {
      kind: 'execute',
      mode: 'cross-platform-compile-check',
      steps: [
        {
          command: env.dotnetPath,
          args: ['build', info.csprojPath, '-p:EnableWindowsTargeting=true'],
          cwd: info.projectDir,
          label: `Compile-check ${info.projectName}`,
        },
      ],
      note: 'Cross-platform compile-check enabled via -p:EnableWindowsTargeting=true.',
    };
  }

  return {
    kind: 'unsupported-os-run',
    message:
      'WinForms apps run natively on Windows. On macOS and Linux, you can compile-check your C# code now or inspect the UI in Live Preview.',
    canCompileCheck: Boolean(env.dotnetPath),
    platform: env.platform,
    isWsl: false,
  };
}

function quoteForDisplay(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

function formatStepForLog(step: PlannedStep): string {
  return [quoteForDisplay(step.command), ...step.args.map(quoteForDisplay)].join(' ');
}

function defaultSpawnProcess(
  command: string,
  args: readonly string[],
  options: cp.SpawnOptions
): RunnerChildProcess {
  return cp.spawn(command, args, options) as unknown as RunnerChildProcess;
}

function defaultKillProcessTree(
  proc: RunnerChildProcess,
  platform: NodeJS.Platform
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (terminated: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(escalateTimer);
      clearTimeout(timer);
      resolve(terminated);
    };

    const escalateTimer = setTimeout(() => {
      if (settled || platform === 'win32') return;
      const pid = proc.pid;
      if (pid !== undefined) {
        try {
          process.kill(-pid, 'SIGKILL');
          return;
        } catch {
          // Fall through to direct child kill
        }
      }
      try {
        proc.kill('SIGKILL');
      } catch {
        // Process may already be exiting
      }
    }, Math.max(250, Math.floor(KILL_WAIT_TIMEOUT_MS / 2)));

    const timer = setTimeout(() => finish(false), KILL_WAIT_TIMEOUT_MS);
    proc.on('close', () => finish(true));
    proc.on('error', () => finish(true));

    const pid = proc.pid;
    if (platform === 'win32' && pid !== undefined) {
      cp.execFile('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true }, (err) => {
        if (err) {
          try {
            proc.kill();
          } catch {
            // Process already exited
          }
          finish(true);
        }
      });
      return;
    }

    if (platform !== 'win32' && pid !== undefined) {
      try {
        process.kill(-pid, 'SIGTERM');
        return;
      } catch {
        // Fall through to direct child kill
      }
    }

    try {
      proc.kill('SIGTERM');
    } catch {
      finish(true);
    }
  });
}

function extractMsbuildOutputExe(stdout: string): string | undefined {
  let matchPath: string | undefined;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const m = /->\s*([^\r\n]+\.exe)\s*$/i.exec(rawLine.trim());
    if (m && m[1]) {
      matchPath = m[1].trim();
    }
  }
  return matchPath;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWinFormsRelatedPath(fsPath: string): boolean {
  const lower = fsPath.toLowerCase();
  return lower.endsWith('.designer.cs') || lower.endsWith('.cs') || lower.endsWith('.csproj');
}

/**
 * Manages WinForms Build / Run / Stop process lifecycle, dedicated OutputChannel,
 * and StatusBarItem transitions.
 */
export class WinFormsProjectRunner implements vscode.Disposable {
  private readonly outputChannel?: vscode.OutputChannel;
  private readonly statusBarItem?: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly detectEnv: () => RunnerEnvironment;
  private readonly spawnProcess: SpawnProcessFn;
  private readonly killProcessTree: KillProcessTreeFn;
  private readonly restartDelayMs: number;

  private state: RunnerState = 'idle';
  private activeProcess?: RunnerChildProcess;
  private activeProcessExited = false;
  private activePlatform: NodeJS.Platform = process.platform;
  private runGeneration = 0;
  private lifecycleChain: Promise<void> = Promise.resolve();
  private disposed = false;
  private workspaceHasWinFormsCache?: boolean;

  constructor(private readonly options: WinFormsProjectRunnerOptions = {}) {
    this.detectEnv = options.detectEnvironment ?? detectRunnerEnvironment;
    this.spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
    this.killProcessTree = options.killProcessTree ?? defaultKillProcessTree;
    this.restartDelayMs = options.restartDelayMs ?? DEFAULT_RESTART_DELAY_MS;

    if (typeof vscode.window.createOutputChannel === 'function') {
      this.outputChannel = vscode.window.createOutputChannel('WinForms Runner');
    }

    if (typeof vscode.window.createStatusBarItem === 'function') {
      const alignment = vscode.StatusBarAlignment?.Left ?? 1;
      this.statusBarItem = vscode.window.createStatusBarItem(alignment, 90);
    }

    if (typeof vscode.window.onDidChangeActiveTextEditor === 'function') {
      this.disposables.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
          this.updateStatusBarVisibility();
        })
      );
    }

    if (typeof vscode.workspace.onDidChangeWorkspaceFolders === 'function') {
      this.disposables.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
          this.workspaceHasWinFormsCache = undefined;
          this.updateStatusBarVisibility();
        })
      );
    }

    this.applyStatusBarState('idle');
  }

  public getState(): RunnerState {
    return this.state;
  }

  public isRunning(): boolean {
    return this.state !== 'idle';
  }

  public getStatusBarItem(): vscode.StatusBarItem | undefined {
    return this.statusBarItem;
  }

  public getOutputChannel(): vscode.OutputChannel | undefined {
    return this.outputChannel;
  }

  public updateStatusBarVisibility(): void {
    if (!this.statusBarItem || this.disposed) {
      return;
    }

    if (this.state !== 'idle') {
      this.statusBarItem.show();
      return;
    }

    const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
    const isEditorWinForms =
      activeEditorUri?.scheme === 'file' && isWinFormsRelatedPath(activeEditorUri.fsPath);

    if (this.options.hasActiveDesigner?.() || isEditorWinForms || this.hasWinFormsWorkspace()) {
      this.statusBarItem.show();
    } else {
      this.statusBarItem.hide();
    }
  }

  private hasWinFormsWorkspace(): boolean {
    if (this.workspaceHasWinFormsCache !== undefined) {
      return this.workspaceHasWinFormsCache;
    }
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      this.workspaceHasWinFormsCache = false;
      return false;
    }
    const csprojs = scanWorkspaceCsprojs(folders, 3);
    this.workspaceHasWinFormsCache = csprojs.length > 0;
    return this.workspaceHasWinFormsCache;
  }

  private applyStatusBarState(next: RunnerState): void {
    this.state = next;
    if (!this.statusBarItem || this.disposed) {
      return;
    }

    if (next === 'idle') {
      this.statusBarItem.text = '$(play) Run WinForms';
      this.statusBarItem.command = 'winforms.runApp';
      this.statusBarItem.tooltip = 'Build and run the active WinForms project';
      this.statusBarItem.backgroundColor = undefined;
      this.updateStatusBarVisibility();
      return;
    }

    if (next === 'building') {
      this.statusBarItem.text = '$(sync~spin) Building WinForms...';
      this.statusBarItem.command = 'winforms.stopApp';
      this.statusBarItem.tooltip = 'Building WinForms project (click to cancel)';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.show();
      return;
    }

    this.statusBarItem.text = '$(debug-stop) Stop WinForms';
    this.statusBarItem.command = 'winforms.stopApp';
    this.statusBarItem.tooltip = 'Stop the running WinForms application';
    this.statusBarItem.backgroundColor =
      typeof vscode.ThemeColor === 'function'
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined;
    this.statusBarItem.show();
  }

  public async build(contextUri?: vscode.Uri, preResolvedProject?: CsprojInfo): Promise<boolean> {
    return this.executeAction('build', contextUri, preResolvedProject);
  }

  public async run(contextUri?: vscode.Uri, preResolvedProject?: CsprojInfo): Promise<boolean> {
    return this.executeAction('run', contextUri, preResolvedProject);
  }

  public async stop(): Promise<void> {
    this.runGeneration += 1;
    await this.enqueueLifecycle(async () => {
      await this.terminateActiveProcess();
    });
  }

  private enqueueLifecycle<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lifecycleChain.then(task, task);
    this.lifecycleChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async terminateActiveProcess(): Promise<boolean> {
    const proc = this.activeProcess;
    const alreadyExited = this.activeProcessExited;
    const platform = this.activePlatform;

    if (!proc || alreadyExited) {
      this.activeProcess = undefined;
      this.activeProcessExited = false;
      this.applyStatusBarState('idle');
      return true;
    }

    this.outputChannel?.appendLine('[WinForms Runner] Stopping active process...');
    let terminated = true;
    try {
      const result = await this.killProcessTree(proc, platform);
      if (result === false) {
        terminated = false;
      }
    } catch {
      terminated = false;
    }

    if (!terminated) {
      this.outputChannel?.appendLine(
        '[WinForms Runner] Timed out waiting for active process to exit.'
      );
      this.outputChannel?.show(true);
      return false;
    }

    if (this.activeProcess === proc) {
      this.activeProcess = undefined;
      this.activeProcessExited = false;
    }
    this.applyStatusBarState('idle');
    return true;
  }

  private async executeAction(
    action: ProjectAction,
    contextUri?: vscode.Uri,
    preResolvedProject?: CsprojInfo
  ): Promise<boolean> {
    if (this.disposed) {
      return false;
    }

    const requestGeneration = ++this.runGeneration;
    let cancelled = false;
    let project = preResolvedProject;

    if (!project && action === 'build') {
      // Build honors the exact enclosing/selected project first (even a Class Library).
      const nearestPath = findNearestCsprojPath(contextUri, vscode.workspace.workspaceFolders);
      if (nearestPath) {
        project = inspectCsproj(nearestPath);
      } else {
        project = await resolveRunnableProject(
          contextUri,
          vscode.workspace.workspaceFolders,
          this.options.workspaceState,
          {
            onCancelled: () => {
              cancelled = true;
            },
          }
        );
      }
    } else if (!project) {
      project = await resolveRunnableProject(
        contextUri,
        vscode.workspace.workspaceFolders,
        this.options.workspaceState,
        {
          onCancelled: () => {
            cancelled = true;
          },
        }
      );
    }

    if (cancelled || requestGeneration !== this.runGeneration || this.disposed) {
      return false;
    }

    if (!project) {
      const nearestPath = findNearestCsprojPath(contextUri, vscode.workspace.workspaceFolders);
      if (nearestPath) {
        const nearestInfo = inspectCsproj(nearestPath);
        if (action === 'build') {
          project = nearestInfo;
        } else {
          void vscode.window.showWarningMessage(
            `Project "${nearestInfo.projectName}" is a Class Library and no runnable WinForms application (.csproj) was found in this workspace.`
          );
          return false;
        }
      }
    }

    if (!project) {
      void vscode.window.showWarningMessage(
        'No .csproj file was found for the active form or workspace.'
      );
      return false;
    }

    const env = this.detectEnv();
    const plan = planProjectCommand(project, action, env);

    if (plan.kind === 'missing-sdk') {
      this.outputChannel?.appendLine(`[WinForms Runner] ${plan.message}`);
      this.outputChannel?.show(true);
      const downloadButton =
        plan.missingTool === 'msbuild' ? 'Download Build Tools' : 'Download .NET SDK';
      const choice = await vscode.window.showWarningMessage(plan.message, downloadButton);
      if (choice === downloadButton && typeof vscode.env?.openExternal === 'function') {
        await vscode.env.openExternal(vscode.Uri.parse(plan.downloadUrl));
      }
      return false;
    }

    if (plan.kind === 'unsupported-os-run') {
      const buttons = plan.canCompileCheck
        ? ['Compile-Check Now', 'Open Live Preview']
        : ['Open Live Preview', 'Download .NET SDK'];
      const choice = await vscode.window.showInformationMessage(plan.message, ...buttons);
      if (choice === 'Compile-Check Now') {
        return this.build(contextUri, project);
      }
      if (choice === 'Open Live Preview') {
        await this.options.onOpenLivePreview?.(contextUri);
        return false;
      }
      if (choice === 'Download .NET SDK' && typeof vscode.env?.openExternal === 'function') {
        await vscode.env.openExternal(vscode.Uri.parse(DOTNET_DOWNLOAD_URL));
      }
      return false;
    }

    // Auto-save dirty files before building or running
    if (typeof vscode.workspace.saveAll === 'function') {
      await vscode.workspace.saveAll(false);
    }

    if (requestGeneration !== this.runGeneration || this.disposed) {
      return false;
    }

    // Serialize termination + restart delay + spawn so overlapping Run/Build calls never orphan a child.
    const prepared = await this.enqueueLifecycle(async (): Promise<boolean> => {
      if (requestGeneration !== this.runGeneration || this.disposed) {
        return false;
      }
      const hadActiveWork = this.activeProcess !== undefined || this.state !== 'idle';
      if (hadActiveWork) {
        const stopped = await this.terminateActiveProcess();
        if (!stopped) {
          void vscode.window.showErrorMessage(
            'Could not stop the previous WinForms process before restarting.'
          );
          return false;
        }
        if (this.restartDelayMs > 0) {
          await delay(this.restartDelayMs);
        }
      }
      return requestGeneration === this.runGeneration && !this.disposed;
    });

    if (!prepared) {
      return false;
    }

    const runId = requestGeneration;
    this.workspaceHasWinFormsCache = true;
    this.outputChannel?.appendLine(
      `\n[WinForms Runner] ${action === 'run' ? 'Running' : 'Building'} ${project.projectName} (${project.csprojPath})`
    );
    if (plan.note) {
      this.outputChannel?.appendLine(`[WinForms Runner] ${plan.note}`);
    }
    this.outputChannel?.show(true);

    let evaluatedMsbuildExe: string | undefined;

    for (let i = 0; i < plan.steps.length; i++) {
      if (runId !== this.runGeneration || this.disposed) {
        return false;
      }

      const rawStep = plan.steps[i];
      const isLastStep = i === plan.steps.length - 1;
      const isRunStep = action === 'run' && isLastStep;
      const step: PlannedStep =
        plan.mode === 'msbuild-legacy' && isRunStep && evaluatedMsbuildExe
          ? {
              ...rawStep,
              command: evaluatedMsbuildExe,
              cwd: path.win32.dirname(evaluatedMsbuildExe),
              label: `Launch ${path.win32.basename(evaluatedMsbuildExe)}`,
            }
          : rawStep;

      const spawned = await this.enqueueLifecycle(async (): Promise<RunnerChildProcess | null> => {
        if (runId !== this.runGeneration || this.disposed) {
          return null;
        }
        this.applyStatusBarState('building');
        this.outputChannel?.appendLine(`> ${formatStepForLog(step)}`);

        const spawnOptions: cp.SpawnOptions = {
          cwd: step.cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: !isRunStep || step.command.toLowerCase().includes('dotnet'),
          detached: env.platform !== 'win32',
        };

        let childProc: RunnerChildProcess;
        try {
          childProc = this.spawnProcess(step.command, step.args, spawnOptions);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.outputChannel?.appendLine(`[WinForms Runner] Failed to launch process: ${message}`);
          this.outputChannel?.show(true);
          if (runId === this.runGeneration) {
            this.applyStatusBarState('idle');
          }
          void vscode.window.showErrorMessage(`WinForms runner failed to start: ${message}`);
          return null;
        }

        this.activeProcess = childProc;
        this.activeProcessExited = false;
        this.activePlatform = env.platform;
        if (isRunStep) {
          this.applyStatusBarState('running');
        }
        return childProc;
      });

      if (!spawned) {
        return false;
      }
      const child = spawned;
      let stepStdout = '';

      child.stdout?.on('data', (chunk: Buffer | string) => {
        const text = chunk.toString();
        if (plan.mode === 'msbuild-legacy' && !isRunStep) {
          stepStdout += text;
        }
        this.outputChannel?.append(text);
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        this.outputChannel?.append(chunk.toString());
      });

      if (isRunStep) {
        child.on('error', (err: Error) => {
          if (this.activeProcess === child) {
            this.activeProcessExited = true;
            this.activeProcess = undefined;
          }
          if (runId !== this.runGeneration) {
            return;
          }
          this.outputChannel?.appendLine(`[WinForms Runner] Process error: ${err.message}`);
          this.outputChannel?.show(true);
          this.applyStatusBarState('idle');
          void vscode.window.showErrorMessage(`WinForms app failed to run: ${err.message}`);
        });

        child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
          if (this.activeProcess === child) {
            this.activeProcessExited = true;
            this.activeProcess = undefined;
          }
          if (runId !== this.runGeneration) {
            return;
          }
          if (code !== null && code !== 0) {
            this.outputChannel?.appendLine(
              `[WinForms Runner] Process exited with code ${code}.`
            );
            this.outputChannel?.show(true);
          } else if (signal) {
            this.outputChannel?.appendLine(
              `[WinForms Runner] Process terminated by signal ${signal}.`
            );
          } else {
            this.outputChannel?.appendLine('[WinForms Runner] Application closed.');
          }
          this.applyStatusBarState('idle');
        });

        return true;
      }

      // Blocking step (build action, or MSBuild step prior to launching .exe)
      const stepSucceeded = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };

        child.on('error', (err: Error) => {
          if (this.activeProcess === child) {
            this.activeProcessExited = true;
            this.activeProcess = undefined;
          }
          if (runId === this.runGeneration) {
            this.outputChannel?.appendLine(`[WinForms Runner] Process error: ${err.message}`);
            this.outputChannel?.show(true);
            this.applyStatusBarState('idle');
            void vscode.window.showErrorMessage(`WinForms build error: ${err.message}`);
          }
          finish(false);
        });

        child.on('close', (code: number | null) => {
          if (this.activeProcess === child) {
            this.activeProcessExited = true;
            this.activeProcess = undefined;
          }
          if (runId !== this.runGeneration) {
            finish(false);
            return;
          }
          if (code === 0) {
            this.outputChannel?.appendLine(`[WinForms Runner] ${step.label} succeeded.`);
            if (isLastStep) {
              this.applyStatusBarState('idle');
            }
            finish(true);
          } else {
            this.outputChannel?.appendLine(
              `[WinForms Runner] ${step.label} failed (exit code ${code ?? 'unknown'}).`
            );
            this.outputChannel?.show(true);
            this.applyStatusBarState('idle');
            void vscode.window.showErrorMessage(
              `WinForms build failed (exit code ${code ?? 'unknown'}). See "WinForms Runner" output for details.`
            );
            finish(false);
          }
        });
      });

      if (!stepSucceeded) {
        return false;
      }
      if (plan.mode === 'msbuild-legacy' && !isRunStep) {
        evaluatedMsbuildExe = extractMsbuildOutputExe(stepStdout);
      }
    }

    if (runId === this.runGeneration) {
      this.applyStatusBarState('idle');
    }
    return true;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    void this.stop();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.statusBarItem?.dispose();
    this.outputChannel?.dispose();
  }
}
