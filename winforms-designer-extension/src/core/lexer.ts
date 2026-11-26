// Full C# Lexer & Balanced Statement Splitter for WinForms Designer & Code-Behind Files

export type TokenKind =
  | 'identifier'
  | 'keyword'
  | 'string'
  | 'char'
  | 'number'
  | 'operator'
  | 'punctuation'
  | 'preprocessor'
  | 'eof';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface StatementSlice {
  tokens: Token[];
  text: string;
  start: number;
  end: number;
  line: number;
}

const CSHARP_KEYWORDS = new Set<string>([
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
  // Contextual keywords common in WinForms files
  'partial',
  'var',
  'async',
  'await',
  'global',
  'record',
  'required',
  'file',
]);

const MULTI_CHAR_OPERATORS = [
  '??=',
  '<<=',
  '>>=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '=>',
  '::',
  '++',
  '--',
  '<<',
  '>>',
  '?.',
];

const SINGLE_CHAR_OPERATORS = new Set<string>([
  '+',
  '-',
  '*',
  '/',
  '%',
  '&',
  '|',
  '^',
  '!',
  '~',
  '=',
  '<',
  '>',
  '?',
]);

const PUNCTUATION = new Set<string>(['(', ')', '{', '}', '[', ']', ';', ',', '.', ':']);

/**
 * Tokenizes C# source code into a flat array of tokens ending with an `'eof'` token.
 * Properly handles single-line (`//`) and multi-line (`/* ... *\/`) comments,
 * preprocessor directives (`#region`, `#endregion`, etc.), standard strings, verbatim strings,
 * C# 11 raw strings, interpolated strings, char literals, verbatim identifiers, numbers, and operators.
 */
