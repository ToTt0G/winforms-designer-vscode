import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

/**
 * Wine writes fixme/err/warn chatter to stderr even on success. Wine's own
 * channels always carry a component and a function, e.g.
 * `err:process:exec_process failed to load ...`, so requiring that second colon
 * keeps the lines that matter: `error: could not parse form` from the designer
 * itself, `warn: Category[0]` from Microsoft.Extensions.Logging and
 * `wine: cannot find ...` from the loader.
 *
 * Wine also prefixes the emitting thread id on most builds and whenever WINEDEBUG
 * is not `-all`, e.g. `0024:err:module:import_dll ...`, so that prefix is optional
 * here - without it, changing `wineDebug` would strip nothing at all.
 */
export function stripWineNoise(output: string): string {
    return output
        .split('\n')
        .filter(line => !/^\s*(?:[0-9a-f]{3,}:)?(fixme|err|warn|trace):[\w.]+:/i.test(line))
        .join('\n')
        .trim();
}

/** Upper bound on the stderr we retain for the error message. */
export const STDERR_CAP_BYTES = 64 * 1024;

/**
 * Append to a capped buffer, keeping the tail - `WINEDEBUG=+relay` can emit
 * hundreds of MB, and the interesting part of a failure is always at the end.
 */
export function appendCapped(buffer: string, chunk: string, cap: number = STDERR_CAP_BYTES): string {
    const combined = buffer + chunk;
    return combined.length > cap ? combined.slice(combined.length - cap) : combined;
}

/** How the designer gets started on this platform. */
export interface Launcher {
    cmd: string;
    args: string[];
    env: NodeJS.ProcessEnv;
    /** True when we go through Wine, i.e. everywhere except Windows. */
    usesWine: boolean;
}

/** Either a launcher, or the reason we refuse to launch. */
export type LauncherOutcome =
    | { ok: true; launcher: Launcher }
    | { ok: false; error: string };

/**
 * Everything in this module that touches the host goes through this seam, so
 * the platform- and filesystem-dependent logic can be unit tested with fakes.
 */
export interface HostDeps {
    existsSync(target: string): boolean;
    statSync(target: string): { isFile(): boolean };
    /** Throws when the check fails, like `fs.accessSync`. */
    accessSync(target: string, mode: number): void;
    readFileSync(target: string): string;
    execFile(
        file: string,
        args: string[],
        options: { env?: NodeJS.ProcessEnv; timeout?: number; signal?: AbortSignal }
    ): Promise<{ stdout: string; stderr: string }>;
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    /** Raw configuration read; the value is deliberately untyped. */
    getSetting(key: string): unknown;
    /** Optional diagnostic sink; the extension routes this to its output channel. */
    log?(message: string): void;
}

const execFileAsync = promisify(child_process.execFile);

/**
 * The real host. `getSetting` returns `undefined` (i.e. "nothing configured")
 * because this module has no VS Code dependency; the extension passes a deps
 * object whose `getSetting` reads the workspace configuration.
 */
export const nodeHostDeps: HostDeps = {
    existsSync: (target: string) => fs.existsSync(target),
    statSync: (target: string) => fs.statSync(target),
    accessSync: (target: string, mode: number) => fs.accessSync(target, mode),
    readFileSync: (target: string) => fs.readFileSync(target, 'utf8'),
    execFile: async (file, args, options) => {
        const result = await execFileAsync(file, args, { ...options, encoding: 'utf8' });
        return { stdout: result.stdout, stderr: result.stderr };
    },
    platform: process.platform,
    env: process.env,
    getSetting: () => undefined
};

function logTo(deps: HostDeps, message: string): void {
    deps.log?.(message);
}

/**
 * Read a configuration value as a string. VS Code only substitutes the declared
 * default when the value is `undefined`, so a `null` or numeric value from a bad
 * settings merge reaches us unchanged and must not be asserted to be a string.
 */
