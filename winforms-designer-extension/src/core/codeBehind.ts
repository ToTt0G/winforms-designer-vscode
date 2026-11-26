// WinForms Code-Behind (.cs) Parser and Event Handler Patcher

import { getEventSignature } from '../shared/catalog';
import type { CodeBehindInfo, CodeBehindMethod } from '../shared/model';
import { findMatchingBrace, findMatchingDelimiter, tokenizeCSharp, type Token } from './lexer';

export interface EnsureEventHandlerRequest {
  controlType: string;
  eventName: string;
  methodName: string;
  nullable?: boolean;
  className?: string;
}

export interface EnsureEventHandlerResult {
  updatedSource: string;
  line: number;
  column: number;
  created: boolean;
}

interface ParsedMethodSpan extends CodeBehindMethod {
  bodyOpenBraceIndex: number;
  bodyCloseBraceIndex: number;
  arrowIndex: number;
}

interface ParsedCodeBehindInternal extends CodeBehindInfo {
  rawBaseType: string;
  isPartial: boolean;
  classOpenBraceIndex: number;
  classCloseBraceIndex: number;
  methodSpans: ParsedMethodSpan[];
  tokens: Token[];
}

const CONTROL_FLOW_KEYWORDS = new Set<string>([
  'if',
  'else',
  'for',
  'foreach',
  'while',
  'do',
  'switch',
  'catch',
  'using',
  'lock',
  'fixed',
  'sizeof',
  'typeof',
  'nameof',
  'default',
  'new',
  'return',
]);

const MODIFIER_KEYWORDS = new Set<string>([
  'public',
  'private',
  'protected',
  'internal',
  'static',
  'virtual',
  'override',
  'abstract',
  'sealed',
  'async',
  'unsafe',
  'extern',
  'new',
  'partial',
  'readonly',
]);

/**
 * Parses a WinForms code-behind `.cs` file to extract namespace, class name, base type,
 * and declared methods (including whether each method matches the WinForms event handler signature).
 */
export function parseCodeBehind(source: string): CodeBehindInfo {
  const internal = parseCodeBehindInternal(source);
  return {
    className: internal.className,
    baseType: internal.baseType,
    namespaceName: internal.namespaceName,
    fileScopedNamespace: internal.fileScopedNamespace,
    methods: internal.methods,
  };
}

/**
 * Ensures an event handler method with `req.methodName` exists in the code-behind `.cs` class.
 * - If it already exists, returns the unchanged source and the 1-based line/column inside its body.
 * - Otherwise, inserts a `private void <methodName>(object? sender, <EventArgs> e)` stub right before
 *   the closing brace of the partial class, matching file indentation and line endings.
 */
