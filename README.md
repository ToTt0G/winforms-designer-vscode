# Modern WinForms Designer for VS Code

A powerful Windows Forms visual designer extension for Visual Studio Code. Design your WinForms UI with drag-and-drop ease, right from VS Code!

![Visual Studio Code](https://img.shields.io/badge/VS%20Code-1.80%2B-blue)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![.NET](https://img.shields.io/badge/.NET-6.0%2B-purple)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **🎨 Visual Designer**: Drag and drop controls just like in Visual Studio
- **🔄 Two-way Synchronization**: Changes in the designer automatically update your `.Designer.cs` code
- **🌙 Modern Dark UI**: Seamlessly matches VS Code's dark theme
- **⚙️ Property Grid**: Edit control properties with an intuitive interface
- **🧰 Toolbox**: Quick access to all common Windows Forms controls
- **🚀 Context Menu Integration**: Right-click any `.cs` file to open the designer

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
git clone https://github.com/YOUR_USERNAME/winforms-designer-vscode.git
cd winforms-designer-vscode

# Install dependencies
npm install

# Compile the extension
npm run compile

# Package the extension (optional)
npx vsce package
```

## 🚀 Usage

1. Open any C# Windows Forms file (`.cs`) in VS Code
2. **Right-click** the file in:
   - **Explorer** sidebar, or
   - **Editor tab** at the top
3. Select **"Open WinForms Designer"**
   
   *Alternatively*, use the Command Palette (`Ctrl+Shift+P`) and run:
   ```
   WinForms: Open WinForms Designer
   ```

4. The visual designer will launch in a separate window
5. Design your form visually—changes sync back to your `.Designer.cs` file!

## 📋 Requirements

- **Operating System**: Windows (WinForms is Windows-only)
- **.NET Runtime**: .NET 6.0 or later
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
npm install -g @vscode/vsce
vsce package
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
