const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function extension({ files = [], documents = [], activeUri, dll = false } = {}) {
    const extensionPath = path.resolve('test-extension');
    const exe = path.join(extensionPath, 'bin', dll ? 'SWD4CS.dll' : 'SWD4CS.exe');
    const existing = new Set([...files, exe]);
    const calls = [];
    const errors = [];
    let command;
    const vscode = {
        commands: { registerCommand: (_name, handler) => { command = handler; return { dispose() {} }; } },
        workspace: { textDocuments: documents },
        window: {
            activeTextEditor: activeUri ? { document: { uri: activeUri } } : undefined,
            showErrorMessage: message => errors.push(message),
            showInformationMessage() {}
        }
    };
    const childProcess = { spawn: (cmd, args, options) => {
        calls.push({ cmd, args, options });
        const child = new EventEmitter();
        child.stderr = new EventEmitter();
        child.unref = () => {};
        return child;
    } };
    const output = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../out/extension.js'), 'utf8'), {
        exports: output.exports, module: output,
        require: name => ({ vscode, path, child_process: childProcess, fs: { existsSync: file => existing.has(file) } })[name],
        console: { log() {}, error() {} }, setTimeout() {}
    });
    output.exports.activate({ extensionPath, subscriptions: [] });
    return { open: uri => command(uri), calls, errors, existing };
}

const uri = file => ({ scheme: 'file', fsPath: path.resolve('test-project', file) });
const form = uri('OrderForm.cs');
const designer = uri('OrderForm.Designer.cs');

test('opening a form code file launches its companion designer, including paths with spaces', async () => {
    const selected = uri('Order Form.cs');
    const companion = uri('Order Form.Designer.cs');
    const host = extension({ files: [companion.fsPath] });
    await host.open(selected);
    assert.equal(host.calls.length, 1);
    assert.deepEqual(Array.from(host.calls[0].args), [companion.fsPath]);
    assert.equal(host.calls[0].options.cwd, path.dirname(companion.fsPath));
});

test('opening Designer.cs directly preserves that path', async () => {
    const host = extension({ files: [designer.fsPath] });
    await host.open(designer);
    assert.deepEqual(Array.from(host.calls[0].args), [designer.fsPath]);
});

test('ordinary C# files without a designer do not open a blank form', async () => {
    const host = extension();
    await host.open(uri('Program.cs'));
    assert.equal(host.calls.length, 0);
    assert.match(host.errors[0], /No Windows Forms designer file found/);
});

test('save the selected form and its designer before launching, leaving unrelated files alone', async () => {
    const saved = [];
    const documents = [form, designer, uri('Unrelated.cs')].map(documentUri => ({
        uri: documentUri, isDirty: true, save: async () => { saved.push(documentUri.fsPath); return true; }
    }));
    const host = extension({ files: [designer.fsPath], documents });
    await host.open(form);
    assert.deepEqual(saved, [form.fsPath, designer.fsPath]);
    assert.equal(host.calls.length, 1);
});

test('a cancelled save prevents launching against stale disk content', async () => {
    const host = extension({ files: [designer.fsPath], documents: [{ uri: designer, isDirty: true, save: async () => false }] });
    await host.open(form);
    assert.equal(host.calls.length, 0);
});

test('DLL fallback also receives Designer.cs', async () => {
    const host = extension({ files: [designer.fsPath], dll: true });
    await host.open(form);
    assert.equal(host.calls[0].cmd, 'dotnet');
    assert.equal(host.calls[0].args[1], designer.fsPath);
});

test('command palette uses the active form', async () => {
    const host = extension({ files: [designer.fsPath], activeUri: form });
    await host.open();
    assert.deepEqual(Array.from(host.calls[0].args), [designer.fsPath]);
});

test('non-file documents are rejected', async () => {
    const host = extension({ files: [designer.fsPath] });
    await host.open({ scheme: 'untitled', fsPath: form.fsPath });
    assert.equal(host.calls.length, 0);
    assert.equal(host.errors.length, 1);
});
