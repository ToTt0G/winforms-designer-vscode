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
  resolveFormFiles,
  sameFilePath,
  type ResolvedFormFiles,
} from './formResolver';

export interface CoreDependencies {
  parseDesignerCs: typeof coreApi.parseDesignerCs;
  generateDesignerCs: typeof coreApi.generateDesignerCs;
  parseCodeBehind: typeof coreApi.parseCodeBehind;
  ensureEventHandlerInCodeBehind: typeof coreApi.ensureEventHandlerInCodeBehind;
  parseResx: typeof coreApi.parseResx;
  updateResxResource: typeof coreApi.updateResxResource;
  removeResxResource: typeof coreApi.removeResxResource;
  scaffoldFormFiles: typeof coreApi.scaffoldFormFiles;
}

const DEFAULT_CORE_DEPS: CoreDependencies = {
  parseDesignerCs: coreApi.parseDesignerCs,
  generateDesignerCs: coreApi.generateDesignerCs,
  parseCodeBehind: coreApi.parseCodeBehind,
  ensureEventHandlerInCodeBehind: coreApi.ensureEventHandlerInCodeBehind,
  parseResx: coreApi.parseResx,
  updateResxResource: coreApi.updateResxResource,
  removeResxResource: coreApi.removeResxResource,
  scaffoldFormFiles: coreApi.scaffoldFormFiles,
};

interface SessionState {
  document: vscode.TextDocument;
  webviewPanel: vscode.WebviewPanel;
  resolved: ResolvedFormFiles;
  lastKnownDocument?: DesignDocument;
  lastParsedSource?: string;
  lastParsedMetadata?: DocumentStyleMetadata;
  applyChain: Promise<void>;
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
  sourceText: string;
  documentVersion: number;
}

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

export class WinFormsCustomEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'winformsDesigner.editor';

  private readonly sessions = new Map<string, SessionState>();
  private lastActiveDesignerUri?: vscode.Uri;
  private readonly core: CoreDependencies;

  constructor(
    private readonly context: vscode.ExtensionContext,
    coreDeps?: Partial<CoreDependencies>
  ) {
    this.core = { ...DEFAULT_CORE_DEPS, ...coreDeps };
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
      applyChain: Promise.resolve(),
      pendingSelfEdits: new Set<string>(),
      inFlightSelfEdits: new Map<string, number>(),
      acceptedSelfEditVersions: new Set<number>([document.version]),
      selfEditCleanupTimers: new Set<ReturnType<typeof setTimeout>>(),
      isDisposed: false,
    };
    this.sessions.set(sessionKey, session);
    this.lastActiveDesignerUri = document.uri;

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
              const payload = this.buildPayloadForDocument(session.document);
              session.resolved = payload.resolved;
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
            const payload = this.buildPayloadForDocument(session.document);
            session.resolved = payload.resolved;
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
    });
  }

  public buildPayloadForDocument(document: vscode.TextDocument): ParsedDocumentPayload {
    const resolved = resolveFormFiles(document.uri.fsPath);
    const sourceText = document.getText();
    const documentVersion = document.version;

    // Respect unsaved VS Code edits on sibling .resx buffers
    const resxRead = readFileOrOpenDocument(resolved.resxPath);
    const resxXml = resxRead.exists ? resxRead.text : undefined;

    const codeBehindRead = readFileOrOpenDocument(resolved.codeBehindPath);
    let baseType: 'Form' | 'UserControl' | undefined;
    let codeBehindHandlers: CodeBehindMethod[] = [];

    if (codeBehindRead.exists && codeBehindRead.text !== undefined) {
      try {
        const info = this.core.parseCodeBehind(codeBehindRead.text);
        if (info.baseType === 'UserControl') {
          baseType = 'UserControl';
        } else if (info.baseType === 'Form') {
          baseType = 'Form';
        }
        codeBehindHandlers = info.methods;
      } catch {
        // Keep designer usable even if code-behind has syntax errors
        codeBehindHandlers = [];
      }
    }

    const doc = this.core.parseDesignerCs(sourceText, {
      baseType,
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

    return {
      doc,
      resolved,
      hasCodeBehind: codeBehindRead.exists,
      codeBehindHandlers,
      resourceDataUris,
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
          const payload = this.buildPayloadForDocument(session.document);
          session.resolved = payload.resolved;
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
          });
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
        const payload = this.buildPayloadForDocument(session.document);
        session.resolved = payload.resolved;
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
        const payload = this.buildPayloadForDocument(session.document);
        session.resolved = payload.resolved;
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
}
