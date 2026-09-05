import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import {
    HostDeps,
    buildLauncher,
    findOnPath,
    getStringSetting,
    resolveWine,
    stripWineNoise,
    toWinePath,
    wineCandidates
} from '../src/wine';

// ---------------------------------------------------------------------------
// Fake host
// ---------------------------------------------------------------------------

interface FakeHostOptions {
    /** Paths that exist as executable files. Everything else is absent. */
    executables?: string[];
    /** Paths that exist as files but without the execute bit. */
    nonExecutables?: string[];
    /** Path -> file contents for `readFileSync`. */
    files?: Record<string, string>;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    settings?: Record<string, unknown>;
    /** Replaces the default `execFile`, which succeeds with an empty stdout. */
    execFile?: HostDeps['execFile'];
}

interface FakeHost extends HostDeps {
    /** Everything routed to `log`, in order. */
    logged: string[];
    /** `[file, args]` for every `execFile` call. */
    calls: Array<[string, string[]]>;
}

/**
 * A HostDeps with no real filesystem, process or configuration behind it. All
 * eight members are supplied - `resolveWine` needs `accessSync` to succeed, so a
 * fake that omits it resolves nothing.
 */
function fakeHost(options: FakeHostOptions = {}): FakeHost {
    const executables = new Set(options.executables ?? []);
    const nonExecutables = new Set(options.nonExecutables ?? []);
    const files = options.files ?? {};
    const logged: string[] = [];
    const calls: Array<[string, string[]]> = [];

    return {
        logged,
        calls,
        existsSync: (target: string) =>
            executables.has(target) || nonExecutables.has(target) || target in files,
        statSync: () => ({ isFile: () => true }),
        accessSync: (target: string) => {
            if (!executables.has(target)) {
                throw new Error(`EACCES: permission denied, access '${target}'`);
            }
        },
        readFileSync: (target: string) => {
            const contents = files[target];
            if (contents === undefined) {
                throw new Error(`ENOENT: no such file or directory, open '${target}'`);
            }
            return contents;
        },
        execFile: options.execFile ?? (async (file, args) => {
            calls.push([file, args]);
            return { stdout: '', stderr: '' };
        }),
        platform: options.platform ?? 'linux',
        env: options.env ?? {},
        getSetting: (key: string) => (options.settings ?? {})[key],
        log: (message: string) => {
            logged.push(message);
        }
    };
}

/** The self-contained publish that `buildLauncher` insists on. */
const SELF_CONTAINED_RUNTIMECONFIG = JSON.stringify({
    runtimeOptions: {
        tfm: 'net10.0',
        includedFrameworks: [{ name: 'Microsoft.WindowsDesktop.App', version: '10.0.0' }]
    }
});

/** What a plain `dotnet publish` (no `--self-contained`) leaves behind. */
const FRAMEWORK_DEPENDENT_RUNTIMECONFIG = JSON.stringify({
    runtimeOptions: {
        tfm: 'net10.0',
        framework: { name: 'Microsoft.WindowsDesktop.App', version: '10.0.0' }
    }
});

// ---------------------------------------------------------------------------
// stripWineNoise (P1-5)
// ---------------------------------------------------------------------------

test('removes Wine diagnostic lines and preserves useful output', () => {
    const output = 'fixme:heap:HeapSetInformation stub\nDesigner started\nerr:module:import_dll failed\n';

    assert.equal(stripWineNoise(output), 'Designer started');
});

test('matches diagnostic prefixes case-insensitively with leading whitespace', () => {
    const output = '  WARN:module:load nothing to see\nTRACE:seh:call_handler entry\nUseful failure';

    assert.equal(stripWineNoise(output), 'Useful failure');
});

test('returns an empty string when output contains only Wine diagnostics', () => {
    assert.equal(stripWineNoise('err:process:exec_process bad arch\nfixme:heap:more noise\n'), '');
});

test('drops the arch-mismatch err: line, which is Wine channel output', () => {
    const archMismatch =
        'err:process:exec_process failed to load L"Z:\\\\bin\\\\SWD4CS.exe" err=193';

    assert.equal(stripWineNoise(archMismatch), '');
});

test('drops channel lines carrying Wine thread-id prefixes', () => {
    const output = [
        '0024:err:module:import_dll Library mscoree.dll not found',
        '002c:fixme:ntdll:NtQuerySystemInformation stub',
        'Designer started'
    ].join('\n');

    assert.equal(stripWineNoise(output), 'Designer started');
});

test('keeps an application line that merely starts with hex digits', () => {
    const output = '0024: parse failed at offset 12';

    assert.equal(stripWineNoise(output), '0024: parse failed at offset 12');
});

