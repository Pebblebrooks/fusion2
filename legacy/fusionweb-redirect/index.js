/**
 * Fusion 富生 — redirect for the retired website Worker ("fusionweb").
 *
 * Deploying this replaces the old site, so every old link and bookmark lands
 * on the matching page of the new combined site:
 *
 *   fusionweb…/            → new home page (old #section anchors mapped below)
 *   fusionweb…/#faq        → /faq/        #privacy → /privacy/   #terms → /terms/
 *   fusionweb…/#playbook   → /learn/#playbook   (and other sections, see SECTION_MAP)
 *   fusionweb…/anything    → new home page (301)
 *
 * Browsers never send the #anchor to the server, so the root page answers
 * with a tiny HTML page whose script reads the anchor and forwards. Without
 * JavaScript it falls back to a plain refresh to the new home page.
 *
 * Deploy from this folder:  npx wrangler deploy
 */
const NEW_SITE = 'https://fusion.ehtan2022.workers.dev';

// Old one-page anchors → new pages
export const SECTION_MAP = {
  top: '/', welcome: '/', features: '/#product', benefits: '/#product', tools: '/#product',
  policies: '/learn/#accounts', 'slide-deck': '/learn/', playbook: '/learn/#playbook',
  safety: '/learn/#protect', faq: '/faq/', privacy: '/privacy/', terms: '/terms/',
  feedback: '/contact/',
};

const page = () => `<!doctype html>
<html lang="en-SG"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fusion 富生 has moved</title>
<link rel="canonical" href="${NEW_SITE}/">
<noscript><meta http-equiv="refresh" content="0; url=${NEW_SITE}/"></noscript>
<script>
  var map = ${JSON.stringify(SECTION_MAP)};
  var key = (location.hash || '').slice(1);
  location.replace(${JSON.stringify(NEW_SITE)} + (map[key] || '/') + location.search);
</script>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#FAFAF8;color:#1C1917;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}a{color:#0F766E}</style>
</head><body><p>Fusion 富生 has moved to <a href="${NEW_SITE}/">${NEW_SITE.replace('https://', '')}</a>.</p></body></html>`;

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(page(), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-robots-tag': 'noindex' },
      });
    }
    return Response.redirect(NEW_SITE + '/' + url.search, 301);
  },
};
