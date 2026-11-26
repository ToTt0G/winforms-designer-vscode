import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ResolvedFormFiles {
  baseName: string;
  directory: string;
  designerPath: string;
  codeBehindPath: string;
  resxPath: string;
  isDesignerFile: boolean;
}

export interface ProjectContext {
  namespaceName: string;
  nullable: boolean;
  targetFramework?: string;
  csprojPath?: string;
  projectDir?: string;
  fileScopedNamespace: boolean;
}

export const CSHARP_KEYWORDS: ReadonlySet<string> = new Set([
  'abstract',
  'as',
  'base',
  'bool',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'checked',
  'class',
  'const',
  'continue',
  'decimal',
  'default',
  'delegate',
  'do',
  'double',
  'else',
  'enum',
  'event',
  'explicit',
  'extern',
  'false',
  'finally',
  'fixed',
  'float',
  'for',
  'foreach',
  'goto',
  'if',
  'implicit',
  'in',
  'int',
  'interface',
  'internal',
  'is',
  'lock',
  'long',
  'namespace',
  'new',
  'null',
  'object',
  'operator',
  'out',
  'override',
  'params',
  'private',
  'protected',
  'public',
  'readonly',
  'ref',
  'return',
  'sbyte',
  'sealed',
  'short',
  'sizeof',
  'stackalloc',
  'static',
  'string',
  'struct',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'uint',
  'ulong',
  'unchecked',
  'unsafe',
  'ushort',
  'using',
  'virtual',
  'void',
  'volatile',
  'while',
]);

const MAX_CSPROJ_SEARCH_DEPTH = 8;
const MODERN_NET_TFM_RE = /^net(?:6|7|8|9|10)(?:\.\d+)?(?:-.+)?$/i;
const DESIGNER_FILE_RE = /^(.+)\.designer\.cs$/i;
const CS_FILE_RE = /^(.+)\.cs$/i;

/**
 * Checks exact path first, then scans directory case-insensitively so sibling files
 * with differing case (e.g., `form1.designer.cs` vs `Form1.Designer.cs`) resolve
 * reliably on case-sensitive filesystems (Linux/macOS).
 */
function findSiblingFile(directory: string, expectedFileName: string): string {
  const exactPath = path.join(directory, expectedFileName);

  try {
    const entries = fs.readdirSync(directory);
    // Prefer exact-case match first, then preserve actual on-disk casing on case-insensitive FS (Windows/macOS).
    if (entries.includes(expectedFileName)) {
      return exactPath;
    }
    const lowerExpected = expectedFileName.toLowerCase();
    for (const entry of entries) {
      if (entry.toLowerCase() === lowerExpected) {
        return path.join(directory, entry);
      }
    }
  } catch {
    // Directory may not exist yet or be unreadable; fall back to exact candidate path.
  }

  return exactPath;
}

/**
 * Given a path to `Foo.cs`, `Foo.Designer.cs`, or `foo.designer.cs`, resolves
 * all sibling WinForms file paths (designer, code-behind, and .resx).
 */
export function resolveFormFiles(filePath: string): ResolvedFormFiles {
  const normalizedPath = path.resolve(filePath);
  const directory = path.dirname(normalizedPath);
  const fileName = path.basename(normalizedPath);

  const designerMatch = DESIGNER_FILE_RE.exec(fileName);
  if (designerMatch) {
    const baseName = designerMatch[1];
    return {
      baseName,
      directory,
      designerPath: normalizedPath,
      codeBehindPath: findSiblingFile(directory, `${baseName}.cs`),
      resxPath: findSiblingFile(directory, `${baseName}.resx`),
      isDesignerFile: true,
    };
  }

  const csMatch = CS_FILE_RE.exec(fileName);
  const baseName = csMatch ? csMatch[1] : path.parse(fileName).name;

  return {
    baseName,
    directory,
    designerPath: findSiblingFile(directory, `${baseName}.Designer.cs`),
    codeBehindPath: csMatch ? normalizedPath : findSiblingFile(directory, `${baseName}.cs`),
    resxPath: findSiblingFile(directory, `${baseName}.resx`),
    isDesignerFile: false,
  };
}

/**
 * Sanitizes a single folder or namespace segment into a valid C# identifier.
 */
