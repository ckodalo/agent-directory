import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import sharp from 'sharp';

test('built PWA has standalone identity and valid install icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  for (const icon of manifest.icons) {
    const image = await sharp(await readFile(new URL(`../dist${icon.src}`, import.meta.url))).metadata();
    assert.equal(`${image.width}x${image.height}`, icon.sizes);
    assert.equal(image.format, 'png');
  }
});

test('generated worker never caches API data or navigation responses', async () => {
  const routes = [];
  let precache;
  class NetworkOnly { constructor(options) { this.options = options; } }
  class PrecacheFallbackPlugin { constructor(options) { this.options = options; } }
  const workbox = {
    NetworkOnly, PrecacheFallbackPlugin,
    precacheAndRoute: entries => { precache = entries; },
    cleanupOutdatedCaches() {},
    registerRoute: (match, strategy) => routes.push({ match, strategy })
  };
  const define = (dependencies, callback) => callback(workbox);
  runInNewContext(await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8'), {
    define, self: { define, addEventListener() {} }
  });
  assert.ok(precache.some(entry => entry.url === 'offline.html'));
  assert.ok(!precache.some(entry => entry.url === 'index.html' || entry.url.startsWith('api/')));
  for (const path of ['/api/agents', '/api/agents/1/reviews', '/api/ads', '/api/locations']) {
    const route = routes.find(route => route.match({ url: new URL(path, 'https://example.com'), request: { mode: 'cors' } }));
    assert.ok(route.strategy instanceof NetworkOnly);
    assert.equal(route.strategy.options, undefined);
  }
  const navigation = routes.find(route => route.match({ url: new URL('https://example.com/'), request: { mode: 'navigate' } }));
  assert.ok(navigation.strategy instanceof NetworkOnly);
  assert.equal(navigation.strategy.options.plugins[0].options.fallbackURL, '/offline.html');
});