test('keeps an application error: line - it has no Wine channel', () => {
    const output = 'error: could not parse form';

    assert.equal(stripWineNoise(output), 'error: could not parse form');
});

test('keeps a Microsoft.Extensions.Logging warn: line', () => {
    const output = 'warn: Category[0] something';

    assert.equal(stripWineNoise(output), 'warn: Category[0] something');
});

test('keeps the wine: loader prefix, which is always actionable', () => {
    const output = 'wine: cannot find L"C:\\\\windows\\\\system32\\\\winemenubuilder.exe"';

    assert.equal(stripWineNoise(output), output.trim());
});

test('keeps actionable lines mixed in with Wine channel noise', () => {
    const output = [
        'fixme:heap:HeapSetInformation stub',
        'err:process:exec_process failed to load',
        'error: could not parse form',
        'warn: Category[0] something',
        'trace:seh:call_handler entry'
    ].join('\n');

    assert.equal(stripWineNoise(output), 'error: could not parse form\nwarn: Category[0] something');
});

// ---------------------------------------------------------------------------
// getStringSetting (P0-4)
// ---------------------------------------------------------------------------

test('getStringSetting falls back for undefined', () => {
    const deps = fakeHost({ settings: {} });

    assert.equal(getStringSetting('winePath', 'fallback', deps), 'fallback');
});

test('getStringSetting falls back for null instead of throwing on trim', () => {
    const deps = fakeHost({ settings: { winePath: null } });

    assert.equal(getStringSetting('winePath', 'fallback', deps), 'fallback');
});

test('getStringSetting falls back for a number', () => {
    const deps = fakeHost({ settings: { winePath: 42 } });

    assert.equal(getStringSetting('winePath', 'fallback', deps), 'fallback');
});

test('getStringSetting falls back for an array', () => {
    const deps = fakeHost({ settings: { winePath: [] } });

    assert.equal(getStringSetting('winePath', 'fallback', deps), 'fallback');
});

test('getStringSetting trims a real string', () => {
    const deps = fakeHost({ settings: { winePath: '  wine  ' } });

    assert.equal(getStringSetting('winePath', 'fallback', deps), 'wine');
});

// ---------------------------------------------------------------------------
// findOnPath / resolveWine
// ---------------------------------------------------------------------------

test('findOnPath returns the first executable match and skips empty PATH entries', () => {
    const deps = fakeHost({
        env: { PATH: ['', '/empty', '/usr/bin'].join(path.delimiter) },
        executables: ['/usr/bin/wine']
    });

    assert.equal(findOnPath('wine', deps), '/usr/bin/wine');
});

test('findOnPath returns undefined with no PATH at all', () => {
    assert.equal(findOnPath('wine', fakeHost()), undefined);
});

test('a configured path with a separator that does not exist resolves to undefined', () => {
    const deps = fakeHost({
        settings: { winePath: '/opt/nowhere/wine' },
        // A perfectly good Wine on PATH must NOT be silently substituted.
        env: { PATH: '/usr/bin' },
        executables: ['/usr/bin/wine', '/usr/bin/wine64']
    });

    assert.equal(resolveWine(deps), undefined);
});

test('a configured path with a separator that exists is used verbatim', () => {
    const deps = fakeHost({
        settings: { winePath: '  /opt/wine-staging/bin/wine  ' },
        executables: ['/opt/wine-staging/bin/wine']
    });

    assert.equal(resolveWine(deps), '/opt/wine-staging/bin/wine');
});

test('a configured bare name is resolved on PATH', () => {
    const deps = fakeHost({
        settings: { winePath: 'wine-custom' },
        env: { PATH: ['/nope', '/opt/bin'].join(path.delimiter) },
        executables: ['/opt/bin/wine-custom']
    });

    assert.equal(resolveWine(deps), '/opt/bin/wine-custom');
});

test('a configured bare name that is not on PATH resolves to undefined', () => {
    const deps = fakeHost({
        settings: { winePath: 'wine-custom' },
        env: { PATH: '/usr/bin' },
        executables: ['/usr/bin/wine']
    });

    assert.equal(resolveWine(deps), undefined);
});

test('wine64 is preferred over wine when both are on PATH', () => {
    const deps = fakeHost({
        env: { PATH: '/usr/bin' },
        executables: ['/usr/bin/wine', '/usr/bin/wine64']
    });

    assert.equal(resolveWine(deps), '/usr/bin/wine64');
});

test('a non-executable candidate is rejected', () => {
    const deps = fakeHost({
        env: { PATH: '/usr/bin' },
        // Present on disk, but without the execute bit - accepting it would fail
        // later with EACCES.
        nonExecutables: ['/usr/bin/wine64', '/usr/bin/wine']
    });

    assert.equal(resolveWine(deps), undefined);
});

