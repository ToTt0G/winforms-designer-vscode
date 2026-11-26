import * as fs from 'node:fs';
import * as path from 'node:path';
import { CULTURE_TAG_RE, isValidCultureTag } from '../shared/protocol';

export { CULTURE_TAG_RE, isValidCultureTag };

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
const IGNORED_SEARCH_DIRS = new Set(['bin', 'obj', 'node_modules', '.git', '.vs']);

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

/**
 * Discovers culture-specific `.resx` files (`<baseName>.<culture>.resx`) in `directory`.
 * Strictly rejects symlinks and paths resolving outside `directory`, deduplicating
 * case-insensitively so case variants never appear as duplicate cultures.
 */
export function findCultureResxFiles(
  directory: string,
  baseName: string
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!directory || !baseName) {
    return result;
  }

  let canonicalDir: string;
  let entries: string[];
  try {
    canonicalDir = fs.realpathSync(directory);
    entries = fs.readdirSync(directory).sort((a, b) => a.localeCompare(b));
  } catch {
    return result;
  }

  const prefixLower = `${baseName.toLowerCase()}.`;
  const suffixLower = '.resx';
  const seenLowerCultures = new Set<string>();

  for (const entry of entries) {
    const lower = entry.toLowerCase();
    if (!lower.startsWith(prefixLower) || !lower.endsWith(suffixLower)) {
      continue;
    }
    const culture = entry.slice(baseName.length + 1, entry.length - suffixLower.length);
    if (!isValidCultureTag(culture)) {
      continue;
    }
    const lowerCulture = culture.toLowerCase();
    if (seenLowerCultures.has(lowerCulture)) {
      continue;
    }
    const fullPath = path.join(directory, entry);
    try {
      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink() || !lstat.isFile()) {
        continue;
      }
      const canonicalFile = fs.realpathSync(fullPath);
      if (!isCanonicalPathWithinRoots(canonicalFile, [canonicalDir])) {
        continue;
      }
      seenLowerCultures.add(lowerCulture);
      result[culture] = fullPath;
    } catch {
      // Skip unreadable entries
    }
  }

  return result;
}

function isCanonicalPathWithinRoots(canonicalPath: string, canonicalRoots: string[]): boolean {
  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
  const target = caseInsensitive ? canonicalPath.toLowerCase() : canonicalPath;
  return canonicalRoots.some((root) => {
    const normRoot = caseInsensitive ? root.toLowerCase() : root;
    if (target === normRoot) {
      return true;
    }
    const prefix = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;
    return target.startsWith(prefix);
  });
}

/**
 * Statically searches `searchRoots` (bounded to `maxDepth`, ignoring build/VCS folders,
 * cycle-protected and strictly confined to `allowedRoots`) for `<baseClassName>.Designer.cs`
 * (case-insensitive).
 */
export function findBaseDesignerFile(
  baseClassName: string,
  searchRoots: string[],
  allowedRoots?: string[],
  maxDepth = 5
): string | undefined {
  if (!baseClassName || validateCSharpIdentifier(baseClassName) !== undefined) {
    return undefined;
  }

  const effectiveAllowed = allowedRoots && allowedRoots.length > 0 ? allowedRoots : searchRoots;
  const canonicalAllowed: string[] = [];
  for (const root of effectiveAllowed) {
    if (!root) continue;
    try {
      const real = fs.realpathSync(root);
      if (!canonicalAllowed.includes(real)) {
        canonicalAllowed.push(real);
      }
    } catch {
      // Skip missing root
    }
  }
  if (canonicalAllowed.length === 0) {
    return undefined;
  }

  const targetLower = `${baseClassName.toLowerCase()}.designer.cs`;
  const visitedDirs = new Set<string>();

  for (const root of searchRoots) {
    if (!root) continue;
    let canonicalRoot: string;
    try {
      canonicalRoot = fs.realpathSync(root);
      if (!fs.statSync(canonicalRoot).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    if (!isCanonicalPathWithinRoots(canonicalRoot, canonicalAllowed)) {
      continue;
    }

    const queue: Array<{ dir: string; depth: number }> = [{ dir: canonicalRoot, depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const dirKey =
        process.platform === 'win32' || process.platform === 'darwin'
          ? current.dir.toLowerCase()
          : current.dir;
      if (visitedDirs.has(dirKey)) {
        continue;
      }
      visitedDirs.add(dirKey);

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }

      const subdirs: string[] = [];
      for (const entry of entries) {
        const lowerName = entry.name.toLowerCase();
        const fullPath = path.join(current.dir, entry.name);

        if (lowerName === targetLower) {
          try {
            const lstat = fs.lstatSync(fullPath);
            if (lstat.isSymbolicLink()) {
              continue;
            }
            const canonicalFile = fs.realpathSync(fullPath);
            if (
              isCanonicalPathWithinRoots(canonicalFile, canonicalAllowed) &&
              fs.statSync(canonicalFile).isFile()
            ) {
              const content = fs.readFileSync(canonicalFile, 'utf8');
              const classDeclRe = new RegExp(`\\bclass\\s+${baseClassName}\\b`);
              if (classDeclRe.test(content)) {
                return canonicalFile;
              }
            }
          } catch {
            // Skip broken symlinks or unreadable files
          }
          continue;
        }

        if (current.depth >= maxDepth) {
          continue;
        }

        if (entry.isDirectory() && !IGNORED_SEARCH_DIRS.has(lowerName)) {
          try {
            const canonicalSub = fs.realpathSync(fullPath);
            if (isCanonicalPathWithinRoots(canonicalSub, canonicalAllowed)) {
              subdirs.push(canonicalSub);
            }
          } catch {
            // Skip broken symlinks
          }
        }
      }

      subdirs.sort((a, b) => a.localeCompare(b));
      for (const sub of subdirs) {
        queue.push({ dir: sub, depth: current.depth + 1 });
      }
    }
  }

  return undefined;
}