export function ensureEventHandlerInCodeBehind(
  source: string,
  req: EnsureEventHandlerRequest
): EnsureEventHandlerResult {
  const parsed = parseCodeBehindInternal(source, req.className);

  // 1. Check if a compatible event-handler method already exists (2 parameters or event-handler-like)
  const existing = parsed.methodSpans.find(
    (m) =>
      m.name === req.methodName &&
      (m.isEventHandlerLike || splitTopLevelCommas(m.parameters).length === 2)
  );
  if (existing) {
    const pos = computeExistingMethodBodyPosition(source, parsed.tokens, existing);
    return {
      updatedSource: source,
      line: pos.line,
      column: pos.column,
      created: false,
    };
  }

  // 2. Method does not exist -> insert before class closing brace
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const { delegateType, eventArgsType: rawEventArgsType } = getEventSignature(
    req.controlType,
    req.eventName
  );
  const eventArgsType = resolveEventArgsTypeForSource(
    rawEventArgsType,
    delegateType,
    source,
    parsed
  );
  const useNullable = detectNullableSetting(source, parsed, req.nullable);
  const senderParam = useNullable ? 'object? sender' : 'object sender';

  if (parsed.classCloseBraceIndex < 0) {
    // Fallback if class structure wasn't found: append cleanly
    const stub = `${eol}private void ${req.methodName}(${senderParam}, ${eventArgsType} e)${eol}{${eol}    ${eol}}${eol}`;
    const updatedSource = source + stub;
    const bodyLine = countLines(source) + 3;
    return {
      updatedSource,
      line: bodyLine,
      column: 5,
      created: true,
    };
  }

  const closeBraceTok = parsed.tokens[parsed.classCloseBraceIndex];
  const openBraceTok = parsed.tokens[parsed.classOpenBraceIndex];
  const closeLineStart = findLineStart(source, closeBraceTok.start);
  const beforeCloseOnSameLine = source.slice(closeLineStart, closeBraceTok.start);
  const closeBraceHasLeadingCode = beforeCloseOnSameLine.trim().length > 0;

  if (closeBraceHasLeadingCode) {
    // Single-line or inline closing brace (e.g. `public partial class Form1 : Form { }`) -> insert strictly INSIDE braces!
    const classIndentMatch = /^[ \t]*/.exec(beforeCloseOnSameLine);
    const classIndent = classIndentMatch ? classIndentMatch[0] : '';
    const indentUnit = detectIndentUnit(source, parsed, classIndent);
    const memberIndent = classIndent + indentUnit;
    const bodyIndent = memberIndent + indentUnit;

    let trimStart = closeBraceTok.start;
    while (
      trimStart > (openBraceTok ? openBraceTok.end : closeLineStart) &&
      (source[trimStart - 1] === ' ' || source[trimStart - 1] === '\t')
    ) {
      trimStart--;
    }

    const methodLines = [
      `${memberIndent}private void ${req.methodName}(${senderParam}, ${eventArgsType} e)`,
      `${memberIndent}{`,
      `${bodyIndent}`,
      `${memberIndent}}`,
    ];
    const insertion = eol + methodLines.join(eol) + eol + classIndent;
    const updatedSource =
      source.slice(0, trimStart) + insertion + source.slice(closeBraceTok.start);

    const prefixBeforeBodyLine =
      source.slice(0, trimStart) + eol + methodLines[0] + eol + methodLines[1] + eol;
    const bodyLine = countLines(prefixBeforeBodyLine);
    const bodyColumn = bodyIndent.length + 1;

    return {
      updatedSource,
      line: bodyLine,
      column: bodyColumn,
      created: true,
    };
  }

  const classIndent = beforeCloseOnSameLine.replace(/[^\t ]/g, '');
  const indentUnit = detectIndentUnit(source, parsed, classIndent);
  const memberIndent = classIndent + indentUnit;
  const bodyIndent = memberIndent + indentUnit;

  // Determine spacing before insertion point
  const beforeCloseLine = source.slice(0, closeLineStart);
  const trimmedBefore = beforeCloseLine.replace(/[ \t]+$/, '');
  const endsWithDoubleNewline =
    trimmedBefore.endsWith('\n\n') ||
    trimmedBefore.endsWith('\r\n\r\n') ||
    trimmedBefore.endsWith('\r\r');
  const classIsEmpty =
    parsed.classCloseBraceIndex === parsed.classOpenBraceIndex + 1 ||
    (trimmedBefore.trimEnd().endsWith('{') && openBraceTok !== undefined);

  let leadingSep = '';
  if (!classIsEmpty && !endsWithDoubleNewline) {
    if (beforeCloseLine.endsWith('\n') || beforeCloseLine.endsWith('\r')) {
      leadingSep = eol;
    } else {
      leadingSep = eol + eol;
    }
  } else if (classIsEmpty && !beforeCloseLine.endsWith('\n') && !beforeCloseLine.endsWith('\r')) {
    leadingSep = eol;
  }

  const methodLines = [
    `${memberIndent}private void ${req.methodName}(${senderParam}, ${eventArgsType} e)`,
    `${memberIndent}{`,
    `${bodyIndent}`,
    `${memberIndent}}`,
  ];
  const insertion = leadingSep + methodLines.join(eol) + eol;
  const updatedSource =
    source.slice(0, closeLineStart) + insertion + source.slice(closeLineStart);

  // Calculate exact 1-based line and column of the empty body line (`methodLines[2]`)
  const prefixBeforeBodyLine =
    source.slice(0, closeLineStart) +
    leadingSep +
    methodLines[0] +
    eol +
    methodLines[1] +
    eol;
  const bodyLine = countLines(prefixBeforeBodyLine);
  const bodyColumn = bodyIndent.length + 1;

  return {
    updatedSource,
    line: bodyLine,
    column: bodyColumn,
    created: true,
  };
}

