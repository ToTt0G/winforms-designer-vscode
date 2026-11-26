import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const production = args.has('--production');
const watch = args.has('--watch');
const buildTests = args.has('--tests');

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function findTestFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(full));
    } else if (entry.name.endsWith('.test.ts')) {
      results.push(full);
    }
  }
  return results;
}

async function run() {
  if (buildTests) {
    const testEntries = findTestFiles(path.join(rootDir, 'test'));
    if (testEntries.length === 0) {
      console.log('No TypeScript test files found.');
      return;
    }
    await esbuild.build({
      entryPoints: testEntries,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      outdir: path.join(rootDir, 'out-test'),
      outbase: path.join(rootDir, 'test'),
      sourcemap: true,
      external: ['vscode'],
    });
    console.log(`Built ${testEntries.length} test file(s) to out-test/`);
    return;
  }

  const extensionCtx = await esbuild.context({
    entryPoints: [path.join(rootDir, 'src/extension/extension.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: path.join(rootDir, 'dist/extension.js'),
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
  });

  const webviewCtx = await esbuild.context({
    entryPoints: [path.join(rootDir, 'src/webview/index.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    jsx: 'automatic',
    outfile: path.join(rootDir, 'dist/webview.js'),
    sourcemap: !production,
    minify: production,
    loader: {
      '.css': 'css',
      '.svg': 'dataurl',
    },
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"',
    },
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
    console.log('Watching extension and webview bundles...');
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
    console.log(`Built dist/extension.js and dist/webview.js (${production ? 'production' : 'development'})`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
