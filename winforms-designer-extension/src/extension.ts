import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('WinForms Designer extension is now active!');

    let disposable = vscode.commands.registerCommand('winforms.openDesigner', (uri: vscode.Uri) => {
        if (!uri && vscode.window.activeTextEditor) {
            uri = vscode.window.activeTextEditor.document.uri;
        }

        if (!uri) {
            vscode.window.showErrorMessage('No file selected to open in Designer.');
            return;
        }

        const filePath = uri.fsPath;

        // Check if it's a .cs file
        if (!filePath.endsWith('.cs')) {
            vscode.window.showErrorMessage('Please select a C# (.cs) file.');
            return;
        }

        // Path to the designer executable
        // We assume the designer is packaged in 'bin/SWD4CS.exe' or 'bin/SWD4CS.dll'
        // Since we are on Windows, we can try .exe first.
        const extensionPath = context.extensionPath;
        const designerExe = path.join(extensionPath, 'bin', 'SWD4CS.exe');
        const designerDll = path.join(extensionPath, 'bin', 'SWD4CS.dll');

        let cmd = '';
        let args: string[] = [];

        if (fs.existsSync(designerExe)) {
            cmd = designerExe;
            args = [filePath];
        } else if (fs.existsSync(designerDll)) {
            cmd = 'dotnet';
            args = [designerDll, filePath];
        } else {
            vscode.window.showErrorMessage(`Designer executable not found at: ${designerExe}`);
            return;
        }

        vscode.window.showInformationMessage(`Opening Designer for: ${path.basename(filePath)}...`);

        try {
            const child = child_process.spawn(cmd, args, {
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let errorOutput = '';

            child.stderr?.on('data', (data) => {
                errorOutput += data.toString();
            });

            child.on('error', (error) => {
                vscode.window.showErrorMessage(`Failed to launch designer: ${error.message}`);
                console.error('Designer launch error:', error);
            });

            child.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    vscode.window.showErrorMessage(
                        `Designer exited with code ${code}. ${errorOutput ? 'Error: ' + errorOutput : ''}`
                    );
                    console.error('Designer error output:', errorOutput);
                }
            });

            // Give it a moment to start, then detach
            setTimeout(() => {
                if (!child.killed) {
                    child.unref();
                }
            }, 1000);

        } catch (error) {
            vscode.window.showErrorMessage(`Error spawning designer: ${error}`);
            console.error('Spawn error:', error);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }
