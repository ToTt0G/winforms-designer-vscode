# Modern WinForms Designer for VS Code

A powerful Windows Forms visual designer extension for Visual Studio Code. Design your WinForms UI with drag-and-drop ease, right from VS Code!

![Visual Studio Code](https://img.shields.io/badge/VS%20Code-1.80%2B-blue)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![.NET](https://img.shields.io/badge/.NET-6.0%2B-purple)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **🎨 Visual Designer**: Drag and drop controls just like in Visual Studio
- **💾 Designer Code Saving**: Save visual edits back to your `.Designer.cs` file
- **🌙 Modern Dark UI**: Seamlessly matches VS Code's dark theme
- **⚙️ Property Grid**: Edit control properties with an intuitive interface
- **🧰 Toolbox**: Quick access to all common Windows Forms controls
- **🚀 Context Menu Integration**: Right-click a form's `.cs` or `.Designer.cs` file to open the designer

## 📦 Installation

### Option 1: Install from VSIX (Recommended)

1. Download the latest `.vsix` file from the [Releases](../../releases) page
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X`)
4. Click the **`...`** menu → **Install from VSIX...**
5. Select the downloaded `.vsix` file
6. Reload VS Code when prompted

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/ToTt0G/winforms-designer-vscode.git
cd winforms-designer-vscode

# Build the Windows designer and copy its runtime files into the extension
dotnet build SWD4CS/SWD4CS.csproj --configuration Release

# Install dependencies
cd winforms-designer-extension
npm ci

# Compile the extension
npm run compile

# Package the extension (optional)
npx vsce package
```

## 🚀 Usage

1. Open a C# Windows Forms file (`Form1.cs` or `Form1.Designer.cs`) in VS Code. Opening `Form1.cs` resolves its sibling `Form1.Designer.cs`; C# files without a matching designer are rejected.
2. **Right-click** the file in:
   - **Explorer** sidebar, or
   - **Editor tab** at the top
3. Select **"Open WinForms Designer"**
   
   *Alternatively*, use the Command Palette (`Ctrl+Shift+P`) and run:
   ```
   WinForms: Open WinForms Designer
   ```

4. The visual designer will launch in a separate window
5. Design your form visually and use **File → Save** in the designer to write the `.Designer.cs` file. Unsaved editor changes to the selected form and its designer are saved before launch; cancelling that save cancels launch. External edits made while the designer is open are not synchronized or conflict-checked.

## 📋 Requirements

- **Operating System**: Windows (WinForms is Windows-only)
- **.NET Runtime**: .NET 6 Windows Desktop Runtime (the designer currently targets `net6.0-windows`; a newer major runtime alone is not sufficient)
- **Building from source**: a .NET SDK capable of building `net6.0-windows`, plus Node.js/npm
- **VS Code**: Version 1.80.0 or higher

## 🛠️ Development

### Project Structure

```
winforms-designer-extension/
├── src/
│   └── extension.ts       # VS Code extension entry point
├── bin/
│   └── SWD4CS.exe        # Bundled WinForms designer executable
├── out/                   # Compiled TypeScript output
├── package.json          # Extension manifest
└── tsconfig.json         # TypeScript configuration
```

### Running in Development Mode

1. Open the project folder in VS Code
2. Press **F5** to launch the Extension Development Host
3. Test the extension in the new window

### Building the VSIX Package

```bash
# From the repository root, rebuild the executable before packaging:
dotnet build SWD4CS/SWD4CS.csproj --configuration Release
cd winforms-designer-extension
npm ci
npm run compile
npx @vscode/vsce package
```

### Regression checks (Windows)

```bash
dotnet run --project Tests/RegressionTests/RegressionTests.csproj --configuration Release
npm --prefix winforms-designer-extension test
```

## ⚠️ Known Limitations

### Resource-based Properties
The following properties require `.resx` resource file support and are not currently supported:
- **Icon**: Form icons cannot be saved/loaded (requires .resx implementation)
- **Images**: Image resources for PictureBox and other controls
- **Localized strings**: Resource-based string localization

These properties may be visible in the property grid but changes will not persist to the `.Designer.cs` file.

**Workaround**: Manually edit the `.Designer.cs` file and create corresponding `.resx` files using Visual Studio or other tools.

## 🙏 Credits

This extension wraps the excellent [SWD4CS](https://github.com/hry2566/SWD4CS) designer by **hry2566**, making it accessible directly from VS Code.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🐛 Issues & Contributions

Found a bug or have a feature request? Please [open an issue](../../issues)!

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

**Enjoy designing WinForms in VS Code!** 🎉
