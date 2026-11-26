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
  findCultureResxFiles,
  formFilesExistInDirectory,
  pickNextAvailableFormName,
  resolveFormFiles,
  sameFilePath,
  validateCSharpIdentifier,
} from './formResolver';
import { WinFormsExplorerProvider } from './formsTreeView';
import {
  WinFormsProjectRunner,
  type WinFormsProjectRunnerOptions,
} from './projectRunner';

const TARGET_FRAMEWORK_OPTIONS: ReadonlyArray<{
  label: string;
  description: string;
  tfm: coreApi.WinFormsTargetFramework;
}> = [
  {
    label: 'net10.0-windows',
    description: '.NET 10 (Windows)',
    tfm: 'net10.0-windows',
  },
  {
    label: 'net9.0-windows',
    description: '.NET 9 (Windows)',
    tfm: 'net9.0-windows',
  },
  {
    label: 'net8.0-windows',
    description: '.NET 8 (Windows LTS)',
    tfm: 'net8.0-windows',
  },
  {
    label: 'net48',
    description: '.NET Framework 4.8',
    tfm: 'net48',
  },
];

function extractUriFromCommandArg(arg: unknown): vscode.Uri | undefined {
  if (!arg || typeof arg !== 'object') {
    return undefined;
  }
  if ('scheme' in arg && 'fsPath' in arg) {
    return arg as vscode.Uri;
  }
  if ('designerUri' in arg) {
    const u = (arg as { designerUri?: unknown }).designerUri;
    if (u && typeof u === 'object' && 'scheme' in u && 'fsPath' in u) {
      return u as vscode.Uri;
    }
  }
  if ('resourceUri' in arg) {
    const u = (arg as { resourceUri?: unknown }).resourceUri;
    if (u && typeof u === 'object' && 'scheme' in u && 'fsPath' in u) {
      return u as vscode.Uri;
    }
  }
  return undefined;
}

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
  coreDeps?: Partial<CoreDependencies>,
  runnerOptions?: WinFormsProjectRunnerOptions
): WinFormsCustomEditorProvider {
  const core: CoreDependencies = {
    parseDesignerCs: coreDeps?.parseDesignerCs ?? coreApi.parseDesignerCs,
    generateDesignerCs: coreDeps?.generateDesignerCs ?? coreApi.generateDesignerCs,
    parseCodeBehind: coreDeps?.parseCodeBehind ?? coreApi.parseCodeBehind,
    ensureEventHandlerInCodeBehind:
      coreDeps?.ensureEventHandlerInCodeBehind ?? coreApi.ensureEventHandlerInCodeBehind,
    parseResx: coreDeps?.parseResx ?? coreApi.parseResx,
    createEmptyResx: coreDeps?.createEmptyResx ?? coreApi.createEmptyResx,
    updateResxResource: coreDeps?.updateResxResource ?? coreApi.updateResxResource,
    removeResxResource: coreDeps?.removeResxResource ?? coreApi.removeResxResource,
    scaffoldFormFiles: coreDeps?.scaffoldFormFiles ?? coreApi.scaffoldFormFiles,
    scaffoldWinFormsProject:
      coreDeps?.scaffoldWinFormsProject ?? coreApi.scaffoldWinFormsProject,
  };

  let provider: WinFormsCustomEditorProvider | undefined;

  const projectRunner = new WinFormsProjectRunner({
    workspaceState: context.workspaceState,
    ...runnerOptions,
    hasActiveDesigner:
      runnerOptions?.hasActiveDesigner ?? (() => provider?.getActiveDesignerUri() !== undefined),
    onOpenLivePreview:
      runnerOptions?.onOpenLivePreview ??
      (async (contextUri?: vscode.Uri) => {
        if (provider?.revealActiveDesigner(contextUri)) {
          return;
        }
        const targetUri = contextUri ?? vscode.window.activeTextEditor?.document.uri;
        if (targetUri) {
          await vscode.commands.executeCommand('winforms.openDesigner', targetUri);
        }
      }),
  });
  context.subscriptions.push(projectRunner);

  provider = new WinFormsCustomEditorProvider(context, core, {
    runProjectAction: async (action, uri) => {
      if (action === 'run') {
        await projectRunner.run(uri);
      } else {
        await projectRunner.build(uri);
      }
    },
    onActiveDesignerChanged: () => {
      projectRunner.updateStatusBarVisibility();
    },
  });
  const activeProvider = provider;
  const formsProvider = new WinFormsExplorerProvider();
  context.subscriptions.push(formsProvider);

  if (typeof vscode.window.registerTreeDataProvider === 'function') {
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('winformsDesigner.formsView', formsProvider)
    );
  }

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
    vscode.commands.registerCommand('winforms.openDesigner', async (arg?: unknown) => {
      const targetUri =
        extractUriFromCommandArg(arg) ?? vscode.window.activeTextEditor?.document.uri;
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
    vscode.commands.registerCommand('winforms.viewCode', async (arg?: unknown) => {
      const targetUri =
        extractUriFromCommandArg(arg) ??
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
    vscode.commands.registerCommand('winforms.viewDesignerCode', async (arg?: unknown) => {
      const targetUri =
        extractUriFromCommandArg(arg) ??
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

    formsProvider.refresh();

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

  // Command: New WinForms Project
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.newProject', async (arg?: unknown) => {
      const parentDir = resolveTargetFolder(extractUriFromCommandArg(arg), provider);
      if (!parentDir) {
        void vscode.window.showWarningMessage(
          'Open a workspace folder before creating a new WinForms project.'
        );
        return;
      }

      const rawProjectName = await vscode.window.showInputBox({
        title: 'New WinForms Project',
        prompt: 'Enter the project name (creates a new folder with .csproj, Program.cs, and MainForm)',
        value: 'WinFormsApp1',
        placeHolder: 'WinFormsApp1',
        validateInput: (value) => {
          const trimmed = value.trim();
          const identError = validateCSharpIdentifier(trimmed);
          if (identError) {
            return identError;
          }
          const candidateDir = path.join(parentDir, trimmed);
          if (fs.existsSync(candidateDir)) {
            return `Folder "${trimmed}" already exists in this location.`;
          }
          return undefined;
        },
      });

      if (!rawProjectName) {
        return;
      }

      const projectName = rawProjectName.trim();
      const identError = validateCSharpIdentifier(projectName);
      if (identError) {
        void vscode.window.showErrorMessage(identError);
        return;
      }

      const projectDir = path.join(parentDir, projectName);
      if (fs.existsSync(projectDir)) {
        void vscode.window.showErrorMessage(
          `Refusing to overwrite existing folder "${projectName}".`
        );
        return;
      }

      let targetFramework: coreApi.WinFormsTargetFramework = 'net10.0-windows';
      let template: coreApi.FormTemplateId = 'blank';

      if (typeof vscode.window.showQuickPick === 'function') {
        const pickedTfm = await vscode.window.showQuickPick(
          TARGET_FRAMEWORK_OPTIONS.map((o) => ({
            label: o.label,
            description: o.description,
            tfm: o.tfm,
          })),
          {
            title: 'Select Target Framework',
            placeHolder: 'Choose the .NET target framework for the WinForms project',
          }
        );
        if (!pickedTfm) {
          return;
        }
        targetFramework = pickedTfm.tfm;

        const pickedTemplate = await vscode.window.showQuickPick(
          coreApi.FORM_TEMPLATES.map((t) => ({
            label: t.label,
            description: t.description,
            template: t.id,
          })),
          {
            title: 'Select Starter Form Template',
            placeHolder: 'Choose a starter layout for MainForm',
          }
        );
        if (!pickedTemplate) {
          return;
        }
        template = pickedTemplate.template;
      }

      const scaffolded = core.scaffoldWinFormsProject({
        projectName,
        targetFramework,
        template,
      });

      const csprojPath = path.join(projectDir, `${projectName}.csproj`);
      const programPath = path.join(projectDir, 'Program.cs');
      const formPath = path.join(projectDir, 'MainForm.cs');
      const designerPath = path.join(projectDir, 'MainForm.Designer.cs');

      const createdFiles: string[] = [];
      let createdDir = false;
      try {
        fs.mkdirSync(projectDir, { recursive: false });
        createdDir = true;
        const filesToCreate: Array<[string, string]> = [
          [csprojPath, scaffolded.csprojContent],
          [programPath, scaffolded.programCsContent],
          [formPath, scaffolded.formCsContent],
          [designerPath, scaffolded.designerCsContent],
        ];
        for (const [filePath, content] of filesToCreate) {
          fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' });
          createdFiles.push(filePath);
        }
      } catch (err) {
        for (const created of createdFiles.reverse()) {
          try {
            fs.unlinkSync(created);
          } catch {
            // Best-effort rollback
          }
        }
        if (createdDir) {
          try {
            fs.rmdirSync(projectDir);
          } catch {
            // Best-effort rollback
          }
        }
        if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
          void vscode.window.showErrorMessage(
            `Refusing to overwrite existing project files in "${projectName}".`
          );
          return;
        }
        throw err;
      }

      formsProvider.refresh();

      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(designerPath),
        WinFormsCustomEditorProvider.viewType
      );
    })
  );

  const resolveProjectActionUri = (arg?: unknown): vscode.Uri | undefined =>
    extractUriFromCommandArg(arg) ??
    activeProvider.getActiveDesignerUri() ??
    vscode.window.activeTextEditor?.document.uri;

  // Command: Build WinForms Project
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.buildApp', async (arg?: unknown) => {
      await projectRunner.build(resolveProjectActionUri(arg));
    })
  );

  // Command: Run WinForms Project
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.runApp', async (arg?: unknown) => {
      await projectRunner.run(resolveProjectActionUri(arg));
    })
  );

  // Command: Stop Running WinForms App
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.stopApp', async () => {
      await projectRunner.stop();
    })
  );

  // Command: Delete Form & Sibling Files
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.deleteForm', async (arg?: unknown) => {
      const targetUri =
        extractUriFromCommandArg(arg) ??
        provider.getActiveDesignerUri() ??
        vscode.window.activeTextEditor?.document.uri;

      if (!targetUri || targetUri.scheme !== 'file') {
        void vscode.window.showWarningMessage(
          'No WinForms form file was selected to delete.'
        );
        return;
      }

      const resolved = resolveFormFiles(targetUri.fsPath);
      if (!fs.existsSync(resolved.designerPath)) {
        void vscode.window.showWarningMessage(
          `"${path.basename(targetUri.fsPath)}" does not have a companion .Designer.cs file and was not deleted.`
        );
        return;
      }

      const cultureMap = findCultureResxFiles(resolved.directory, resolved.baseName);
      const candidatePaths = [
        resolved.codeBehindPath,
        resolved.designerPath,
        resolved.resxPath,
        ...Object.keys(cultureMap)
          .sort((a, b) => a.localeCompare(b))
          .map((k) => cultureMap[k]),
      ];

      const filesToDelete: string[] = [];
      for (const candidate of candidatePaths) {
        if (!fs.existsSync(candidate)) continue;
        if (filesToDelete.some((existing) => sameFilePath(existing, candidate))) continue;
        filesToDelete.push(candidate);
      }

      if (filesToDelete.length === 0) {
        void vscode.window.showWarningMessage(
          `No files found on disk for "${resolved.baseName}".`
        );
        return;
      }

      const fileList = filesToDelete.map((f) => path.basename(f)).join(', ');
      const choice = await vscode.window.showWarningMessage(
        `Delete "${resolved.baseName}" and its sibling files (${fileList})?`,
        { modal: true },
        'Delete'
      );

      if (choice !== 'Delete') {
        return;
      }

      const errors: string[] = [];
      const hasWorkspaceFsDelete = typeof vscode.workspace.fs?.delete === 'function';
      for (const filePath of filesToDelete) {
        try {
          if (hasWorkspaceFsDelete) {
            await vscode.workspace.fs.delete(vscode.Uri.file(filePath), { useTrash: true });
          } else {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          errors.push(
            `${path.basename(filePath)}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      formsProvider.refresh();

      if (errors.length > 0) {
        void vscode.window.showErrorMessage(
          `Failed to delete some form files: ${errors.join('; ')}`
        );
      }
    })
  );

  // Command: Refresh Forms Explorer
  context.subscriptions.push(
    vscode.commands.registerCommand('winforms.refreshFormsView', () => {
      formsProvider.refresh();
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
