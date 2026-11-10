import { defineConfig } from 'vite';
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

export default defineConfig({
  plugins: [sitePartials(), react(), cloudflare()],
  // Pages belong to the browser ("client") build only — the Worker build has
  // its own entry (src/index.js, from wrangler.jsonc).
  environments: {
    client: { build: { rollupOptions: { input: pages } } },
  },
});
