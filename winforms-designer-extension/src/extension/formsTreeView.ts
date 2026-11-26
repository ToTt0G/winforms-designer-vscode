import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolveFormFiles } from './formResolver';

const IGNORED_DIRS = new Set(['bin', 'obj', 'node_modules', '.git', '.vs']);
const DESIGNER_FILE_RE = /^(.+)\.designer\.cs$/i;
const USER_CONTROL_BASE_RE =
  /\bclass\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*(?:(?:global::)?System\.Windows\.Forms\.)?UserControl\b/;
const FORM_BASE_RE =
  /\bclass\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*(?:(?:global::)?System\.Windows\.Forms\.)?Form\b/;
const MAX_SCAN_DEPTH = 10;

export class FormTreeItem extends vscode.TreeItem {
  public readonly designerUri: vscode.Uri;
  public readonly codeBehindPath: string;
  public readonly baseName: string;
  public readonly baseType: 'Form' | 'UserControl';
  public readonly relativeFolder: string;

  constructor(params: {
    baseName: string;
    baseType: 'Form' | 'UserControl';
    designerUri: vscode.Uri;
    codeBehindPath: string;
    relativeFolder: string;
  }) {
    super(params.baseName, vscode.TreeItemCollapsibleState?.None ?? 0);
    this.baseName = params.baseName;
    this.baseType = params.baseType;
    this.designerUri = params.designerUri;
    this.codeBehindPath = params.codeBehindPath;
    this.relativeFolder = params.relativeFolder;

    this.contextValue = 'winformsForm';
    this.description = params.relativeFolder
      ? `${params.relativeFolder} (${params.baseType})`
      : `(${params.baseType})`;
    this.resourceUri = params.designerUri;
    this.tooltip = `${params.baseName} (${params.baseType}) — ${params.designerUri.fsPath}`;
    if (typeof vscode.ThemeIcon === 'function') {
      this.iconPath = new vscode.ThemeIcon(
        params.baseType === 'UserControl' ? 'symbol-class' : 'window'
      );
    }
    this.command = {
      command: 'winforms.openDesigner',
      title: 'Open WinForms Designer',
      arguments: [params.designerUri],
    };
  }
}

function detectDesignerBaseType(designerPath: string, codeBehindPath: string): 'Form' | 'UserControl' {
  try {
    if (fs.existsSync(codeBehindPath)) {
      const cbSource = fs.readFileSync(codeBehindPath, 'utf8');
      if (USER_CONTROL_BASE_RE.test(cbSource)) {
        return 'UserControl';
      }
      if (FORM_BASE_RE.test(cbSource)) {
        return 'Form';
      }
    }
  } catch {
    // Fall back to .Designer.cs inspection
  }

  try {
    const designerSource = fs.readFileSync(designerPath, 'utf8');
    if (USER_CONTROL_BASE_RE.test(designerSource)) {
      return 'UserControl';
    }
    if (/\bClientSize\s*=/.test(designerSource)) {
      return 'Form';
    }
    if (
      /\bthis\.Size\s*=/.test(designerSource) &&
      !/\bthis\.ClientSize\s*=/.test(designerSource) &&
      !/\bthis\.Text\s*=/.test(designerSource)
    ) {
      return 'UserControl';
    }
  } catch {
    // Default to Form
  }

  return 'Form';
}

function scanDirectoryForDesignerFiles(
  rootDir: string,
  results: FormTreeItem[],
  seenFiles: Set<string>
): void {
  let canonicalRoot: string;
  try {
    canonicalRoot = fs.realpathSync(rootDir);
  } catch {
    return;
  }

  const visitedDirs = new Set<string>();
  const stack: Array<{ dir: string; depth: number }> = [{ dir: canonicalRoot, depth: 0 }];

  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!;
    const dirKey =
      process.platform === 'win32' || process.platform === 'darwin' ? dir.toLowerCase() : dir;
    if (visitedDirs.has(dirKey)) {
      continue;
    }
    visitedDirs.add(dirKey);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const lowerName = entry.name.toLowerCase();
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (depth < MAX_SCAN_DEPTH && !IGNORED_DIRS.has(lowerName)) {
          try {
            const canonicalSub = fs.realpathSync(fullPath);
            stack.push({ dir: canonicalSub, depth: depth + 1 });
          } catch {
            // Skip unreadable or broken symlinks
          }
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const match = DESIGNER_FILE_RE.exec(entry.name);
      if (!match) {
        continue;
      }

      const fileKey =
        process.platform === 'win32' || process.platform === 'darwin'
          ? fullPath.toLowerCase()
          : fullPath;
      if (seenFiles.has(fileKey)) {
        continue;
      }
      seenFiles.add(fileKey);

      const resolved = resolveFormFiles(fullPath);
      const baseType = detectDesignerBaseType(resolved.designerPath, resolved.codeBehindPath);
      const rel = path.relative(canonicalRoot, path.dirname(fullPath)).replace(/\\/g, '/');
      const relativeFolder = !rel || rel === '.' ? '' : rel;

      results.push(
        new FormTreeItem({
          baseName: resolved.baseName,
          baseType,
          designerUri: vscode.Uri.file(fullPath),
          codeBehindPath: resolved.codeBehindPath,
          relativeFolder,
        })
      );
    }
  }
}

export class WinFormsExplorerProvider
  implements vscode.TreeDataProvider<FormTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData =
    typeof vscode.EventEmitter === 'function'
      ? new vscode.EventEmitter<FormTreeItem | undefined | void>()
      : undefined;

  public readonly onDidChangeTreeData = this._onDidChangeTreeData?.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    if (typeof vscode.workspace.createFileSystemWatcher === 'function') {
      const watcher = vscode.workspace.createFileSystemWatcher('**/*.[Dd]esigner.cs');
      this.disposables.push(
        watcher,
        watcher.onDidCreate(() => this.refresh()),
        watcher.onDidDelete(() => this.refresh())
      );
    }
  }

  public refresh(): void {
    this._onDidChangeTreeData?.fire();
  }

  public getTreeItem(element: FormTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: FormTreeItem): FormTreeItem[] {
    if (element) {
      return [];
    }

    const items: FormTreeItem[] = [];
    const seenFiles = new Set<string>();

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      if (folder.uri.scheme !== 'file') {
        continue;
      }
      scanDirectoryForDesignerFiles(folder.uri.fsPath, items, seenFiles);
    }

    items.sort((a, b) => {
      const folderCmp = a.relativeFolder.localeCompare(b.relativeFolder, undefined, {
        sensitivity: 'base',
      });
      if (folderCmp !== 0) {
        return folderCmp;
      }
      return a.baseName.localeCompare(b.baseName, undefined, { sensitivity: 'base' });
    });

    return items;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this._onDidChangeTreeData?.dispose();
  }
}
