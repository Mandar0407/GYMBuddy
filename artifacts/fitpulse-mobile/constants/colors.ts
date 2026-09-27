/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#27231f',
    tint: '#df7040',

    // Core surfaces
    background: '#f7f2e8',
    foreground: '#27231f',

    // Cards / elevated surfaces
    card: '#fffefa',
    cardForeground: '#27231f',

    // Primary action color (buttons, links, active states)
    primary: '#df7040',
    primaryForeground: '#fffefa',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e9f1e9',
    secondaryForeground: '#28674f',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#eae2d7',
    mutedForeground: '#827b73',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#cfe76b',
    accentForeground: '#27231f',

    // Destructive actions (delete, error states)
    destructive: '#d83e35',
    destructiveForeground: '#fffefa',

    // Borders and input outlines
    border: '#e7dfd3',
    input: '#e7dfd3',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