export function getStringSetting(key: string, fallback: string, deps: HostDeps = nodeHostDeps): string {
    const value: unknown = deps.getSetting(key);
    return typeof value === 'string' ? value.trim() : fallback;
}

/** Wine locations we check when 'winformsDesigner.winePath' is not set. */
export function wineCandidates(deps: HostDeps = nodeHostDeps): string[] {
    const home = deps.env.HOME ?? '';
    if (deps.platform === 'darwin') {
        return [
            '/opt/homebrew/bin/wine',
            '/usr/local/bin/wine',
            '/Applications/Wine Stable.app/Contents/Resources/wine/bin/wine',
            '/Applications/Wine Staging.app/Contents/Resources/wine/bin/wine',
            '/Applications/Wine Devel.app/Contents/Resources/wine/bin/wine',
            '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine',
            path.join(home, 'Library/Application Support/com.isaacmarovitz.Whisky/Libraries/Wine/bin/wine')
        ];
    }
    return [
        '/usr/bin/wine',
        '/usr/local/bin/wine',
        '/opt/wine-stable/bin/wine',
        '/opt/wine-staging/bin/wine'
    ];
}

/** True when the path is a file we are actually allowed to execute. */
function isExecutableFile(target: string, deps: HostDeps): boolean {
    try {
        if (!deps.existsSync(target) || !deps.statSync(target).isFile()) {
            return false;
        }
        // Without X_OK a non-executable match wins here and fails later with EACCES.
        deps.accessSync(target, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/** Look up a bare executable name on PATH, without shelling out. */
export function findOnPath(name: string, deps: HostDeps = nodeHostDeps): string | undefined {
    const dirs = (deps.env.PATH ?? '').split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
        const candidate = path.join(dir, name);
        if (isExecutableFile(candidate, deps)) {
            return candidate;
        }
    }
    return undefined;
}

export function resolveWine(deps: HostDeps = nodeHostDeps): string | undefined {
    const configured = getStringSetting('winePath', '', deps);

    if (configured) {
        // An explicit setting is authoritative: if it is wrong, say so rather than
        // silently falling back to some other Wine.
        if (configured.includes(path.sep) || configured.includes('/')) {
            return isExecutableFile(configured, deps) ? configured : undefined;
        }
        return findOnPath(configured, deps);
    }

    for (const name of ['wine64', 'wine']) {
        const found = findOnPath(name, deps);
        if (found) {
            return found;
        }
    }
    return wineCandidates(deps).find(candidate => isExecutableFile(candidate, deps));
}

export function wineEnv(deps: HostDeps = nodeHostDeps): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...deps.env };

    const prefix = getStringSetting('winePrefix', '', deps);
    if (prefix) {
        env.WINEPREFIX = prefix;
    }
    // Wine is extremely chatty on stderr; keep it quiet unless asked otherwise.
    const debug = getStringSetting('wineDebug', '-all', deps);
    if (debug) {
        env.WINEDEBUG = debug;
    }
    return env;
}

/**
 * Translate a host path into one the designer will see from inside Wine.
 * Prefers `winepath -w`; falls back to the default Z: drive mapping, which is
 * what Wine maps to '/' in a stock prefix.
 */
export async function toWinePath(
    wine: string,
    hostPath: string,
    env: NodeJS.ProcessEnv,
    signal?: AbortSignal,
    deps: HostDeps = nodeHostDeps
): Promise<string> {
    try {
        const result = await deps.execFile(wine, ['winepath', '-w', hostPath], {
            env,
            // A cold prefix has to be created first, which is slow.
            timeout: 120_000,
            signal
        });
        const converted = result.stdout.trim();
        if (converted) {
            return converted;
        }
        logTo(deps, `winepath returned nothing for ${hostPath}; falling back to the Z: drive mapping.`);
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }
        logTo(deps, `winepath failed (${describeError(error)}); falling back to the Z: drive mapping. ` +
            'CrossOver and Whisky bottles sometimes drop the Z: mapping, in which case the designer ' +
            'will report that it cannot find the file.');
    }
    return 'Z:' + hostPath.replace(/\//g, '\\');
}

