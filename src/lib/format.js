/**
 * Formatting helpers.
 * Extracted from App.jsx (App_170) — logic unchanged.
 */

// ── Pure utility functions — hoisted to module level (R7, R8) ──────────────
// Defined outside App() so they are stable references — not re-created on
// every render. Both are pure with no component state dependency.
export const formatCurrency = val => "$" + Math.round(Number(val) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
