import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseResx, removeResxResource, updateResxResource } from '../../src/core';

describe('resx (parseResx, updateResxResource, removeResxResource)', () => {
  it('creates a valid .resx from scratch with ResXFileRef Bitmap and Icon entries', () => {
    const xml1 = updateResxResource(null, {
      name: 'pictureBox1.Image',
      kind: 'fileRef',
      value: 'Resources\\hero.png',
      assetType: 'Bitmap',
    });

    assert.ok(xml1.includes('<?xml version="1.0" encoding="utf-8"?>'));
    assert.ok(xml1.includes('type="System.Resources.ResXFileRef, System.Windows.Forms"'));
    assert.ok(xml1.includes('Resources\\hero.png;System.Drawing.Bitmap'));

    const xml2 = updateResxResource(xml1, {
      name: '$this.Icon',
      kind: 'fileRef',
      value: 'Resources\\app.ico',
      assetType: 'Icon',
    });

    const xml3 = updateResxResource(xml2, {
      name: 'WelcomeMessage',
      kind: 'string',
      value: 'Hello <World> & "Friends"',
    });

    const parsed = parseResx(xml3);
    assert.equal(Object.keys(parsed).length, 3);
    assert.equal(parsed['pictureBox1.Image'].kind, 'fileRef');
    assert.equal(parsed['pictureBox1.Image'].filePath, 'Resources\\hero.png');
    assert.ok(parsed['pictureBox1.Image'].clrType?.startsWith('System.Drawing.Bitmap'));

    assert.equal(parsed['$this.Icon'].kind, 'fileRef');
    assert.equal(parsed['$this.Icon'].filePath, 'Resources\\app.ico');
    assert.ok(parsed['$this.Icon'].clrType?.startsWith('System.Drawing.Icon'));

    assert.equal(parsed['WelcomeMessage'].kind, 'string');
    assert.equal(parsed['WelcomeMessage'].value, 'Hello <World> & "Friends"');
  });

  it('updates an existing entry in place and removes entries cleanly', () => {
    let xml = updateResxResource(null, {
      name: 'btn1.Image',
      kind: 'fileRef',
      value: 'img/old.png',
    });
    xml = updateResxResource(xml, {
      name: 'Title',
      kind: 'string',
      value: 'Original',
    });

    // Update existing
    xml = updateResxResource(xml, {
      name: 'btn1.Image',
      kind: 'fileRef',
      value: 'img/new.png',
    });

    const parsed1 = parseResx(xml);
    assert.equal(Object.keys(parsed1).length, 2);
    assert.equal(parsed1['btn1.Image'].filePath, 'img/new.png');

    // Remove entry
    const afterRemove = removeResxResource(xml, 'btn1.Image');
    const parsed2 = parseResx(afterRemove);
    assert.equal(Object.keys(parsed2).length, 1);
    assert.equal(parsed2['btn1.Image'], undefined);
    assert.equal(parsed2['Title'].value, 'Original');

    // Removing non-existent entry is a no-op
    assert.equal(removeResxResource(afterRemove, 'DoesNotExist'), afterRemove);
  });

  it('parses base64 binary entries and ignores XML comments', () => {
    const legacyResx = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <!-- <data name="commentedOut"><value>IgnoreMe</value></data> -->
  <data name="legacyIcon" type="System.Drawing.Icon, System.Drawing" mimetype="application/x-microsoft.net.object.bytearray.base64">
    <value>AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA</value>
  </data>
  <data name="customObj" type="MyApp.CustomData, MyApp">
    <value>payload</value>
  </data>
</root>`;

    const map = parseResx(legacyResx);
    assert.equal(map['commentedOut'], undefined);
    assert.equal(map['legacyIcon'].kind, 'base64');
    assert.equal(map['legacyIcon'].mimeType, 'application/x-microsoft.net.object.bytearray.base64');
    assert.equal(map['customObj'].kind, 'other');
    assert.equal(map['customObj'].value, 'payload');
  });

  it('throws on malformed .resx missing </root> instead of silently wiping the file', () => {
    const brokenXml = '<?xml version="1.0" encoding="utf-8"?>\n<root>\n  <data name="keep"><value>important</value></data>\n';
    assert.throws(
      () =>
        updateResxResource(brokenXml, {
          name: 'pic.Image',
          kind: 'fileRef',
          value: 'Resources/a.png',
        }),
      /Malformed \.resx XML: missing <\/root>/
    );
  });
});
