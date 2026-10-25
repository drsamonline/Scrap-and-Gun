const fs = require('node:fs');
const path = require('node:path');
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
for (const [name, ok] of Object.entries({
  cacheVersioned: /CACHE_NAME\s*=\s*['"]scrap-gun-shell-v\d+['"]/.test(sw),
  preservesOtherOriginCaches: /key\.startsWith\(['"]scrap-gun-shell-['"]\)/.test(sw),
  skipsCrossOriginRequests: /new URL\(event\.request\.url\)\.origin !== self\.location\.origin/.test(sw),
  cachesProductionBundle: /game\.min\.js/.test(sw),
  loadsProductionBundle: /src=['"]game\.min\.js['"]/.test(html)
})) if (!ok) throw new Error('Service worker/app-shell check failed: ' + name);
console.log('SCRAP & GUN service-worker scope checks passed (5 checks).');