function resolveEventArgsTypeForSource(
  eventArgsType: string,
  delegateType: string,
  source: string,
  parsed: ParsedCodeBehindInternal
): string {
  if (eventArgsType.includes('.')) {
    return eventArgsType;
  }

  const hasAnyExplicitUsing = /^\s*(?:global\s+)?using\s+[A-Za-z_]/m.test(source);
  const isQualifiedBase = parsed.rawBaseType.includes('.');
  const clearlyImplicitUsings =
    !hasAnyExplicitUsing && parsed.fileScopedNamespace && !isQualifiedBase;

  if (clearlyImplicitUsings) {
    return eventArgsType;
  }

  // Determine the owning namespace of this EventArgs type from the delegate type
  let targetNs = 'System.Windows.Forms';
  if (eventArgsType === 'EventArgs') {
    targetNs = 'System';
  } else if (delegateType.includes('.')) {
    targetNs = delegateType.slice(0, delegateType.lastIndexOf('.'));
  }

  const escapedNs = targetNs.replace(/\./g, '\\.');
  const hasUsingTargetNs = new RegExp(`^\\s*(?:global\\s+)?using\\s+${escapedNs}\\s*;`, 'm').test(
    source
  );
  if (hasUsingTargetNs) {
    return eventArgsType;
  }

  return `${targetNs}.${eventArgsType}`;
}

interface CandidateClass {
  className: string;
  baseType: string;
  rawBaseType: string;
  isPartial: boolean;
  classOpenBraceIndex: number;
  classCloseBraceIndex: number;
  namespaceName: string;
  fileScopedNamespace: boolean;
}

