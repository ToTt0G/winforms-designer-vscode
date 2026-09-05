import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import {
    HostDeps,
    Launcher,
    STDERR_CAP_BYTES,
    appendCapped,
    buildLauncher,
    describeError,
    nodeHostDeps,
    stripWineNoise
} from './wine';

// Re-exported so tests can reach the host-dependent logic through either module.
export {
    HostDeps,
    Launcher,
    LauncherOutcome,
    buildLauncher,
    findOnPath,
    getStringSetting,
    resolveWine,
    stripWineNoise,
    toWinePath,
    wineCandidates,
    wineEnv
} from './wine';

const CONFIG_SECTION = 'winformsDesigner';
const OUTPUT_CHANNEL_HINT = 'See the "WinForms Designer" output channel for details.';

let outputChannel: vscode.OutputChannel | undefined;

/**
 * One designer per file: the second click must not start a second writer. The
 * slot is reserved *before* the first `await` (value `undefined` while the launch
 * is still being prepared), because preparation is asynchronous and the UI stays
 * responsive throughout — so a second invocation can arrive at any point.
 */
const activeLaunches = new Map<string, child_process.ChildProcess | undefined>();

/** Only release the slot we still own; a later launch must keep its own entry. */
function releaseLaunch(filePath: string, child?: child_process.ChildProcess): void {
    if (activeLaunches.get(filePath) === child) {
        activeLaunches.delete(filePath);
    }
}

/** Everything diagnostic goes to the output channel, never to `console`. */
function log(message: string): void {
    outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

/** Raw child output, kept verbatim so the actionable Wine lines survive. */
function logRaw(message: string): void {
    outputChannel?.append(message);
}

/** The real host, with configuration reads wired to the workspace settings. */
const hostDeps: HostDeps = {
    ...nodeHostDeps,
    getSetting: (key: string) => vscode.workspace.getConfiguration(CONFIG_SECTION).get(key),
    log
};

/** Windows and macOS resolve paths case-insensitively; Linux does not. */
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin';

function samePath(a: string, b: string): boolean {
    return CASE_INSENSITIVE_FS ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * The designer rewrites `*.Designer.cs`, so an unsaved buffer for either half of
 * the pair is a data-loss path in both directions. The suffix test is
 * case-insensitive: `Form1.designer.cs` is the same file to Windows and macOS,
 * and missing it would skip the dirty check entirely.
 */
function relatedFiles(filePath: string): string[] {
    const designerSuffix = /\.designer\.cs$/i;
    if (designerSuffix.test(filePath)) {
        return [filePath, filePath.replace(designerSuffix, '.cs')];
    }
    return [filePath, filePath.replace(/\.cs$/i, '.Designer.cs')];
}

/**
 * Both halves of a pair drive the same generated file, so they must share one
 * launch slot - otherwise opening `Form1.cs` and `Form1.Designer.cs` yields two
 * designers writing one `.Designer.cs`, which is the race P1-9 exists to prevent.
 */
function launchKey(filePath: string): string {
    const designerPath = relatedFiles(filePath).find(candidate => /\.designer\.cs$/i.test(candidate))
        ?? filePath;
    return CASE_INSENSITIVE_FS ? designerPath.toLowerCase() : designerPath;
}

/**
 * The designer reads from disk. If we hand it a path with unsaved edits it works
 * from stale content, and the editor's buffer then clobbers whatever it wrote.
 */
async function ensureSavedBeforeLaunch(filePath: string): Promise<boolean> {
    const related = relatedFiles(filePath);
    const dirty = vscode.workspace.textDocuments.filter(
        document => related.some(candidate => samePath(candidate, document.uri.fsPath)) && document.isDirty
    );
    if (dirty.length === 0) {
        return true;
    }

    const names = dirty.map(document => path.basename(document.uri.fsPath)).join(', ');
    const choice = await vscode.window.showWarningMessage(
        `${names} ${dirty.length === 1 ? 'has' : 'have'} unsaved changes. The designer reads the file ` +
        'from disk, so it would ignore those edits and later overwrite them.',
        { modal: true },
        'Save and open'
    );
    if (choice !== 'Save and open') {
        log(`Launch cancelled: unsaved changes in ${names}.`);
        return false;
    }

    for (const document of dirty) {
        if (!(await document.save())) {
            vscode.window.showErrorMessage(
                `Could not save ${path.basename(document.uri.fsPath)}, so the designer was not started.`
            );
            return false;
        }
    }
    return true;
}

function launchDesigner(launcher: Launcher, filePath: string, key: string): void {
    const name = path.basename(filePath);
    log(`Launching ${launcher.cmd} ${launcher.args.join(' ')}`);

    let child: child_process.ChildProcess;
    try {
        child = child_process.spawn(launcher.cmd, launcher.args, {
            detached: false,
            // stdout is deliberately not piped: an unread pipe deadlocks the child
            // once it fills, and the designer has nothing useful to say there.
            stdio: ['ignore', 'ignore', 'pipe'],
            env: launcher.env
        });
    } catch (error) {
        log(`Spawn failed: ${describeError(error)}`);
        vscode.window.showErrorMessage(`Could not start the designer: ${describeError(error)}`);
        return;
    }

    // Replaces the reservation made by `openDesigner` before it started awaiting.
    activeLaunches.set(key, child);

    let errorOutput = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
        logRaw(chunk);
        errorOutput = appendCapped(errorOutput, chunk, STDERR_CAP_BYTES);
    });

    child.on('error', (error) => {
        releaseLaunch(key, child);
        log(`Designer launch error for ${name}: ${describeError(error)}`);
        vscode.window.showErrorMessage(`Failed to launch designer: ${error.message} ${OUTPUT_CHANNEL_HINT}`);
    });

    child.on('exit', (code, signal) => {
        releaseLaunch(key, child);
        log(`Designer for ${name} exited (code=${code}, signal=${signal}).`);

        const reported = launcher.usesWine ? stripWineNoise(errorOutput) : errorOutput.trim();
        const detail = reported ? `Error: ${reported}` : OUTPUT_CHANNEL_HINT;

        if (signal) {
            // Wine crashes arrive as SIGSEGV/SIGABRT with a null exit code.
            vscode.window.showErrorMessage(
                `The designer was terminated by ${signal}` +
                `${launcher.usesWine ? ' - normally a Wine crash' : ''}. ${detail}`
            );
        } else if (code === null) {
            vscode.window.showErrorMessage(`The designer stopped without reporting an exit code. ${detail}`);
        } else if (code !== 0) {
            vscode.window.showErrorMessage(`Designer exited with code ${code}. ${detail}`);
        }
    });

    // Give it a moment to start, then detach
    setTimeout(() => {
        if (!child.killed) {
            child.unref();
        }
    }, 1000);
}

