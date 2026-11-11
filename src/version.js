/**
 * Release identity, filled in at build time by vite.config.js.
 *   APP_VERSION — "version" in package.json. Raise it for every release pushed to GitHub and add a CHANGELOG.md entry.
 *   APP_COMMIT  — short id of the commit that was built.
 *   APP_BUILT   — build date (UTC).
 */
/* global __APP_VERSION__, __APP_COMMIT__, __APP_BUILT__ */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'local';
export const APP_BUILT = typeof __APP_BUILT__ !== 'undefined' ? __APP_BUILT__ : '';
export const VERSION_LABEL = `v${APP_VERSION} · build ${APP_COMMIT}${APP_BUILT ? ` · ${APP_BUILT}` : ''}`;
