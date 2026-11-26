// C# String Literal Encoder & Decoder
// Supports standard ("..."), verbatim (@"..."), and C# 11 raw ("""...""") string literals.

/**
 * Encodes a JavaScript string into a valid C# double-quoted string literal (`"..."`).
 * Preserves readable Unicode characters (including emoji and typographic punctuation)
 * while escaping quotes, backslashes, and control/line-separator characters.
 */
export function encodeCSharpString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const code = value.charCodeAt(i);
    switch (ch) {
      case '\\':
        out += '\\\\';
        break;
      case '"':
        out += '\\"';
        break;
      case '\0':
        out += '\\0';
        break;
      case '\x07':
        out += '\\a';
        break;
      case '\b':
        out += '\\b';
        break;
      case '\f':
        out += '\\f';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      case '\t':
        out += '\\t';
        break;
      case '\v':
        out += '\\v';
        break;
      default:
        if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) {
          out += '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
        } else {
          out += ch;
        }
        break;
    }
  }
  out += '"';
  return out;
}

/**
 * Checks whether a trimmed token text looks like a C# string literal
 * (standard `"..."`, verbatim `@"..."`, or C# 11 raw `"""..."""`).
 */
export function isCSharpStringLiteral(text: string): boolean {
  const s = text.trim();
  if (s.length < 2) return false;
  if (s.startsWith('@"') && s.endsWith('"') && s.length >= 3) return true;
  if (s.startsWith('"""')) {
    let q = 0;
    while (q < s.length && s[q] === '"') q++;
    return q >= 3 && s.length >= q * 2 && s.endsWith('"'.repeat(q));
  }
  return s.startsWith('"') && s.endsWith('"');
}

/**
 * Decodes a C# string literal token into its runtime string value.
 * Supports:
 * - Standard literals (`"..."`) with `\\`, `\"`, `\'`, `\0`, `\a`, `\b`, `\f`, `\n`, `\r`, `\t`, `\v`,
 *   `\xH..HHHH`, `\uHHHH`, `\UHHHHHHHH` (surrogate-safe via `String.fromCodePoint`).
 * - Verbatim literals (`@"..."`) with `""` unescaped to `"`.
 * - C# 11 raw string literals (`"""..."""`, `""""...""""`, single-line and multi-line with indent stripping).
 */
export function decodeCSharpString(literal: string): string {
  const s = literal.trim();
  if (s.length < 2) return s;

  // Verbatim string literal: @"..."
  if (s.startsWith('@"') && s.endsWith('"') && s.length >= 3) {
    const inner = s.slice(2, -1);
    return inner.replace(/""/g, '"');
  }

  // C# 11 raw string literal: """...""" (3 or more opening/closing quotes)
  if (s.startsWith('"""')) {
    let quoteCount = 0;
    while (quoteCount < s.length && s[quoteCount] === '"') {
      quoteCount++;
    }
    const delim = '"'.repeat(quoteCount);
    if (s.length >= quoteCount * 2 && s.endsWith(delim)) {
      const inner = s.slice(quoteCount, s.length - quoteCount);
      return decodeRawStringContent(inner);
    }
  }

  // Standard string literal: "..."
  if (s.startsWith('"') && s.endsWith('"')) {
    return decodeStandardStringInner(s.slice(1, -1));
  }

  return s;
}

function decodeRawStringContent(inner: string): string {
  // Single-line raw string literal: no line breaks inside
  if (!inner.includes('\n') && !inner.includes('\r')) {
    return inner;
  }

  // Multi-line raw string literal:
  // 1. Strip optional horizontal whitespace + first newline after opening quotes
  let content = inner;
  const firstNewlineMatch = /^[ \t]*(?:\r\n|\n|\r)/.exec(content);
  if (firstNewlineMatch) {
    content = content.slice(firstNewlineMatch[0].length);
  }

  // 2. Find the last newline before the closing quotes; whitespace after it defines indentation to strip
  let lastNewlineIdx = -1;
  let lastNewlineLen = 0;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i] === '\n') {
      if (i > 0 && content[i - 1] === '\r') {
        lastNewlineIdx = i - 1;
        lastNewlineLen = 2;
      } else {
        lastNewlineIdx = i;
        lastNewlineLen = 1;
      }
      break;
    } else if (content[i] === '\r') {
      lastNewlineIdx = i;
      lastNewlineLen = 1;
      break;
    }
  }

  let indent = '';
  if (lastNewlineIdx >= 0) {
    const trailing = content.slice(lastNewlineIdx + lastNewlineLen);
    if (/^[ \t]*$/.test(trailing)) {
      indent = trailing;
      content = content.slice(0, lastNewlineIdx);
    }
  } else if (/^[ \t]*$/.test(content)) {
    // Only whitespace between opening newline and closing quotes
    return '';
  }

  if (indent.length === 0) {
    return content;
  }

  // 3. Strip `indent` prefix from each line (preserving original line endings)
  const parts = content.split(/(\r\n|\n|\r)/);
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    if (line.startsWith(indent)) {
      parts[i] = line.slice(indent.length);
    } else if (/^[ \t]*$/.test(line)) {
      parts[i] = '';
    }
  }
  return parts.join('');
}

function decodeStandardStringInner(inner: string): string {
  let out = '';
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (ch !== '\\' || i + 1 >= inner.length) {
      out += ch;
      i++;
      continue;
    }

    const esc = inner[i + 1];
    switch (esc) {
      case '\\':
        out += '\\';
        i += 2;
        break;
      case '"':
        out += '"';
        i += 2;
        break;
      case "'":
        out += "'";
        i += 2;
        break;
      case '0':
        out += '\0';
        i += 2;
        break;
      case 'a':
        out += '\x07';
        i += 2;
        break;
      case 'b':
        out += '\b';
        i += 2;
        break;
      case 'f':
        out += '\f';
        i += 2;
        break;
      case 'n':
        out += '\n';
        i += 2;
        break;
      case 'r':
        out += '\r';
        i += 2;
        break;
      case 't':
        out += '\t';
        i += 2;
        break;
      case 'v':
        out += '\v';
        i += 2;
        break;
      case 'u': {
        const hex = inner.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else {
          out += 'u';
          i += 2;
        }
        break;
      }
      case 'U': {
        const hex = inner.slice(i + 2, i + 10);
        if (/^[0-9a-fA-F]{8}$/.test(hex)) {
          const cp = parseInt(hex, 16);
          if (cp >= 0 && cp <= 0x10ffff) {
            out += String.fromCodePoint(cp);
          } else {
            out += '\uFFFD';
          }
          i += 10;
        } else {
          out += 'U';
          i += 2;
        }
        break;
      }
      case 'x': {
        // C# \x accepts 1 to 4 hex digits greedily
        let j = i + 2;
        const maxEnd = Math.min(inner.length, i + 6);
        while (j < maxEnd && isHexDigit(inner[j])) {
          j++;
        }
        if (j > i + 2) {
          out += String.fromCharCode(parseInt(inner.slice(i + 2, j), 16));
          i = j;
        } else {
          out += 'x';
          i += 2;
        }
        break;
      }
      default:
        out += esc;
        i += 2;
        break;
    }
  }
  return out;
}

function isHexDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}
