import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as coreApi from '../core';
import {
  WinFormsCustomEditorProvider,
  type CoreDependencies,
} from './customEditor';
import {
  detectProjectContext,
  formFilesExistInDirectory,
  pickNextAvailableFormName,
  resolveFormFiles,
  validateCSharpIdentifier,
} from './formResolver';

const FORM_DECLARATION_FALLBACK_RE =
  /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:(?:global::)?System\.Windows\.Forms\.)?(Form|UserControl)\b/;
const FILE_SCOPED_NS_RE = /^\s*namespace\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;/m;
const BLOCK_NS_RE = /^\s*namespace\s+([A-Za-z_][A-Za-z0-9_.]*)\s*(?:\r?\n\s*)?\{/m;

interface DetectedFormClass {
  className: string;
  baseType: 'Form' | 'UserControl';
  namespaceName?: string;
  fileScopedNamespace?: boolean;
  isPartial: boolean;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectIsPartialClass(source: string, className: string): boolean {
  if (!className) return false;
  const re = new RegExp(`\\bpartial\\s+class\\s+${escapeRegExp(className)}\\b`);
  return re.test(source);
}

function detectFormOrUserControlClass(
  source: string,
  parseCodeBehind: typeof coreApi.parseCodeBehind
): DetectedFormClass | undefined {
  try {
    const info = parseCodeBehind(source);
    if (info.baseType === 'Form' || info.baseType === 'UserControl') {
      return {
        className: info.className,
        baseType: info.baseType,
        namespaceName: info.namespaceName,
        fileScopedNamespace: info.fileScopedNamespace,
        isPartial: detectIsPartialClass(source, info.className),
      };
    }
    return undefined;
  } catch {
    // Fallback regex detection if code-behind has partial syntax or parser is unavailable
    const match = FORM_DECLARATION_FALLBACK_RE.exec(source);
    if (!match) {
      return undefined;
    }
    const fileScopedMatch = FILE_SCOPED_NS_RE.exec(source);
    const blockNsMatch = !fileScopedMatch ? BLOCK_NS_RE.exec(source) : null;

    return {
      className: match[1],
      baseType: match[2] as 'Form' | 'UserControl',
      namespaceName: fileScopedMatch?.[1] ?? blockNsMatch?.[1] ?? '',
      fileScopedNamespace: fileScopedMatch ? true : blockNsMatch ? false : undefined,
      isPartial: detectIsPartialClass(source, match[1]),
    };
  }
}

function getWorkspaceRootForUri(uri: vscode.Uri): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder?.(uri);
  if (folder) {
    return folder.uri.fsPath;
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolveTargetFolder(
  targetUri: vscode.Uri | undefined,
  provider: WinFormsCustomEditorProvider
): string | undefined {
  if (targetUri && targetUri.scheme === 'file') {
    try {
      if (fs.existsSync(targetUri.fsPath) && fs.statSync(targetUri.fsPath).isDirectory()) {
        return targetUri.fsPath;
      }
    } catch {
      // Fall through to dirname
    }
    return path.dirname(targetUri.fsPath);
  }

  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  if (activeEditorUri && activeEditorUri.scheme === 'file') {
    return path.dirname(activeEditorUri.fsPath);
  }

  const activeDesignerUri = provider.getActiveDesignerUri();
  if (activeDesignerUri && activeDesignerUri.scheme === 'file') {
    return path.dirname(activeDesignerUri.fsPath);
  }

  const firstWorkspace = vscode.workspace.workspaceFolders?.[0];
  if (firstWorkspace && firstWorkspace.uri.scheme === 'file') {
    return firstWorkspace.uri.fsPath;
  }

  return undefined;
}

export function activateWithDeps(
  context: vscode.ExtensionContext,
  coreDeps?: Partial<CoreDependencies>
): WinFormsCustomEditorProvider {
  const core: CoreDependencies = {
    parseDesignerCs: coreDeps?.parseDesignerCs ?? coreApi.parseDesignerCs,
    generateDesignerCs: coreDeps?.generateDesignerCs ?? coreApi.generateDesignerCs,
    parseCodeBehind: coreDeps?.parseCodeBehind ?? coreApi.parseCodeBehind,
    ensureEventHandlerInCodeBehind:
      coreDeps?.ensureEventHandlerInCodeBehind ?? coreApi.ensureEventHandlerInCodeBehind,
    parseResx: coreDeps?.parseResx ?? coreApi.parseResx,
    updateResxResource: coreDeps?.updateResxResource ?? coreApi.updateResxResource,
    removeResxResource: coreDeps?.removeResxResource ?? coreApi.removeResxResource,
    scaffoldFormFiles: coreDeps?.scaffoldFormFiles ?? coreApi.scaffoldFormFiles,
  };

  const provider = new WinFormsCustomEditorProvider(context, core);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      WinFormsCustomEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Command: Open WinForms Designer
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.openDesigner', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        void vscode.window.showWarningMessage('Open a C# Form or UserControl file first.');
        return;
      }

      if (targetUri.scheme !== 'file') {
        void vscode.window.showWarningMessage(
          'WinForms Designer only supports local files on disk.'
        );
        return;
      }

      if (!/\.cs$/i.test(targetUri.fsPath)) {
        void vscode.window.showWarningMessage(
          'WinForms Designer can only open C# (.cs) files.'
        );
        return;
      }

      const resolved = resolveFormFiles(targetUri.fsPath);

      if (fs.existsSync(resolved.designerPath)) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(resolved.designerPath),
          WinFormsCustomEditorProvider.viewType
        );
        return;
      }

      // Companion .Designer.cs does not exist — check if the .cs file declares a Form or UserControl
      let csSource = '';
      const openDoc = vscode.workspace.textDocuments.find(
        (doc) => doc.uri.toString() === targetUri.toString()
      );
      if (openDoc) {
        csSource = openDoc.getText();
      } else if (fs.existsSync(targetUri.fsPath)) {
        csSource = fs.readFileSync(targetUri.fsPath, 'utf8');
      }

      const detected = detectFormOrUserControlClass(csSource, core.parseCodeBehind);
      if (!detected) {
        void vscode.window.showWarningMessage(
          `No companion .Designer.cs file was found for "${path.basename(targetUri.fsPath)}".`
        );
        return;
      }

      if (!detected.isPartial) {
        void vscode.window.showWarningMessage(
          `Class "${detected.className}" in "${path.basename(targetUri.fsPath)}" is not declared as 'partial'. Add the 'partial' modifier so it can share a .Designer.cs file.`
        );
        return;
      }

      const designerFileName = path.basename(resolved.designerPath);
      const choice = await vscode.window.showInformationMessage(
        `No companion Designer file was found for "${path.basename(targetUri.fsPath)}". Create "${designerFileName}"?`,
        'Create Designer File'
      );

      if (choice !== 'Create Designer File') {
        return;
      }

      if (!fs.existsSync(resolved.designerPath)) {
        const projectCtx = detectProjectContext(
          resolved.directory,
          getWorkspaceRootForUri(targetUri)
        );
        const targetNamespace =
          detected.namespaceName !== undefined
            ? detected.namespaceName
            : projectCtx.namespaceName;
        const scaffolded = core.scaffoldFormFiles({
          className: detected.className || resolved.baseName,
          namespaceName: targetNamespace,
          baseType: detected.baseType,
          fileScopedNamespace:
            targetNamespace === ''
              ? false
              : (detected.fileScopedNamespace ?? projectCtx.fileScopedNamespace),
          nullable: projectCtx.nullable,
        });
        try {
          fs.writeFileSync(resolved.designerPath, scaffolded.designer, {
            encoding: 'utf8',
            flag: 'wx',
          });
        } catch (err) {
          if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') {
            throw err;
          }
        }
      }

      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(resolved.designerPath),
        WinFormsCustomEditorProvider.viewType
      );
    })
  );

  // Command: View Form Code
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.viewCode', async (uri?: vscode.Uri) => {
      const targetUri =
        uri ??
        provider.getActiveDesignerUri() ??
        vscode.window.activeTextEditor?.document.uri;

      if (!targetUri || targetUri.scheme !== 'file') {
        void vscode.window.showWarningMessage(
          'No active WinForms Designer or Form file was found.'
        );
        return;
      }

      await provider.openCodeBehindForUri(targetUri, false);
    })
  );

  // Command: View Designer Code Side by Side
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.viewDesignerCode', async (uri?: vscode.Uri) => {
      const targetUri =
        uri ??
        provider.getActiveDesignerUri() ??
        vscode.window.activeTextEditor?.document.uri;

      if (!targetUri || targetUri.scheme !== 'file') {
        void vscode.window.showWarningMessage(
          'No active WinForms Designer or Form file was found.'
        );
        return;
      }

      await provider.openDesignerCodeForUri(targetUri, true);
    })
  );

  // Shared helper for creating a new Form or UserControl
  const createNewWinFormsItem = async (
    baseType: 'Form' | 'UserControl',
    targetUri?: vscode.Uri
  ): Promise<void> => {
    const targetDir = resolveTargetFolder(targetUri, provider);
    if (!targetDir) {
      void vscode.window.showWarningMessage(
        'Open a workspace folder before creating a new Windows Form or User Control.'
      );
      return;
    }

    const isForm = baseType === 'Form';
    const defaultName = pickNextAvailableFormName(
      targetDir,
      isForm ? 'Form' : 'UserControl',
      isForm ? 2 : 1
    );

    const className = await vscode.window.showInputBox({
      title: isForm ? 'New Windows Form' : 'New User Control',
      prompt: isForm
        ? 'Enter the C# class name for the new Windows Form'
        : 'Enter the C# class name for the new User Control',
      value: defaultName,
      placeHolder: defaultName,
      validateInput: (value) => {
        const trimmed = value.trim();
        const identError = validateCSharpIdentifier(trimmed);
        if (identError) {
          return identError;
        }
        if (formFilesExistInDirectory(targetDir, trimmed)) {
          return `"${trimmed}.cs" or "${trimmed}.Designer.cs" already exists in this folder.`;
        }
        return undefined;
      },
    });

    if (!className) {
      return;
    }

    const trimmedName = className.trim();
    const identError = validateCSharpIdentifier(trimmedName);
    if (identError) {
      void vscode.window.showErrorMessage(identError);
      return;
    }

    const codeBehindPath = path.join(targetDir, `${trimmedName}.cs`);
    const designerPath = path.join(targetDir, `${trimmedName}.Designer.cs`);

    if (formFilesExistInDirectory(targetDir, trimmedName)) {
      void vscode.window.showErrorMessage(
        `Refusing to overwrite existing "${trimmedName}.cs" or "${trimmedName}.Designer.cs".`
      );
      return;
    }

    const workspaceRoot = getWorkspaceRootForUri(vscode.Uri.file(targetDir));
    const projectCtx = detectProjectContext(targetDir, workspaceRoot);

    let selectedTemplate: coreApi.FormTemplateId | undefined;
    if (isForm && typeof vscode.window.showQuickPick === 'function') {
      const templateItems = coreApi.FORM_TEMPLATES.map((t) => ({
        label: t.label,
        description: t.description,
        template: t.id,
      }));
      const picked = await vscode.window.showQuickPick(templateItems, {
        title: 'Select Form Template',
        placeHolder: 'Choose a starter layout for the new Windows Form',
      });
      if (picked && picked.template !== 'blank') {
        selectedTemplate = picked.template;
      }
    }

    const scaffolded = core.scaffoldFormFiles({
      className: trimmedName,
      namespaceName: projectCtx.namespaceName,
      baseType,
      fileScopedNamespace: projectCtx.fileScopedNamespace,
      nullable: projectCtx.nullable,
      ...(selectedTemplate ? { template: selectedTemplate } : {}),
    });

    fs.mkdirSync(targetDir, { recursive: true });
    let createdCodeBehind = false;
    try {
      fs.writeFileSync(codeBehindPath, scaffolded.codeBehind, {
        encoding: 'utf8',
        flag: 'wx',
      });
      createdCodeBehind = true;
      fs.writeFileSync(designerPath, scaffolded.designer, {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch (err) {
      if (createdCodeBehind) {
        try {
          fs.unlinkSync(codeBehindPath);
        } catch {
          // Best-effort rollback of first file on failure
        }
      }
      if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
        void vscode.window.showErrorMessage(
          `Refusing to overwrite existing "${trimmedName}.cs" or "${trimmedName}.Designer.cs".`
        );
        return;
      }
      throw err;
    }

    await vscode.commands.executeCommand(
      'vscode.openWith',
      vscode.Uri.file(designerPath),
      WinFormsCustomEditorProvider.viewType
    );
  };

  // Command: New Windows Form
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.newForm', async (uri?: vscode.Uri) => {
      await createNewWinFormsItem('Form', uri);
    })
  );

  // Command: New User Control
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.newUserControl', async (uri?: vscode.Uri) => {
      await createNewWinFormsItem('UserControl', uri);
    })
  );

  return provider;
}

export function activate(context: vscode.ExtensionContext): void {
  activateWithDeps(context);
}

export function deactivate(): void {
  // All subscriptions are disposed automatically via context.subscriptions
}
