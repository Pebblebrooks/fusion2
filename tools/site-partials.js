/**
 * Vite plugin: inlines shared HTML partials into the website pages.
 *   <!-- @include header -->  →  contents of site/partials/header.html
 * Runs before Vite processes the HTML, so <link>/<script> tags inside partials
 * are bundled normally. Used in dev and build. The app page (/app/) uses none.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INCLUDE_RE = /<!--\s*@include\s+([a-z0-9-]+)\s*-->/gi;

export function inlinePartials(html, dir) {
  return html.replace(INCLUDE_RE, (_, name) => {
    try {
      return readFileSync(resolve(dir, `${name}.html`), 'utf8').trim();
    } catch {
      throw new Error(`site-partials: missing partial "${name}" (expected ${dir}/${name}.html)`);
    }
  });
}

export default function sitePartials({ dir = resolve(process.cwd(), 'site/partials') } = {}) {
  return {
    name: 'fusion-site-partials',
    transformIndexHtml: { order: 'pre', handler: (html) => inlinePartials(html, dir) },
    configureServer(server) {
      // Full reload when a partial changes during `npm run dev`
      server.watcher.add(dir);
      server.watcher.on('change', (file) => { if (file.startsWith(dir)) server.ws.send({ type: 'full-reload' }); });
    },
  };
}
