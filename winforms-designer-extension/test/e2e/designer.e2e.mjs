import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(extensionRoot, '..');
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Playwright & Chromium environment discovery
// ---------------------------------------------------------------------------

function loadPlaywrightCore() {
  // 1. Standard resolution (node_modules / CI)
  try {
    return require('playwright-core');
  } catch {
    // fall through
  }

  // 2. Known T3 runtime location, then scan any runtime versions newest-first
  const candidates = [
    '/home/t3dev/.t3/runtime/versions/0.1.12-nightly.20261125.5230/node_modules/playwright-core',
  ];

  const versionsDir = '/home/t3dev/.t3/runtime/versions';
  if (fs.existsSync(versionsDir)) {
    const entries = fs
      .readdirSync(versionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
    for (const ver of entries) {
      const p = path.join(versionsDir, ver, 'node_modules', 'playwright-core');
      if (!candidates.includes(p)) candidates.push(p);
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }

  throw new Error(
    'Unable to locate playwright-core. Install playwright-core or ensure the T3 runtime directory is available.'
  );
}

function findChromiumExecutable() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const preferred = '/home/t3dev/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
  if (fs.existsSync(preferred)) {
    return preferred;
  }

  const cacheDir = '/home/t3dev/.cache/ms-playwright';
  if (fs.existsSync(cacheDir)) {
    const dirs = fs
      .readdirSync(cacheDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('chromium-'))
      .map((e) => e.name)
      .sort()
      .reverse();
    for (const dir of dirs) {
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const candidate = path.join(cacheDir, dir, rel);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// In-memory core module loader (zero temporary files left on disk)
// ---------------------------------------------------------------------------

async function loadCoreModule() {
  const entry = path.join(extensionRoot, 'src', 'core', 'index.ts');
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  });
  const code = result.outputFiles[0].text;
  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', code);
  fn(require, mod, mod.exports, entry, path.dirname(entry));
  return mod.exports;
}

// ---------------------------------------------------------------------------
// Local ephemeral HTTP server for dist/webview.js & dist/webview.css
// ---------------------------------------------------------------------------

async function startWebviewServer() {
  const webviewJsPath = path.join(extensionRoot, 'dist', 'webview.js');
  const webviewCssPath = path.join(extensionRoot, 'dist', 'webview.css');

  assert.ok(fs.existsSync(webviewJsPath), `Missing ${webviewJsPath} — run "npm run build" first.`);
  assert.ok(fs.existsSync(webviewCssPath), `Missing ${webviewCssPath} — run "npm run build" first.`);

  const webviewJs = fs.readFileSync(webviewJsPath);
  const webviewCss = fs.readFileSync(webviewCssPath);
  const html = Buffer.from(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Modern WinForms Designer E2E</title>
  <link rel="icon" href="data:," />
  <link rel="stylesheet" href="/webview.css" />
</head>
<body>
  <div id="root"></div>
  <script src="/webview.js"></script>
</body>
</html>`,
    'utf8'
  );

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (pathname === '/webview.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(webviewJs);
      return;
    }
    if (pathname === '/webview.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(webviewCss);
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const url = `http://127.0.0.1:${addr.port}/`;
  return {
    url,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// ---------------------------------------------------------------------------
// Document & page helpers
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  gridSize: 8,
  layoutMode: 'snaplines',
  showGrid: true,
  renderStyle: 'fluent',
  useThisQualifier: 'auto',
  eventHandlerStyle: 'auto',
};

function findNodeByName(doc, name) {
  let found = null;
  const walk = (node) => {
    if (!node || found) return;
    if (node.name === name) {
      found = node;
      return;
    }
    for (const child of node.children || []) {
      walk(child);
    }
  };
  walk(doc.form);
  if (!found) {
    for (const comp of doc.components || []) {
      walk(comp);
    }
  }
  return found;
}

async function initDesigner(page, serverUrl, initPayload) {
  await page.goto(serverUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__WINFORMS_DESIGNER__), { timeout: 10000 });

  await page.evaluate((payload) => {
    window.__WINFORMS_DESIGNER__.dispatchHostMessage({
      type: 'init',
      document: payload.document,
      settings: payload.settings,
      fileName: payload.fileName,
      codeBehindFileName: payload.codeBehindFileName,
      hasCodeBehind: payload.hasCodeBehind,
      codeBehindHandlers: payload.codeBehindHandlers,
      themeKind: payload.themeKind,
      resourceDataUris: payload.resourceDataUris || {},
      ...(payload.hasProject !== undefined ? { hasProject: payload.hasProject } : {}),
      ...(payload.availableCultures !== undefined ? { availableCultures: payload.availableCultures } : {}),
      ...(payload.activeCulture !== undefined ? { activeCulture: payload.activeCulture } : {}),
      ...(payload.cultureStrings !== undefined ? { cultureStrings: payload.cultureStrings } : {}),
    });
    window.__WINFORMS_DESIGNER__.clearSentMessages();
  }, initPayload);

  await page.locator('.wd-app').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.wd-canvas').waitFor({ state: 'visible', timeout: 10000 });
}

async function getDesignerState(page) {
  return page.evaluate(() => window.__WINFORMS_DESIGNER__.getState());
}

async function getSentMessages(page) {
  return page.evaluate(() => window.__WINFORMS_DESIGNER__.getSentMessages());
}

async function clearSentMessages(page) {
  return page.evaluate(() => window.__WINFORMS_DESIGNER__.clearSentMessages());
}

async function assertNonZeroBox(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `Expected ${label} to have non-zero bounding box, got ${JSON.stringify(box)}`);
  return box;
}

async function waitForApplyDocumentCount(page, minCount, timeout = 5000) {
  await page.waitForFunction(
    (expected) =>
      window.__WINFORMS_DESIGNER__
        .getSentMessages()
        .filter((m) => m.type === 'applyDocument').length >= expected,
    minCount,
    { timeout }
  );
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------

async function runSuite() {
  const { chromium } = loadPlaywrightCore();
  const executablePath = findChromiumExecutable();
  const core = await loadCoreModule();
  const { parseDesignerCs, generateDesignerCs, parseCodeBehind, auditDesignDocument } = core;

  assert.equal(typeof parseDesignerCs, 'function', 'parseDesignerCs must be exported from src/core/index.ts');
  assert.equal(typeof generateDesignerCs, 'function', 'generateDesignerCs must be exported from src/core/index.ts');
  assert.equal(typeof parseCodeBehind, 'function', 'parseCodeBehind must be exported from src/core/index.ts');
  assert.equal(typeof auditDesignDocument, 'function', 'auditDesignDocument must be exported from src/core/index.ts');

  const orderDesignerPath = path.join(repoRoot, 'samples', 'OrderManagerDemo', 'MainForm.Designer.cs');
  const orderCodeBehindPath = path.join(repoRoot, 'samples', 'OrderManagerDemo', 'MainForm.cs');
  const testDesignFilePath = path.join(repoRoot, 'TestDesignFile', 'Form1.Designer.cs');

  const orderDesignerSource = fs.readFileSync(orderDesignerPath, 'utf8');
  const orderCodeBehindSource = fs.readFileSync(orderCodeBehindPath, 'utf8');
  const testDesignFileSource = fs.readFileSync(testDesignFilePath, 'utf8');

  const makeOrderInitPayload = (overrides = {}) => {
    const doc = parseDesignerCs(orderDesignerSource);
    const cb = parseCodeBehind(orderCodeBehindSource);
    return {
      document: doc,
      settings: { ...DEFAULT_SETTINGS },
      fileName: 'MainForm.Designer.cs',
      codeBehindFileName: 'MainForm.cs',
      hasCodeBehind: true,
      codeBehindHandlers: cb.methods,
      themeKind: 'dark',
      resourceDataUris: {},
      ...overrides,
    };
  };

  let server;
  let browser;
  let passed = 0;
  let failed = 0;

  try {
    server = await startWebviewServer();
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      env: {
        ...process.env,
        TMPDIR: '/tmp',
        XDG_RUNTIME_DIR: '/tmp',
      },
    });

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.stack || String(err));
    });

    const runTest = async (name, fn) => {
      consoleErrors.length = 0;
      pageErrors.length = 0;
      const start = Date.now();
      try {
        await fn();
        assert.deepEqual(consoleErrors, [], `Unexpected console errors: ${consoleErrors.join(' | ')}`);
        assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join(' | ')}`);
        passed++;
        console.log(`  PASS  ${name} (${Date.now() - start}ms)`);
      } catch (err) {
        failed++;
        console.error(`  FAIL  ${name} (${Date.now() - start}ms)`);
        console.error(err);
        if (consoleErrors.length) console.error('  Console errors:', consoleErrors);
        if (pageErrors.length) console.error('  Page errors:', pageErrors);
      }
    };

    console.log('Running Modern WinForms Designer E2E suite in headless Chromium (1440x900)...');

    // -----------------------------------------------------------------------
    // 1. Real samples/OrderManagerDemo/MainForm.Designer.cs Full Stack Load & Render
    // -----------------------------------------------------------------------
    await runTest('1. OrderManagerDemo full-stack load & 4-pane + canvas render', async () => {
      const payload = makeOrderInitPayload();
      assert.equal(payload.document.className, 'MainForm');
      assert.equal(payload.document.components.length, 3);
      assert.ok(payload.codeBehindHandlers.some((m) => m.name === 'MainForm_Load'));
      assert.ok(payload.codeBehindHandlers.some((m) => m.name === 'btnApplyFilter_Click'));

      await initDesigner(page, server.url, payload);

      // Assert all IDE panes + Component Tray render with non-zero bounding boxes
      await assertNonZeroBox(page.locator('.wd-toolbox'), 'Toolbox pane');
      await assertNonZeroBox(page.locator('.wd-outline'), 'Document Outline pane');
      await assertNonZeroBox(page.locator('.wd-canvas'), 'Design Canvas pane');
      await assertNonZeroBox(page.locator('.wd-props'), 'Properties sidebar');
      await assertNonZeroBox(page.locator('.wd-tray'), 'Component Tray');

      // Component tray items
      for (const compName of ['refreshTimer', 'exportDialog', 'toolbarIcons']) {
        await assertNonZeroBox(
          page.locator('.wd-tray-items .wd-chip', { hasText: compName }),
          `Component tray chip ${compName}`
        );
      }

      // Key controls visible on canvas
      await assertNonZeroBox(
        page.locator('.wd-canvas [data-form-caption]', { hasText: 'Order Manager — Desktop Console' }),
        'Form caption title'
      );
      await assertNonZeroBox(
        page.locator('.wd-canvas .wf-group-legend', { hasText: 'Order Filters' }),
        'GroupBox Order Filters'
      );
      await assertNonZeroBox(
        page.locator('.wd-canvas .wf-button', { hasText: 'Apply Filter' }),
        'Apply Filter button'
      );
      await assertNonZeroBox(
        page.locator('.wd-canvas .wf-tab-header', { hasText: 'Active Orders' }),
        'Active Orders tab header'
      );
      await assertNonZeroBox(
        page.locator('.wd-canvas .wf-tab-header', { hasText: 'Batch Summary' }),
        'Batch Summary tab header'
      );
      for (const colHeader of ['Order ID', 'Customer', 'Shipped']) {
        await assertNonZeroBox(
          page.locator('.wd-canvas .wf-dg-colhead', { hasText: colHeader }),
          `DataGridView column header "${colHeader}"`
        );
      }

      // Verify implicit defaultDock stacking on real MainForm.Designer.cs
      // (MenuStrip/ToolStrip/StatusStrip omit explicit Dock in VS-generated C#)
      const menuStrip = findNodeByName(payload.document, 'menuStrip1');
      const toolStrip = findNodeByName(payload.document, 'toolStrip1');
      const splitMain = findNodeByName(payload.document, 'splitMain');
      const statusStrip = findNodeByName(payload.document, 'statusStrip1');
      const menuBox = await assertNonZeroBox(page.locator(`.wd-canvas [data-node-id="${menuStrip.id}"]`), 'menuStrip1');
      const toolBox = await assertNonZeroBox(page.locator(`.wd-canvas [data-node-id="${toolStrip.id}"]`), 'toolStrip1');
      const splitBox = await assertNonZeroBox(page.locator(`.wd-canvas [data-node-id="${splitMain.id}"]`), 'splitMain');
      const statusBox = await assertNonZeroBox(page.locator(`.wd-canvas [data-node-id="${statusStrip.id}"]`), 'statusStrip1');
      assert.ok(
        Math.round(menuBox.y + menuBox.height) <= Math.round(toolBox.y) + 1,
        `menuStrip1 bottom (${menuBox.y + menuBox.height}) should sit above toolStrip1 top (${toolBox.y})`
      );
      assert.ok(
        Math.round(toolBox.y + toolBox.height) <= Math.round(splitBox.y) + 1,
        `toolStrip1 bottom (${toolBox.y + toolBox.height}) should sit above splitMain top (${splitBox.y})`
      );
      assert.ok(
        Math.round(splitBox.y + splitBox.height) <= Math.round(statusBox.y) + 1,
        `splitMain bottom (${splitBox.y + splitBox.height}) should sit above statusStrip1 top (${statusBox.y})`
      );
    });

    // -----------------------------------------------------------------------
    // 2. Interactive Canvas Edit -> Real generateDesignerCs -> Re-Parse Round-Trip + Undo/Redo
    // -----------------------------------------------------------------------
    await runTest('2. Interactive canvas nudge -> generateDesignerCs -> re-parse round-trip & Undo/Redo', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      const initialDoc = (await getDesignerState(page)).document;
      const btnApprove = findNodeByName(initialDoc, 'btnApprove');
      assert.ok(btnApprove, 'btnApprove should exist in parsed document');
      const startX = btnApprove.properties.Location.x;
      const startY = btnApprove.properties.Location.y;
      assert.deepEqual({ x: startX, y: startY }, { x: 344, y: 10 });

      // Select btnApprove on canvas
      await page.locator(`.wd-canvas [data-node-id="${btnApprove.id}"]`).click();
      const selState = await getDesignerState(page);
      assert.deepEqual(selState.selection, [btnApprove.id]);

      // Nudge right by gridSize (8px) -> verify exactly one applyDocument
      await clearSentMessages(page);
      await page.keyboard.press('ArrowRight');
      await waitForApplyDocumentCount(page, 1);

      let applyMsgs = (await getSentMessages(page)).filter((m) => m.type === 'applyDocument');
      assert.equal(applyMsgs.length, 1, 'ArrowRight should emit exactly one applyDocument');
      let movedNode = findNodeByName(applyMsgs[0].document, 'btnApprove');
      assert.equal(movedNode.properties.Location.x, startX + 8);
      assert.equal(movedNode.properties.Location.y, startY);

      // Nudge down by gridSize (8px) -> verify second applyDocument
      await page.keyboard.press('ArrowDown');
      await waitForApplyDocumentCount(page, 2);

      applyMsgs = (await getSentMessages(page)).filter((m) => m.type === 'applyDocument');
      assert.equal(applyMsgs.length, 2, 'ArrowDown should emit a second applyDocument');
      const finalEditedDoc = applyMsgs[1].document;
      movedNode = findNodeByName(finalEditedDoc, 'btnApprove');
      assert.equal(movedNode.properties.Location.x, startX + 8);
      assert.equal(movedNode.properties.Location.y, startY + 8);

      // Generate real C# and re-parse round-trip
      const generatedCs = generateDesignerCs(finalEditedDoc);
      assert.ok(
        generatedCs.includes(`new System.Drawing.Point(${startX + 8}, ${startY + 8})`),
        `Generated C# should contain updated Point(${startX + 8}, ${startY + 8})`
      );

      const reparsedDoc = parseDesignerCs(generatedCs);
      const reparsedBtn = findNodeByName(reparsedDoc, 'btnApprove');
      assert.deepEqual(reparsedBtn.properties.Location, {
        kind: 'point',
        x: startX + 8,
        y: startY + 8,
      });

      // Undo twice (Ctrl+Z) -> reverts back to original (344, 10)
      await clearSentMessages(page);
      await page.keyboard.press('Control+z');
      await waitForApplyDocumentCount(page, 1);
      let afterUndo1 = findNodeByName((await getDesignerState(page)).document, 'btnApprove');
      assert.deepEqual(afterUndo1.properties.Location, { kind: 'point', x: startX + 8, y: startY });

      await page.keyboard.press('Control+z');
      await waitForApplyDocumentCount(page, 2);
      let afterUndo2 = findNodeByName((await getDesignerState(page)).document, 'btnApprove');
      assert.deepEqual(afterUndo2.properties.Location, { kind: 'point', x: startX, y: startY });

      // Redo twice (Ctrl+Y) -> re-applies cleanly to (352, 18)
      await page.keyboard.press('Control+y');
      await waitForApplyDocumentCount(page, 3);
      let afterRedo1 = findNodeByName((await getDesignerState(page)).document, 'btnApprove');
      assert.deepEqual(afterRedo1.properties.Location, { kind: 'point', x: startX + 8, y: startY });

      await page.keyboard.press('Control+y');
      await waitForApplyDocumentCount(page, 4);
      let afterRedo2 = findNodeByName((await getDesignerState(page)).document, 'btnApprove');
      assert.deepEqual(afterRedo2.properties.Location, { kind: 'point', x: startX + 8, y: startY + 8 });
    });

    // -----------------------------------------------------------------------
    // 3. TabControl Switching, SplitContainer Dragging & Form Resize Anchor Propagation
    // -----------------------------------------------------------------------
    await runTest('3. TabControl switching, SplitContainer drag & Form resize anchor propagation', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      const doc0 = (await getDesignerState(page)).document;
      const dtpOrderDate = findNodeByName(doc0, 'dtpOrderDate');
      const numBatchLimit = findNodeByName(doc0, 'numBatchLimit');
      const rtbNotes = findNodeByName(doc0, 'rtbNotes');
      const dgvOrders = findNodeByName(doc0, 'dgvOrders');
      const splitMain = findNodeByName(doc0, 'splitMain');

      // Initially on Active Orders: Batch Summary controls are hidden
      assert.equal(await page.locator(`.wd-canvas [data-node-id="${dtpOrderDate.id}"]`).count(), 0);
      assert.equal(await page.locator(`.wd-canvas [data-node-id="${numBatchLimit.id}"]`).count(), 0);
      assert.equal(await page.locator(`.wd-canvas [data-node-id="${rtbNotes.id}"]`).count(), 0);

      // Click Batch Summary tab -> verify controls become visible
      await page.locator('.wd-canvas .wf-tab-header', { hasText: 'Batch Summary' }).click();
      await assertNonZeroBox(page.locator(`.wd-canvas [data-node-id="${dtpOrderDate.id}"]`), 'dtpOrderDate');
      await assertNonZeroBox(page.locator(`.wd-canvas [data-node-id="${numBatchLimit.id}"]`), 'numBatchLimit');
      await assertNonZeroBox(page.locator(`.wd-canvas [data-node-id="${rtbNotes.id}"]`), 'rtbNotes');

      // Switch back to Active Orders
      await page.locator('.wd-canvas .wf-tab-header', { hasText: 'Active Orders' }).click();
      await assertNonZeroBox(page.locator(`.wd-canvas [data-node-id="${dgvOrders.id}"]`), 'dgvOrders');

      // Drag SplitContainer splitter bar right by +40px
      await clearSentMessages(page);
      const splitter = page.locator(`.wd-canvas [data-splitter="${splitMain.id}"]`);
      const spBox = await assertNonZeroBox(splitter, 'splitMain splitter');
      const spStartX = spBox.x + spBox.width / 2;
      const spStartY = spBox.y + spBox.height / 2;
      await page.mouse.move(spStartX, spStartY);
      await page.mouse.down();
      await page.mouse.move(spStartX + 40, spStartY, { steps: 6 });
      await page.mouse.up();
      await waitForApplyDocumentCount(page, 1);

      const afterSplitState = await getDesignerState(page);
      const splitAfter = findNodeByName(afterSplitState.document, 'splitMain');
      assert.ok(
        splitAfter.properties.SplitterDistance > 244,
        `Expected SplitterDistance > 244 after dragging right, got ${splitAfter.properties.SplitterDistance}`
      );

      // Record before-resize positions for anchor propagation check
      const formBefore = afterSplitState.document.form.properties.ClientSize;
      const filterBefore = findNodeByName(afterSplitState.document, 'btnApplyFilter').properties.Location;
      const exportBefore = findNodeByName(afterSplitState.document, 'btnExport').properties.Location;

      // Scroll canvas so the Form SE resize handle and its drag destination are well inside the viewport
      await page.evaluate(() => {
        const scroller = document.querySelector('.wd-canvas');
        if (scroller) {
          scroller.scrollLeft = 220;
          scroller.scrollTop = 120;
        }
      });

      // Drag Form SE resize handle by (+60, +40)
      await clearSentMessages(page);
      const seHandle = page.locator('.wd-form-handle.se');
      await seHandle.scrollIntoViewIfNeeded();
      const seBox = await assertNonZeroBox(seHandle, 'Form SE resize handle');
      const seX = seBox.x + seBox.width / 2;
      const seY = seBox.y + seBox.height / 2;
      await page.mouse.move(seX, seY);
      await page.mouse.down();
      await page.mouse.move(seX + 60, seY + 40, { steps: 8 });
      await page.mouse.up();
      await waitForApplyDocumentCount(page, 1);

      const resizeMsgs = (await getSentMessages(page)).filter((m) => m.type === 'applyDocument');
      assert.equal(resizeMsgs.length, 1, 'Form resize gesture should emit one coalesced applyDocument');
      const resizedDoc = resizeMsgs[0].document;
      const formAfter = resizedDoc.form.properties.ClientSize;
      const filterAfter = findNodeByName(resizedDoc, 'btnApplyFilter').properties.Location;
      const exportAfter = findNodeByName(resizedDoc, 'btnExport').properties.Location;

      const dw = formAfter.width - formBefore.width;
      const dh = formAfter.height - formBefore.height;
      assert.ok(dw > 30 && dh > 20, `Expected Form ClientSize to grow significantly, delta=(${dw}, ${dh})`);
      assert.equal(
        filterAfter.y,
        filterBefore.y + dh,
        `Bottom-anchored btnApplyFilter.Y should shift by +${dh}`
      );
      assert.equal(
        exportAfter.x,
        exportBefore.x + dw,
        `Right-anchored btnExport.X should shift by +${dw}`
      );

      // Verify generated C# reflects new ClientSize and updated anchored child Locations
      const generatedCs = generateDesignerCs(resizedDoc);
      assert.ok(
        generatedCs.includes(`this.ClientSize = new System.Drawing.Size(${formAfter.width}, ${formAfter.height});`),
        'Generated C# should reflect updated ClientSize'
      );
      assert.ok(
        generatedCs.includes(`this.btnApplyFilter.Location = new System.Drawing.Point(${filterAfter.x}, ${filterAfter.y});`),
        'Generated C# should reflect updated btnApplyFilter.Location'
      );
      assert.ok(
        generatedCs.includes(`this.btnExport.Location = new System.Drawing.Point(${exportAfter.x}, ${exportAfter.y});`),
        'Generated C# should reflect updated btnExport.Location'
      );
    });

    // -----------------------------------------------------------------------
    // 4. Toolbox Double-Click Insert, Duplicate / Copy-Paste, Delete & Undo
    // -----------------------------------------------------------------------
    await runTest('4. Toolbox search & double-click insert, duplicate, copy/paste, delete & undo', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      // Select grpFilters so the inserted button lands directly in a visible container
      const doc0 = (await getDesignerState(page)).document;
      const grpFilters = findNodeByName(doc0, 'grpFilters');
      await page.locator(`.wd-outline [data-outline-id="${grpFilters.id}"]`).click();

      // Filter Toolbox for "Button" and double-click to insert
      const searchInput = page.locator('[data-testid="toolbox-search"]');
      await searchInput.fill('Button');
      const buttonTool = page.locator('.wd-toolbox [data-control-type="Button"]');
      await assertNonZeroBox(buttonTool, 'Toolbox Button item');

      await clearSentMessages(page);
      await buttonTool.dblclick();
      await waitForApplyDocumentCount(page, 1);

      const insertMsgs = (await getSentMessages(page)).filter((m) => m.type === 'applyDocument');
      assert.equal(insertMsgs.length, 1);
      const insertedState = await getDesignerState(page);
      assert.equal(insertedState.selection.length, 1);
      const insertedId = insertedState.selection[0];
      const insertedNode = findNodeByName(insertedState.document, 'button1');
      assert.ok(insertedNode, 'Inserted button should have unique name button1');
      assert.equal(insertedNode.id, insertedId);

      // Verify generateDesignerCs declares field AND adds to Controls.Add(...)
      const generatedCs = generateDesignerCs(insertedState.document);
      assert.ok(
        generatedCs.includes('private System.Windows.Forms.Button button1;'),
        'Generated C# should declare button1 field'
      );
      assert.ok(
        generatedCs.includes('.Controls.Add(this.button1);'),
        'Generated C# should add button1 to Controls'
      );

      // Focus canvas by clicking the newly inserted button on the design surface
      await page.locator(`.wd-canvas [data-node-id="${insertedNode.id}"]`).click();

      // Duplicate via Ctrl+D
      await clearSentMessages(page);
      await page.keyboard.press('Control+d');
      await waitForApplyDocumentCount(page, 1);
      const dupState = await getDesignerState(page);
      const dupNode = findNodeByName(dupState.document, 'button2');
      assert.ok(dupNode, 'Ctrl+D should create unique duplicate button2');
      assert.deepEqual(dupState.selection, [dupNode.id]);

      // Copy & Paste via Ctrl+C / Ctrl+V
      await clearSentMessages(page);
      await page.keyboard.press('Control+c');
      await page.keyboard.press('Control+v');
      await waitForApplyDocumentCount(page, 1);
      const pasteState = await getDesignerState(page);
      const pastedNode = findNodeByName(pasteState.document, 'button3');
      assert.ok(pastedNode, 'Ctrl+C / Ctrl+V should create unique pasted button3');

      // Delete pasted button3
      await clearSentMessages(page);
      await page.keyboard.press('Delete');
      await waitForApplyDocumentCount(page, 1);
      let afterDel = await getDesignerState(page);
      assert.equal(findNodeByName(afterDel.document, 'button3'), null, 'Delete should remove button3');

      // Undo Delete -> button3 restored
      await clearSentMessages(page);
      await page.keyboard.press('Control+z');
      await waitForApplyDocumentCount(page, 1);
      let afterUndoDel = await getDesignerState(page);
      assert.ok(findNodeByName(afterUndoDel.document, 'button3'), 'Ctrl+Z should restore deleted button3');
    });

    // -----------------------------------------------------------------------
    // 5. Tab Order Overlay Mode
    // -----------------------------------------------------------------------
    await runTest('5. Tab Order overlay mode assigns sequential TabIndex & serializes to C#', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      const doc0 = (await getDesignerState(page)).document;
      const btnExport = findNodeByName(doc0, 'btnExport');
      const btnApprove = findNodeByName(doc0, 'btnApprove');

      // Enter Tab Order mode
      await page.locator('[data-testid="toolbar-tab-order-btn"]').click();
      assert.equal((await getDesignerState(page)).tabOrderMode, true);

      const badgeCount = await page.locator('.wd-taborder-badge').count();
      assert.ok(badgeCount > 5, `Expected Tab Order badges on controls, found ${badgeCount}`);

      // Click two sibling controls in order: btnExport (0), then btnApprove (1)
      await clearSentMessages(page);
      await page.locator(`.wd-canvas [data-node-id="${btnExport.id}"]`).click();
      await waitForApplyDocumentCount(page, 1);
      await page.locator(`.wd-canvas [data-node-id="${btnApprove.id}"]`).click();
      await waitForApplyDocumentCount(page, 2);

      const st = await getDesignerState(page);
      const exportAfter = findNodeByName(st.document, 'btnExport');
      const approveAfter = findNodeByName(st.document, 'btnApprove');
      assert.equal(exportAfter.properties.TabIndex, 0, 'First clicked control should get TabIndex = 0');
      assert.equal(approveAfter.properties.TabIndex, 1, 'Second clicked control should get TabIndex = 1');

      const generatedCs = generateDesignerCs(st.document);
      assert.ok(generatedCs.includes('this.btnExport.TabIndex = 0;'), 'Generated C# should contain btnExport.TabIndex = 0');
      assert.ok(generatedCs.includes('this.btnApprove.TabIndex = 1;'), 'Generated C# should contain btnApprove.TabIndex = 1');

      // Exit Tab Order mode
      await page.locator('[data-testid="toolbar-tab-order-btn"]').click();
      assert.equal((await getDesignerState(page)).tabOrderMode, false);
      assert.equal(await page.locator('.wd-taborder-badge').count(), 0);
    });

    // -----------------------------------------------------------------------
    // 6. Control-Reference Picker (AcceptButton) & Rename Propagation
    // -----------------------------------------------------------------------
    await runTest('6. Control-reference picker (AcceptButton) & rename propagation', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      const doc0 = (await getDesignerState(page)).document;
      const btnApplyFilter = findNodeByName(doc0, 'btnApplyFilter');
      assert.ok(btnApplyFilter);

      // Root Form is selected on init; set AcceptButton -> btnApplyFilter
      await clearSentMessages(page);
      const acceptPicker = page.locator('[data-testid="controlref-AcceptButton"]');
      await acceptPicker.waitFor({ state: 'visible' });
      await acceptPicker.selectOption('btnApplyFilter');
      await waitForApplyDocumentCount(page, 1);

      const afterAccept = await getDesignerState(page);
      const csAfterAccept = generateDesignerCs(afterAccept.document);
      assert.ok(
        csAfterAccept.includes('this.AcceptButton = this.btnApplyFilter;'),
        'Generated C# should assign this.AcceptButton = this.btnApplyFilter;'
      );

      // Select btnApplyFilter and rename it to btnRunFilter in Property Grid
      await page.locator(`.wd-canvas [data-node-id="${btnApplyFilter.id}"]`).click();
      await clearSentMessages(page);
      const nameInput = page.locator('.wd-props [data-property="Name"] input');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill('btnRunFilter');
      await nameInput.press('Enter');
      await waitForApplyDocumentCount(page, 1);

      const afterRename = await getDesignerState(page);
      assert.ok(findNodeByName(afterRename.document, 'btnRunFilter'), 'Control should be renamed to btnRunFilter');
      assert.equal(findNodeByName(afterRename.document, 'btnApplyFilter'), null, 'Old name btnApplyFilter should be gone');

      const csAfterRename = generateDesignerCs(afterRename.document);
      assert.ok(
        csAfterRename.includes('this.AcceptButton = this.btnRunFilter;'),
        'AcceptButton reference should automatically update to this.btnRunFilter'
      );
      assert.ok(
        !csAfterRename.includes('this.AcceptButton = this.btnApplyFilter;'),
        'Old AcceptButton reference should no longer appear in generated C#'
      );
    });

    // -----------------------------------------------------------------------
    // 7. Events Inspector & Double-Click Code Navigation
    // -----------------------------------------------------------------------
    await runTest('7. Events Inspector & double-click code navigation', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      const doc0 = (await getDesignerState(page)).document;
      const btnApplyFilter = findNodeByName(doc0, 'btnApplyFilter');
      const btnApprove = findNodeByName(doc0, 'btnApprove');

      // Switch to Events tab while MainForm is selected -> verify MainForm_Load appears
      await page.locator('[data-testid="prop-tab-events"]').click();
      const loadInput = page.locator('.wd-props [data-event="Load"] input');
      await loadInput.waitFor({ state: 'visible' });
      assert.equal(await loadInput.inputValue(), 'MainForm_Load');

      // Select btnApplyFilter -> verify btnApplyFilter_Click appears
      await page.locator(`.wd-canvas [data-node-id="${btnApplyFilter.id}"]`).click();
      const clickInput = page.locator('.wd-props [data-event="Click"] input');
      await clickInput.waitFor({ state: 'visible' });
      assert.equal(await clickInput.inputValue(), 'btnApplyFilter_Click');

      // Double-click btnApprove on the canvas -> verify navigateToEvent message
      await clearSentMessages(page);
      await page.locator(`.wd-canvas [data-node-id="${btnApprove.id}"]`).dblclick();
      await page.waitForFunction(
        () => window.__WINFORMS_DESIGNER__.getSentMessages().some((m) => m.type === 'navigateToEvent'),
        { timeout: 5000 }
      );

      const navMsgs = (await getSentMessages(page)).filter((m) => m.type === 'navigateToEvent');
      assert.equal(navMsgs.length, 1, 'Double-clicking btnApprove should emit one navigateToEvent message');
      assert.equal(navMsgs[0].nodeId, btnApprove.id);
      assert.equal(navMsgs[0].controlName, 'btnApprove');
      assert.equal(navMsgs[0].controlType, 'Button');
      assert.equal(navMsgs[0].eventName, 'Click');
      assert.equal(navMsgs[0].methodName, 'btnApprove_Click');
    });

    // -----------------------------------------------------------------------
    // 8. Live Layout & Accessibility Auditor
    // -----------------------------------------------------------------------
    await runTest('8. Live Layout & Accessibility Auditor detects issues & selects offending control', async () => {
      const buggyDesignerCs = `namespace AuditDemo
{
    partial class BuggyDialog
    {
        private System.ComponentModel.IContainer components = null;

        #region Windows Form Designer generated code
        private void InitializeComponent()
        {
            this.btnFirst = new System.Windows.Forms.Button();
            this.btnSecond = new System.Windows.Forms.Button();
            this.SuspendLayout();
            //
            // btnFirst
            //
            this.btnFirst.Location = new System.Drawing.Point(24, 24);
            this.btnFirst.Name = "btnFirst";
            this.btnFirst.Size = new System.Drawing.Size(120, 32);
            this.btnFirst.TabIndex = 0;
            this.btnFirst.Text = "First";
            //
            // btnSecond
            //
            this.btnSecond.Location = new System.Drawing.Point(60, 32);
            this.btnSecond.Name = "btnSecond";
            this.btnSecond.Size = new System.Drawing.Size(120, 32);
            this.btnSecond.TabIndex = 1;
            this.btnSecond.Text = "Second";
            //
            // BuggyDialog
            //
            this.ClientSize = new System.Drawing.Size(360, 200);
            this.Controls.Add(this.btnSecond);
            this.Controls.Add(this.btnFirst);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            this.Name = "BuggyDialog";
            this.Text = "Buggy Dialog";
            this.ResumeLayout(false);
        }
        #endregion

        private System.Windows.Forms.Button btnFirst;
        private System.Windows.Forms.Button btnSecond;
    }
}
`;
      const buggyDoc = parseDesignerCs(buggyDesignerCs);
      const expectedIssues = auditDesignDocument(buggyDoc);
      assert.ok(expectedIssues.some((i) => i.code === 'overlapping-controls'), 'Auditor should flag overlapping-controls');
      assert.ok(expectedIssues.some((i) => i.code === 'dialog-missing-accept-button'), 'Auditor should flag dialog-missing-accept-button');

      await initDesigner(page, server.url, {
        document: buggyDoc,
        settings: { ...DEFAULT_SETTINGS },
        fileName: 'BuggyDialog.Designer.cs',
        hasCodeBehind: false,
        codeBehindHandlers: [],
        themeKind: 'dark',
        resourceDataUris: {},
      });

      const auditBtn = page.locator('[data-testid="toolbar-audit-btn"]');
      await auditBtn.waitFor({ state: 'visible' });
      const badgeText = (await auditBtn.textContent()).trim();
      const displayedCount = Number(badgeText);
      assert.ok(displayedCount >= 2, `Expected non-zero audit issue count >= 2, got "${badgeText}"`);
      assert.equal(displayedCount, expectedIssues.length, 'Toolbar audit count should match auditDesignDocument()');

      // Click toolbar audit button to open popover
      await auditBtn.click();
      const auditItems = page.locator('[data-testid="audit-item"]');
      await auditItems.first().waitFor({ state: 'visible' });
      assert.equal(await auditItems.count(), expectedIssues.length);

      // Click the overlapping-controls issue item -> selects the offending control
      const overlapIssue = expectedIssues.find((i) => i.code === 'overlapping-controls');
      const overlapItem = auditItems.filter({ hasText: 'Overlapping controls' }).first();
      await overlapItem.click();

      const selAfterPick = (await getDesignerState(page)).selection;
      assert.deepEqual(
        selAfterPick,
        [overlapIssue.nodeId],
        `Clicking audit item should select ${overlapIssue.controlName} (${overlapIssue.nodeId})`
      );
    });

    // -----------------------------------------------------------------------
    // 9. Live Preview Modal (DPI & Size Presets + Seeded Values)
    // -----------------------------------------------------------------------
    await runTest('9. Live Preview modal seeded NumericUpDown value, DPI 125% & Compact size preset', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      const doc0 = (await getDesignerState(page)).document;
      const numBatchLimit = findNodeByName(doc0, 'numBatchLimit');

      // Open Preview modal
      await page.locator('[data-testid="toolbar-preview-btn"]').click();
      const preview = page.locator('.wd-preview');
      await assertNonZeroBox(preview, 'Preview modal');

      // Switch to Batch Summary tab inside Preview
      await preview.locator('.wf-tab-header', { hasText: 'Batch Summary' }).click();

      // Verify NumericUpDown shows "100" (NOT blank)
      const numInput = preview.locator(`[data-node-id="${numBatchLimit.id}"] input.wf-live-input`);
      await numInput.waitFor({ state: 'visible' });
      assert.equal(await numInput.inputValue(), '100', 'NumericUpDown in Preview must be seeded with "100"');

      // Click 125% DPI and Compact size preset (640x400)
      await page.locator('[data-testid="preview-dpi-125"]').click();
      await page.locator('[data-testid="preview-size-compact"]').click();

      const sizeText = (await page.locator('[data-testid="preview-size"]').textContent()).trim();
      assert.ok(sizeText.includes('640 × 400'), `Expected preview size to include "640 × 400", got "${sizeText}"`);
      assert.ok(sizeText.includes('125%'), `Expected preview size to include "125%", got "${sizeText}"`);
      assert.equal(await preview.locator('.wd-preview-window').getAttribute('data-dpi'), '1.25');

      // Close Preview
      await preview.locator('[aria-label="Close preview"]').click();
      await preview.waitFor({ state: 'detached', timeout: 5000 });
    });

    // -----------------------------------------------------------------------
    // 10. Themes, Fluent vs Classic, Shortcuts Modal & TestDesignFile/Form1.Designer.cs
    // -----------------------------------------------------------------------
    await runTest('10. Themes (dark/light/high-contrast), Fluent vs Classic, Shortcuts modal & Form1 (this.Size)', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      // Theme switching
      for (const theme of ['light', 'high-contrast', 'dark']) {
        await page.evaluate((t) => window.__WINFORMS_DESIGNER__.setTheme(t), theme);
        const applied = await page.evaluate(() => ({
          attr: document.documentElement.dataset.theme,
          stateTheme: window.__WINFORMS_DESIGNER__.getState().themeKind,
        }));
        assert.equal(applied.attr, theme, `documentElement dataset.theme should be ${theme}`);
        assert.equal(applied.stateTheme, theme, `store themeKind should be ${theme}`);
      }

      // Fluent vs Classic style toggle
      await page.locator('[data-testid="toolbar-style-classic"]').click();
      assert.equal((await getDesignerState(page)).renderStyle, 'classic');
      assert.equal(await page.locator('.wd-canvas .wf-client.wf-classic').count(), 1);

      await page.locator('[data-testid="toolbar-style-fluent"]').click();
      assert.equal((await getDesignerState(page)).renderStyle, 'fluent');
      assert.equal(await page.locator('.wd-canvas .wf-client.wf-fluent').count(), 1);

      // Keyboard Shortcuts modal open & close with Escape
      await page.locator('[data-testid="toolbar-shortcuts-btn"]').click();
      const shortcutsModal = page.locator('[data-testid="shortcuts-modal"]');
      await assertNonZeroBox(shortcutsModal, 'Keyboard Shortcuts modal');
      await page.keyboard.press('Escape');
      await shortcutsModal.waitFor({ state: 'detached', timeout: 5000 });

      // Load TestDesignFile/Form1.Designer.cs (uses this.Size instead of ClientSize)
      const form1Doc = parseDesignerCs(testDesignFileSource);
      assert.equal(form1Doc.className, 'Form1');
      assert.deepEqual(form1Doc.form.properties.Size, { kind: 'size', width: 480, height: 400 });

      await initDesigner(page, server.url, {
        document: form1Doc,
        settings: { ...DEFAULT_SETTINGS },
        fileName: 'Form1.Designer.cs',
        hasCodeBehind: false,
        codeBehindHandlers: [],
        themeKind: 'dark',
        resourceDataUris: {},
      });

      const formSizeLabel = (await page.locator('[data-testid="form-size"]').textContent()).trim();
      // Form1 sets outer this.Size = (480, 400); designer derives ClientSize = (480 - 16) x (400 - 39) = 464 x 361
      assert.equal(formSizeLabel, '464 × 361', `Form1 client size should render as 464 × 361, got "${formSizeLabel}"`);
      const clientBox = await assertNonZeroBox(page.locator('.wd-canvas .wf-client'), 'Form1 client area');
      assert.equal(Math.round(clientBox.width), 464);
      assert.equal(Math.round(clientBox.height), 361);
      await assertNonZeroBox(
        page.locator('.wd-canvas .wf-label', { hasText: 'Label01' }),
        'Form1 Label01'
      );
    });

    // -----------------------------------------------------------------------
    // 11. Unintrusive GitHub Star Prompt Toast
    // -----------------------------------------------------------------------
    await runTest('11. Unintrusive GitHub Star toast: hidden initially, suppressed in modals/modes, emits actions', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      const toast = page.locator('[data-testid="star-prompt"]');
      assert.equal(await toast.count(), 0, 'Star prompt must stay hidden on initial load');

      // Focus the canvas and ensure dispatching showStarPrompt shows the card without stealing focus
      await page.locator('.wd-canvas').click({ position: { x: 12, y: 12 } });
      await page.evaluate(() => {
        window.__WINFORMS_DESIGNER__.dispatchHostMessage({
          type: 'showStarPrompt',
          repoUrl: 'https://github.com/ToTt0G/winforms-designer-vscode',
        });
      });
      const toastBox = await assertNonZeroBox(toast, 'GitHub Star toast');
      const propsBox = await assertNonZeroBox(page.locator('.wd-props'), 'Properties pane');
      assert.ok(
        toastBox.x + toastBox.width <= propsBox.x + 2,
        `Star toast right edge (${toastBox.x + toastBox.width}) should stay left of Properties pane (${propsBox.x})`
      );

      // Suppressed cleanly while Preview modal is open, then reappears when closed
      await page.locator('[data-testid="toolbar-preview-btn"]').click();
      await page.locator('.wd-preview').waitFor({ state: 'visible' });
      assert.equal(await toast.count(), 0, 'Star prompt should hide while Preview modal is open');
      await page.locator('.wd-preview [aria-label="Close preview"]').click();
      await page.locator('.wd-preview').waitFor({ state: 'detached' });
      await assertNonZeroBox(toast, 'GitHub Star toast restored after Preview closes');

      // Click Star on GitHub -> emits starPromptAction('star') and hides
      await clearSentMessages(page);
      await page.locator('[data-testid="star-prompt-star"]').click();
      await toast.waitFor({ state: 'detached', timeout: 5000 });
      let starMsgs = (await getSentMessages(page)).filter((m) => m.type === 'starPromptAction');
      assert.deepEqual(starMsgs, [{ type: 'starPromptAction', action: 'star' }]);

      // Re-dispatch and verify Later + Dismiss actions
      for (const [btnTestId, expectedAction] of [
        ['star-prompt-later', 'later'],
        ['star-prompt-dismiss', 'dismiss'],
      ]) {
        await clearSentMessages(page);
        await page.evaluate(() => {
          window.__WINFORMS_DESIGNER__.dispatchHostMessage({
            type: 'showStarPrompt',
            repoUrl: 'https://github.com/ToTt0G/winforms-designer-vscode',
          });
        });
        await assertNonZeroBox(toast, `GitHub Star toast before ${expectedAction}`);
        await page.locator(`[data-testid="${btnTestId}"]`).click();
        await toast.waitFor({ state: 'detached', timeout: 5000 });
        starMsgs = (await getSentMessages(page)).filter((m) => m.type === 'starPromptAction');
        assert.deepEqual(starMsgs, [{ type: 'starPromptAction', action: expectedAction }]);
      }
    });

    // -----------------------------------------------------------------------
    // 12. Right-Click Context Menu Delete (Canvas Control + Component Tray)
    // -----------------------------------------------------------------------
    await runTest('12. Right-click context menu Delete works on both canvas controls and Component Tray', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      const doc0 = (await getDesignerState(page)).document;
      const btnApprove = findNodeByName(doc0, 'btnApprove');
      assert.ok(btnApprove);

      // Right-click btnApprove on the canvas and click Delete in the context menu
      await clearSentMessages(page);
      await page.locator(`.wd-canvas [data-node-id="${btnApprove.id}"]`).click({ button: 'right' });
      const canvasDel = page.locator('.wd-menu [role="menuitem"]', { hasText: 'Delete' });
      await canvasDel.waitFor({ state: 'visible', timeout: 5000 });
      await canvasDel.click();
      await waitForApplyDocumentCount(page, 1);

      let stateAfter = await getDesignerState(page);
      assert.equal(findNodeByName(stateAfter.document, 'btnApprove'), null, 'Right-click Delete on canvas must delete btnApprove');

      // Undo restores btnApprove
      await clearSentMessages(page);
      await page.keyboard.press('Control+z');
      await waitForApplyDocumentCount(page, 1);
      stateAfter = await getDesignerState(page);
      assert.ok(findNodeByName(stateAfter.document, 'btnApprove'), 'Undo should restore btnApprove');

      // Right-click refreshTimer in the Component Tray and click Delete
      await clearSentMessages(page);
      const timerChip = page.locator('.wd-tray-items .wd-chip', { hasText: 'refreshTimer' });
      await timerChip.click({ button: 'right' });
      const trayDel = page.locator('.wd-menu [role="menuitem"]', { hasText: 'Delete' });
      await trayDel.waitFor({ state: 'visible', timeout: 5000 });
      await trayDel.click();
      await waitForApplyDocumentCount(page, 1);

      stateAfter = await getDesignerState(page);
      assert.equal(
        findNodeByName(stateAfter.document, 'refreshTimer'),
        null,
        'Right-click Delete in Component Tray must delete refreshTimer'
      );
    });

    // -----------------------------------------------------------------------
    // 13. On-Canvas Strip "Type Here" Editing & Ctrl+Drag Duplicate
    // -----------------------------------------------------------------------
    await runTest('13. On-canvas MenuStrip "Type Here" add/rename/delete & Ctrl+Drag duplicate', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      const doc0 = (await getDesignerState(page)).document;
      const menuStrip = findNodeByName(doc0, 'menuStrip1');
      assert.ok(menuStrip);

      // Click "Type Here" on MenuStrip to add a new menu item
      await clearSentMessages(page);
      const addTrigger = page.locator(`.wd-canvas [data-strip-add="${menuStrip.id}"]`);
      await addTrigger.waitFor({ state: 'visible' });
      await addTrigger.click();
      const addInput = page.locator('[data-testid="strip-inline-add"]');
      await addInput.waitFor({ state: 'visible' });
      await addInput.fill('Reports');
      await addInput.press('Enter');
      await waitForApplyDocumentCount(page, 1);

      let st = await getDesignerState(page);
      let ms = findNodeByName(st.document, 'menuStrip1');
      let reportsItem = (ms.stripItems || []).find((i) => i.text === 'Reports');
      assert.ok(reportsItem, 'MenuStrip should include newly added "Reports" item');

      // Double-click to rename to "Analytics"
      await clearSentMessages(page);
      const reportsEl = page.locator(`.wd-canvas [data-strip-item="${reportsItem.id}"]`);
      await reportsEl.dblclick();
      const editInput = page.locator('[data-testid="strip-inline-edit"]');
      await editInput.waitFor({ state: 'visible' });
      await editInput.fill('Analytics');
      await editInput.press('Enter');
      await waitForApplyDocumentCount(page, 1);

      st = await getDesignerState(page);
      ms = findNodeByName(st.document, 'menuStrip1');
      const renamed = (ms.stripItems || []).find((i) => i.id === reportsItem.id);
      assert.equal(renamed?.text, 'Analytics', 'Renamed MenuStrip item should have text "Analytics"');

      // Click hover delete button on the item
      await clearSentMessages(page);
      await page.locator(`.wd-canvas [data-strip-item="${reportsItem.id}"]`).hover();
      await page.locator(`.wd-canvas [data-strip-del="${reportsItem.id}"]`).click();
      await waitForApplyDocumentCount(page, 1);

      st = await getDesignerState(page);
      ms = findNodeByName(st.document, 'menuStrip1');
      assert.equal((ms.stripItems || []).some((i) => i.id === reportsItem.id), false, 'Deleted MenuStrip item should be gone');

      // Ctrl+Drag btnApprove -> leaves original in place and creates a fresh copy
      const btnApprove = findNodeByName(st.document, 'btnApprove');
      const origLoc = { ...btnApprove.properties.Location };
      const btnLocator = page.locator(`.wd-canvas [data-node-id="${btnApprove.id}"]`);
      const box = await assertNonZeroBox(btnLocator, 'btnApprove for Ctrl+Drag');

      await clearSentMessages(page);
      await page.keyboard.down('Control');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 48, box.y + box.height / 2, { steps: 6 });
      await assertNonZeroBox(page.locator('[data-testid="drag-copy-badge"]'), 'Ctrl+Drag copy badge');
      await page.mouse.up();
      await page.keyboard.up('Control');
      await waitForApplyDocumentCount(page, 1);

      st = await getDesignerState(page);
      const origAfter = findNodeByName(st.document, 'btnApprove');
      assert.deepEqual(origAfter.properties.Location, origLoc, 'Original btnApprove must stay at its original Location after Ctrl+Drag');
      assert.equal(st.selection.length, 1);
      assert.notEqual(st.selection[0], btnApprove.id, 'Selection after Ctrl+Drag should move to the newly created copy');
    });

    // -----------------------------------------------------------------------
    // 14. Audit Auto-Fix ("Fix" & "Fix All", including High-DPI AutoScaleMode.None)
    // -----------------------------------------------------------------------
    await runTest('14. Audit Auto-Fix fixes AutoScaleMode.None and missing AcceptButton in one undo step', async () => {
      const dpiDialogCs = `namespace DpiDemo
{
    partial class SettingsDialog
    {
        private System.ComponentModel.IContainer components = null;

        #region Windows Form Designer generated code
        private void InitializeComponent()
        {
            this.btnOk = new System.Windows.Forms.Button();
            this.SuspendLayout();
            this.btnOk.Location = new System.Drawing.Point(180, 120);
            this.btnOk.Name = "btnOk";
            this.btnOk.Size = new System.Drawing.Size(90, 28);
            this.btnOk.TabIndex = 0;
            this.btnOk.Text = "OK";
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.None;
            this.ClientSize = new System.Drawing.Size(300, 170);
            this.Controls.Add(this.btnOk);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedDialog;
            this.Name = "SettingsDialog";
            this.Text = "Settings";
            this.ResumeLayout(false);
        }
        #endregion

        private System.Windows.Forms.Button btnOk;
    }
}
`;
      const doc = parseDesignerCs(dpiDialogCs);
      await initDesigner(page, server.url, {
        document: doc,
        settings: { ...DEFAULT_SETTINGS },
        fileName: 'SettingsDialog.Designer.cs',
        hasCodeBehind: false,
        codeBehindHandlers: [],
        themeKind: 'dark',
        resourceDataUris: {},
      });

      await page.locator('[data-testid="toolbar-audit-btn"]').click();
      await page.locator('[data-testid="audit-item"]', { hasText: 'High-DPI scaling disabled' }).waitFor({ state: 'visible' });
      const fixAllBtn = page.locator('[data-testid="audit-fix-all-btn"]');
      await fixAllBtn.waitFor({ state: 'visible' });

      await clearSentMessages(page);
      await fixAllBtn.click();
      await waitForApplyDocumentCount(page, 1);

      const st = await getDesignerState(page);
      assert.equal(st.document.form.properties.AutoScaleMode?.value, 'Font', 'Fix All must upgrade AutoScaleMode from None to Font');
      const generated = generateDesignerCs(st.document);
      assert.ok(generated.includes('this.AcceptButton = this.btnOk;'), 'Fix All must wire AcceptButton to btnOk');
      assert.ok(generated.includes('System.Windows.Forms.AutoScaleMode.Font'), 'Generated C# must contain AutoScaleMode.Font');
    });

    // -----------------------------------------------------------------------
    // 15. Culture Switcher, Inherited Read-Only Controls, DataBindings & Run Button
    // -----------------------------------------------------------------------
    await runTest('15. Culture switcher, inherited read-only protection, DataBindings editor & Run button', async () => {
      const payload = makeOrderInitPayload({
        hasProject: true,
        availableCultures: ['default', 'de'],
        activeCulture: 'default',
        cultureStrings: {},
      });
      // Mark btnExport as inherited from a base form to verify read-only protection
      const inheritedBtn = findNodeByName(payload.document, 'btnExport');
      inheritedBtn.inherited = true;
      inheritedBtn.inheritedFrom = 'BaseOrderForm';

      await initDesigner(page, server.url, payload);

      // Run button is visible and emits runProjectAction
      const runBtn = page.locator('[data-testid="toolbar-run-btn"]');
      await assertNonZeroBox(runBtn, 'Toolbar Run button');
      await clearSentMessages(page);
      await runBtn.click();
      const runMsgs = (await getSentMessages(page)).filter((m) => m.type === 'runProjectAction');
      assert.deepEqual(runMsgs, [{ type: 'runProjectAction', action: 'run' }]);

      // Inherited control shows badge, read-only Property Grid banner, and cannot be deleted
      await assertNonZeroBox(
        page.locator(`.wd-canvas [data-inherited-badge="${inheritedBtn.id}"]`),
        'Canvas inherited badge'
      );
      await page.locator(`.wd-canvas [data-node-id="${inheritedBtn.id}"]`).click();
      await clearSentMessages(page);
      await page.keyboard.press('Delete');
      const afterBlockedDelete = await getDesignerState(page);
      assert.ok(findNodeByName(afterBlockedDelete.document, 'btnExport'), 'Inherited control must NOT be deletable');
      assert.equal((await getSentMessages(page)).filter((m) => m.type === 'applyDocument').length, 0);

      // Switch culture to "de" -> emits switchCulture -> host replies cultureChanged -> canvas displays German text
      await clearSentMessages(page);
      await page.locator('[data-testid="toolbar-culture-select"]').selectOption('de');
      const switchMsgs = (await getSentMessages(page)).filter((m) => m.type === 'switchCulture');
      assert.deepEqual(switchMsgs, [{ type: 'switchCulture', culture: 'de' }]);

      await page.evaluate(() => {
        window.__WINFORMS_DESIGNER__.dispatchHostMessage({
          type: 'cultureChanged',
          activeCulture: 'de',
          availableCultures: ['default', 'de'],
          cultureStrings: { '$this.Text': 'Auftragsmanager', 'btnApplyFilter.Text': 'Filter anwenden' },
        });
      });
      await assertNonZeroBox(
        page.locator('.wd-canvas [data-form-caption]', { hasText: 'Auftragsmanager' }),
        'Localized German form title'
      );
      await assertNonZeroBox(
        page.locator('.wd-canvas .wf-button', { hasText: 'Filter anwenden' }),
        'Localized German button text'
      );

      // Switch back to default culture, then add a DataBinding on txtSearch
      await page.locator('[data-testid="toolbar-culture-select"]').selectOption('default');
      await page.evaluate(() => {
        window.__WINFORMS_DESIGNER__.dispatchHostMessage({
          type: 'cultureChanged',
          activeCulture: 'default',
          availableCultures: ['default', 'de'],
          cultureStrings: {},
        });
      });

      const txtSearch = findNodeByName((await getDesignerState(page)).document, 'txtSearch');
      await page.locator(`.wd-canvas [data-node-id="${txtSearch.id}"]`).click();
      const dbRow = page.locator('.wd-props [data-property="DataBindings"]');
      await dbRow.scrollIntoViewIfNeeded();
      await dbRow.locator('button').click();

      const dbModal = page.locator('[data-testid="databindings-editor"]');
      await assertNonZeroBox(dbModal, 'DataBindings editor modal');
      await dbModal.locator('.wd-list-toolbar button', { hasText: 'Add' }).click();
      await page.locator('[data-testid="databinding-property"]').fill('Text');
      await page.locator('[data-testid="databinding-source"]').fill('orderBindingSource');
      await page.locator('[data-testid="databinding-member"]').fill('CustomerName');

      await clearSentMessages(page);
      await page.locator('.wd-modal-foot button', { hasText: 'OK' }).click();
      await waitForApplyDocumentCount(page, 1);

      const dbDoc = (await getDesignerState(page)).document;
      const updatedTxt = findNodeByName(dbDoc, 'txtSearch');
      assert.equal(updatedTxt.dataBindings?.length, 1);
      const dbCs = generateDesignerCs(dbDoc);
      assert.ok(
        dbCs.includes('this.txtSearch.DataBindings.Add(new System.Windows.Forms.Binding("Text",'),
        'Generated C# must emit txtSearch.DataBindings.Add(...)'
      );
    });

    // -----------------------------------------------------------------------
    // 16. Live Preview Pixel-Fidelity Interactivity (MenuStrip Dropdown, Esc, Grid, Spinner)
    // -----------------------------------------------------------------------
    await runTest('16. Live Preview: zero fake grid rows, interactive MenuStrip dropdown, Escape & NumericUpDown spinner', async () => {
      const payload = makeOrderInitPayload();
      await initDesigner(page, server.url, payload);

      await page.locator('[data-testid="toolbar-preview-btn"]').click();
      const preview = page.locator('.wd-preview');
      await assertNonZeroBox(preview, 'Preview modal');

      // Zero fake DataGridView rows (AllowUserToAddRows = false) and zero design-time Type Here placeholders
      assert.equal(await preview.locator('.wf-dg-row').count(), 0, 'DataGridView with AllowUserToAddRows=false must render 0 empty rows');
      assert.equal(await preview.locator('.wf-strip-add').count(), 0, 'Preview must never show design-time "Type Here" / "+" placeholders');

      // Click "File" menu -> opens native WinForms dropdown with New Order, Export CSV..., Exit
      await preview.locator('.wf-strip-item.menu', { hasText: 'File' }).click();
      const dropdown = preview.locator('.wf-dropdown');
      await assertNonZeroBox(dropdown, 'MenuStrip File dropdown');
      await assertNonZeroBox(dropdown.locator('.wf-dd-item', { hasText: 'New Order' }), 'File > New Order');
      await assertNonZeroBox(dropdown.locator('.wf-dd-item', { hasText: 'Exit' }), 'File > Exit');

      // First Escape closes ONLY the dropdown menu, keeping Preview open
      await page.keyboard.press('Escape');
      await dropdown.waitFor({ state: 'detached', timeout: 5000 });
      await assertNonZeroBox(preview, 'Preview modal stays open after first Escape');

      // Re-open File menu and click Exit -> closes dropdown and updates footer status
      await preview.locator('.wf-strip-item.menu', { hasText: 'File' }).click();
      await dropdown.waitFor({ state: 'visible', timeout: 5000 });
      await dropdown.locator('.wf-dd-item', { hasText: 'Exit' }).click();
      await dropdown.waitFor({ state: 'detached', timeout: 5000 });
      const footText = (await preview.locator('.wd-preview-foot').textContent()).trim();
      assert.ok(footText.includes('exitToolStripMenuItem'), `Preview footer should report exitToolStripMenuItem click, got "${footText}"`);

      // Switch to Batch Summary and click NumericUpDown up-spinner -> increments 100 -> 101
      const doc0 = (await getDesignerState(page)).document;
      const numBatchLimit = findNodeByName(doc0, 'numBatchLimit');
      await preview.locator('.wf-tab-header', { hasText: 'Batch Summary' }).click();
      const numNode = preview.locator(`[data-node-id="${numBatchLimit.id}"]`);
      const numInput = numNode.locator('input.wf-live-input');
      assert.equal(await numInput.inputValue(), '100');
      await numNode.locator('.wf-spin > span').first().click();
      assert.equal(await numInput.inputValue(), '101', 'Clicking NumericUpDown up spinner should increment 100 -> 101');

      // Close Preview via Escape now that no dropdown is open
      await page.keyboard.press('Escape');
      await preview.waitFor({ state: 'detached', timeout: 5000 });
    });

    await context.close();
  } finally {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await server.close();
    }
  }

  console.log(`\nE2E Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

runSuite().catch((err) => {
  console.error('Fatal E2E runner error:', err);
  process.exitCode = 1;
});