async function openDesigner(extensionPath: string, uri: vscode.Uri | undefined): Promise<void> {
    if (!uri && vscode.window.activeTextEditor) {
        uri = vscode.window.activeTextEditor.document.uri;
    }

    if (!uri) {
        vscode.window.showErrorMessage('No file selected to open in Designer.');
        return;
    }

    const filePath = uri.fsPath;
    const name = path.basename(filePath);

    if (!/\.cs$/i.test(filePath)) {
        vscode.window.showErrorMessage('Please select a C# (.cs) file.');
        return;
    }

    // Keyed on the generated file, so the two halves of a pair share one slot.
    const key = launchKey(filePath);

    if (activeLaunches.has(key)) {
        vscode.window.showInformationMessage(`The designer is already open for ${name}.`);
        return;
    }

    // Claim the slot synchronously: everything below awaits, and the progress
    // notification is non-modal, so the command can be invoked again meanwhile.
    activeLaunches.set(key, undefined);
    try {
        await prepareAndLaunch(extensionPath, filePath, name, key);
    } finally {
        // A no-op once `launchDesigner` has stored the child; the child's own
        // handlers own the entry from that point on.
        releaseLaunch(key);
    }
}

async function prepareAndLaunch(extensionPath: string, filePath: string, name: string, key: string): Promise<void> {
    if (!(await ensureSavedBeforeLaunch(filePath))) {
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Opening the WinForms Designer for ${name}...`,
            cancellable: true
        },
        async (_progress, token) => {
            // A cold Wine prefix has to be created before `winepath` answers, which
            // is slow enough that Cancel has to actually abort the child process.
            const controller = new AbortController();
            const cancellation = token.onCancellationRequested(() => controller.abort());
            try {
                const outcome = await buildLauncher(extensionPath, filePath, controller.signal, hostDeps);
                if (token.isCancellationRequested) {
                    log(`Launch for ${name} cancelled by the user.`);
                    return;
                }
                if (!outcome.ok) {
                    log(`Refusing to launch for ${name}: ${outcome.error}`);
                    vscode.window.showErrorMessage(outcome.error);
                    return;
                }
                launchDesigner(outcome.launcher, filePath, key);
            } catch (error) {
                if (token.isCancellationRequested) {
                    log(`Launch for ${name} cancelled by the user.`);
                    return;
                }
                log(`Could not prepare the launch for ${name}: ${describeError(error)}`);
                vscode.window.showErrorMessage(
                    `Could not prepare the designer launch: ${describeError(error)} ${OUTPUT_CHANNEL_HINT}`
                );
            } finally {
                cancellation.dispose();
            }
        }
    );
}

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('WinForms Designer');
    context.subscriptions.push(outputChannel);
    log('WinForms Designer extension activated.');

    const disposable = vscode.commands.registerCommand(
        'winforms.openDesigner',
        (uri?: vscode.Uri) => openDesigner(context.extensionPath, uri)
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {
    outputChannel = undefined;
}
