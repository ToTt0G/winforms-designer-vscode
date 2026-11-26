# Changelog

## 1.1.0 — 2026-11-26

### Added

- **Run / Build / Stop.** A toolbar **Run** button and a status bar item (**Run**, **Building...**, **Stop**) build and launch the active project. Supports .NET 6–10 through `dotnet`, .NET Framework 4.x through MSBuild located with `vswhere`, WSL through Windows `dotnet.exe` with `wslpath` path conversion, and a macOS / Linux compile-check using `EnableWindowsTargeting=true`. All files are saved and any previous instance is stopped before each run, which avoids MSB3027 file-lock failures.
- **WinForms Explorer** view in the Activity Bar listing every form and user control in the workspace, with New Form, Run, Build and Refresh in its title bar and Open Designer, View Code and Delete on each item.
- **New WinForms Project...** scaffolds a complete, runnable project for `net10.0-windows`, `net9.0-windows`, `net8.0-windows` or `net48`.
- **Delete Form & Sibling Files** removes a form's `.cs`, `.Designer.cs` and `.resx` in one step.
- **Explorer file nesting** defaults that group `.Designer.cs` and `.resx` files under their form.
- **On-canvas strip editing.** Add **Type Here** items to `MenuStrip`, `ToolStrip` and `StatusStrip`, double-click to rename, and hover to delete.
- **Ctrl+Drag duplicate.** Dragging with `Ctrl` held drops a copy with fresh names, shows a ghost and a **+** badge, and leaves the original in place.
- **DataBindings editor** for simple bindings, with a live preview of the generated `DataBindings.Add(...)` statement. Both full and shorthand `Binding` forms are parsed.
- **Inherited forms.** Base `Form` and `UserControl` chains are resolved statically from source (case-insensitive, cycle-safe, `bin/` and `obj/` ignored). Inherited controls render with a badge, are read-only in the Property Grid, cannot be deleted, and are never written into the derived `.Designer.cs`.
- **Multi-culture localization.** A toolbar culture switcher discovers `Form.<culture>.resx` files, displays localized text on the canvas and edits culture values in place. Invalid culture names and path traversal are rejected.
- **Audit auto-fix.** **Fix** corrects a single issue and **Fix All** applies every automatic fix as one undo step, covering duplicate `TabIndex`, missing dialog `AcceptButton` / `CancelButton`, missing accessible text, and out-of-range `NumericUpDown`, `ProgressBar` and `SplitContainer` values.
- **High-DPI audit rule** flags `AutoScaleMode.None` and fixes it to `AutoScaleMode.Font`.
- **Interactive Live Preview controls**: working MenuStrip dropdowns, NumericUpDown spinners, TrackBar dragging and DataGridView column sorting.

### Changed

- Pixel-fidelity pass on control rendering. Fluent now follows Windows 11 metrics; Classic draws Win32 chrome with a gradient title bar, 3D bevels and a segmented progress bar.
- New extension icon and Activity Bar icon.
- README screenshots and demo recordings refreshed for 1.1.0.

### Fixed

- Live Preview no longer shows placeholder rows on a `DataGridView` with `AllowUserToAddRows = false`, or design-time **Type Here** slots on strips.
- Pressing `Esc` in Live Preview closes an open menu dropdown first instead of the whole preview.
- `Localizable` is never emitted into generated C#.

## 1.0.1 — 2026-11-26

### Added

- Added an unobtrusive, dismissible GitHub Star toast inside the designer canvas that appears only after sustained visual editing (or returning after an update), with **Star on GitHub**, **Later** (14-day snooze), and **Don't ask again** persistence in VS Code `globalState`.

### Fixed

- Preserved actual on-disk filename casing when resolving sibling `.cs` / `.Designer.cs` / `.resx` files on Windows and macOS case-insensitive filesystems.
- Fixed cross-platform unit test glob discovery on Windows.

## 1.0.0 — 2026-11-26

Complete rewrite replacing the external Windows-only `.NET 6` `SWD4CS.exe` process with a native, cross-platform VS Code Custom Editor (`winformsDesigner.editor`).

### Added

