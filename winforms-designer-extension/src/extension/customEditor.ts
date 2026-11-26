import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as coreApi from '../core';
import {
  isRawExpressionValue,
  type CodeBehindMethod,
  type DesignDocument,
  type DesignNode,
  type DocumentStyleMetadata,
  type PropertyValue,
  type ResourceEntry,
  type ResourceMap,
  type StripItemNode,
} from '../shared/model';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';
import { getDesignerSettings, getThemeKind, updateDesignerSetting } from './config';
import {
  detectProjectContext,
  findBaseDesignerFile,
  findCultureResxFiles,
  isValidCultureTag,
  resolveFormFiles,
  sameFilePath,
  validateCSharpIdentifier,
  type ResolvedFormFiles,
} from './formResolver';
import { GITHUB_REPO_URL, StarPromptController } from './starPrompt';

export interface CoreDependencies {
  parseDesignerCs: typeof coreApi.parseDesignerCs;
  generateDesignerCs: typeof coreApi.generateDesignerCs;
  parseCodeBehind: typeof coreApi.parseCodeBehind;
  ensureEventHandlerInCodeBehind: typeof coreApi.ensureEventHandlerInCodeBehind;
  parseResx: typeof coreApi.parseResx;
  createEmptyResx: typeof coreApi.createEmptyResx;
  updateResxResource: typeof coreApi.updateResxResource;
  removeResxResource: typeof coreApi.removeResxResource;
  scaffoldFormFiles: typeof coreApi.scaffoldFormFiles;
  scaffoldWinFormsProject: typeof coreApi.scaffoldWinFormsProject;
}

const DEFAULT_CORE_DEPS: CoreDependencies = {
  parseDesignerCs: coreApi.parseDesignerCs,
  generateDesignerCs: coreApi.generateDesignerCs,
  parseCodeBehind: coreApi.parseCodeBehind,
  ensureEventHandlerInCodeBehind: coreApi.ensureEventHandlerInCodeBehind,
  parseResx: coreApi.parseResx,
  createEmptyResx: coreApi.createEmptyResx,
  updateResxResource: coreApi.updateResxResource,
  removeResxResource: coreApi.removeResxResource,
  scaffoldFormFiles: coreApi.scaffoldFormFiles,
  scaffoldWinFormsProject: coreApi.scaffoldWinFormsProject,
};

interface SessionState {
  document: vscode.TextDocument;
  webviewPanel: vscode.WebviewPanel;
  resolved: ResolvedFormFiles;
  activeCulture: string;
  lastKnownDocument?: DesignDocument;
  lastParsedSource?: string;
  lastParsedMetadata?: DocumentStyleMetadata;
  applyChain: Promise<void>;
  cultureWriteChain: Promise<void>;
  pendingSelfEdits: Set<string>;
  inFlightSelfEdits: Map<string, number>;
  acceptedSelfEditVersions: Set<number>;
  selfEditCleanupTimers: Set<ReturnType<typeof setTimeout>>;
  externalChangeTimer?: ReturnType<typeof setTimeout>;
  isDisposed: boolean;
}

interface ParsedDocumentPayload {
  doc: DesignDocument;
  resolved: ResolvedFormFiles;
  hasCodeBehind: boolean;
  codeBehindHandlers: CodeBehindMethod[];
  resourceDataUris: Record<string, string>;
  hasProject: boolean;
  availableCultures: string[];
  activeCulture: string;
  cultureStrings: Record<string, string>;
  sourceText: string;
  documentVersion: number;
}

const MAX_INHERITANCE_DEPTH = 4;
const NON_CUSTOM_BASE_CLASS_NAMES = new Set<string>([
  'Form',
  'UserControl',
  'object',
  'Object',
  'IDisposable',
  'IComponent',
  'ISupportInitialize',
]);

const EXTERNAL_CHANGE_DEBOUNCE_MS = 200;
const SELF_EDIT_GRACE_MS = 500;
const MAX_IMAGE_RESOURCE_BYTES = 10 * 1024 * 1024;
const PROJECT_RESOURCE_EXPR_RE =
  /(?:^|[^\w.])(?:(?:global::)?(?:[A-Za-z_]\w*\.)*)?Properties\.Resources\.([A-Za-z_]\w*)\b/;

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string = generateNonce()
): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css'));

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: blob:`,
    `font-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Modern WinForms Designer</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function inferMimeFromExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

function inferImageMimeFromBytes(buf: Buffer, fallbackMime?: string): string {
  if (buf.length >= 4) {
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'image/jpeg';
    }
    // GIF: 47 49 46 38
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
      return 'image/gif';
    }
    // BMP: 42 4D
    if (buf[0] === 0x42 && buf[1] === 0x4d) {
      return 'image/bmp';
    }
    // ICO: 00 00 01 00
    if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
      return 'image/x-icon';
    }
    // WEBP: RIFF....WEBP
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    ) {
      return 'image/webp';
    }
  }
  if (fallbackMime && fallbackMime.startsWith('image/')) {
    return fallbackMime;
  }
  return 'image/png';
}

function isAllowedImageExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return Object.prototype.hasOwnProperty.call(EXT_TO_MIME, ext);
}

function canonicalizeAllowedRoots(roots: string[]): string[] {
  const canonical: string[] = [];
  for (const root of roots) {
    if (!root) continue;
    try {
      const real = fs.realpathSync(root);
      if (!canonical.includes(real)) {
        canonical.push(real);
      }
    } catch {
      // Skip non-existent roots
    }
  }
  return canonical;
}

function isPathConfinedToRoots(canonicalPath: string, canonicalRoots: string[]): boolean {
  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
  const target = caseInsensitive ? canonicalPath.toLowerCase() : canonicalPath;
  return canonicalRoots.some((root) => {
    const normRoot = caseInsensitive ? root.toLowerCase() : root;
    const prefix = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;
    return target.startsWith(prefix);
  });
}

/**
 * Ensures `filePath` is not a symlink (including a dangling symlink) and that its
 * canonical directory/path stays strictly confined inside `allowedRoots`.
 */
function isConfinedNonSymlinkPath(
  filePath: string,
  allowedRoots: string[],
  allowMissing = false
): boolean {
  const canonicalRoots = canonicalizeAllowedRoots(allowedRoots);
  if (canonicalRoots.length === 0) {
    return false;
  }

  let canonicalDir: string;
  try {
    canonicalDir = fs.realpathSync(path.dirname(path.resolve(filePath)));
  } catch {
    return false;
  }

  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
  const dirInRoots = canonicalRoots.some((root) => {
    const a = caseInsensitive ? canonicalDir.toLowerCase() : canonicalDir;
    const b = caseInsensitive ? root.toLowerCase() : root;
    if (a === b) return true;
    const prefix = b.endsWith(path.sep) ? b : b + path.sep;
    return a.startsWith(prefix);
  });
  if (!dirInRoots) {
    return false;
  }

  try {
    const lstat = fs.lstatSync(filePath);
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      return false;
    }
    const canonicalFile = fs.realpathSync(filePath);
    return isPathConfinedToRoots(canonicalFile, canonicalRoots);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return allowMissing;
    }
    return false;
  }
}

function resolveFileRefOnDisk(
  baseDir: string,
  rawRelativePath: string,
  allowedRoots?: string[]
): string | undefined {
  const trimmed = rawRelativePath.trim();
  // Reject absolute paths, Windows drive-qualified paths, and UNC network paths
  if (
    !trimmed ||
    path.isAbsolute(trimmed) ||
    /^[A-Za-z]:/.test(trimmed) ||
    /^\\\\/.test(trimmed) ||
    trimmed.startsWith('/')
  ) {
    return undefined;
  }

  const roots = allowedRoots && allowedRoots.length > 0 ? allowedRoots : [baseDir];
  const canonicalRoots = canonicalizeAllowedRoots(roots);
  if (canonicalRoots.length === 0) {
    return undefined;
  }

  const normalizedRel = trimmed.replace(/\\/g, path.sep);
  let candidate: string | undefined;
  const directPath = path.resolve(baseDir, normalizedRel);
  if (fs.existsSync(directPath)) {
    candidate = directPath;
  } else {
    // Case-insensitive segment-by-segment fallback for cross-platform .resx references
    const segments = trimmed
      .replace(/\\/g, '/')
      .split('/')
      .filter((s) => s.length > 0 && s !== '.');

    let current = path.resolve(baseDir);
    for (const segment of segments) {
      if (segment === '..') {
        current = path.dirname(current);
        continue;
      }
      const next = path.join(current, segment);
      if (fs.existsSync(next)) {
        current = next;
        continue;
      }
      try {
        const entries = fs.readdirSync(current);
        const match = entries.find((e) => e.toLowerCase() === segment.toLowerCase());
        if (!match) {
          return undefined;
        }
        current = path.join(current, match);
      } catch {
        return undefined;
      }
    }
    if (fs.existsSync(current)) {
      candidate = current;
    }
  }

  if (!candidate) {
    return undefined;
  }

  try {
    const canonicalCandidate = fs.realpathSync(candidate);
    if (!isPathConfinedToRoots(canonicalCandidate, canonicalRoots)) {
      return undefined;
    }
    const stat = fs.statSync(canonicalCandidate);
    if (!stat.isFile()) {
      return undefined;
    }
    return canonicalCandidate;
  } catch {
    return undefined;
  }
}