export function sanitizeNamespaceSegment(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed) {
    return '';
  }

  let sanitized = trimmed.replace(/[^A-Za-z0-9_]/g, '_');
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  if (CSHARP_KEYWORDS.has(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized;
}

function sanitizeNamespace(rawNamespace: string): string {
  const parts = rawNamespace
    .split('.')
    .map((segment) => sanitizeNamespaceSegment(segment))
    .filter((segment) => segment.length > 0);
  return parts.join('.');
}

function stripXmlComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function readXmlTag(xml: string, tagName: string): string | undefined {
  const re = new RegExp(`<${tagName}\\b[^>]*>([^<]+)</${tagName}>`, 'i');
  const match = re.exec(xml);
  return match ? match[1].trim() : undefined;
}

function isPathInsideOrEqual(candidate: string, ancestor: string): boolean {
  const rel = path.relative(ancestor, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Walks up ancestor directories (bounded by MAX_CSPROJ_SEARCH_DEPTH and optional
 * workspaceRoot) to locate the nearest `.csproj`, extract RootNamespace, append
 * sanitized relative subfolder segments, and detect Nullable & TargetFramework.
 */
export function detectProjectContext(startDir: string, workspaceRoot?: string): ProjectContext {
  const resolvedStart = path.resolve(startDir);
  const resolvedRoot = workspaceRoot ? path.resolve(workspaceRoot) : undefined;
  const boundedByRoot =
    resolvedRoot !== undefined && isPathInsideOrEqual(resolvedStart, resolvedRoot);

  let currentDir = resolvedStart;
  let csprojPath: string | undefined;
  let projectDir: string | undefined;

  for (let depth = 0; depth <= MAX_CSPROJ_SEARCH_DEPTH; depth++) {
    try {
      const entries = fs.readdirSync(currentDir);
      const csprojs = entries
        .filter((entry) => entry.toLowerCase().endsWith('.csproj'))
        .sort((a, b) => a.localeCompare(b));

      if (csprojs.length > 0) {
        csprojPath = path.join(currentDir, csprojs[0]);
        projectDir = currentDir;
        break;
      }
    } catch {
      // Stop walking if a directory cannot be read
      break;
    }

    if (boundedByRoot && resolvedRoot && sameFilePath(currentDir, resolvedRoot)) {
      break;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  if (!csprojPath || !projectDir) {
    const fallbackName = sanitizeNamespaceSegment(path.basename(resolvedStart)) || 'WinFormsApp';
    return {
      namespaceName: fallbackName,
      nullable: false,
      fileScopedNamespace: false,
    };
  }

  let xml = '';
  try {
    xml = stripXmlComments(fs.readFileSync(csprojPath, 'utf8'));
  } catch {
    xml = '';
  }

  const csprojBaseName = path.basename(csprojPath, path.extname(csprojPath));
  const rawRootNamespace = readXmlTag(xml, 'RootNamespace') || csprojBaseName;
  const baseNamespace = sanitizeNamespace(rawRootNamespace) || 'WinFormsApp';

  const relFromProject = path.relative(projectDir, resolvedStart);
  const subSegments =
    relFromProject && relFromProject !== '.' && !relFromProject.startsWith('..')
      ? relFromProject
          .split(path.sep)
          .map((seg) => sanitizeNamespaceSegment(seg))
          .filter((seg) => seg.length > 0)
      : [];

  const namespaceName =
    subSegments.length > 0 ? `${baseNamespace}.${subSegments.join('.')}` : baseNamespace;

  let targetFramework = readXmlTag(xml, 'TargetFramework');
  if (!targetFramework) {
    const multiTfm = readXmlTag(xml, 'TargetFrameworks');
    if (multiTfm) {
      targetFramework = multiTfm
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.length > 0);
    }
  }

  const isModernNet = targetFramework !== undefined && MODERN_NET_TFM_RE.test(targetFramework);
  const rawNullable = readXmlTag(xml, 'Nullable');
  let nullable: boolean;
  if (rawNullable !== undefined) {
    nullable = rawNullable.toLowerCase() === 'enable';
  } else {
    nullable = isModernNet;
  }

  return {
    namespaceName,
    nullable,
    targetFramework,
    csprojPath,
    projectDir,
    fileScopedNamespace: isModernNet,
  };
}

/**
 * Validates whether a string is a valid C# class/identifier name.
 * Returns a human-readable error message if invalid, or undefined if valid.
 */
export function validateCSharpIdentifier(name: string): string | undefined {
  if (!name || name.trim().length === 0) {
    return 'Name cannot be empty.';
  }
  if (/\s/.test(name)) {
    return 'Name cannot contain spaces.';
  }
  if (/^[0-9]/.test(name)) {
    return 'Name cannot start with a digit.';
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return 'Name must contain only letters, digits, and underscores.';
  }
  if (CSHARP_KEYWORDS.has(name)) {
    return `'${name}' is a reserved C# keyword.`;
  }
  return undefined;
}

/**
 * Checks whether `<className>.cs` or `<className>.Designer.cs` already exists in `directory`
 * (case-insensitive check for cross-platform safety).
 */
export function formFilesExistInDirectory(directory: string, className: string): boolean {
  const lowerCs = `${className}.cs`.toLowerCase();
  const lowerDesigner = `${className}.Designer.cs`.toLowerCase();

  try {
    const entries = fs.readdirSync(directory);
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (lower === lowerCs || lower === lowerDesigner) {
        return true;
      }
    }
    return false;
  } catch {
    return (
      fs.existsSync(path.join(directory, `${className}.cs`)) ||
      fs.existsSync(path.join(directory, `${className}.Designer.cs`))
    );
  }
}

/**
 * Picks the next unused form/control class name in `directory` starting from `startNumber`
 * (e.g., Form2, Form3... or UserControl1, UserControl2...).
 */
export function pickNextAvailableFormName(
  directory: string,
  prefix: string,
  startNumber = 1
): string {
  for (let i = startNumber; i < startNumber + 1000; i++) {
    const candidate = `${prefix}${i}`;
    if (!formFilesExistInDirectory(directory, candidate)) {
      return candidate;
    }
  }
  return `${prefix}${Date.now()}`;
}

/**
 * Compares two file paths consistently across platforms.
 */
export function sameFilePath(a: string, b: string): boolean {
  const normA = path.resolve(a);
  const normB = path.resolve(b);
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}
