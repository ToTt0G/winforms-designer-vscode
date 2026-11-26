// .resx XML Resource Manager (Parser, Updater, Remover)
// Emits MSBuild-compatible ResXFileRef entries (no BinaryFormatter required on .NET 6-10).

import type { ResourceEntry, ResourceMap, ResxEntryInput } from '../shared/model';

const RESX_FILEREF_TYPE = 'System.Resources.ResXFileRef, System.Windows.Forms';
const BITMAP_CLR_TYPE =
  'System.Drawing.Bitmap, System.Drawing, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a';
const ICON_CLR_TYPE =
  'System.Drawing.Icon, System.Drawing, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a';

const EMPTY_RESX_TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="resmimetype">
    <value>text/microsoft-resx</value>
  </resheader>
  <resheader name="version">
    <value>2.0</value>
  </resheader>
  <resheader name="reader">
    <value>System.Resources.ResXResourceReader, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089</value>
  </resheader>
  <resheader name="writer">
    <value>System.Resources.ResXResourceWriter, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089</value>
  </resheader>
</root>
`;

/**
 * Parses a `.resx` XML document into a `ResourceMap`.
 * Supports `ResXFileRef` entries, string entries, and existing base64/binary entries.
 */
export function parseResx(xml: string): ResourceMap {
  const map: ResourceMap = {};
  if (!xml || !xml.trim()) {
    return map;
  }

  // Strip XML comments so commented-out <data> nodes are ignored
  const cleaned = xml.replace(/<!--[\s\S]*?-->/g, '');

  // Match <data ...>...</data> or self-closing <data .../>
  const dataRegex = /<data\b([^>]*?)(?:\/>|>([\s\S]*?)<\/data>)/gi;
  let match: RegExpExecArray | null;

  while ((match = dataRegex.exec(cleaned)) !== null) {
    const attrStr = match[1] ?? '';
    const innerXml = match[2] ?? '';
    const attrs = parseXmlAttributes(attrStr);
    const name = attrs['name'];
    if (!name) continue;

    const typeAttr = attrs['type'];
    const mimeTypeAttr = attrs['mimetype'];

    let rawValue = '';
    const valueMatch = /<value\b[^>]*>([\s\S]*?)<\/value>/i.exec(innerXml);
    if (valueMatch) {
      rawValue = extractXmlText(valueMatch[1]);
    }

    let entry: ResourceEntry;
    if (typeAttr && typeAttr.includes('ResXFileRef')) {
      const parts = rawValue.split(';');
      const filePath = (parts[0] ?? '').trim();
      const clrType = parts.length > 1 ? parts.slice(1).join(';').trim() : undefined;
      entry = {
        name,
        kind: 'fileRef',
        value: rawValue,
        filePath,
        ...(clrType ? { clrType } : {}),
      };
    } else if (mimeTypeAttr && mimeTypeAttr.length > 0) {
      entry = {
        name,
        kind: 'base64',
        value: rawValue.trim(),
        mimeType: mimeTypeAttr,
        ...(typeAttr ? { clrType: typeAttr } : {}),
      };
    } else if (!typeAttr || typeAttr.startsWith('System.String')) {
      entry = {
        name,
        kind: 'string',
        value: rawValue,
        ...(typeAttr ? { clrType: typeAttr } : {}),
      };
    } else {
      entry = {
        name,
        kind: 'other',
        value: rawValue,
        clrType: typeAttr,
      };
    }

    map[name] = entry;
  }

  return map;
}

/**
 * Adds or updates a `<data>` resource entry in a `.resx` XML document.
 * When `xml` is `null` or empty, creates a clean MSBuild-compatible `.resx` document.
 */
export function updateResxResource(xml: string | null, entry: ResxEntryInput): string {
  const eol = xml && xml.includes('\r\n') ? '\r\n' : '\n';
  const hasExistingContent = xml !== null && xml.trim().length > 0;
  if (hasExistingContent && xml!.lastIndexOf('</root>') === -1) {
    throw new Error('Malformed .resx XML: missing </root> element.');
  }
  const baseXml = hasExistingContent ? xml! : EMPTY_RESX_TEMPLATE.replace(/\n/g, eol);

  const dataBlock = buildDataElement(entry, eol);

  // Check if a <data name="..."> element with the same name already exists (outside comments)
  const existingSpan = findDataElementSpan(baseXml, entry.name);
  if (existingSpan) {
    return baseXml.slice(0, existingSpan.start) + dataBlock + baseXml.slice(existingSpan.end);
  }

  // Insert before closing </root>
  const closeRootIdx = baseXml.lastIndexOf('</root>');
  if (closeRootIdx === -1) {
    throw new Error('Malformed .resx XML: missing </root> element.');
  }

  const beforeClose = baseXml.slice(0, closeRootIdx);
  const needsLeadingNewline = beforeClose.length > 0 && !beforeClose.endsWith('\n') && !beforeClose.endsWith('\r');
  const prefix = needsLeadingNewline ? eol : '';
  return `${beforeClose}${prefix}${dataBlock}${eol}${baseXml.slice(closeRootIdx)}`;
}

/**
 * Removes a `<data name="...">` resource entry from a `.resx` XML document.
 * Returns the XML unchanged if no matching entry exists.
 */
export function removeResxResource(xml: string, name: string): string {
  if (!xml) return xml;
  const span = findDataElementSpan(xml, name);
  if (!span) return xml;

  // Also remove one trailing newline so removal leaves clean formatting
  let removeEnd = span.end;
  if (xml.startsWith('\r\n', removeEnd)) {
    removeEnd += 2;
  } else if (xml[removeEnd] === '\n' || xml[removeEnd] === '\r') {
    removeEnd += 1;
  }

  return xml.slice(0, span.start) + xml.slice(removeEnd);
}

function buildDataElement(entry: ResxEntryInput, eol: string): string {
  const escapedName = escapeXmlAttr(entry.name);
  if (entry.kind === 'fileRef') {
    const inferredIcon = entry.value.toLowerCase().endsWith('.ico');
    const assetType = entry.assetType ?? (inferredIcon ? 'Icon' : 'Bitmap');
    const clrType = assetType === 'Icon' ? ICON_CLR_TYPE : BITMAP_CLR_TYPE;
    const refValue = `${entry.value};${clrType}`;
    return [
      `  <data name="${escapedName}" type="${RESX_FILEREF_TYPE}">`,
      `    <value>${escapeXmlText(refValue)}</value>`,
      `  </data>`,
    ].join(eol);
  }

  return [
    `  <data name="${escapedName}" xml:space="preserve">`,
    `    <value>${escapeXmlText(entry.value)}</value>`,
    `  </data>`,
  ].join(eol);
}

function findDataElementSpan(xml: string, targetName: string): { start: number; end: number } | null {
  // Walk comments and <data ...> elements sequentially so we never match inside <!-- ... -->
  const tokenRegex = /<!--[\s\S]*?-->|<data\b([^>]*?)(?:\/>|>([\s\S]*?)<\/data>)/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(xml)) !== null) {
    if (match[0].startsWith('<!--')) continue;
    const attrs = parseXmlAttributes(match[1] ?? '');
    if (attrs['name'] === targetName) {
      // Extend start back to beginning of horizontal indentation on this line
      let start = match.index;
      while (start > 0 && (xml[start - 1] === ' ' || xml[start - 1] === '\t')) {
        start--;
      }
      return { start, end: match.index + match[0].length };
    }
  }

  return null;
}

function parseXmlAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(attrStr)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2] !== undefined ? m[2] : (m[3] ?? '');
    attrs[key] = unescapeXml(val);
  }
  return attrs;
}

function extractXmlText(raw: string): string {
  const cdataMatch = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  if (cdataMatch) {
    return cdataMatch[1];
  }
  return unescapeXml(raw);
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, entity: string) => {
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
          const cp = parseInt(entity.slice(2), 16);
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
        }
        if (entity.startsWith('#')) {
          const cp = parseInt(entity.slice(1), 10);
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : _m;
        }
        return _m;
    }
  });
}
