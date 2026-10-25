# Changelog

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