test('a non-executable configured path is rejected', () => {
    const deps = fakeHost({
        settings: { winePath: '/opt/wine/bin/wine' },
        nonExecutables: ['/opt/wine/bin/wine']
    });

    assert.equal(resolveWine(deps), undefined);
});

test('darwin falls back to the CrossOver and Whisky candidate locations', () => {
    const whisky = path.join(
        '/Users/tester',
        'Library/Application Support/com.isaacmarovitz.Whisky/Libraries/Wine/bin/wine'
    );
    const candidates = wineCandidates(fakeHost({ platform: 'darwin', env: { HOME: '/Users/tester' } }));

    assert.ok(candidates.includes('/opt/homebrew/bin/wine'));
    assert.ok(candidates.includes('/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine'));
    assert.ok(candidates.includes(whisky));
    assert.ok(!candidates.includes('/opt/wine-staging/bin/wine'));

    const deps = fakeHost({ platform: 'darwin', env: { HOME: '/Users/tester' }, executables: [whisky] });
    assert.equal(resolveWine(deps), whisky);
});

test('linux candidates are the distro paths, not the macOS bundles', () => {
    const candidates = wineCandidates(fakeHost({ platform: 'linux' }));

    assert.deepEqual(candidates, [
        '/usr/bin/wine',
        '/usr/local/bin/wine',
        '/opt/wine-stable/bin/wine',
        '/opt/wine-staging/bin/wine'
    ]);

    const deps = fakeHost({ platform: 'linux', executables: ['/opt/wine-stable/bin/wine'] });
    assert.equal(resolveWine(deps), '/opt/wine-stable/bin/wine');
});

test('the darwin candidate list tolerates a missing HOME', () => {
    const candidates = wineCandidates(fakeHost({ platform: 'darwin', env: {} }));

    assert.equal(candidates.length, 7);
    assert.ok(candidates.every(candidate => typeof candidate === 'string' && candidate.length > 0));
});

// ---------------------------------------------------------------------------
// toWinePath
// ---------------------------------------------------------------------------

test('toWinePath uses winepath output when it succeeds', async () => {
    const calls: Array<[string, string[]]> = [];
    const deps = fakeHost({
        execFile: async (file, args) => {
            calls.push([file, args]);
            return { stdout: 'Z:\\home\\tester\\Form1.cs\n', stderr: '' };
        }
    });

    const converted = await toWinePath('/usr/bin/wine', '/home/tester/Form1.cs', {}, undefined, deps);

    assert.equal(converted, 'Z:\\home\\tester\\Form1.cs');
    assert.deepEqual(calls, [['/usr/bin/wine', ['winepath', '-w', '/home/tester/Form1.cs']]]);
    assert.deepEqual(deps.logged, []);
});

test('toWinePath falls back to the Z: mapping when winepath fails', async () => {
    const deps = fakeHost({
        execFile: async () => {
            throw new Error('spawn wine ENOENT');
        }
    });

    const converted = await toWinePath('/usr/bin/wine', '/home/tester/Form1.cs', {}, undefined, deps);

    assert.equal(converted, 'Z:\\home\\tester\\Form1.cs');
    assert.equal(deps.logged.length, 1);
    assert.match(deps.logged.join('\n'), /winepath failed \(spawn wine ENOENT\)/);
    assert.match(deps.logged.join('\n'), /Z: mapping/);
});

test('toWinePath falls back to the Z: mapping when winepath prints nothing', async () => {
    const deps = fakeHost({ execFile: async () => ({ stdout: '   \n', stderr: '' }) });

    const converted = await toWinePath('/usr/bin/wine', '/home/tester/Form1.cs', {}, undefined, deps);

    assert.equal(converted, 'Z:\\home\\tester\\Form1.cs');
    assert.equal(deps.logged.length, 1);
    assert.match(deps.logged.join('\n'), /returned nothing/);
});

test('toWinePath rethrows when the launch was cancelled rather than silently falling back', async () => {
    const controller = new AbortController();
    const deps = fakeHost({
        execFile: async () => {
            controller.abort();
            throw new Error('The operation was aborted');
        }
    });

    await assert.rejects(
        () => toWinePath('/usr/bin/wine', '/home/tester/Form1.cs', {}, controller.signal, deps),
        /aborted/
    );
    assert.deepEqual(deps.logged, []);
});

// ---------------------------------------------------------------------------
// buildLauncher (P0-1b)
// ---------------------------------------------------------------------------

const EXTENSION_PATH = '/ext';
const BIN_DIR = path.join(EXTENSION_PATH, 'bin');
const DESIGNER_EXE = path.join(BIN_DIR, 'SWD4CS.exe');
const RUNTIME_CONFIG = path.join(BIN_DIR, 'SWD4CS.runtimeconfig.json');
const FORM = '/home/tester/Form1.cs';