export function tokenizeCSharp(source: string): Token[] {
  const tokens: Token[] = [];
  const len = source.length;
  let pos = 0;
  let line = 1;
  let col = 1;
  let atLineStart = true;

  const advance = (count = 1): void => {
    for (let i = 0; i < count && pos < len; i++) {
      const ch = source[pos];
      if (ch === '\r') {
        pos++;
        if (pos < len && source[pos] === '\n') {
          pos++;
        }
        line++;
        col = 1;
        atLineStart = true;
      } else if (ch === '\n') {
        pos++;
        line++;
        col = 1;
        atLineStart = true;
      } else {
        pos++;
        col++;
      }
    }
  };

  while (pos < len) {
    const ch = source[pos];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\f' || ch === '\v' || ch === '\uFEFF') {
      advance();
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      advance();
      continue;
    }

    // Single-line comment //
    if (ch === '/' && pos + 1 < len && source[pos + 1] === '/') {
      while (pos < len && source[pos] !== '\r' && source[pos] !== '\n') {
        advance();
      }
      continue;
    }

    // Multi-line comment /* ... */
    if (ch === '/' && pos + 1 < len && source[pos + 1] === '*') {
      advance(2);
      while (pos < len) {
        if (source[pos] === '*' && pos + 1 < len && source[pos + 1] === '/') {
          advance(2);
          break;
        }
        advance();
      }
      continue;
    }

    // Preprocessor directive (#region, #endregion, #if, #pragma, #nullable, etc.)
    if (ch === '#' && atLineStart) {
      const start = pos;
      const startLine = line;
      const startCol = col;
      while (pos < len && source[pos] !== '\r' && source[pos] !== '\n') {
        advance();
      }
      tokens.push({
        kind: 'preprocessor',
        text: source.slice(start, pos),
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    atLineStart = false;
    const start = pos;
    const startLine = line;
    const startCol = col;

    // Verbatim string @"..." or interpolated verbatim $@"..." / @$"..."
    if (
      (ch === '@' && pos + 1 < len && source[pos + 1] === '"') ||
      (ch === '$' && pos + 2 < len && source[pos + 1] === '@' && source[pos + 2] === '"') ||
      (ch === '@' && pos + 2 < len && source[pos + 1] === '$' && source[pos + 2] === '"')
    ) {
      const prefixLen = ch === '@' && source[pos + 1] === '"' ? 2 : 3;
      advance(prefixLen);
      while (pos < len) {
        if (source[pos] === '"') {
          if (pos + 1 < len && source[pos + 1] === '"') {
            advance(2);
            continue;
          }
          advance();
          break;
        }
        advance();
      }
      tokens.push({
        kind: 'string',
        text: source.slice(start, pos),
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Interpolated string $"..." or raw interpolated $$"""..."""
    if (ch === '$' && pos + 1 < len && (source[pos + 1] === '"' || source[pos + 1] === '$')) {
      let dollarCount = 0;
      while (pos + dollarCount < len && source[pos + dollarCount] === '$') {
        dollarCount++;
      }
      if (pos + dollarCount < len && source[pos + dollarCount] === '"') {
        advance(dollarCount);
        // Check if raw interpolated string (3+ quotes)
        let quoteCount = 0;
        while (pos + quoteCount < len && source[pos + quoteCount] === '"') {
          quoteCount++;
        }
        if (quoteCount >= 3) {
          advance(quoteCount);
          scanRawStringEnd(source, quoteCount, () => pos, () => len, advance);
        } else {
          advance(); // opening "
          scanInterpolatedStringEnd(source, () => pos, () => len, advance);
        }
        tokens.push({
          kind: 'string',
          text: source.slice(start, pos),
          start,
          end: pos,
          line: startLine,
          column: startCol,
        });
        continue;
      }
    }

    // C# 11 raw string literal """...""" or standard string literal "..."
    if (ch === '"') {
      let quoteCount = 0;
      while (pos + quoteCount < len && source[pos + quoteCount] === '"') {
        quoteCount++;
      }
      if (quoteCount >= 3) {
        advance(quoteCount);
        scanRawStringEnd(source, quoteCount, () => pos, () => len, advance);
      } else {
        advance(); // opening "
        while (pos < len) {
          if (source[pos] === '\\') {
            advance(pos + 1 < len ? 2 : 1);
            continue;
          }
          if (source[pos] === '"') {
            advance();
            break;
          }
          if (source[pos] === '\r' || source[pos] === '\n') {
            // Unterminated standard string literal; stop at newline
            break;
          }
          advance();
        }
      }
      tokens.push({
        kind: 'string',
        text: source.slice(start, pos),
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Char literal '...'
    if (ch === "'") {
      advance();
      while (pos < len) {
        if (source[pos] === '\\') {
          advance(pos + 1 < len ? 2 : 1);
          continue;
        }
        if (source[pos] === "'") {
          advance();
          break;
        }
        if (source[pos] === '\r' || source[pos] === '\n') {
          break;
        }
        advance();
      }
      tokens.push({
        kind: 'char',
        text: source.slice(start, pos),
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Verbatim identifier @identifier
    if (ch === '@' && pos + 1 < len && isIdentStart(source[pos + 1])) {
      advance(2);
      while (pos < len && isIdentPart(source[pos])) {
        advance();
      }
      tokens.push({
        kind: 'identifier',
        text: source.slice(start, pos),
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Identifier or keyword
    if (isIdentStart(ch)) {
      advance();
      while (pos < len && isIdentPart(source[pos])) {
        advance();
      }
      const text = source.slice(start, pos);
      tokens.push({
        kind: CSHARP_KEYWORDS.has(text) ? 'keyword' : 'identifier',
        text,
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Number literal (integer, hex, binary, float/double/decimal)
    if (isDigit(ch) || (ch === '.' && pos + 1 < len && isDigit(source[pos + 1]))) {
      let isHexOrBinary = false;
      if (ch === '0' && pos + 1 < len && (source[pos + 1] === 'x' || source[pos + 1] === 'X')) {
        isHexOrBinary = true;
        advance(2);
        while (pos < len && (isHexDigit(source[pos]) || source[pos] === '_')) {
          advance();
        }
      } else if (
        ch === '0' &&
        pos + 1 < len &&
        (source[pos + 1] === 'b' || source[pos + 1] === 'B')
      ) {
        isHexOrBinary = true;
        advance(2);
        while (pos < len && (source[pos] === '0' || source[pos] === '1' || source[pos] === '_')) {
          advance();
        }
      } else {
        while (pos < len && (isDigit(source[pos]) || source[pos] === '_')) {
          advance();
        }
        if (pos < len && source[pos] === '.' && pos + 1 < len && isDigit(source[pos + 1])) {
          advance();
          while (pos < len && (isDigit(source[pos]) || source[pos] === '_')) {
            advance();
          }
        }
        if (pos < len && (source[pos] === 'e' || source[pos] === 'E')) {
          const nextIdx = pos + 1;
          const afterSign =
            nextIdx < len && (source[nextIdx] === '+' || source[nextIdx] === '-')
              ? nextIdx + 1
              : nextIdx;
          if (afterSign < len && isDigit(source[afterSign])) {
            advance(afterSign - pos);
            while (pos < len && (isDigit(source[pos]) || source[pos] === '_')) {
              advance();
            }
          }
        }
      }
      // Numeric type suffix: only u/U/l/L on hex/binary; f/F/d/D/m/M/u/U/l/L on decimal
      const suffixRe = isHexOrBinary ? /[uUlL]/ : /[fFdDmMuUlL]/;
      while (pos < len && suffixRe.test(source[pos])) {
        advance();
      }
      tokens.push({
        kind: 'number',
        text: source.slice(start, pos),
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Multi-character operators
    let matchedMultiOp: string | undefined;
    for (const op of MULTI_CHAR_OPERATORS) {
      if (source.startsWith(op, pos)) {
        matchedMultiOp = op;
        break;
      }
    }
    if (matchedMultiOp) {
      advance(matchedMultiOp.length);
      tokens.push({
        kind: 'operator',
        text: matchedMultiOp,
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Punctuation
    if (PUNCTUATION.has(ch)) {
      advance();
      tokens.push({
        kind: 'punctuation',
        text: ch,
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Single-character operator
    if (SINGLE_CHAR_OPERATORS.has(ch)) {
      advance();
      tokens.push({
        kind: 'operator',
        text: ch,
        start,
        end: pos,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Any unrecognized character: emit as operator/punctuation fallback so we never loop infinitely
    advance();
    tokens.push({
      kind: 'punctuation',
      text: ch,
      start,
      end: pos,
      line: startLine,
      column: startCol,
    });
  }

  tokens.push({
    kind: 'eof',
    text: '',
    start: len,
    end: len,
    line,
    column: col,
  });

  return tokens;
}

function scanRawStringEnd(
  source: string,
  quoteCount: number,
  getPos: () => number,
  getLen: () => number,
  advance: (n?: number) => void
): void {
  const len = getLen();
  while (getPos() < len) {
    if (source[getPos()] === '"') {
      let run = 0;
      const p = getPos();
      while (p + run < len && source[p + run] === '"') {
        run++;
      }
      advance(run);
      if (run >= quoteCount) {
        return;
      }
    } else {
      advance();
    }
  }
}

function scanInterpolatedStringEnd(
  source: string,
  getPos: () => number,
  getLen: () => number,
  advance: (n?: number) => void
): void {
  const len = getLen();
  let braceDepth = 0;
  while (getPos() < len) {
    const ch = source[getPos()];
    if (braceDepth === 0) {
      if (ch === '\\') {
        advance(getPos() + 1 < len ? 2 : 1);
        continue;
      }
      if (ch === '{') {
        if (getPos() + 1 < len && source[getPos() + 1] === '{') {
          advance(2);
          continue;
        }
        braceDepth++;
        advance();
        continue;
      }
      if (ch === '"') {
        advance();
        return;
      }
      if (ch === '\r' || ch === '\n') {
        return;
      }
      advance();
    } else {
      if (ch === '"') {
        // Nested string inside interpolation hole
        advance();
        while (getPos() < len) {
          if (source[getPos()] === '\\') {
            advance(getPos() + 1 < len ? 2 : 1);
            continue;
          }
          if (source[getPos()] === '"') {
            advance();
            break;
          }
          advance();
        }
        continue;
      }
      if (ch === '{') {
        braceDepth++;
        advance();
      } else if (ch === '}') {
        braceDepth--;
        advance();
      } else {
        advance();
      }
    }
  }
}

function isIdentStart(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 0x80;
}

function isIdentPart(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    (c >= 48 && c <= 57) ||
    c === 95 ||
    c >= 0x80
  );
}

function isDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 48 && c <= 57;
}

function isHexDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

/**
 * Given the index of an opening `{` token, returns the index of its matching `}` token,
 * or -1 if unmatched.
 */
export function findMatchingBrace(tokens: Token[], openBraceIndex: number): number {
  if (openBraceIndex < 0 || openBraceIndex >= tokens.length || tokens[openBraceIndex].text !== '{') {
    return -1;
  }
  let depth = 0;
  for (let i = openBraceIndex; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'punctuation') {
      if (t.text === '{') {
        depth++;
      } else if (t.text === '}') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }
  }
  return -1;
}

/**
 * Given the index of an opening `(` or `[` token, returns the index of its matching closing token,
 * or -1 if unmatched.
 */
export function findMatchingDelimiter(
  tokens: Token[],
  openIndex: number,
  openChar: '(' | '[' | '{',
  closeChar: ')' | ']' | '}'
): number {
  if (openIndex < 0 || openIndex >= tokens.length || tokens[openIndex].text !== openChar) {
    return -1;
  }
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'punctuation') {
      if (t.text === openChar) depth++;
      else if (t.text === closeChar) {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * Splits a token slice (typically the body inside `InitializeComponent() { ... }`)
 * into balanced C# statements separated by top-level `;` tokens.
 * Respects `()`, `{}`, `[]` nesting, comments, strings, and skips preprocessor lines.
 */
export function splitStatements(
  tokens: Token[],
  source: string,
  startIndex = 0,
  endIndex = tokens.length
): StatementSlice[] {
  const statements: StatementSlice[] = [];
  let current: Token[] = [];
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = startIndex; i < endIndex; i++) {
    const tok = tokens[i];
    if (tok.kind === 'eof') break;
    if (tok.kind === 'preprocessor') continue;

    if (tok.kind === 'punctuation') {
      if (tok.text === '(') parenDepth++;
      else if (tok.text === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (tok.text === '{') braceDepth++;
      else if (tok.text === '}') braceDepth = Math.max(0, braceDepth - 1);
      else if (tok.text === '[') bracketDepth++;
      else if (tok.text === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    }

    current.push(tok);

    if (
      tok.kind === 'punctuation' &&
      tok.text === ';' &&
      parenDepth === 0 &&
      braceDepth === 0 &&
      bracketDepth === 0
    ) {
      const first = current[0];
      const last = current[current.length - 1];
      statements.push({
        tokens: current,
        text: source.slice(first.start, last.end),
        start: first.start,
        end: last.end,
        line: first.line,
      });
      current = [];
    }
  }

  // If trailing tokens remain (e.g., malformed missing semicolon), include them so parser can diagnose
  if (current.length > 0) {
    const first = current[0];
    const last = current[current.length - 1];
    statements.push({
      tokens: current,
      text: source.slice(first.start, last.end),
      start: first.start,
      end: last.end,
      line: first.line,
    });
  }

  return statements;
}
