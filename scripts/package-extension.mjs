import { readFile, writeFile, readdir, mkdir, copyFile, cp, rm } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { zipSync, unzipSync } from 'fflate';

const destination = resolve('dist/extension');
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
await mkdir(join(destination, 'icons'), { recursive: true });
await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// Locally rendered PNG icons; Chrome manifest icons cannot be SVG.
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, bytes) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([length, name, bytes, checksum]);
}
function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}
function icon(size) {
  const buffer = Buffer.alloc(size * (size * 4 + 1));
  const polygons = [
    [
      [22, 31],
      [40, 31],
      [64, 92],
      [46, 92],
    ],
    [
      [73, 31],
      [96, 31],
      [66, 92],
      [46, 92],
    ],
  ];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      let r = 0,
        g = 0,
        b = 0,
        alpha = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) / size) * 128,
            py = ((y + (sy + 0.5) / 4) / size) * 128;
          const dx = Math.max(24 - px, px - 104, 0),
            dy = Math.max(24 - py, py - 104, 0);
          if (dx * dx + dy * dy > 24 * 24) continue;
          const foreground = polygons.some((p) => inPolygon(px, py, p));
          r += foreground ? 100 : 16;
          g += foreground ? 231 : 28;
          b += foreground ? 182 : 40;
          alpha++;
        }
      if (alpha) {
        buffer[offset] = Math.round(r / alpha);
        buffer[offset + 1] = Math.round(g / alpha);
        buffer[offset + 2] = Math.round(b / alpha);
        buffer[offset + 3] = Math.round((alpha / 16) * 255);
      }
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(buffer)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const size of [16, 32, 48, 128])
  await writeFile(join(destination, 'icons', `icon${size}.png`), icon(size));
let licenses = 'THIRD-PARTY NOTICES — BUNDLED RUNTIME DEPENDENCIES\n';
for (const dependency of ['react', 'react-dom', 'lucide-react', '@fontsource-variable/inter'])
  licenses +=
    `\n\n=== ${dependency} ===\n` + (await readFile(`node_modules/${dependency}/LICENSE`, 'utf8'));
await writeFile(join(destination, 'THIRD-PARTY-LICENSES.txt'), licenses);
const install = `VECTOR LIVE — CHROME / EDGE EXTENSION\n\n1. Extract this ZIP and keep the vector-live-extension folder.\n2. Open chrome://extensions or edge://extensions.\n3. Enable Developer mode, choose Load unpacked, select the folder containing manifest.json.\n4. Pin Vector from the browser extension menu. Crypto uses public Binance market data (no key).\n5. For forex, open Vector Settings and enter a Twelve Data market-data key privately. Coverage, latency and quotas depend on your plan. Never share API keys in chat.\n6. Use the expand button for the native side panel; on unsupported browsers a full extension tab is the fallback.\n\nThis package is locally loaded, not published to the Chrome Web Store. The extension uses polled market snapshots, not tick-by-tick streaming. No exchange balances or webpages are read, and no orders are placed. Technical strength is not accuracy or probability. Real-market performance has not been independently validated. No guaranteed returns or passive income. API failures never fall back to demo prices.\n\nPermissions: storage, alarms, sidePanel. Network access: data-api.binance.vision and api.twelvedata.com only. Background refresh is off by default. Credentials stay in local extension storage and are not synced or exported.\n`;
await writeFile(join(destination, 'INSTALL.txt'), install);
for (const entry of [
  manifest.action.default_popup,
  manifest.background.service_worker,
  manifest.side_panel.default_path,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
])
  await readFile(join(destination, entry));
if (manifest.description.length > 132)
  throw new Error('Manifest description exceeds Chrome limit.');
const files = {};
async function collect(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await collect(path);
    else
      files[`vector-live-extension/${relative(destination, path).replaceAll('\\', '/')}`] =
        new Uint8Array(await readFile(path));
  }
}
await collect(destination);
const zip = zipSync(files, { level: 6 });
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/vector-live-extension.zip', zip);
await copyFile('artifacts/vector-live-extension.zip', 'public/vector-live-extension.zip');
// Fail the build if the package is missing entrypoints or accidentally packages the old demo app.
const archive = unzipSync(zip);
for (const name of [
  'manifest.json',
  'background.js',
  'popup.html',
  'panel.html',
  'options.html',
  'INSTALL.txt',
  'icons/icon128.png',
])
  if (!archive[`vector-live-extension/${name}`]) throw new Error(`Missing packaged file: ${name}`);
for (const [name, contents] of Object.entries(archive)) {
  if (name.endsWith('.js')) {
    const text = new TextDecoder().decode(contents);
    if (
      text.includes('DEMO_AS_OF') ||
      text.includes('67482.5') ||
      text.includes('BTC / USD · Simulated')
    )
      throw new Error('Demo research data leaked into the live extension bundle.');
  }
}
// GitHub downloads must include a folder users can load without Node/Vite.
// Only this dedicated generated directory is replaced; source and repository stay intact.
const installable = resolve('vector-live-extension');
await rm(installable, { recursive: true, force: true });
await cp(destination, installable, { recursive: true });
console.log('Updated ready-to-load GitHub folder: vector-live-extension/');
console.log(
  `Packaged ${Object.keys(files).length} files (${Math.round(zip.length / 1024)} KiB): artifacts/vector-live-extension.zip`,
);
