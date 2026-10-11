import { existsSync, readFileSync } from 'node:fs';
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
  it('has only storage/alarms/sidePanel and two specific provider hosts', () => {
    expect(manifest.permissions).toEqual(['storage', 'alarms', 'sidePanel']);
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