function parseCodeBehindInternal(
  source: string,
  targetClassName?: string
): ParsedCodeBehindInternal {
  const tokens = tokenizeCSharp(source);
  let namespaceName = '';
  let fileScopedNamespace = false;
  const candidates: CandidateClass[] = [];

  // Scan top-level for namespace and all top-level classes
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === 'eof') break;

    if (tok.kind === 'keyword' && tok.text === 'namespace' && !namespaceName) {
      let j = i + 1;
      const parts: string[] = [];
      while (j < tokens.length && tokens[j].text !== ';' && tokens[j].text !== '{') {
        if (tokens[j].kind === 'identifier' || tokens[j].kind === 'keyword' || tokens[j].text === '.') {
          parts.push(tokens[j].text);
        }
        j++;
      }
      namespaceName = parts.join('');
      if (j < tokens.length && tokens[j].text === ';') {
        fileScopedNamespace = true;
      }
      i = j;
      continue;
    }

    if (tok.kind === 'keyword' && tok.text === 'class') {
      // Check if `partial` preceded `class` among its contiguous modifiers
      let isPartial = false;
      let m = i - 1;
      while (m >= 0 && tokens[m].kind === 'keyword' && MODIFIER_KEYWORDS.has(tokens[m].text)) {
        if (tokens[m].text === 'partial') {
          isPartial = true;
        }
        m--;
      }

      const nameTok = tokens[i + 1];
      if (nameTok && (nameTok.kind === 'identifier' || nameTok.kind === 'keyword')) {
        const candidateName = nameTok.text;
        let candidateBaseType = 'Form';
        let rawBaseType = '';
        let j = i + 2;

        // Skip generic parameters if present: class Foo<T>
        if (j < tokens.length && tokens[j].text === '<') {
          let angleDepth = 0;
          while (j < tokens.length) {
            if (tokens[j].text === '<') angleDepth++;
            else if (tokens[j].text === '>') {
              angleDepth--;
              if (angleDepth === 0) {
                j++;
                break;
              }
            }
            j++;
          }
        }

        // Optional base list: `: Form, IInterface`
        if (j < tokens.length && tokens[j].text === ':') {
          j++;
          const baseTypeParts: string[] = [];
          while (
            j < tokens.length &&
            tokens[j].text !== '{' &&
            tokens[j].text !== ',' &&
            tokens[j].text !== 'where'
          ) {
            baseTypeParts.push(tokens[j].text);
            j++;
          }
          rawBaseType = baseTypeParts.join('').trim();
          if (rawBaseType) {
            const cleanedBase = rawBaseType.replace(/^global::/, '');
            const shortBase = cleanedBase.includes('.')
              ? cleanedBase.slice(cleanedBase.lastIndexOf('.') + 1)
              : cleanedBase;
            candidateBaseType = shortBase;
          }
        }

        // Advance to class opening `{`
        while (j < tokens.length && tokens[j].text !== '{' && tokens[j].kind !== 'eof') {
          j++;
        }
        if (j < tokens.length && tokens[j].text === '{') {
          const openIdx = j;
          const closeIdx = findMatchingBrace(tokens, j);
          candidates.push({
            className: candidateName,
            baseType: candidateBaseType,
            rawBaseType,
            isPartial,
            classOpenBraceIndex: openIdx,
            classCloseBraceIndex: closeIdx,
            namespaceName,
            fileScopedNamespace,
          });
          // Skip past this class body so nested classes aren't treated as top-level
          i = closeIdx >= 0 ? closeIdx : j;
          continue;
        }
      }
    }
  }

  let selected: CandidateClass | undefined;
  if (targetClassName) {
    selected =
      candidates.find((c) => c.className === targetClassName && c.isPartial) ??
      candidates.find((c) => c.className === targetClassName);
  }
  if (!selected) {
    selected =
      candidates.find(
        (c) => c.isPartial && (c.baseType === 'Form' || c.baseType === 'UserControl')
      ) ??
      candidates.find((c) => c.baseType === 'Form' || c.baseType === 'UserControl') ??
      candidates[0];
  }

  const className = selected?.className ?? '';
  const baseType = selected?.baseType ?? 'Form';
  const rawBaseType = selected?.rawBaseType ?? '';
  const isPartial = selected?.isPartial ?? false;
  const classOpenBraceIndex = selected?.classOpenBraceIndex ?? -1;
  const classCloseBraceIndex = selected?.classCloseBraceIndex ?? -1;

  const methodSpans: ParsedMethodSpan[] = [];
  if (classOpenBraceIndex >= 0 && classCloseBraceIndex > classOpenBraceIndex) {
    scanClassMethods(
      source,
      tokens,
      classOpenBraceIndex + 1,
      classCloseBraceIndex,
      className,
      methodSpans
    );
  }

  const methods: CodeBehindMethod[] = methodSpans.map(
    ({ name, line, column, parameters, isEventHandlerLike }) => ({
      name,
      line,
      column,
      parameters,
      isEventHandlerLike,
    })
  );

  return {
    className,
    baseType,
    rawBaseType,
    isPartial,
    namespaceName: selected?.namespaceName ?? namespaceName,
    fileScopedNamespace: selected?.fileScopedNamespace ?? fileScopedNamespace,
    methods,
    classOpenBraceIndex,
    classCloseBraceIndex,
    methodSpans,
    tokens,
  };
}

