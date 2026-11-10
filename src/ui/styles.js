/**
 * Shared inline style objects (reference CSS custom properties for theming).
 * Extracted from App.jsx (App_170) — logic unchanged.
 */

// ── Option B: Shared style objects ────────────────────────────────────────────
// Use these for props that cannot accept a CSS className (Recharts, conditional
// spreads, or objects merged with dynamic overrides via { ...STYLES.x, color }).
// All values reference CSS custom-property variables so dark/light themes apply.
export const STYLES = {
  // ── Recharts <Tooltip> props — used on every chart ──
  chartTooltip: {
    background: "var(--tooltip-bg)",
    backdropFilter: "blur(4px)",
    border: "1px solid var(--tooltip-border)",
    borderRadius: 8,
    fontSize: 12,
    padding: "6px 8px",
  },
  chartTooltipItem:  { padding: 0, color: "var(--tooltip-text)" },
  chartTooltipLabel: { fontSize: 12, color: "var(--tooltip-label)", marginBottom: 2 },
  chartTooltipWrapper: { pointerEvents: "none" },
  chartLegend: { fontSize: 12, fontWeight: 600, color: "var(--text-main)" },

  // ── Input base — merged with dynamic border/bg overrides ──
  inputBase: {
    background: "var(--bg-input)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text-bright)",
    padding: "6px 10px",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
  },

  // ── Tag / pill base — merged with dynamic colour overrides ──
  tagPill: {
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
  },

  // ── Small card panel ──
  cardSm: {
    background: "var(--bg-panel)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 12,
  },
  card: {
    background: "var(--bg-panel)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 16,
  },

  // ── Ghost / transparent action button base ──
  btnGhost: {
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    cursor: "pointer",
    color: "var(--text-muted)",
  },
};
