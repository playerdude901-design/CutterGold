import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Windows icon contains valid entries for desktop, installer and high-DPI sizes', () => {
  const data = fs.readFileSync('build/icon.ico');
  assert.equal(data.readUInt16LE(0), 0);
  assert.equal(data.readUInt16LE(2), 1);
  const count = data.readUInt16LE(4);
  const dimensions = new Set<number>();
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const width = data[entry] || 256;
    const height = data[entry + 1] || 256;
    assert.equal(width, height);
    dimensions.add(width);
    const length = data.readUInt32LE(entry + 8);
    const offset = data.readUInt32LE(entry + 12);
    assert.ok(length > 0 && offset >= 6 + count * 16 && offset + length <= data.length);
  }
  for (const size of [16, 24, 32, 48, 64, 128, 256]) assert.ok(dimensions.has(size));
});

test('installer references a real ICO, embeds executable icon and creates shortcuts', () => {
  const { build } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const icon of [build.win.icon, build.nsis.installerIcon, build.nsis.uninstallerIcon, build.nsis.installerHeaderIcon]) {
    assert.ok(icon.endsWith('.ico') && fs.existsSync(icon));
  }
  assert.equal(build.win.signAndEditExecutable, true);
  assert.equal(build.nsis.createDesktopShortcut, 'always');
  assert.equal(build.nsis.createStartMenuShortcut, true);
  assert.ok(build.extraResources.some((entry: { from: string; to: string }) => entry.from === build.win.icon && entry.to === 'icon.ico'));
  assert.ok(fs.existsSync(build.nsis.include));
});
