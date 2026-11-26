'use strict';

const scope = self.registration.scope;
const prefix = 'valentia-epigraphica:' + scope + ':';
const release = '1.0-rc16-recap-final';
const version = prefix + release;
const index = new URL('index.html', scope).href;
const assets = new Set([
  'index.html', 'style.css', 'data.js', 'map.js', 'app.js',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'fonts/cinzel-600.woff2',
  'fonts/marcellus-regular.ttf', 'fonts/source-serif-4-regular.woff2',
  'fonts/source-serif-4-italic.woff2', 'fonts/source-serif-4-semibold.woff2',
  'photos/crates.jpg',
  'photos/eufemo.jpg',
  'photos/aquilino.jpg',
  'photos/asclepio.jpg',
  'photos/sertoria.jpg',
  'photos/antonia.jpg',
  'photos/mamea.jpg',
  'photos/probo.jpg',
  'photos/basilica.jpg',
].map(path => new URL(path, scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(version).then(cache =>
    cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' })))
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== version)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// A controller alone does not prove that the browser has retained every
// resource. Ask the active worker to verify its own versioned cache.
async function verifyAssets() {
  const cache = await caches.open(version);
  const missing = async () => {
    const results = await Promise.all([...assets].map(async url => {
      const response = await cache.match(url);
      return response && response.ok ? null : url;
    }));
    return results.filter(Boolean);
  };
  let absent = await missing();
  if (!absent.length) return true;
  // Refill only when the HTTP origin still serves this exact worker release.
  // Never fill an old cache with resources from a newer deployment.
  try {
    const response = await fetch(new URL('sw.js', scope), { cache: 'no-store' });
    const marker = "const release = '" + release + "';";
    if (!response.ok || !(await response.text()).includes(marker)) return false;
    await cache.addAll(absent.map(url => new Request(url, { cache: 'reload' })));
    absent = await missing();
  } catch {
    return false;
  }
  return absent.length === 0;
}

self.addEventListener('message', event => {
  if (event.data?.type !== 'VERIFY_OFFLINE' || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil(verifyAssets().then(complete => {
    port.postMessage({ complete });
  }).catch(() => {
    port.postMessage({ complete: false });
  }));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.href.startsWith(scope)) return;
  const isEntry = request.mode === 'navigate' &&
    (url.pathname === new URL(scope).pathname || url.pathname === new URL(index).pathname);
  const key = isEntry ? index : url.href;
  if (!assets.has(key)) return;
  event.respondWith(caches.open(version).then(cache =>
    cache.match(key).then(response => response || fetch(request))
  ));
});