test('a missing SWD4CS.exe refuses to launch and names the publish command', async () => {
    const deps = fakeHost({ platform: 'darwin', env: { PATH: '/usr/bin' }, executables: ['/usr/bin/wine64'] });

    const outcome = await buildLauncher(EXTENSION_PATH, FORM, undefined, deps);

    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && outcome.error.includes(DESIGNER_EXE));
    assert.ok(!outcome.ok && outcome.error.includes('--self-contained true'));
    // Nothing may be executed when we are refusing.
    assert.deepEqual(deps.calls, []);
});

test('a framework-dependent runtimeconfig refuses to launch (P0-1b)', async () => {
    const deps = fakeHost({
        platform: 'darwin',
        env: { PATH: '/usr/bin' },
        executables: [DESIGNER_EXE, '/usr/bin/wine64'],
        files: { [RUNTIME_CONFIG]: FRAMEWORK_DEPENDENT_RUNTIMECONFIG }
    });

    const outcome = await buildLauncher(EXTENSION_PATH, FORM, undefined, deps);

    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && outcome.error.includes('framework-dependent'));
    assert.ok(!outcome.ok && outcome.error.includes('dotnet publish -c Release -r win-x64 --self-contained true'));
    // The refusal comes before Wine is resolved, so winepath must not have run.
    assert.deepEqual(deps.calls, []);
});

test('an empty includedFrameworks array is still a framework-dependent build', async () => {
    const deps = fakeHost({
        platform: 'linux',
        env: { PATH: '/usr/bin' },
        executables: [DESIGNER_EXE, '/usr/bin/wine64'],
        files: { [RUNTIME_CONFIG]: JSON.stringify({ runtimeOptions: { includedFrameworks: [] } }) }
    });

    const outcome = await buildLauncher(EXTENSION_PATH, FORM, undefined, deps);

    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && outcome.error.includes('framework-dependent'));
});

test('an unreadable runtimeconfig refuses to launch', async () => {
    const deps = fakeHost({
        platform: 'linux',
        env: { PATH: '/usr/bin' },
        executables: [DESIGNER_EXE, '/usr/bin/wine64'],
        files: {}
    });

    const outcome = await buildLauncher(EXTENSION_PATH, FORM, undefined, deps);

    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && outcome.error.includes(RUNTIME_CONFIG));
    assert.ok(!outcome.ok && outcome.error.includes('ENOENT'));
});

test('a self-contained payload returns a Wine launcher', async () => {
    const deps = fakeHost({
        platform: 'darwin',
        env: { PATH: '/usr/bin', HOME: '/Users/tester' },
        executables: [DESIGNER_EXE, '/usr/bin/wine64'],
        files: { [RUNTIME_CONFIG]: SELF_CONTAINED_RUNTIMECONFIG },
        settings: { winePrefix: '/Users/tester/.wine-designer' }
    });

    const outcome = await buildLauncher(EXTENSION_PATH, FORM, undefined, deps);

    assert.equal(outcome.ok, true);
    assert.ok(outcome.ok);
    assert.equal(outcome.launcher.usesWine, true);
    assert.equal(outcome.launcher.cmd, '/usr/bin/wine64');
    // winepath produced nothing in the default fake, so the Z: fallback applies.
    assert.deepEqual(outcome.launcher.args, [DESIGNER_EXE, 'Z:\\home\\tester\\Form1.cs']);
    assert.equal(outcome.launcher.env.WINEPREFIX, '/Users/tester/.wine-designer');
    assert.equal(outcome.launcher.env.WINEDEBUG, '-all');
});

test('a self-contained payload with no Wine refuses to launch with a platform hint', async () => {
    const deps = fakeHost({
        platform: 'darwin',
        executables: [DESIGNER_EXE],
        files: { [RUNTIME_CONFIG]: SELF_CONTAINED_RUNTIMECONFIG }
    });

    const outcome = await buildLauncher(EXTENSION_PATH, FORM, undefined, deps);

    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && outcome.error.includes('Wine was not found'));
    assert.ok(!outcome.ok && outcome.error.includes('brew install'));
});

test('win32 runs the exe directly and never consults the runtimeconfig', async () => {
    const deps = fakeHost({ platform: 'win32', executables: [DESIGNER_EXE], env: { TMP: 'C:\\Temp' } });

    const outcome = await buildLauncher(EXTENSION_PATH, FORM, undefined, deps);

    assert.ok(outcome.ok);
    assert.equal(outcome.launcher.usesWine, false);
    assert.equal(outcome.launcher.cmd, DESIGNER_EXE);
    assert.deepEqual(outcome.launcher.args, [FORM]);
});
