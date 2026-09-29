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
    text: '#232824',
    tint: '#42715d',

    // Core surfaces
    background: '#f5f2e9',
    foreground: '#232824',

    // Cards / elevated surfaces
    card: '#fffdf8',
    cardForeground: '#232824',

    // Primary action color (buttons, links, active states)
    primary: '#42715d',
    primaryForeground: '#fffdf8',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e7eee5',
    secondaryForeground: '#305747',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#ebe8df',
    mutedForeground: '#696d66',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#b6d1a7',
    accentForeground: '#232824',

    // Destructive actions (delete, error states)
    destructive: '#d83e35',
    destructiveForeground: '#fffefa',

    // Borders and input outlines
    border: '#deded4',
    input: '#deded4',
  },
  dark: {
    text: '#f5f2e9',
    tint: '#b6d1a7',
    background: '#1b2420',
    foreground: '#f5f2e9',
    card: '#26312b',
    cardForeground: '#f5f2e9',
    primary: '#b6d1a7',
    primaryForeground: '#1b2420',
    secondary: '#34463a',
    secondaryForeground: '#e0e9dc',
    muted: '#303d35',
    mutedForeground: '#adbcb0',
    accent: '#b6d1a7',
    accentForeground: '#1b2420',
    destructive: '#ef817d',
    destructiveForeground: '#1b2420',
    border: '#405047',
    input: '#405047',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