function resolveSingleResourceDataUri(
  entry: ResourceEntry,
  baseDir: string,
  allowedRoots?: string[]
): string | undefined {
  if (entry.kind === 'fileRef') {
    const rawRelPath = entry.filePath || entry.value.split(';')[0]?.trim();
    if (!rawRelPath) {
      return undefined;
    }
    const resolvedFile = resolveFileRefOnDisk(baseDir, rawRelPath, allowedRoots);
    if (!resolvedFile) {
      return undefined;
    }
    // Enforce image-only extension allowlist AFTER symlink canonicalization
    if (!isAllowedImageExtension(resolvedFile)) {
      return undefined;
    }
    try {
      const stat = fs.statSync(resolvedFile);
      if (!stat.isFile() || stat.size > MAX_IMAGE_RESOURCE_BYTES) {
        return undefined;
      }
      const bytes = fs.readFileSync(resolvedFile);
      const mime = inferMimeFromExtension(resolvedFile);
      return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
      return undefined;
    }
  }

  if (entry.kind === 'base64') {
    const cleanBase64 = entry.value.replace(/\s+/g, '');
    if (!cleanBase64) {
      return undefined;
    }
    try {
      const bytes = Buffer.from(cleanBase64, 'base64');
      if (bytes.length > MAX_IMAGE_RESOURCE_BYTES) {
        return undefined;
      }
      const mime = inferImageMimeFromBytes(bytes, entry.mimeType);
      return `data:${mime};base64,${cleanBase64}`;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function resolveResourceDataUris(
  resources: ResourceMap,
  baseDir: string,
  allowedRoots?: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  const effectiveRoots = allowedRoots && allowedRoots.length > 0 ? allowedRoots : [baseDir];
  for (const [key, entry] of Object.entries(resources)) {
    const uri = resolveSingleResourceDataUri(entry, baseDir, effectiveRoots);
    if (uri) {
      result[key] = uri;
    }
  }
  return result;
}

function collectProjectResourceKeys(doc: DesignDocument): Set<string> {
  const keys = new Set<string>();

  const scanProps = (props?: Record<string, PropertyValue>): void => {
    if (!props) return;
    for (const val of Object.values(props)) {
      if (!isRawExpressionValue(val)) continue;
      const match = PROJECT_RESOURCE_EXPR_RE.exec(val.expression);
      if (match?.[1]) {
        keys.add(match[1]);
      }
    }
  };

  const scanStripItems = (items?: StripItemNode[]): void => {
    if (!items) return;
    for (const item of items) {
      scanProps(item.properties);
      scanStripItems(item.dropDownItems);
    }
  };

  const scanNode = (node: DesignNode): void => {
    scanProps(node.properties);
    scanStripItems(node.stripItems);
    if (node.columns) {
      for (const col of node.columns) {
        scanProps(col.properties);
      }
    }
    for (const child of node.children) {
      scanNode(child);
    }
  };

  scanNode(doc.form);
  for (const comp of doc.components) {
    scanNode(comp);
  }

  return keys;
}

function findProjectResourcesResx(projectDir: string, allowedRoots?: string[]): string | undefined {
  return resolveFileRefOnDisk(projectDir, 'Properties/Resources.resx', allowedRoots);
}

function readFileOrOpenDocument(filePath: string): { exists: boolean; text?: string } {
  const openDoc = vscode.workspace.textDocuments.find(
    (doc) => doc.uri.scheme === 'file' && sameFilePath(doc.uri.fsPath, filePath)
  );
  if (openDoc) {
    return { exists: true, text: openDoc.getText() };
  }
  if (fs.existsSync(filePath)) {
    try {
      return { exists: true, text: fs.readFileSync(filePath, 'utf8') };
    } catch {
      return { exists: false };
    }
  }
  return { exists: false };
}

function copyImageIntoResourcesFolder(sourcePath: string, resxDir: string): string {
  const resourcesDir = path.join(resxDir, 'Resources');
  fs.mkdirSync(resourcesDir, { recursive: true });

  const parsed = path.parse(sourcePath);
  const sourceBytes = fs.readFileSync(sourcePath);

  let candidateName = parsed.base;
  let targetPath = path.join(resourcesDir, candidateName);
  let suffix = 1;

  while (fs.existsSync(targetPath)) {
    try {
      const existingBytes = fs.readFileSync(targetPath);
      if (existingBytes.equals(sourceBytes)) {
        // Identical asset already present; reuse without creating duplicates
        return targetPath;
      }
    } catch {
      // Fall through to pick a unique filename
    }
    candidateName = `${parsed.name}_${suffix}${parsed.ext}`;
    targetPath = path.join(resourcesDir, candidateName);
    suffix++;
  }

  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

export interface CustomEditorCallbacks {
  runProjectAction?: (action: 'build' | 'run', uri: vscode.Uri) => Promise<void> | void;
  onActiveDesignerChanged?: (uri: vscode.Uri | undefined) => void;
}

export class WinFormsCustomEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'winformsDesigner.editor';

  private readonly sessions = new Map<string, SessionState>();
  private lastActiveDesignerUri?: vscode.Uri;
  private readonly core: CoreDependencies;
  private readonly starPrompt: StarPromptController;
  private readonly callbacks?: CustomEditorCallbacks;

  constructor(
    private readonly context: vscode.ExtensionContext,
    coreDeps?: Partial<CoreDependencies>,
    callbacks?: CustomEditorCallbacks
  ) {
    this.core = { ...DEFAULT_CORE_DEPS, ...coreDeps };
    this.starPrompt = new StarPromptController(context.globalState);
    this.callbacks = callbacks;
  }

  public getActiveDesignerUri(): vscode.Uri | undefined {
    for (const session of this.sessions.values()) {
      if (!session.isDisposed && session.webviewPanel.active) {
        return session.document.uri;
      }
    }

    if (this.lastActiveDesignerUri) {
      const existing = this.sessions.get(this.lastActiveDesignerUri.toString());
      if (existing && !existing.isDisposed) {
        return existing.document.uri;
      }
    }

    for (const session of this.sessions.values()) {
      if (!session.isDisposed) {
        return session.document.uri;
      }
    }

    return undefined;
  }

  public revealActiveDesigner(preferredUri?: vscode.Uri): boolean {
    let targetSession: SessionState | undefined;

    if (preferredUri && preferredUri.scheme === 'file') {
      const resolved = resolveFormFiles(preferredUri.fsPath);
      for (const session of this.sessions.values()) {
        if (
          !session.isDisposed &&
          session.document.uri.scheme === 'file' &&
          sameFilePath(session.document.uri.fsPath, resolved.designerPath)
        ) {
          targetSession = session;
          break;
        }
      }
    }

    if (!targetSession) {
      const activeUri = this.getActiveDesignerUri();
      if (activeUri) {
        const candidate = this.sessions.get(activeUri.toString());
        if (candidate && !candidate.isDisposed) {
          targetSession = candidate;
        }
      }
    }

    if (!targetSession) {
      return false;
    }

    if (typeof targetSession.webviewPanel.reveal === 'function') {
      targetSession.webviewPanel.reveal(undefined, false);
    }
    return true;
  }

  public async openCodeBehindForUri(uri: vscode.Uri, beside = false): Promise<void> {
    const resolved = resolveFormFiles(uri.fsPath);
    if (!fs.existsSync(resolved.codeBehindPath)) {
      const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.scheme === 'file' && sameFilePath(d.uri.fsPath, resolved.codeBehindPath)
      );
      if (!openDoc) {
        void vscode.window.showWarningMessage(
          `Code-behind file "${path.basename(resolved.codeBehindPath)}" was not found.`
        );
        return;
      }
    }

    const codeDoc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(resolved.codeBehindPath)
    );
    await vscode.window.showTextDocument(codeDoc, {
      viewColumn: beside ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
      preserveFocus: false,
    });
  }

  public async openDesignerCodeForUri(uri: vscode.Uri, beside = true): Promise<void> {
    const resolved = resolveFormFiles(uri.fsPath);
    const targetUri = vscode.Uri.file(resolved.designerPath);

    await vscode.commands.executeCommand('vscode.openWith', targetUri, 'default', {
      viewColumn: beside ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
      preserveFocus: false,
    });
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const resolved = resolveFormFiles(document.uri.fsPath);

    // Tighten localResourceRoots strictly to extension dist/; all form images are served as validated data: URIs
    const localResourceRoots: vscode.Uri[] = [
      vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
    ];

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots,
    };

    webviewPanel.webview.html = buildWebviewHtml(
      webviewPanel.webview,
      this.context.extensionUri
    );

    const sessionKey = document.uri.toString();
    const session: SessionState = {
      document,
      webviewPanel,
      resolved,
      activeCulture: 'default',
      applyChain: Promise.resolve(),
      cultureWriteChain: Promise.resolve(),
      pendingSelfEdits: new Set<string>(),
      inFlightSelfEdits: new Map<string, number>(),
      acceptedSelfEditVersions: new Set<number>([document.version]),
      selfEditCleanupTimers: new Set<ReturnType<typeof setTimeout>>(),
      isDisposed: false,
    };
    this.sessions.set(sessionKey, session);
    this.lastActiveDesignerUri = document.uri;
    this.callbacks?.onActiveDesignerChanged?.(this.getActiveDesignerUri());

    const postMessage = (msg: HostToWebviewMessage): void => {
      if (!session.isDisposed) {
        void webviewPanel.webview.postMessage(msg);
      }
    };

    const disposables: vscode.Disposable[] = [];

    disposables.push(
      webviewPanel.onDidChangeViewState((event) => {
        if (event.webviewPanel.active) {
          this.lastActiveDesignerUri = document.uri;
        }
        this.callbacks?.onActiveDesignerChanged?.(this.getActiveDesignerUri());
      })
    );

    disposables.push(
      webviewPanel.webview.onDidReceiveMessage((msg: WebviewToHostMessage) => {
        void this.handleWebviewMessage(session, msg, postMessage);
      })
    );

    disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (session.isDisposed || event.contentChanges.length === 0) {
          return;
        }

        const isDesignerDoc = event.document.uri.toString() === document.uri.toString();
        const isCodeBehindDoc =
          event.document.uri.scheme === 'file' &&
          sameFilePath(event.document.uri.fsPath, session.resolved.codeBehindPath);

        if (!isDesignerDoc && !isCodeBehindDoc) {
          return;
        }

        const undoReason = vscode.TextDocumentChangeReason?.Undo;
        const redoReason = vscode.TextDocumentChangeReason?.Redo;
        const isUndo = undoReason !== undefined && event.reason === undoReason;
        const isRedo = redoReason !== undefined && event.reason === redoReason;

        if (isDesignerDoc) {
          if (isUndo || isRedo) {
            // Native Undo/Redo must NEVER be suppressed as a self-edit!
            if (session.externalChangeTimer) {
              clearTimeout(session.externalChangeTimer);
              session.externalChangeTimer = undefined;
            }
            for (const cached of [...session.pendingSelfEdits]) {
              if ((session.inFlightSelfEdits.get(cached) ?? 0) === 0) {
                session.pendingSelfEdits.delete(cached);
              }
            }
            try {
              const payload = this.buildPayloadForDocument(session.document, session.activeCulture);
              session.resolved = payload.resolved;
              session.activeCulture = payload.activeCulture;
              session.lastKnownDocument = payload.doc;
              session.lastParsedSource = payload.sourceText;
              session.lastParsedMetadata = payload.doc.metadata;
              session.acceptedSelfEditVersions = new Set<number>([session.document.version]);
              postMessage({
                type: 'documentUpdated',
                document: payload.doc,
                documentVersion: session.document.version,
                codeBehindHandlers: payload.codeBehindHandlers,
                resourceDataUris: payload.resourceDataUris,
                source: 'external',
                reason: isUndo ? 'undo' : 'redo',
                availableCultures: payload.availableCultures,
                activeCulture: payload.activeCulture,
                cultureStrings: payload.cultureStrings,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              void vscode.window.showErrorMessage(`WinForms Designer sync error: ${message}`);
            }
            return;
          }

          const currentText = event.document.getText();
          if (session.pendingSelfEdits.has(currentText)) {
            if (session.externalChangeTimer) {
              clearTimeout(session.externalChangeTimer);
              session.externalChangeTimer = undefined;
            }
            return;
          }
          // External change diverged from self-edits; invalidate prior self-edit version chain immediately
          session.acceptedSelfEditVersions = new Set<number>([event.document.version]);
          for (const cached of [...session.pendingSelfEdits]) {
            if ((session.inFlightSelfEdits.get(cached) ?? 0) === 0) {
              session.pendingSelfEdits.delete(cached);
            }
          }
        }

        if (session.externalChangeTimer) {
          clearTimeout(session.externalChangeTimer);
        }

        session.externalChangeTimer = setTimeout(() => {
          session.externalChangeTimer = undefined;
          if (session.isDisposed) {
            return;
          }
          try {
            const payload = this.buildPayloadForDocument(session.document, session.activeCulture);
            session.resolved = payload.resolved;
            session.activeCulture = payload.activeCulture;
            session.lastKnownDocument = payload.doc;
            session.lastParsedSource = payload.sourceText;
            session.lastParsedMetadata = payload.doc.metadata;
            postMessage({
              type: 'documentUpdated',
              document: payload.doc,
              documentVersion: session.document.version,
              codeBehindHandlers: payload.codeBehindHandlers,
              resourceDataUris: payload.resourceDataUris,
              source: 'external',
              reason: 'external',
              availableCultures: payload.availableCultures,
              activeCulture: payload.activeCulture,
              cultureStrings: payload.cultureStrings,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            void vscode.window.showErrorMessage(`WinForms Designer sync error: ${message}`);
          }
        }, EXTERNAL_CHANGE_DEBOUNCE_MS);
      })
    );

    disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('winformsDesigner', session.document.uri)) {
          postMessage({
            type: 'settingsChanged',
            settings: getDesignerSettings(session.document.uri),
          });
        }
      })
    );

    disposables.push(
      vscode.window.onDidChangeActiveColorTheme((theme) => {
        postMessage({
          type: 'themeChanged',
          themeKind: getThemeKind(theme),
        });
      })
    );

    webviewPanel.onDidDispose(() => {
      session.isDisposed = true;
      if (session.externalChangeTimer) {
        clearTimeout(session.externalChangeTimer);
        session.externalChangeTimer = undefined;
      }
      for (const timer of session.selfEditCleanupTimers) {
        clearTimeout(timer);
      }
      session.selfEditCleanupTimers.clear();
      session.pendingSelfEdits.clear();
      session.inFlightSelfEdits.clear();
      this.sessions.delete(sessionKey);
      if (
        this.lastActiveDesignerUri &&
        this.lastActiveDesignerUri.toString() === sessionKey
      ) {
        this.lastActiveDesignerUri = undefined;
        for (const remaining of this.sessions.values()) {
          if (!remaining.isDisposed) {
            this.lastActiveDesignerUri = remaining.document.uri;
            break;
          }
        }
      }
      for (const disposable of disposables) {
        disposable.dispose();
      }
      this.callbacks?.onActiveDesignerChanged?.(this.getActiveDesignerUri());
    });
  }

  public buildPayloadForDocument(
    document: vscode.TextDocument,
    requestedCulture = 'default'
  ): ParsedDocumentPayload {
    const resolved = resolveFormFiles(document.uri.fsPath);
    const sourceText = document.getText();
    const documentVersion = document.version;

    // Respect unsaved VS Code edits on sibling .resx buffers
    const resxRead = readFileOrOpenDocument(resolved.resxPath);
    const resxXml = resxRead.exists ? resxRead.text : undefined;

    const codeBehindRead = readFileOrOpenDocument(resolved.codeBehindPath);
    let baseType: 'Form' | 'UserControl' | undefined;
    let customBaseClass: string | undefined;
    let codeBehindHandlers: CodeBehindMethod[] = [];

    if (codeBehindRead.exists && codeBehindRead.text !== undefined) {
      try {
        const info = this.core.parseCodeBehind(codeBehindRead.text);
        if (info.baseType === 'UserControl') {
          baseType = 'UserControl';
        } else if (info.baseType === 'Form') {
          baseType = 'Form';
        } else if (
          info.baseType &&
          !NON_CUSTOM_BASE_CLASS_NAMES.has(info.baseType) &&
          validateCSharpIdentifier(info.baseType) === undefined
        ) {
          customBaseClass = info.baseType;
        }
        codeBehindHandlers = info.methods;
      } catch {
        // Keep designer usable even if code-behind has syntax errors
        codeBehindHandlers = [];
      }
    }

    const doc = this.core.parseDesignerCs(sourceText, {
      baseType,
      customBaseClass,
      resxXml,
    });
    if (doc.metadata) {
      doc.metadata.documentVersion = documentVersion;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder?.(document.uri);
    const projectCtx = detectProjectContext(
      resolved.directory,
      workspaceFolder?.uri.fsPath
    );
    const allowedRoots: string[] = [resolved.directory];
    if (projectCtx.projectDir) {
      allowedRoots.push(projectCtx.projectDir);
    }
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme === 'file') {
        allowedRoots.push(folder.uri.fsPath);
      }
    }

    const resourceDataUris = resolveResourceDataUris(
      doc.resources ?? {},
      path.dirname(resolved.resxPath),
      allowedRoots
    );

    // Static Inherited Form resolution when customBaseClass is present
    if (doc.customBaseClass) {
      this.resolveInheritedBaseForms(doc, resolved, allowedRoots, resourceDataUris);
    }

    // Resolve `Properties.Resources.<Key>` references from project-level Properties/Resources.resx
    const projectResourceKeys = collectProjectResourceKeys(doc);
    if (projectResourceKeys.size > 0) {
      const searchBase = projectCtx.projectDir ?? resolved.directory;
      const projectResxPath = findProjectResourcesResx(searchBase, allowedRoots);
      if (projectResxPath) {
        try {
          const projectResxRead = readFileOrOpenDocument(projectResxPath);
          const projectResxXml = projectResxRead.text ?? '';
          const projectResources = this.core.parseResx(projectResxXml);
          const projectResxDir = path.dirname(projectResxPath);

          for (const key of projectResourceKeys) {
            let entry: ResourceEntry | undefined = projectResources[key];
            if (!entry) {
              const lowerKey = key.toLowerCase();
              const matchedKey = Object.keys(projectResources).find(
                (k) => k.toLowerCase() === lowerKey
              );
              if (matchedKey) {
                entry = projectResources[matchedKey];
              }
            }
            if (!entry) continue;
            const uri = resolveSingleResourceDataUri(entry, projectResxDir, allowedRoots);
            if (uri) {
              resourceDataUris[`Properties.Resources.${key}`] = uri;
              if (!(key in resourceDataUris)) {
                resourceDataUris[key] = uri;
              }
            }
          }
        } catch {
          // Ignore unreadable/malformed project Resources.resx
        }
      }
    }

    // Culture-specific .resx discovery & localization state
    const cultureState = this.resolveCultureState(resolved, requestedCulture);
    doc.localizable = Boolean(
      doc.form.properties.Localizable === true ||
        cultureState.availableCultures.length > 1 ||
        (doc.metadata.usesComponentResourceManager && Object.keys(doc.resources ?? {}).length > 0)
    );

    return {
      doc,
      resolved,
      hasCodeBehind: codeBehindRead.exists,
      codeBehindHandlers,
      resourceDataUris,
      hasProject: Boolean(projectCtx.csprojPath),
      availableCultures: cultureState.availableCultures,
      activeCulture: cultureState.activeCulture,
      cultureStrings: cultureState.cultureStrings,
      sourceText,
      documentVersion,
    };
  }

  private async handleWebviewMessage(
    session: SessionState,
    msg: WebviewToHostMessage,
    postMessage: (msg: HostToWebviewMessage) => void
  ): Promise<void> {
    try {
      switch (msg.type) {
        case 'ready': {
          const payload = this.buildPayloadForDocument(session.document, session.activeCulture);
          session.resolved = payload.resolved;
          session.activeCulture = payload.activeCulture;
          session.lastKnownDocument = payload.doc;
          session.lastParsedSource = payload.sourceText;
          session.lastParsedMetadata = payload.doc.metadata;
          session.acceptedSelfEditVersions = new Set<number>([payload.documentVersion]);

          postMessage({
            type: 'init',
            document: payload.doc,
            documentVersion: payload.documentVersion,
            settings: getDesignerSettings(session.document.uri),
            fileName: path.basename(session.document.uri.fsPath),
            codeBehindFileName: path.basename(payload.resolved.codeBehindPath),
            hasCodeBehind: payload.hasCodeBehind,
            codeBehindHandlers: payload.codeBehindHandlers,
            themeKind: getThemeKind(vscode.window.activeColorTheme),
            resourceDataUris: payload.resourceDataUris,
            hasProject: payload.hasProject,
            availableCultures: payload.availableCultures,
            activeCulture: payload.activeCulture,
            cultureStrings: payload.cultureStrings,
          });

          if (!payload.doc.metadata?.readOnlyReason) {
            const extVersion = (
              this.context.extension?.packageJSON as { version?: string } | undefined
            )?.version;
            void this.starPrompt.recordSessionOpen(extVersion);
          }
          break;
        }

        case 'applyDocument': {
          session.applyChain = session.applyChain
            .then(() => this.applyDocumentEdit(session, msg, postMessage))
            .catch((err) => {
              const errorMessage = err instanceof Error ? err.message : String(err);
              postMessage({
                type: 'applyAck',
                revision: msg.revision ?? 0,
                documentVersion: session.document.version,
                accepted: false,
                reason: errorMessage,
              });
              void vscode.window.showErrorMessage(`WinForms Designer error: ${errorMessage}`);
            });
          await session.applyChain;
          break;
        }

        case 'navigateToEvent': {
          await this.handleNavigateToEvent(session, msg, postMessage);
          break;
        }

        case 'viewCode': {
          await this.openCodeBehindForUri(session.document.uri, Boolean(msg.beside));
          break;
        }

        case 'viewDesignerCode': {
          await this.openDesignerCodeForUri(
            session.document.uri,
            msg.beside !== undefined ? msg.beside : true
          );
          break;
        }

        case 'pickImage': {
          await this.handlePickImage(session, msg, postMessage);
          break;
        }

        case 'clearImage': {
          this.handleClearImage(session, msg);
          break;
        }

        case 'showMessage': {
          if (msg.level === 'error') {
            void vscode.window.showErrorMessage(msg.message);
          } else if (msg.level === 'warning') {
            void vscode.window.showWarningMessage(msg.message);
          } else {
            void vscode.window.showInformationMessage(msg.message);
          }
          break;
        }

        case 'updateSetting': {
          await updateDesignerSetting(msg.key, msg.value, session.document.uri);
          break;
        }

        case 'starPromptAction': {
          await this.starPrompt.handleAction(msg.action);
          break;
        }

        case 'switchCulture': {
          this.handleSwitchCulture(session, msg, postMessage);
          break;
        }

        case 'addCulture': {
          session.cultureWriteChain = session.cultureWriteChain
            .then(() => this.handleAddCulture(session, msg, postMessage))
            .catch((err) => {
              const errorMessage = err instanceof Error ? err.message : String(err);
              void vscode.window.showErrorMessage(`WinForms Designer error: ${errorMessage}`);
            });
          await session.cultureWriteChain;
          break;
        }

        case 'setCultureValue': {
          session.cultureWriteChain = session.cultureWriteChain
            .then(() => this.handleSetCultureValue(session, msg, postMessage))
            .catch((err) => {
              const errorMessage = err instanceof Error ? err.message : String(err);
              void vscode.window.showErrorMessage(`WinForms Designer error: ${errorMessage}`);
            });
          await session.cultureWriteChain;
          break;
        }

        case 'runProjectAction': {
          if (this.callbacks?.runProjectAction) {
            await this.callbacks.runProjectAction(msg.action, session.document.uri);
          } else {
            const cmd = msg.action === 'run' ? 'winforms.runApp' : 'winforms.buildApp';
            await vscode.commands.executeCommand(cmd, session.document.uri);
          }
          break;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`WinForms Designer error: ${errorMessage}`);
    }
  }

  private async applyDocumentEdit(
    session: SessionState,
    msg: Extract<WebviewToHostMessage, { type: 'applyDocument' }>,
    postMessage: (msg: HostToWebviewMessage) => void
  ): Promise<void> {
    if (session.isDisposed) {
      return;
    }

    const revision = msg.revision ?? 0;
    const nextDocument = msg.document;

    // 1. Check read-only guard before doing anything
    const existingReadOnlyReason =
      session.lastParsedMetadata?.readOnlyReason || nextDocument.metadata?.readOnlyReason;
    if (existingReadOnlyReason) {
      postMessage({
        type: 'applyAck',
        revision,
        documentVersion: session.document.version,
        accepted: false,
        reason: existingReadOnlyReason,
      });
      void vscode.window.showWarningMessage(existingReadOnlyReason);
      return;
    }

    // 2. Conflict / stale document version detection
    // Allow rapid sequential webview edits sent with the same baseDocumentVersion before prior applyAcks arrive,
    // while strictly rejecting any edit when an external change has bumped document.version.
    const isCompatibleVersion =
      msg.baseDocumentVersion === undefined ||
      (session.acceptedSelfEditVersions.has(session.document.version) &&
        session.acceptedSelfEditVersions.has(msg.baseDocumentVersion));
    if (!isCompatibleVersion) {
      postMessage({
        type: 'applyAck',
        revision,
        documentVersion: session.document.version,
        accepted: false,
        reason: 'conflict',
      });
      try {
        const payload = this.buildPayloadForDocument(session.document, session.activeCulture);
        session.resolved = payload.resolved;
        session.activeCulture = payload.activeCulture;
        session.lastKnownDocument = payload.doc;
        session.lastParsedSource = payload.sourceText;
        session.lastParsedMetadata = payload.doc.metadata;
        session.acceptedSelfEditVersions = new Set<number>([payload.documentVersion]);
        postMessage({
          type: 'documentUpdated',
          document: payload.doc,
          documentVersion: payload.documentVersion,
          codeBehindHandlers: payload.codeBehindHandlers,
          resourceDataUris: payload.resourceDataUris,
          source: 'external',
          reason: 'conflict',
          availableCultures: payload.availableCultures,
          activeCulture: payload.activeCulture,
          cultureStrings: payload.cultureStrings,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`WinForms Designer sync error: ${message}`);
      }
      return;
    }

    // 3. Ensure host holds fresh trusted metadata spans for current buffer text
    const currentText = session.document.getText();
    if (!session.lastParsedMetadata || session.lastParsedSource !== currentText) {
      const freshPayload = this.buildPayloadForDocument(session.document);
      session.resolved = freshPayload.resolved;
      session.lastParsedSource = freshPayload.sourceText;
      session.lastParsedMetadata = freshPayload.doc.metadata;
      if (freshPayload.doc.metadata?.readOnlyReason) {
        postMessage({
          type: 'applyAck',
          revision,
          documentVersion: session.document.version,
          accepted: false,
          reason: freshPayload.doc.metadata.readOnlyReason,
        });
        void vscode.window.showWarningMessage(freshPayload.doc.metadata.readOnlyReason);
        return;
      }
    }

    // Always splice host-owned trusted metadata spans so webview can never supply stale offsets
    const trustedMeta = session.lastParsedMetadata;
    const mergedMetadata: DocumentStyleMetadata = trustedMeta
      ? {
          ...nextDocument.metadata,
          originalSource: trustedMeta.originalSource,
          initializeComponentRange: trustedMeta.initializeComponentRange,
          fieldsRegionRange: trustedMeta.fieldsRegionRange,
          fieldSpans: trustedMeta.fieldSpans,
          fieldInsertOffset: trustedMeta.fieldInsertOffset,
          existingFieldDeclarations: trustedMeta.existingFieldDeclarations,
          readOnlyReason: trustedMeta.readOnlyReason,
          documentVersion: session.document.version,
        }
      : {
          ...nextDocument.metadata,
          documentVersion: session.document.version,
        };

    const docToGenerate: DesignDocument = {
      ...nextDocument,
      metadata: mergedMetadata,
    };

    const settings = getDesignerSettings(session.document.uri);
    const generatedSource = this.core.generateDesignerCs(docToGenerate, {
      useThisQualifier: settings.useThisQualifier,
      eventHandlerStyle: settings.eventHandlerStyle,
    });

    if (generatedSource === currentText) {
      session.lastKnownDocument = docToGenerate;
      postMessage({
        type: 'applyAck',
        revision,
        documentVersion: session.document.version,
        accepted: true,
      });
      return;
    }

    session.pendingSelfEdits.add(generatedSource);
    session.inFlightSelfEdits.set(
      generatedSource,
      (session.inFlightSelfEdits.get(generatedSource) ?? 0) + 1
    );
    if (session.externalChangeTimer) {
      clearTimeout(session.externalChangeTimer);
      session.externalChangeTimer = undefined;
    }
    session.lastKnownDocument = docToGenerate;

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      session.document.positionAt(0),
      session.document.positionAt(currentText.length)
    );
    edit.replace(session.document.uri, fullRange, generatedSource);

    let applied = false;
    try {
      applied = await vscode.workspace.applyEdit(edit);
    } finally {
      const remaining = (session.inFlightSelfEdits.get(generatedSource) ?? 1) - 1;
      if (remaining <= 0) {
        session.inFlightSelfEdits.delete(generatedSource);
      } else {
        session.inFlightSelfEdits.set(generatedSource, remaining);
      }

      if (!applied) {
        if (!session.inFlightSelfEdits.has(generatedSource)) {
          session.pendingSelfEdits.delete(generatedSource);
        }
      } else if (!session.isDisposed) {
        const cleanupTimer = setTimeout(() => {
          session.selfEditCleanupTimers.delete(cleanupTimer);
          if (!session.inFlightSelfEdits.has(generatedSource)) {
            session.pendingSelfEdits.delete(generatedSource);
          }
        }, SELF_EDIT_GRACE_MS);
        cleanupTimer.unref?.();
        session.selfEditCleanupTimers.add(cleanupTimer);
      }
    }

    if (session.isDisposed) {
      return;
    }

    if (!applied) {
      postMessage({
        type: 'applyAck',
        revision,
        documentVersion: session.document.version,
        accepted: false,
        reason: 'rejected',
      });
      try {
        const payload = this.buildPayloadForDocument(session.document, session.activeCulture);
        session.resolved = payload.resolved;
        session.activeCulture = payload.activeCulture;
        session.lastKnownDocument = payload.doc;
        session.lastParsedSource = payload.sourceText;
        session.lastParsedMetadata = payload.doc.metadata;
        postMessage({
          type: 'documentUpdated',
          document: payload.doc,
          documentVersion: payload.documentVersion,
          codeBehindHandlers: payload.codeBehindHandlers,
          resourceDataUris: payload.resourceDataUris,
          source: 'host',
          reason: 'rejected',
          availableCultures: payload.availableCultures,
          activeCulture: payload.activeCulture,
          cultureStrings: payload.cultureStrings,
        });
      } catch {
        // Ignore re-parse error on rollback
      }
      return;
    }

    // Refresh host's trusted metadata spans for the newly written text
    session.acceptedSelfEditVersions.add(session.document.version);
    try {
      const newText = session.document.getText();
      const reparsed = this.core.parseDesignerCs(newText, {
        baseType: docToGenerate.baseType,
      });
      if (reparsed.metadata) {
        reparsed.metadata.documentVersion = session.document.version;
      }
      session.lastParsedSource = newText;
      session.lastParsedMetadata = reparsed.metadata;
    } catch {
      session.lastParsedSource = undefined;
      session.lastParsedMetadata = undefined;
    }

    postMessage({
      type: 'applyAck',
      revision,
      documentVersion: session.document.version,
      accepted: true,
    });

    if (await this.starPrompt.recordSuccessfulEdit()) {
      postMessage({
        type: 'showStarPrompt',
        repoUrl: GITHUB_REPO_URL,
      });
    }
  }

  private async handleNavigateToEvent(
    session: SessionState,
    msg: Extract<WebviewToHostMessage, { type: 'navigateToEvent' }>,
    postMessage: (msg: HostToWebviewMessage) => void
  ): Promise<void> {
    const resolved = resolveFormFiles(session.document.uri.fsPath);
    session.resolved = resolved;

    const workspaceFolder = vscode.workspace.getWorkspaceFolder?.(session.document.uri);
    const projectCtx = detectProjectContext(
      resolved.directory,
      workspaceFolder?.uri.fsPath
    );

    const codeBehindRead = readFileOrOpenDocument(resolved.codeBehindPath);
    if (!codeBehindRead.exists) {
      if (!msg.createIfMissing) {
        void vscode.window.showWarningMessage(
          `Code-behind file "${path.basename(resolved.codeBehindPath)}" does not exist.`
        );
        return;
      }

      const knownDoc = session.lastKnownDocument;
      const targetNamespace =
        knownDoc?.namespaceName !== undefined
          ? knownDoc.namespaceName
          : projectCtx.namespaceName;
      const scaffolded = this.core.scaffoldFormFiles({
        className: knownDoc?.className || resolved.baseName,
        namespaceName: targetNamespace,
        baseType: knownDoc?.baseType || 'Form',
        fileScopedNamespace:
          targetNamespace === ''
            ? false
            : (knownDoc?.fileScopedNamespace ?? projectCtx.fileScopedNamespace),
        nullable: projectCtx.nullable,
        eol: knownDoc?.metadata?.eol,
      });

      fs.writeFileSync(resolved.codeBehindPath, scaffolded.codeBehind, 'utf8');
    }

    const codeBehindUri = vscode.Uri.file(resolved.codeBehindPath);
    const codeBehindDoc = await vscode.workspace.openTextDocument(codeBehindUri);
    const currentSource = codeBehindDoc.getText();

    const result = this.core.ensureEventHandlerInCodeBehind(currentSource, {
      controlType: msg.controlType,
      eventName: msg.eventName,
      methodName: msg.methodName,
      nullable: projectCtx.nullable,
      className: session.lastKnownDocument?.className || resolved.baseName,
    });

    if (result.created && result.updatedSource !== currentSource) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        codeBehindDoc.positionAt(0),
        codeBehindDoc.positionAt(currentSource.length)
      );
      edit.replace(codeBehindDoc.uri, fullRange, result.updatedSource);
      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        const errorText = 'Failed to edit code-behind file.';
        void vscode.window.showErrorMessage(errorText);
        let existingHandlers: CodeBehindMethod[] = [];
        try {
          existingHandlers = this.core.parseCodeBehind(codeBehindDoc.getText()).methods;
        } catch {
          existingHandlers = [];
        }
        postMessage({
          type: 'eventHandlerReady',
          nodeId: msg.nodeId,
          eventName: msg.eventName,
          methodName: msg.methodName,
          codeBehindHandlers: existingHandlers,
          success: false,
          error: errorText,
        });
        return;
      }
    }

    const editor = await vscode.window.showTextDocument(codeBehindDoc, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
    });

    const maxLine = Math.max(0, codeBehindDoc.lineCount - 1);
    const targetLine = Math.max(0, Math.min(result.line - 1, maxLine));
    const targetCol = Math.max(0, result.column - 1);
    const position = new vscode.Position(targetLine, targetCol);
    const range = new vscode.Range(position, position);

    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

    let refreshedHandlers: CodeBehindMethod[] = [];
    try {
      const parsedInfo = this.core.parseCodeBehind(codeBehindDoc.getText());
      refreshedHandlers = parsedInfo.methods;
    } catch {
      refreshedHandlers = [];
    }

    postMessage({
      type: 'eventHandlerReady',
      nodeId: msg.nodeId,
      eventName: msg.eventName,
      methodName: msg.methodName,
      codeBehindHandlers: refreshedHandlers,
      success: true,
    });
  }

  private async handlePickImage(
    session: SessionState,
    msg: Extract<WebviewToHostMessage, { type: 'pickImage' }>,
    postMessage: (msg: HostToWebviewMessage) => void
  ): Promise<void> {
    try {
      const filters: Record<string, string[]> = msg.acceptIcon
        ? { Icons: ['ico', 'png'] }
        : { Images: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'ico'] };

      const selected = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: msg.acceptIcon ? 'Select Icon' : 'Select Image',
        filters,
      });

      if (!selected || selected.length === 0) {
        postMessage({
          type: 'imagePicked',
          requestId: msg.requestId,
          cancelled: true,
        });
        return;
      }

      const selectedPath = selected[0].fsPath;
      const resolved = resolveFormFiles(session.document.uri.fsPath);
      session.resolved = resolved;
      const resxDir = path.dirname(resolved.resxPath);

      const rawRelative = path.relative(resxDir, selectedPath);
      const isOutsideFormDir =
        rawRelative.startsWith('..') || path.isAbsolute(rawRelative);

      const finalAssetPath = isOutsideFormDir
        ? copyImageIntoResourcesFolder(selectedPath, resxDir)
        : selectedPath;

      const relPath = path.relative(resxDir, finalAssetPath).replace(/\\/g, '/');
      const ext = path.extname(finalAssetPath).toLowerCase();
      const assetType: 'Bitmap' | 'Icon' =
        msg.acceptIcon || ext === '.ico' ? 'Icon' : 'Bitmap';

      const isRootForm =
        msg.controlName === '$this' ||
        (session.lastKnownDocument !== undefined &&
          msg.controlName === session.lastKnownDocument.form.name);
      const resourceName = isRootForm
        ? `$this.${msg.propertyName}`
        : `${msg.controlName}.${msg.propertyName}`;

      // Respect unsaved edits if the sibling .resx file is open in VS Code
      const resxRead = readFileOrOpenDocument(resolved.resxPath);
      const existingResxXml = resxRead.exists ? (resxRead.text ?? null) : null;

      const updatedResxXml = this.core.updateResxResource(existingResxXml, {
        name: resourceName,
        kind: 'fileRef',
        value: relPath,
        assetType,
      });

      const openResxDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.scheme === 'file' && sameFilePath(d.uri.fsPath, resolved.resxPath)
      );
      if (openResxDoc) {
        const resxEdit = new vscode.WorkspaceEdit();
        const curResxText = openResxDoc.getText();
        resxEdit.replace(
          openResxDoc.uri,
          new vscode.Range(
            openResxDoc.positionAt(0),
            openResxDoc.positionAt(curResxText.length)
          ),
          updatedResxXml
        );
        const resxApplied = await vscode.workspace.applyEdit(resxEdit);
        if (!resxApplied) {
          throw new Error('Failed to apply update to open .resx document.');
        }
      } else {
        fs.writeFileSync(resolved.resxPath, updatedResxXml, 'utf8');
      }

      const assetBytes = fs.readFileSync(finalAssetPath);
      const mime = inferMimeFromExtension(finalAssetPath);
      const dataUri = `data:${mime};base64,${assetBytes.toString('base64')}`;

      postMessage({
        type: 'imagePicked',
        requestId: msg.requestId,
        resource: {
          kind: 'resource',
          resourceName,
          resourceType: assetType === 'Icon' ? 'Icon' : 'Image',
          relativePath: relPath,
        },
        dataUri,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      postMessage({
        type: 'imagePicked',
        requestId: msg.requestId,
        error: errorMessage,
      });
    }
  }

  private handleClearImage(
    _session: SessionState,
    _msg: Extract<WebviewToHostMessage, { type: 'clearImage' }>
  ): void {
    // Intentionally preserve .resx entries while the designer session is active so
    // Undo always restores the image cleanly and shared references never break.
  }

  private resolveInheritedBaseForms(
    doc: DesignDocument,
    resolved: ResolvedFormFiles,
    allowedRoots: string[],
    resourceDataUris: Record<string, string>
  ): void {
    const visitedClasses = new Set<string>([doc.className.toLowerCase()]);
    const visitedPaths = new Set<string>();
    try {
      visitedPaths.add(fs.realpathSync(resolved.designerPath));
    } catch {
      visitedPaths.add(path.resolve(resolved.designerPath));
    }

    const chain: Array<{ baseClassName: string; baseDoc: DesignDocument; baseResolved: ResolvedFormFiles }> = [];
    let currentBaseName: string | undefined = doc.customBaseClass;

    while (currentBaseName && chain.length < MAX_INHERITANCE_DEPTH) {
      const lowerName = currentBaseName.toLowerCase();
      if (visitedClasses.has(lowerName)) {
        break;
      }
      visitedClasses.add(lowerName);

      const baseDesignerPath = findBaseDesignerFile(currentBaseName, allowedRoots, allowedRoots, 5);
      if (!baseDesignerPath) {
        break;
      }
      if (visitedPaths.has(baseDesignerPath)) {
        break;
      }
      visitedPaths.add(baseDesignerPath);

      const baseRead = readFileOrOpenDocument(baseDesignerPath);
      if (!baseRead.exists || baseRead.text === undefined) {
        break;
      }

      const baseResolved = resolveFormFiles(baseDesignerPath);
      const baseResxRead = isConfinedNonSymlinkPath(baseResolved.resxPath, allowedRoots, false)
        ? readFileOrOpenDocument(baseResolved.resxPath)
        : { exists: false, text: undefined };
      const baseResxXml = baseResxRead.exists ? baseResxRead.text : undefined;
      const baseCbRead = isConfinedNonSymlinkPath(baseResolved.codeBehindPath, allowedRoots, false)
        ? readFileOrOpenDocument(baseResolved.codeBehindPath)
        : { exists: false, text: undefined };

      let nextBaseType: 'Form' | 'UserControl' | undefined;
      let nextCustomBase: string | undefined;
      if (baseCbRead.exists && baseCbRead.text !== undefined) {
        try {
          const info = this.core.parseCodeBehind(baseCbRead.text);
          if (info.baseType === 'UserControl') {
            nextBaseType = 'UserControl';
          } else if (info.baseType === 'Form') {
            nextBaseType = 'Form';
          } else if (
            info.baseType &&
            !NON_CUSTOM_BASE_CLASS_NAMES.has(info.baseType) &&
            validateCSharpIdentifier(info.baseType) === undefined
          ) {
            nextCustomBase = info.baseType;
          }
        } catch {
          // Ignore malformed base code-behind
        }
      }

      try {
        const baseDoc = this.core.parseDesignerCs(baseRead.text, {
          baseType: nextBaseType,
          customBaseClass: nextCustomBase,
          resxXml: baseResxXml,
        });
        chain.push({ baseClassName: currentBaseName, baseDoc, baseResolved });
        currentBaseName = baseDoc.customBaseClass;
      } catch {
        break;
      }
    }

    if (chain.length === 0) {
      return;
    }

    // Propagate UserControl baseType if the resolved inheritance chain terminates at UserControl
    const rootAncestor = chain[chain.length - 1];
    if (rootAncestor.baseDoc.baseType === 'UserControl') {
      doc.baseType = 'UserControl';
      doc.form.type = 'UserControl';
      doc.form.fullTypeName = 'System.Windows.Forms.UserControl';
    }

    // Collect existing names on derived form (including strip items and columns) so inherited items never collide
    const existingNames = new Set<string>();
    const collectStripNames = (items?: StripItemNode[]): void => {
      if (!items) return;
      for (const item of items) {
        existingNames.add(item.name);
        collectStripNames(item.dropDownItems);
      }
    };
    const collectNodeNames = (node: DesignNode): void => {
      existingNames.add(node.name);
      collectStripNames(node.stripItems);
      node.columns?.forEach((c) => existingNames.add(c.name));
      node.listViewColumns?.forEach((c) => existingNames.add(c.name));
      for (const child of node.children) {
        collectNodeNames(child);
      }
    };
    for (const child of doc.form.children) {
      collectNodeNames(child);
    }
    for (const comp of doc.components) {
      collectNodeNames(comp);
    }

    const markNodeInherited = (node: DesignNode, fromClass: string): DesignNode => {
      const cloned: DesignNode = {
        ...structuredClone(node),
        inherited: true,
        inheritedFrom: fromClass,
        children: node.children
          .filter((c) => !existingNames.has(c.name))
          .map((c) => markNodeInherited(c, fromClass)),
      };
      existingNames.add(cloned.name);
      return cloned;
    };

    const inheritedChildren: DesignNode[] = [];
    const inheritedComponents: DesignNode[] = [];

    // Walk from furthest ancestor to immediate base so base controls are prepended in inheritance order
    for (let i = chain.length - 1; i >= 0; i--) {
      const { baseClassName, baseDoc, baseResolved } = chain[i];
      for (const child of baseDoc.form.children) {
        if (!existingNames.has(child.name)) {
          inheritedChildren.push(markNodeInherited(child, baseClassName));
        }
      }
      for (const comp of baseDoc.components) {
        if (!existingNames.has(comp.name)) {
          inheritedComponents.push(markNodeInherited(comp, baseClassName));
        }
      }

      // Resolve any inherited form image/icon resources for canvas preview
      const baseResUris = resolveResourceDataUris(
        baseDoc.resources ?? {},
        path.dirname(baseResolved.resxPath),
        allowedRoots
      );
      for (const [key, uri] of Object.entries(baseResUris)) {
        if (!(key in resourceDataUris)) {
          resourceDataUris[key] = uri;
        }
      }
    }

    if (inheritedChildren.length > 0) {
      doc.form.children = [...inheritedChildren, ...doc.form.children];
    }
    if (inheritedComponents.length > 0) {
      doc.components = [...inheritedComponents, ...doc.components];
    }

    // Inherit base visual defaults (ClientSize, BackColor, Font, and Size for UserControl) ONLY if unset on derived.
    // Record them in inheritedDefaultProperties so saving unrelated edits never turns base defaults into overrides.
    const inheritedVisualProps =
      doc.baseType === 'UserControl'
        ? ['Size', 'ClientSize', 'BackColor', 'Font']
        : ['ClientSize', 'BackColor', 'Font'];
    const inheritedDefaults: Record<string, PropertyValue> = {};
    for (const { baseDoc } of chain) {
      for (const prop of inheritedVisualProps) {
        if (
          !(prop in doc.form.properties) &&
          baseDoc.form.properties[prop] !== undefined
        ) {
          const clonedVal = structuredClone(baseDoc.form.properties[prop]);
          doc.form.properties[prop] = clonedVal;
          inheritedDefaults[prop] = structuredClone(clonedVal);
        }
      }
    }
    if (Object.keys(inheritedDefaults).length > 0) {
      doc.form.inheritedDefaultProperties = inheritedDefaults;
    }
  }

  private extractCultureStrings(resxPath: string): Record<string, string> {
    const read = readFileOrOpenDocument(resxPath);
    if (!read.exists || !read.text) {
      return {};
    }
    try {
      const parsed = this.core.parseResx(read.text);
      const result: Record<string, string> = {};
      for (const [name, entry] of Object.entries(parsed)) {
        if (entry.kind === 'string') {
          result[name] = entry.value;
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  private resolveCultureState(
    resolved: ResolvedFormFiles,
    requestedCulture: string
  ): {
    availableCultures: string[];
    activeCulture: string;
    cultureStrings: Record<string, string>;
    cultureMap: Record<string, string>;
  } {
    const cultureMap = findCultureResxFiles(resolved.directory, resolved.baseName);
    const sortedCultures = Object.keys(cultureMap).sort((a, b) => a.localeCompare(b));
    const availableCultures = ['default', ...sortedCultures];

    let activeCulture = 'default';
    if (requestedCulture && requestedCulture !== 'default') {
      if (requestedCulture in cultureMap) {
        activeCulture = requestedCulture;
      } else {
        const lowerReq = requestedCulture.toLowerCase();
        const matched = sortedCultures.find((c) => c.toLowerCase() === lowerReq);
        if (matched) {
          activeCulture = matched;
        }
      }
    }

    const resxPath =
      activeCulture === 'default' ? resolved.resxPath : cultureMap[activeCulture];
    const cultureStrings = resxPath ? this.extractCultureStrings(resxPath) : {};

    return {
      availableCultures,
      activeCulture,
      cultureStrings,
      cultureMap,
    };
  }

  private handleSwitchCulture(
    session: SessionState,
    msg: Extract<WebviewToHostMessage, { type: 'switchCulture' }>,
    postMessage: (msg: HostToWebviewMessage) => void
  ): void {
    const requested = typeof msg.culture === 'string' ? msg.culture.trim() : '';
    if (requested !== 'default' && !isValidCultureTag(requested)) {
      void vscode.window.showWarningMessage(`Invalid culture tag "${msg.culture}".`);
      return;
    }

    session.resolved = resolveFormFiles(session.document.uri.fsPath);
    const state = this.resolveCultureState(session.resolved, requested);
    session.activeCulture = state.activeCulture;

    postMessage({
      type: 'cultureChanged',
      activeCulture: state.activeCulture,
      availableCultures: state.availableCultures,
      cultureStrings: state.cultureStrings,
    });
  }

  private handleAddCulture(
    session: SessionState,
    msg: Extract<WebviewToHostMessage, { type: 'addCulture' }>,
    postMessage: (msg: HostToWebviewMessage) => void
  ): void {
    const culture = typeof msg.culture === 'string' ? msg.culture.trim() : '';
    if (!isValidCultureTag(culture)) {
      void vscode.window.showWarningMessage(
        `Invalid culture tag "${msg.culture}". Expected a BCP-47 tag such as "de", "fr-FR", or "zh-Hans".`
      );
      return;
    }

    session.resolved = resolveFormFiles(session.document.uri.fsPath);
    const existingMap = findCultureResxFiles(session.resolved.directory, session.resolved.baseName);
    const lowerCulture = culture.toLowerCase();
    const existingKey = Object.keys(existingMap).find((k) => k.toLowerCase() === lowerCulture);

    let effectiveCulture = existingKey ?? culture;
    if (!existingKey) {
      const targetPath = path.join(
        session.resolved.directory,
        `${session.resolved.baseName}.${culture}.resx`
      );
      if (!isConfinedNonSymlinkPath(targetPath, [session.resolved.directory], true)) {
        void vscode.window.showWarningMessage(
          `Refusing to write culture file "${path.basename(targetPath)}" outside the form directory or through a symbolic link.`
        );
        return;
      }

      if (!fs.existsSync(targetPath)) {
        const eol = session.lastParsedMetadata?.eol ?? '\r\n';
        try {
          fs.writeFileSync(targetPath, this.core.createEmptyResx(eol), {
            encoding: 'utf8',
            flag: 'wx',
          });
        } catch (err) {
          if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') {
            throw err;
          }
        }
      }
      effectiveCulture = culture;
    }

    const state = this.resolveCultureState(session.resolved, effectiveCulture);
    session.activeCulture = state.activeCulture;

    postMessage({
      type: 'cultureChanged',
      activeCulture: state.activeCulture,
      availableCultures: state.availableCultures,
      cultureStrings: state.cultureStrings,
    });
  }

  private async writeResxEntryConfined(
    targetPath: string,
    allowedDir: string,
    key: string,
    value: string
  ): Promise<boolean> {
    if (!isConfinedNonSymlinkPath(targetPath, [allowedDir], true)) {
      throw new Error(
        `Refusing to write "${path.basename(targetPath)}" outside the form directory or through a symbolic link.`
      );
    }

    const resxRead = readFileOrOpenDocument(targetPath);
    const existingXml = resxRead.exists ? (resxRead.text ?? null) : null;
    const updatedXml = this.core.updateResxResource(existingXml, {
      name: key,
      kind: 'string',
      value,
    });

    const openResxDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.scheme === 'file' && sameFilePath(d.uri.fsPath, targetPath)
    );
    if (openResxDoc) {
      const resxEdit = new vscode.WorkspaceEdit();
      const curText = openResxDoc.getText();
      resxEdit.replace(
        openResxDoc.uri,
        new vscode.Range(openResxDoc.positionAt(0), openResxDoc.positionAt(curText.length)),
        updatedXml
      );
      return await vscode.workspace.applyEdit(resxEdit);
    }

    if (fs.existsSync(targetPath)) {
      if (!isConfinedNonSymlinkPath(targetPath, [allowedDir], false)) {
        throw new Error(
          `Refusing to overwrite symbolic link "${path.basename(targetPath)}".`
        );
      }
      fs.writeFileSync(targetPath, updatedXml, 'utf8');
      return true;
    }

    try {
      fs.writeFileSync(targetPath, updatedXml, { encoding: 'utf8', flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
        if (!isConfinedNonSymlinkPath(targetPath, [allowedDir], false)) {
          throw new Error(
            `Refusing to overwrite symbolic link "${path.basename(targetPath)}".`
          );
        }
        fs.writeFileSync(targetPath, updatedXml, 'utf8');
      } else {
        throw err;
      }
    }
    return true;
  }

  /**
   * Ensures a localized Text key actually takes effect at .NET runtime:
   * seeds the neutral `<Form>.resx` with the control's default Text if missing, and
   * converts a plain literal `Text` assignment in `.Designer.cs` to `resources.GetString(key)`.
   */
  private async ensureRuntimeResourceLookupForTextKey(
    session: SessionState,
    key: string,
    postMessage: (msg: HostToWebviewMessage) => void
  ): Promise<void> {
    if (!key.endsWith('.Text')) {
      return;
    }
    const baseDoc = session.lastKnownDocument;
    if (!baseDoc || baseDoc.metadata?.readOnlyReason) {
      return;
    }

    const ownerName = key.slice(0, -'.Text'.length);
    let targetNode: DesignNode | undefined;
    if (ownerName === '$this') {
      targetNode = baseDoc.form;
    } else {
      const walk = (n: DesignNode): DesignNode | undefined => {
        if (n.name === ownerName && !n.inherited) return n;
        for (const c of n.children) {
          const found = walk(c);
          if (found) return found;
        }
        return undefined;
      };
      targetNode = walk(baseDoc.form);
    }

    if (!targetNode || typeof targetNode.properties.Text !== 'string') {
      return;
    }

    // If the node already uses ComponentResourceManager.ApplyResources(...), runtime already reads .resx
    const hasApplyResources = (targetNode.rawStatements ?? []).some((s) =>
      /\bApplyResources\s*\(/.test(s)
    );
    if (hasApplyResources) {
      return;
    }

    const neutralText = targetNode.properties.Text;
    const neutralResxPath = session.resolved.resxPath;
    if (!isConfinedNonSymlinkPath(neutralResxPath, [session.resolved.directory], true)) {
      return;
    }

    // Seed neutral .resx if the key is not already stored there
    const neutralRead = readFileOrOpenDocument(neutralResxPath);
    const neutralEntries =
      neutralRead.exists && neutralRead.text ? this.core.parseResx(neutralRead.text) : {};
    if (!neutralEntries[key]) {
      const seeded = await this.writeResxEntryConfined(
        neutralResxPath,
        session.resolved.directory,
        key,
        neutralText
      );
      if (!seeded) {
        return;
      }
    }

    // Update the node's Text property in .Designer.cs to a String ResourceValue so generator emits resources.GetString(...)
    const nextDoc = structuredClone(baseDoc);
    let nextTarget: DesignNode | undefined;
    if (ownerName === '$this') {
      nextTarget = nextDoc.form;
    } else {
      const walkNext = (n: DesignNode): DesignNode | undefined => {
        if (n.name === ownerName && !n.inherited) return n;
        for (const c of n.children) {
          const found = walkNext(c);
          if (found) return found;
        }
        return undefined;
      };
      nextTarget = walkNext(nextDoc.form);
    }
    if (!nextTarget || typeof nextTarget.properties.Text !== 'string') {
      return;
    }

    nextTarget.properties.Text = {
      kind: 'resource',
      resourceName: key,
      resourceType: 'String',
    };
    if (nextTarget.rawPropertyExpressions) {
      delete nextTarget.rawPropertyExpressions.Text;
    }
    nextDoc.resources = {
      ...(nextDoc.resources ?? {}),
      [key]: { name: key, kind: 'string', value: neutralText },
    };

    session.applyChain = session.applyChain
      .then(() =>
        this.applyDocumentEdit(
          session,
          {
            type: 'applyDocument',
            document: nextDoc,
            baseDocumentVersion: session.document.version,
            description: `Localize ${key}`,
          },
          postMessage
        )
      )
      .catch(() => {
        // Best-effort runtime wiring; culture .resx write already succeeded
      });
    await session.applyChain;
  }

  private async handleSetCultureValue(
    session: SessionState,
    msg: Extract<WebviewToHostMessage, { type: 'setCultureValue' }>,
    postMessage: (msg: HostToWebviewMessage) => void
  ): Promise<void> {
    const culture = typeof msg.culture === 'string' ? msg.culture.trim() : '';
    if (culture === 'default' || !isValidCultureTag(culture)) {
      void vscode.window.showWarningMessage(
        `Cannot write localized value: invalid culture tag "${msg.culture}".`
      );
      return;
    }
    if (!msg.key || typeof msg.key !== 'string') {
      return;
    }

    session.resolved = resolveFormFiles(session.document.uri.fsPath);
    const existingMap = findCultureResxFiles(session.resolved.directory, session.resolved.baseName);
    const lowerCulture = culture.toLowerCase();
    const existingKey = Object.keys(existingMap).find((k) => k.toLowerCase() === lowerCulture);
    const effectiveCulture = existingKey ?? culture;

    const targetPath =
      (existingKey ? existingMap[existingKey] : undefined) ??
      path.join(session.resolved.directory, `${session.resolved.baseName}.${culture}.resx`);

    if (!isConfinedNonSymlinkPath(targetPath, [session.resolved.directory], true)) {
      void vscode.window.showWarningMessage(
        `Refusing to write localized resource "${path.basename(targetPath)}" outside the form directory or through a symbolic link.`
      );
      return;
    }

    const applied = await this.writeResxEntryConfined(
      targetPath,
      session.resolved.directory,
      msg.key,
      msg.value
    );

    if (applied) {
      await this.ensureRuntimeResourceLookupForTextKey(session, msg.key, postMessage);
    }

    const state = this.resolveCultureState(session.resolved, effectiveCulture);
    session.activeCulture = state.activeCulture;

    postMessage({
      type: 'cultureChanged',
      activeCulture: state.activeCulture,
      availableCultures: state.availableCultures,
      cultureStrings: state.cultureStrings,
    });

    if (!applied) {
      void vscode.window.showWarningMessage(
        `Could not apply edit to open "${path.basename(targetPath)}" document; reverted preview to buffer contents.`
      );
    }
  }
}
