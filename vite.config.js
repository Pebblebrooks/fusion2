import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react-swc';
import { cloudflare } from '@cloudflare/vite-plugin';
import { resolve } from 'node:path';
import sitePartials from './tools/site-partials.js';

const r = (p) => resolve(import.meta.dirname, p);

// Website pages + the planner app are one multi-page build.
// Add a new site page here AND to public/sitemap.xml.
const pages = {
  home:     r('index.html'),
  pricing:  r('pricing/index.html'),
  checkout: r('checkout/index.html'),
  advisers: r('advisers/index.html'),
  learn:    r('learn/index.html'),
  faq:      r('faq/index.html'),
  contact:  r('contact/index.html'),
  privacy:  r('privacy/index.html'),
  terms:    r('terms/index.html'),
  notFound: r('404.html'),
  app:      r('app/index.html'),
  appClassic: r('app/classic/index.html'),
};

// Version shown in the app: package.json version + the commit being built + build date.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const commit = (() => {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA; // set by Cloudflare Workers Builds
  if (fromCi) return fromCi.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'local'; }
})();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [sitePartials(), react(), cloudflare()],
  // Pages belong to the browser ("client") build only — the Worker build has
  // its own entry (src/index.js, from wrangler.jsonc).
  environments: {
    client: { build: { rollupOptions: { input: pages } } },
  },
});