function scanClassMethods(
  source: string,
  tokens: Token[],
  startIdx: number,
  endIdx: number,
  className: string,
  out: ParsedMethodSpan[]
): void {
  let i = startIdx;
  while (i < endIdx) {
    const tok = tokens[i];
    if (tok.kind === 'preprocessor') {
      i++;
      continue;
    }

    // Skip attribute lists `[...]`
    if (tok.kind === 'punctuation' && tok.text === '[') {
      const closeBracket = findMatchingDelimiter(tokens, i, '[', ']');
      i = closeBracket >= 0 ? closeBracket + 1 : i + 1;
      continue;
    }

    // Skip nested blocks / types if we encounter `{` directly
    if (tok.kind === 'punctuation' && tok.text === '{') {
      const closeBrace = findMatchingBrace(tokens, i);
      i = closeBrace >= 0 ? closeBrace + 1 : i + 1;
      continue;
    }

    // Parse a member declaration header starting at `i`
    const memberStart = i;
    // Skip modifiers
    while (i < endIdx && tokens[i].kind === 'keyword' && MODIFIER_KEYWORDS.has(tokens[i].text)) {
      i++;
    }

    // Skip nested class/struct/enum/interface/record/delegate declarations
    if (
      i < endIdx &&
      (tokens[i].text === 'class' ||
        tokens[i].text === 'struct' ||
        tokens[i].text === 'enum' ||
        tokens[i].text === 'interface' ||
        tokens[i].text === 'record')
    ) {
      while (i < endIdx && tokens[i].text !== '{' && tokens[i].text !== ';') i++;
      if (i < endIdx && tokens[i].text === '{') {
        const closeBrace = findMatchingBrace(tokens, i);
        i = closeBrace >= 0 ? closeBrace + 1 : i + 1;
      } else {
        i++;
      }
      continue;
    }

    // Scan until `(`, `;`, `{`, or `=>` at top-level (respecting `<...>` generics and `[...]` arrays)
    let j = i;
    let angleDepth = 0;
    let bracketDepth = 0;
    while (j < endIdx) {
      const t = tokens[j];
      if (t.text === '<') angleDepth++;
      else if (t.text === '>' && angleDepth > 0) angleDepth--;
      else if (t.text === '[') bracketDepth++;
      else if (t.text === ']' && bracketDepth > 0) bracketDepth--;
      else if (angleDepth === 0 && bracketDepth === 0) {
        if (t.text === '(' || t.text === ';' || t.text === '{' || t.text === '=>') {
          break;
        }
      }
      j++;
    }

    if (j >= endIdx) break;

    if (tokens[j].text === ';') {
      // Field or event declaration
      i = j + 1;
      continue;
    }

    if (tokens[j].text === '{') {
      // Property or indexer with getter/setter block
      const closeBrace = findMatchingBrace(tokens, j);
      i = closeBrace >= 0 ? closeBrace + 1 : j + 1;
      continue;
    }

    if (tokens[j].text === '=>') {
      // Expression-bodied property
      while (j < endIdx && tokens[j].text !== ';') j++;
      i = j + 1;
      continue;
    }

    // Found `(` at index `j`: check if this is a method (not constructor, not field initializer)
    const openParen = j;
    const closeParen = findMatchingDelimiter(tokens, openParen, '(', ')');
    if (closeParen < 0 || closeParen >= endIdx) {
      i = j + 1;
      continue;
    }

    // Look at header tokens between `i` (after modifiers) and `openParen`
    // Exclude fields with `=` before `(` (e.g. `private readonly Foo x = new Foo();`)
    let hasEquals = false;
    for (let k = memberStart; k < openParen; k++) {
      if (tokens[k].text === '=') {
        hasEquals = true;
        break;
      }
    }
    if (hasEquals) {
      // Skip to end of field declaration `;`
      let k = closeParen + 1;
      let braceD = 0;
      while (k < endIdx) {
        if (tokens[k].text === '{') braceD++;
        else if (tokens[k].text === '}') braceD = Math.max(0, braceD - 1);
        else if (tokens[k].text === ';' && braceD === 0) {
          k++;
          break;
        }
        k++;
      }
      i = k;
      continue;
    }

    // Extract method name (identifier right before `(` or before `<T>` before `(`)
    let nameIdx = openParen - 1;
    if (nameIdx >= i && tokens[nameIdx].text === '>') {
      // Skip generic method type parameters `Foo<T>(`
      let ad = 0;
      while (nameIdx >= i) {
        if (tokens[nameIdx].text === '>') ad++;
        else if (tokens[nameIdx].text === '<') {
          ad--;
          if (ad === 0) {
            nameIdx--;
            break;
          }
        }
        nameIdx--;
      }
    }

    const nameTok = nameIdx >= i ? tokens[nameIdx] : undefined;
    const returnTypeTokens = nameIdx > i ? tokens.slice(i, nameIdx) : [];
    const returnTypeText = returnTypeTokens.map((t) => t.text).join('');

    // Advance past parameter list `)` and optional constraints (`where ...`) or constructor `: base(...)`
    let afterParen = closeParen + 1;
    while (
      afterParen < endIdx &&
      tokens[afterParen].text !== '{' &&
      tokens[afterParen].text !== '=>' &&
      tokens[afterParen].text !== ';'
    ) {
      afterParen++;
    }

    let bodyOpenBraceIndex = -1;
    let bodyCloseBraceIndex = -1;
    let arrowIndex = -1;
    let nextI = afterParen + 1;

    if (afterParen < endIdx && tokens[afterParen].text === '{') {
      bodyOpenBraceIndex = afterParen;
      bodyCloseBraceIndex = findMatchingBrace(tokens, afterParen);
      nextI = bodyCloseBraceIndex >= 0 ? bodyCloseBraceIndex + 1 : afterParen + 1;
    } else if (afterParen < endIdx && tokens[afterParen].text === '=>') {
      arrowIndex = afterParen;
      let k = afterParen + 1;
      let braceD = 0;
      let parenD = 0;
      while (k < endIdx) {
        if (tokens[k].text === '{') braceD++;
        else if (tokens[k].text === '}') braceD = Math.max(0, braceD - 1);
        else if (tokens[k].text === '(') parenD++;
        else if (tokens[k].text === ')') parenD = Math.max(0, parenD - 1);
        else if (tokens[k].text === ';' && braceD === 0 && parenD === 0) {
          k++;
          break;
        }
        k++;
      }
      nextI = k;
    }

    // Record if this is a real method (has return type, name is not className/control-flow)
    if (
      nameTok &&
      nameTok.kind === 'identifier' &&
      returnTypeTokens.length > 0 &&
      nameTok.text !== className &&
      !CONTROL_FLOW_KEYWORDS.has(nameTok.text) &&
      (bodyOpenBraceIndex >= 0 || arrowIndex >= 0)
    ) {
      const paramsRaw = source.slice(tokens[openParen].end, tokens[closeParen].start).trim();
      const isEventHandlerLike = checkEventHandlerSignature(returnTypeText, paramsRaw);
      out.push({
        name: nameTok.text,
        line: nameTok.line,
        column: nameTok.column,
        parameters: paramsRaw,
        isEventHandlerLike,
        bodyOpenBraceIndex,
        bodyCloseBraceIndex,
        arrowIndex,
      });
    }

    i = nextI;
  }
}

