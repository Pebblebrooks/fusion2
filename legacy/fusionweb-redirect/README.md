> **ON HOLD (11 Nov 2026). Do not deploy.** Set `NEW_SITE` in `index.js` to the final address first.

# fusionweb redirect

Retires the old website at `fusionweb.ehtan2022.workers.dev` and forwards every
visit to the new site at `fusion.ehtan2022.workers.dev`.

- The home page and its old section links (`#faq`, `#privacy`, `#playbook`, …)
  go to the matching new page. The full list is `SECTION_MAP` in `index.js`.
- Any other path gets a permanent (301) redirect to the new home page.

## Deploy

Deploy **after** the new site is live, from this folder:

```bash
cd legacy/fusionweb-redirect
npx wrangler deploy
```

This overwrites the current `fusionweb` Worker, and the old pages stop being
served. To undo it, redeploy the old website from its own repository or roll back
the version in Cloudflare → Workers & Pages → fusionweb → Deployments.

If the old site is connected to GitHub for automatic builds, disconnect it in
Cloudflare first, or the next push to the old repository will put it back.
