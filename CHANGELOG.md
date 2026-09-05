# Changelog

All notable changes to the Modern WinForms Designer extension are documented here.

## 0.0.5

### ⚠️ Breaking — runtime requirement

- The designer now targets **`net10.0-windows`** instead of `net6.0-windows`. On Windows you
  need the **.NET 10 Desktop Runtime**; a .NET 6 runtime will no longer load the designer. If
  you build the self-contained payload (below) nothing has to be installed at all.

### ⚠️ Breaking — build step

- The designer payload in `winforms-designer-extension/bin/` is now produced **only** by a
  self-contained `win-x64` publish:

  ```bash
  dotnet publish SWD4CS/SWD4CS.csproj -c Release -r win-x64 --self-contained true
  ```

  A plain `dotnet build` no longer copies anything into `bin/`. It previously overwrote the
  self-contained payload with a framework-dependent Debug build (and a macOS apphost),
  producing a mixed payload that failed at launch with no useful diagnostic. A publish with
  the wrong flags now fails with an error naming the required command instead of
  half-populating `bin/`, and the directory is cleared before each copy so stale files from
  an earlier runtime or target framework cannot survive.
- Windows contributors who relied on the plain `dotnet build` inner loop should use
  `dotnet publish SWD4CS/SWD4CS.csproj -c Debug -r win-x64 --self-contained true`.

### Added

- macOS and Linux support: the Windows designer binary is launched through **Wine**, with
  `winformsDesigner.winePath`, `winformsDesigner.winePrefix` and `winformsDesigner.wineDebug`
  settings, Wine auto-detection (`wine64`/`wine` on `PATH`, then the standard Wine, CrossOver
  and Whisky locations) and `winepath -w` path translation.
- Wine diagnostic-channel noise stripping so Wine's `fixme:`/`trace:` chatter no longer
  masks real designer errors, with unit tests.
- A `.vscodeignore`, so packages no longer bundle `src/`, `tests/`, `out-test/`, `*.vsix`
  or `.pdb` files.

### Fixed

- **VS Code no longer freezes while the designer starts.** Translating the file path through
  Wine ran synchronously on the extension host, stalling every extension for up to two
  minutes on a cold Wine prefix. It is now asynchronous, behind a cancellable progress
  notification.
- **Unsaved edits are no longer silently lost.** Opening the designer for a file with unsaved
  changes in either half of the `Form.cs` / `Form.Designer.cs` pair now prompts to save first
  — previously the designer read stale content from disk and the editor buffer then
  overwrote whatever it wrote. Opening both halves of a pair no longer starts two designers
  writing the same generated file.
- **Unwiring an event no longer corrupts the generated file.** Removing a handler whose name
  was not `control_Event` (hand-written or renamed) cleared the grid cell without removing
  the `+=` line, so the next double-click emitted a duplicate handler and method and the
  `.Designer.cs` stopped compiling. Unwiring is now keyed on both the event and the handler
  name actually present in the file, and reports failure instead of silently succeeding.
- **Double-clicking a column header in the events grid no longer crashes the designer.**
- **Controls are no longer dropped from the control tree.** A control whose container was
  declared after it was silently omitted, and controls sharing a name across containers could
  attach to the wrong parent. The tree is now built in two passes with identity-keyed lookup,
  and anything unparented is shown under an explicit `(unparented)` node.
- Events wired more than once in the designer file are now reported instead of silently
  half-removed.
- Generated handler signatures now emit valid C# for nested and generic parameter types.
- Designer crashes are reported instead of appearing to succeed: termination by signal (a
  Wine segfault) was previously indistinguishable from a clean exit.
- Wine's own diagnostics no longer hide the actionable error. Full designer output goes to a
  **WinForms Designer** output channel, and the retained buffer is capped so
  `wineDebug: +relay` cannot exhaust memory.
- Invalid values for the `winformsDesigner.*` settings (for example `null` from a settings
  merge) no longer make the command fail with an unexplained error.

### Changed

- The build no longer shells out to `xcopy`, so the project builds on macOS and Linux.
- Packaging is pinned to `@vscode/vsce` via `npm run package`. The deprecated unscoped `vsce`
  predates VS Code 1.74 and rejects this manifest for a missing `activationEvents`, which
  modern VS Code infers from `contributes.commands`.
- `@types/vscode` is pinned to the declared `engines.vscode` floor, and the repository now has
  ESLint, a whole-tree `typecheck` script and CI.

## 0.0.3

- Fixed property persistence: designer edits now reliably round-trip to `.Designer.cs`.