- **Native VS Code Custom Editor**: Edit `*.Designer.cs` files directly inside a VS Code tab on Windows, macOS, and Linux with native `Ctrl+S` saving, Undo/Redo, and side-by-side text synchronization.
- **Visual Studio 2026-inspired UI**: 4-pane workspace (Toolbox, Document Outline, Design Canvas, Properties/Events Inspector), bottom Component Tray, Fluent and Classic WinForms control rendering, and automatic Dark / Light / High Contrast VS Code theme matching.
- **59 built-in WinForms types**: Common Controls, Containers (`Panel`, `GroupBox`, `TabControl`, `SplitContainer`, `FlowLayoutPanel`, `TableLayoutPanel`), Menus & Toolbars (`MenuStrip`, `ToolStrip`, `StatusStrip`, `ContextMenuStrip`), Data (`DataGridView`, `BindingSource`, `BindingNavigator`), Components, Dialogs, and Printing, plus safe placeholder rendering for custom controls.
- **Layout & alignment tools**: Blue edge/spacing snaplines, magenta text-baseline snaplines, configurable dot grid, full Dock/Anchor propagation on resize, marquee multi-select, align/size/spacing commands, Z-order, lock controls, smart tags, and `F2` inline text editing.
- **Visual property & collection editors**: Anchor cross picker, 5-zone Dock picker, 3×3 Alignment picker, 3-tab Color picker (Custom / Web / System), Font picker, Control Reference pickers (`AcceptButton`, `CancelButton`, `MainMenuStrip`, `ContextMenuStrip`, `ImageList`), `.resx` Image/Icon picker, and dedicated editors for Items, `DataGridView` columns, `ListView` columns, `TreeView` nodes, `TabPages`, Strip items (with Insert Standard Items), and `TableLayoutPanel` tracks.
- **Code-behind event wiring**: Double-click controls or bind events in the Events tab to wire `+=` in `.Designer.cs`, generate typed event handlers in `.cs` matching project namespace/nullable settings, and place the cursor inside the handler body.
- **Visual Tab Order mode**: Overlay hierarchical `TabIndex` badges across containers and assign focus order by clicking.
- **Interactive Live Preview**: Test controls, tab switching, splitters, and resizing across 100% / 125% / 150% DPI and Design / Compact / Wide size presets.
- **Live Layout & Accessibility Auditor**: Real-time diagnostics for overlapping controls, out-of-bounds placement, duplicate `TabIndex`, missing dialog Accept/Cancel buttons, missing accessible labels, and invalid `NumericUpDown` / `ProgressBar` / `SplitContainer` bounds.
- **Form & UserControl scaffolding**: Right-click any folder to create a new Windows Form (6 starter templates: Blank, OK/Cancel Dialog, Master-Detail Workspace, Settings Window, Sign-In Form, Dashboard) or UserControl, inferring namespace and nullable settings from the nearest `.csproj`.
- **Surgical C# & `.resx` engine**: Supports `.NET Framework 4.x` through `.NET 10`, preserves custom fields/helper methods/comments/`ComponentResourceManager`/`DataGridViewCellStyle`, resolves `Properties.Resources.*` images, and enters safe read-only mode on unsupported files (such as `#if` directives inside `InitializeComponent()`).

### Removed

- Removed bundled Windows-only `SWD4CS.exe` executable and the `.NET 6 Windows Desktop Runtime` dependency.

## 0.0.4 — 2026-10-25

### Fixed

- Opening `Form.cs` now resolves its sibling `Form.Designer.cs` instead of launching a blank design. Files without a matching designer are rejected with an explanation.
- Dirty form/designer editor documents are saved before launch; cancelling a save cancels the launch.
- String property loading and saving preserve equals signs, semicolons, quotes, backslashes, escaped newlines, control characters and Unicode.
- Named event subscriptions support both shorthand (`Click += button_Click`) and explicit delegate constructors.
- Designer files using CRLF, LF or CR line endings load consistently; end-of-file lookahead is bounded.
- Text containing event-like syntax is no longer interpreted as an event subscription.
- VSIX packaging rebuilds the native designer first, preventing stale executables from being shipped with updated extension code.

### Verification

- 19 native parser/serializer regression checks and 8 extension-command checks pass on Windows.
- Release build, TypeScript compilation and VSIX packaging pass.

### Requirements and remaining limits

- Windows and the **.NET 6 Windows Desktop Runtime** are required. A newer major runtime alone does not meet the current runtime configuration.
- This remains a **prerelease**. Full interactive VS Code/native designer acceptance was not performed.
- The line-based parser does not support arbitrary C# round-trip editing. Resource-backed icons/images/localization, custom controls and arbitrary modern syntax are not certified.
- Saving requires **File → Save** in the designer. External file edits made while it is open are not synchronized or conflict-checked.
- The runtime target remains `net6.0-windows`; upgrading the unsupported runtime is separate work.