function checkEventHandlerSignature(returnType: string, paramsRaw: string): boolean {
  if (returnType !== 'void') return false;
  if (!paramsRaw) return false;
  const params = splitTopLevelCommas(paramsRaw);
  if (params.length !== 2) return false;

  const p0 = params[0].trim();
  const p1 = params[1].trim();
  // First param type should be `object`, `object?`, `System.Object`, or `System.Object?`
  const p0Match = /^(?:System\.)?[Oo]bject\??\s+[@A-Za-z_]\w*$/.test(p0);
  if (!p0Match) return false;

  // Second param type should end with `EventArgs` (e.g. `EventArgs`, `MouseEventArgs`, `FormClosingEventArgs`)
  const p1Tokens = p1.split(/\s+/);
  if (p1Tokens.length < 2) return false;
  const p1Type = p1Tokens.slice(0, -1).join('').replace(/\?$/, '');
  return p1Type.endsWith('EventArgs');
}

function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '<' || ch === '(' || ch === '[') depth++;
    else if (ch === '>' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0 || parts.length > 0) {
    parts.push(current);
  }
  return parts;
}

function computeExistingMethodBodyPosition(
  source: string,
  tokens: Token[],
  method: ParsedMethodSpan
): { line: number; column: number } {
  if (method.bodyOpenBraceIndex >= 0 && method.bodyCloseBraceIndex > method.bodyOpenBraceIndex) {
    const openTok = tokens[method.bodyOpenBraceIndex];
    const closeTok = tokens[method.bodyCloseBraceIndex];
    const firstBodyTok = tokens[method.bodyOpenBraceIndex + 1];

    if (firstBodyTok && method.bodyOpenBraceIndex + 1 < method.bodyCloseBraceIndex) {
      return { line: firstBodyTok.line, column: firstBodyTok.column };
    }

    // Empty body `{ ... }` -> point to line after `{` if multi-line, or right after `{`
    if (closeTok.line > openTok.line) {
      const openLineEnd = findLineEnd(source, openTok.end);
      const nextLineStart = advancePastNewline(source, openLineEnd);
      const nextLineEnd = findLineEnd(source, nextLineStart);
      const nextLineText = source.slice(nextLineStart, nextLineEnd);
      const wsLen = nextLineText.length - nextLineText.trimStart().length;
      return { line: openTok.line + 1, column: wsLen + 1 };
    }
    return { line: openTok.line, column: openTok.column + 1 };
  }

  if (method.arrowIndex >= 0) {
    const arrowTok = tokens[method.arrowIndex];
    const nextTok = tokens[method.arrowIndex + 1];
    if (nextTok) {
      return { line: nextTok.line, column: nextTok.column };
    }
    return { line: arrowTok.line, column: arrowTok.column + 2 };
  }

  return { line: method.line, column: method.column };
}

