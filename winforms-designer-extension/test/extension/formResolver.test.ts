import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  detectProjectContext,
  findBaseDesignerFile,
  findCultureResxFiles,
  isValidCultureTag,
  pickNextAvailableFormName,
  resolveFormFiles,
  sanitizeNamespaceSegment,
  validateCSharpIdentifier,
} from '../../src/extension/formResolver';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'winforms-resolver-test-'));
}

describe('formResolver', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('resolveFormFiles', () => {
    it('resolves sibling files when given Foo.cs', () => {
      const formCs = path.join(tempDir, 'MainForm.cs');
      const designerCs = path.join(tempDir, 'MainForm.Designer.cs');
      const resx = path.join(tempDir, 'MainForm.resx');
      fs.writeFileSync(formCs, '', 'utf8');
      fs.writeFileSync(designerCs, '', 'utf8');
      fs.writeFileSync(resx, '', 'utf8');

      const resolved = resolveFormFiles(formCs);
      assert.equal(resolved.baseName, 'MainForm');
      assert.equal(resolved.directory, tempDir);
      assert.equal(resolved.isDesignerFile, false);
      assert.equal(resolved.codeBehindPath, formCs);
      assert.equal(resolved.designerPath, designerCs);
      assert.equal(resolved.resxPath, resx);
    });

    it('resolves sibling files when given Foo.Designer.cs', () => {
      const formCs = path.join(tempDir, 'SettingsForm.cs');
      const designerCs = path.join(tempDir, 'SettingsForm.Designer.cs');
      fs.writeFileSync(formCs, '', 'utf8');
      fs.writeFileSync(designerCs, '', 'utf8');

      const resolved = resolveFormFiles(designerCs);
      assert.equal(resolved.baseName, 'SettingsForm');
      assert.equal(resolved.isDesignerFile, true);
      assert.equal(resolved.designerPath, designerCs);
      assert.equal(resolved.codeBehindPath, formCs);
      assert.equal(resolved.resxPath, path.join(tempDir, 'SettingsForm.resx'));
    });

    it('handles lowercase foo.designer.cs', () => {
      const designerCs = path.join(tempDir, 'loginform.designer.cs');
      const formCs = path.join(tempDir, 'LoginForm.cs');
      fs.writeFileSync(designerCs, '', 'utf8');
      fs.writeFileSync(formCs, '', 'utf8');

      const resolved = resolveFormFiles(designerCs);
      assert.equal(resolved.baseName, 'loginform');
      assert.equal(resolved.isDesignerFile, true);
      assert.equal(resolved.designerPath, designerCs);
      assert.equal(resolved.codeBehindPath, formCs);
    });

    it('performs case-insensitive sibling resolution on case-sensitive filesystems', () => {
      const formCs = path.join(tempDir, 'Form1.cs');
      const lowerDesigner = path.join(tempDir, 'form1.designer.cs');
      const upperResx = path.join(tempDir, 'FORM1.RESX');
      fs.writeFileSync(formCs, '', 'utf8');
      fs.writeFileSync(lowerDesigner, '', 'utf8');
      fs.writeFileSync(upperResx, '', 'utf8');

      const resolved = resolveFormFiles(formCs);
      assert.equal(resolved.baseName, 'Form1');
      assert.equal(resolved.designerPath, lowerDesigner);
      assert.equal(resolved.resxPath, upperResx);
      assert.equal(resolved.codeBehindPath, formCs);
    });

    it('falls back to expected canonical names when siblings do not exist yet', () => {
      const formCs = path.join(tempDir, 'NewForm.cs');
      const resolved = resolveFormFiles(formCs);
      assert.equal(resolved.designerPath, path.join(tempDir, 'NewForm.Designer.cs'));
      assert.equal(resolved.resxPath, path.join(tempDir, 'NewForm.resx'));
    });
  });

  describe('detectProjectContext', () => {
    it('extracts RootNamespace, subfolder namespace suffix, Nullable, and TargetFramework', () => {
      const csproj = path.join(tempDir, 'OrderApp.csproj');
      fs.writeFileSync(
        csproj,
        `<Project Sdk="Microsoft.NET.Sdk">
  <!-- <RootNamespace>IgnoredCommentNamespace</RootNamespace> -->
  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <RootNamespace>Acme.Orders</RootNamespace>
    <Nullable>enable</Nullable>
    <UseWindowsForms>true</UseWindowsForms>
  </PropertyGroup>
</Project>`,
        'utf8'
      );

      const subDir = path.join(tempDir, 'Views', '2026 Reports', 'class');
      fs.mkdirSync(subDir, { recursive: true });

      const ctx = detectProjectContext(subDir);
      assert.equal(ctx.csprojPath, csproj);
      assert.equal(ctx.projectDir, tempDir);
      assert.equal(ctx.namespaceName, 'Acme.Orders.Views._2026_Reports._class');
      assert.equal(ctx.nullable, true);
      assert.equal(ctx.targetFramework, 'net8.0-windows');
      assert.equal(ctx.fileScopedNamespace, true);
    });

    it('falls back to .csproj filename when RootNamespace is absent', () => {
      const csproj = path.join(tempDir, 'My-Desktop App.csproj');
      fs.writeFileSync(
        csproj,
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0-windows</TargetFramework>
  </PropertyGroup>
</Project>`,
        'utf8'
      );

      const ctx = detectProjectContext(tempDir);
      assert.equal(ctx.namespaceName, 'My_Desktop_App');
      // Modern .NET 6-10 defaults nullable to true when <Nullable> is omitted
      assert.equal(ctx.nullable, true);
      assert.equal(ctx.targetFramework, 'net10.0-windows');
      assert.equal(ctx.fileScopedNamespace, true);
    });

    it('respects explicit <Nullable>disable</Nullable> on modern .NET', () => {
      fs.writeFileSync(
        path.join(tempDir, 'LegacyStyle.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <Nullable>disable</Nullable>
  </PropertyGroup>
</Project>`,
        'utf8'
      );

      const ctx = detectProjectContext(tempDir);
      assert.equal(ctx.nullable, false);
    });

    it('defaults nullable to false for .NET Framework / .NET 5 projects', () => {
      fs.writeFileSync(
        path.join(tempDir, 'ClassicWinForms.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net48</TargetFramework>
  </PropertyGroup>
</Project>`,
        'utf8'
      );

      const ctx = detectProjectContext(tempDir);
      assert.equal(ctx.nullable, false);
      assert.equal(ctx.fileScopedNamespace, false);
      assert.equal(ctx.targetFramework, 'net48');
    });

    it('supports <TargetFrameworks> plural element', () => {
      fs.writeFileSync(
        path.join(tempDir, 'MultiTarget.csproj'),
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>net9.0-windows;net48</TargetFrameworks>
  </PropertyGroup>
</Project>`,
        'utf8'
      );

      const ctx = detectProjectContext(tempDir);
      assert.equal(ctx.targetFramework, 'net9.0-windows');
      assert.equal(ctx.nullable, true);
    });

    it('stops at workspaceRoot boundary when searching ancestors', () => {
      // Put csproj outside workspaceRoot
      fs.writeFileSync(
        path.join(tempDir, 'Outer.csproj'),
        `<Project><PropertyGroup><RootNamespace>OuterNs</RootNamespace></PropertyGroup></Project>`,
        'utf8'
      );
      const workspaceDir = path.join(tempDir, 'workspace');
      const innerDir = path.join(workspaceDir, 'Forms');
      fs.mkdirSync(innerDir, { recursive: true });

      const ctx = detectProjectContext(innerDir, workspaceDir);
      assert.equal(ctx.csprojPath, undefined);
      assert.equal(ctx.namespaceName, 'Forms');
      assert.equal(ctx.nullable, false);
    });
  });

  describe('validateCSharpIdentifier & helpers', () => {
    it('accepts valid C# class names', () => {
      assert.equal(validateCSharpIdentifier('Form1'), undefined);
      assert.equal(validateCSharpIdentifier('_OrderDialog'), undefined);
      assert.equal(validateCSharpIdentifier('Customer_Edit_2'), undefined);
    });

    it('rejects empty, spaced, leading-digit, invalid-char, and keyword names', () => {
      assert.ok(validateCSharpIdentifier(''));
      assert.ok(validateCSharpIdentifier('   '));
      assert.ok(validateCSharpIdentifier('My Form'));
      assert.ok(validateCSharpIdentifier('1Form'));
      assert.ok(validateCSharpIdentifier('Form-1'));
      assert.ok(validateCSharpIdentifier('Form.1'));
      assert.ok(validateCSharpIdentifier('class'));
      assert.ok(validateCSharpIdentifier('namespace'));
      assert.ok(validateCSharpIdentifier('public'));
      assert.ok(validateCSharpIdentifier('return'));
    });

    it('sanitizes namespace segments cleanly', () => {
      assert.equal(sanitizeNamespaceSegment('My Views'), 'My_Views');
      assert.equal(sanitizeNamespaceSegment('123Folder'), '_123Folder');
      assert.equal(sanitizeNamespaceSegment('event'), '_event');
    });

    it('picks next available form and user control names case-insensitively', () => {
      assert.equal(pickNextAvailableFormName(tempDir, 'Form', 2), 'Form2');
      fs.writeFileSync(path.join(tempDir, 'Form2.cs'), '', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'form3.designer.cs'), '', 'utf8');
      assert.equal(pickNextAvailableFormName(tempDir, 'Form', 2), 'Form4');

      assert.equal(pickNextAvailableFormName(tempDir, 'UserControl', 1), 'UserControl1');
      fs.writeFileSync(path.join(tempDir, 'UserControl1.cs'), '', 'utf8');
      assert.equal(pickNextAvailableFormName(tempDir, 'UserControl', 1), 'UserControl2');
    });
  });

  describe('culture .resx discovery & base form lookup', () => {
    it('discovers valid BCP-47 culture .resx files and ignores invalid or traversal names', () => {
      fs.writeFileSync(path.join(tempDir, 'MainForm.resx'), '<root/>', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'MainForm.de.resx'), '<root/>', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'MainForm.fr-FR.resx'), '<root/>', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'MainForm.zh-Hans.resx'), '<root/>', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'MainForm.notacult.resx'), '<root/>', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'OtherForm.es.resx'), '<root/>', 'utf8');

      const found = findCultureResxFiles(tempDir, 'MainForm');
      assert.deepEqual(Object.keys(found).sort(), ['de', 'fr-FR', 'zh-Hans']);
      assert.equal(found['de'], path.join(tempDir, 'MainForm.de.resx'));
      assert.equal(found['fr-FR'], path.join(tempDir, 'MainForm.fr-FR.resx'));
      assert.equal(found['zh-Hans'], path.join(tempDir, 'MainForm.zh-Hans.resx'));

      assert.equal(isValidCultureTag('de'), true);
      assert.equal(isValidCultureTag('fr-FR'), true);
      assert.equal(isValidCultureTag('zh-Hans'), true);
      assert.equal(isValidCultureTag('sr-Latn-RS'), true);
      assert.equal(isValidCultureTag('default'), false);
      assert.equal(isValidCultureTag('../etc'), false);
      assert.equal(isValidCultureTag('de/../../x'), false);
      assert.equal(isValidCultureTag('de..fr'), false);
      assert.equal(isValidCultureTag(''), false);
    });

    it('finds base form Designer files case-insensitively while ignoring bin/obj and confining to allowedRoots', () => {
      const binDir = path.join(tempDir, 'bin', 'Debug');
      const baseDir = path.join(tempDir, 'Base');
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winforms-outside-'));
      try {
        fs.mkdirSync(binDir, { recursive: true });
        fs.mkdirSync(baseDir, { recursive: true });
        // File in bin/ must be ignored
        fs.writeFileSync(path.join(binDir, 'BaseDialog.Designer.cs'), 'partial class BaseDialog {}', 'utf8');
        const realBase = path.join(baseDir, 'basedialog.designer.cs');
        fs.writeFileSync(realBase, 'partial class BaseDialog {}', 'utf8');
        fs.writeFileSync(path.join(outsideDir, 'SecretBase.Designer.cs'), 'partial class SecretBase {}', 'utf8');

        const found = findBaseDesignerFile('BaseDialog', [tempDir], [tempDir]);
        assert.equal(found, fs.realpathSync(realBase));

        // Reject traversal names
        assert.equal(findBaseDesignerFile('../SecretBase', [tempDir], [tempDir]), undefined);
        // Outside allowedRoots cannot be found
        assert.equal(findBaseDesignerFile('SecretBase', [outsideDir], [tempDir]), undefined);
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });
});