export function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

export function installHint(deps: HostDeps = nodeHostDeps): string {
    switch (deps.platform) {
        case 'darwin':
            return 'Install Wine (for example `brew install --cask --no-quarantine wine-stable`, or CrossOver) ' +
                'or set `winformsDesigner.winePath`.';
        case 'linux':
            return 'Install Wine (for example `sudo apt install wine64` or your distro equivalent) ' +
                'or set `winformsDesigner.winePath`.';
        default:
            return 'Set `winformsDesigner.winePath` to your Wine binary.';
    }
}

const PUBLISH_COMMAND = 'dotnet publish -c Release -r win-x64 --self-contained true';

/**
 * A framework-dependent build cannot run inside a Wine prefix (there is no
 * Microsoft.WindowsDesktop.App installed there), and the resulting failure is
 * opaque. Detect it from the runtimeconfig instead.
 */
function selfContainedProblem(binDir: string, deps: HostDeps): string | undefined {
    const runtimeConfig = path.join(binDir, 'SWD4CS.runtimeconfig.json');
    let parsed: unknown;
    try {
        parsed = JSON.parse(deps.readFileSync(runtimeConfig));
    } catch (error) {
        return `Could not read ${runtimeConfig} (${describeError(error)}), so the designer in \`bin/\` ` +
            `cannot be verified as a self-contained build. Re-run \`${PUBLISH_COMMAND}\`.`;
    }

    const runtimeOptions = (parsed as { runtimeOptions?: { includedFrameworks?: unknown } } | null)?.runtimeOptions;
    const included: unknown = runtimeOptions?.includedFrameworks;
    if (!Array.isArray(included) || included.length === 0) {
        return 'The designer in `bin/` is a framework-dependent build, which cannot run inside a Wine ' +
            `prefix. Re-run \`${PUBLISH_COMMAND}\`.`;
    }
    return undefined;
}

export async function buildLauncher(
    extensionPath: string,
    filePath: string,
    signal?: AbortSignal,
    deps: HostDeps = nodeHostDeps
): Promise<LauncherOutcome> {
    const binDir = path.join(extensionPath, 'bin');
    const designerExe = path.join(binDir, 'SWD4CS.exe');
    const designerDll = path.join(binDir, 'SWD4CS.dll');

    if (deps.platform === 'win32') {
        if (deps.existsSync(designerExe)) {
            return { ok: true, launcher: { cmd: designerExe, args: [filePath], env: { ...deps.env }, usesWine: false } };
        }
        if (deps.existsSync(designerDll)) {
            return {
                ok: true,
                launcher: { cmd: 'dotnet', args: [designerDll, filePath], env: { ...deps.env }, usesWine: false }
            };
        }
        return { ok: false, error: `Designer executable not found at: ${designerExe}` };
    }

    // macOS / Linux: the designer is a Windows binary, so it runs through Wine.
    // The `dotnet SWD4CS.dll` path is deliberately not offered here - that dll
    // targets a Windows TFM and the host dotnet cannot load it.
    if (!deps.existsSync(designerExe)) {
        return {
            ok: false,
            error: `Designer executable not found at: ${designerExe}. On ${deps.platform} it must be a ` +
                `self-contained Windows build: \`${PUBLISH_COMMAND}\`.`
        };
    }

    const payloadProblem = selfContainedProblem(binDir, deps);
    if (payloadProblem) {
        return { ok: false, error: payloadProblem };
    }

    const wine = resolveWine(deps);
    if (!wine) {
        return { ok: false, error: `Wine was not found, so the designer cannot be started. ${installHint(deps)}` };
    }

    const env = wineEnv(deps);
    return {
        ok: true,
        launcher: {
            cmd: wine,
            args: [designerExe, await toWinePath(wine, filePath, env, signal, deps)],
            env,
            usesWine: true
        }
    };
}