function detectNullableSetting(
  source: string,
  parsed: ParsedCodeBehindInternal,
  explicit?: boolean
): boolean {
  if (explicit !== undefined) return explicit;
  if (/#nullable\s+disable/.test(source)) return false;
  if (/#nullable\s+enable/.test(source)) return true;
  for (const m of parsed.methods) {
    if (/\bobject\?\s+/.test(m.parameters)) return true;
    if (/\bobject\s+/.test(m.parameters)) return false;
  }
  return parsed.fileScopedNamespace;
}

function detectIndentUnit(
  source: string,
  parsed: ParsedCodeBehindInternal,
  classIndent: string
): string {
  // Check indentation of first member inside class
  if (parsed.classOpenBraceIndex >= 0 && parsed.classCloseBraceIndex > parsed.classOpenBraceIndex + 1) {
    const firstMemberTok = parsed.tokens[parsed.classOpenBraceIndex + 1];
    const lineStart = findLineStart(source, firstMemberTok.start);
    const memberIndent = source.slice(lineStart, firstMemberTok.start);
    if (memberIndent.startsWith(classIndent) && memberIndent.length > classIndent.length) {
      const diff = memberIndent.slice(classIndent.length);
      if (/^[ \t]+$/.test(diff)) {
        return diff;
      }
    }
  }
  if (classIndent.includes('\t')) return '\t';
  return '    ';
}

function findLineStart(source: string, offset: number): number {
  let i = offset;
  while (i > 0 && source[i - 1] !== '\n' && source[i - 1] !== '\r') {
    i--;
  }
  return i;
}

function findLineEnd(source: string, offset: number): number {
  let i = offset;
  while (i < source.length && source[i] !== '\n' && source[i] !== '\r') {
    i++;
  }
  return i;
}

function advancePastNewline(source: string, offset: number): number {
  if (source.startsWith('\r\n', offset)) return offset + 2;
  if (source[offset] === '\n' || source[offset] === '\r') return offset + 1;
  return offset;
}

function countLines(text: string): number {
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\r') {
      lines++;
      if (text[i + 1] === '\n') i++;
    } else if (text[i] === '\n') {
      lines++;
    }
  }
  return lines;
}
