import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
describe('least-privilege Chrome/Edge installable package', () => {
  it('declares MV3, native surfaces and a compatible browser minimum', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('116');
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(manifest.side_panel.default_path).toBe('panel.html');
    expect(manifest.options_ui.page).toBe('options.html');
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });
  it('uses temporary activeTab/scripting, no content scripts or permanent all-sites access', () => {
    expect(manifest.permissions).toEqual([
      'storage',
      'alarms',
      'sidePanel',
      'activeTab',
      'scripting',
    ]);
    expect(manifest.host_permissions).toEqual([
      'https://data-api.binance.vision/*',
      'https://api.twelvedata.com/*',
    ]);
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.content_security_policy.extension_pages).not.toContain('unsafe-eval');
    expect(manifest.content_security_policy.extension_pages).not.toContain('unsafe-inline');
  });
  it('GitHub includes a ready-to-load folder with all local scripts, styles, fonts and icons', () => {
    const root = resolve('vector-live-extension');
    expect(existsSync(join(root, 'manifest.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))).toEqual(manifest);
    for (const file of [
      manifest.action.default_popup,
      manifest.background.service_worker,
      manifest.side_panel.default_path,
      manifest.options_ui.page,
      ...(Object.values(manifest.icons) as string[]),
      'INSTALL.txt',
      'THIRD-PARTY-LICENSES.txt',
    ])
      expect(existsSync(join(root, file)), file).toBe(true);
    for (const page of ['popup.html', 'panel.html', 'options.html']) {
      const html = readFileSync(join(root, page), 'utf8');
      expect(html).not.toContain('/src/');
      expect(html).not.toContain('localhost');
      const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)];
      expect(assets.length).toBeGreaterThan(0);
      for (const asset of assets) expect(existsSync(resolve(root, asset[1])), asset[1]).toBe(true);
    }
    const scripts = [
      join(root, 'background.js'),
      ...readdirSync(join(root, 'assets'))
        .filter((f) => f.endsWith('.js'))
        .map((f) => join(root, 'assets', f)),
    ];
    for (const file of scripts) {
      const source = readFileSync(file, 'utf8');
      for (const imported of source.matchAll(/(?:from|import)\s*["'](\.\.?\/[^"']+\.js)["']/g))
        expect(existsSync(resolve(dirname(file), imported[1])), imported[1]).toBe(true);
      expect(source).not.toContain('DEMO_AS_OF');
      expect(source).not.toContain('fixture-native-only-key');
    }
    for (const file of readdirSync(join(root, 'assets')).filter((f) => f.endsWith('.css'))) {
      for (const font of readFileSync(join(root, 'assets', file), 'utf8').matchAll(
        /url\(["']?([^"')]+\.woff2)["']?\)/g,
      ))
        expect(existsSync(resolve(root, 'assets', font[1])), font[1]).toBe(true);
    }
  });
  it.skipIf(!existsSync('artifacts/vector-live-extension.zip'))(
    'ZIP contains working relative entrypoints, worker, instructions and correctly sized PNGs',
    () => {
      const files = unzipSync(readFileSync('artifacts/vector-live-extension.zip')),
        prefix = 'vector-live-extension/';
      for (const name of [
        'manifest.json',
        'background.js',
        'popup.html',
        'panel.html',
        'options.html',
        'INSTALL.txt',
      ])
        expect(files[prefix + name], name).toBeDefined();
      for (const size of [16, 32, 48, 128]) {
        const png = files[`${prefix}icons/icon${size}.png`];
        expect(Buffer.from(png).readUInt32BE(16)).toBe(size);
        expect(Buffer.from(png).readUInt32BE(20)).toBe(size);
      }
      for (const name of ['popup.html', 'panel.html', 'options.html']) {
        const html = new TextDecoder().decode(files[prefix + name]);
        for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g))
          expect(files[prefix + match[1].slice(2)], match[1]).toBeDefined();
        expect(html).not.toContain('/src/');
        expect(html).not.toContain('localhost');
      }
      for (const [name, content] of Object.entries(files)) {
        expect(name).not.toMatch(/research|market\.ts|\.map$|\.env/);
        if (name.endsWith('.js')) {
          const source = new TextDecoder().decode(content);
          expect(source).not.toContain('DEMO_AS_OF');
          expect(source).not.toContain('referencePrice');
          expect(source).not.toContain('67482.5');
        }
      }
    },
  );
});
