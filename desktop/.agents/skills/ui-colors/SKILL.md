---
name: ui-colors
description: "Use when making any UI modification that involves color or shared controls. Power Tools has one palette, defined as role-based tokens in src/ui/styles/theme.css. Use the token utilities (bg-surface, text-fg-muted, border-line, bg-accent...) and never hardcoded colors such as bg-[#hex], text-blue-500 or rgba() literals. If no token fits, ask the user before adding one."
---

# Power Tools color palette

## Source of truth

- Tokens live in `src/ui/styles/theme.css`, inside Tailwind's `@theme`.
- Each `--color-<name>` token generates utilities: `bg-<name>`, `text-<name>`, `border-<name>`, `ring-<name>`, `accent-<name>`, `fill-<name>`, and so on.
- Tokens are named by **role**, not by value. Dark is the default theme. `[data-theme="light"]` redefines the same names, so a component that uses tokens works in both themes without changes.
- The user picks **System**, **Dark**, or **Light** in **View > Theme**. The main process (`src/electron/theme.ts`) saves the choice in `settings.json` and sets `nativeTheme.themeSource`. The renderer follows `prefers-color-scheme` and sets `data-theme` on `<html>` (`src/ui/shell/theme/colorScheme.ts`). Window background colors in `theme.ts` mirror `surface` and `canvas`; change both places together.
- Always check a change in both themes. Anything drawn with a fixed color, such as an image or an inverted icon, breaks in one of them.
- Identity: cool slate neutrals with one deep teal accent. Teal is the only brand color. Blue is not part of the palette.

## Palette

### Surfaces (back to front)

| Token | Dark | Light | Use |
|---|---|---|---|
| `canvas` | `#14171c` | `#f6f7f9` | App background, tool content area, input fields on surface |
| `surface` | `#1b1f26` | `#ffffff` | Title bar, sidebar, panels, tab strip, modals |
| `raised` | `#232832` | `#eef0f3` | Cards, secondary buttons, menus, popovers |
| `hover` | `#2a303a` | `#e4e7ec` | Hover background for rows, list items, ghost buttons |

### Lines

| Token | Dark | Light | Use |
|---|---|---|---|
| `line` | `#2e3540` | `#d6dae1` | Default borders, dividers, table grid, input borders |
| `line-strong` | `#3d4654` | `#c1c7d0` | Secondary button borders, scrollbar thumb, emphasized dividers |

### Text

| Token | Dark | Light | Use |
|---|---|---|---|
| `fg-strong` | `#f3f5f8` | `#0f1216` | Headings, selected item labels, emphasis |
| `fg` | `#d3d8df` | `#2a303a` | Body text, input values, default labels |
| `fg-muted` | `#8b94a3` | `#5f6877` | Hints, placeholders, column headers, metadata, disabled text |

### Accent (teal)

| Token | Dark | Light | Use |
|---|---|---|---|
| `accent` | `#1f8075` | `#1f7f74` | **Fill**: primary buttons, status bar, progress bars, checked checkboxes |
| `accent-hover` | `#1a6d64` | `#1a6d64` | Hover fill for anything using `accent` |
| `accent-fg` | `#ffffff` | `#ffffff` | Text and icons placed on an `accent` fill |
| `accent-text` | `#3fbfae` | `#1a6e64` | **Foreground**: links, active tab underline, selected indicators, "Custom" tags |
| `accent-soft` | `accent-text` at 14% | same | Selected row background, tag background, drop targets, text selection |
| `focus` | = `accent-text` | = `accent-text` | Focus border on inputs and the global keyboard focus ring |

`accent` and `accent-text` are different on purpose. White text on `accent` passes WCAG AA (4.8:1). `accent-text` passes AA as text on `canvas`, `surface` and `raised`. Never put body text in `accent`, and never put `accent-fg` on `accent-text`.

### Status

| Token | Dark | Light | Use |
|---|---|---|---|
| `danger` | `#f0846f` | `#c2412d` | Errors, failed rows, destructive actions |
| `danger-soft` | `danger` at 14% | same | Error banner and row background |
| `warn` | `#e0b13a` | `#9a6b00` | Warnings, risky or large operations |
| `warn-soft` | `warn` at 14% | same | Warning banner background |
| `ok` | `#5cbf7a` | `#2f7d45` | Success, connected state, completed rows |
| `ok-soft` | `ok` at 14% | same | Success banner background |

### Secondary hue and nesting

| Token | Dark | Light | Use |
|---|---|---|---|
| `alt` | `#e39a5f` | `#a3541c` | Second category color next to `accent-text`: the OR toggle in filter groups, "Application required" field tags. Not a status. |
| `alt-soft` | `alt` at 14% | same | Background behind `alt` text |
| `nest-a` | `#3a4d2a` | `#a9c79a` | Left guide line for the third level of nested filter groups |
| `nest-b` | `#4d2e52` | `#cfaed6` | Left guide line for the fourth level of nested filter groups |

Filter-group nesting cycles `line`, `accent-text/30`, `nest-a`, `nest-b`.

## Recipes

| Element | Classes |
|---|---|
| Primary button | `bg-accent hover:bg-accent-hover text-accent-fg` |
| Secondary button | `bg-raised hover:bg-hover text-fg border border-line-strong` |
| Ghost button | `text-fg hover:text-fg-strong hover:bg-hover` |
| Text input / select | `bg-canvas border border-line text-fg placeholder:text-fg-muted focus:outline-none focus:border-focus` |
| Panel | `bg-surface border-line` |
| Selected list row | `bg-accent-soft text-fg-strong` |
| Hover list row | `hover:bg-hover` |
| Active tab | `text-fg-strong border-b-2 border-accent-text` |
| Link | `text-accent-text hover:underline` |
| Tag / badge | `bg-accent-soft text-accent-text` |
| Error message | `text-danger`, banner `bg-danger-soft border-danger` |
| Native checkbox / radio | `accent-accent` |

For a translucent variant, use Tailwind's opacity modifier on a token, for example `bg-accent-text/25` or `border-accent-text/30`. In inline styles, use `color-mix(in srgb, var(--color-accent-text) 20%, transparent)`.

## Rules

1. **Never** hardcode a color: no `bg-[#hex]`, `text-[#hex]`, `border-[#hex]`, `rgba(...)` or `#hex` in inline styles, and no Tailwind palette colors such as `text-blue-500` or `border-red-700`.
2. **Always** use a token utility (`bg-surface`) or, in inline styles and CSS, `var(--color-surface)`.
3. Pick a token by **role**, not by how it looks today. Body text is `text-fg` even if `fg-strong` looks nicer in one spot.
4. If no token fits the role, **stop and ask the user** before adding one. A new token needs a dark value, a light value and a row in this file.
5. Prefer shared controls from `src/ui/shared/ui` over raw `<input>`, `<select>` and `<button>`, so colors stay in one place.
6. ESLint rejects hardcoded hex, `rgb()`/`rgba()` and Tailwind palette colors anywhere in `src/ui/**` except tests. `bg-black/50` for modal overlays is allowed.
7. To assert a tone in a test, put a `data-tone` attribute on the element and assert that, not the color class.

## Shared controls

Import from `src/ui/shared/ui`. Each one already uses the palette, so a tool only adds layout classes. Every control takes `className`, merged with `cn()` so a later class overrides an earlier one.

| Control | Use for | Notes |
|---|---|---|
| `Button` | Every button | `variant`: `primary` (one per screen, the main action), `secondary`, `ghost` (toolbars, icon buttons), `danger` (destructive). `size`: `md`, `sm`. Defaults to `type="button"`. |
| `Field` | Label, hint, and error for one control | Wires `id`, `aria-describedby`, and `aria-invalid` to the control inside it. |
| `Input`, `Textarea`, `Select` | Text fields and dropdowns | `Select` is a styled native `<select>`. Put them inside `Field` for a label. |
| `SearchInput` | Filtering a list | Has a search icon and a clear button. |
| `Checkbox` | Boolean choice | Supports `indeterminate`. |
| `Modal` | Dialogs | Radix Dialog: traps focus, closes the top dialog on Escape or outside click, hides the background from screen readers. `busy` blocks closing and shows a spinner. |
| `Tabs` | Switching views inside a tool, such as Results / FetchXML | Arrow keys move between tabs. |
| `Menu` | Actions behind one button | Keyboard navigation and type-ahead. `null` in `items` draws a separator. |
| `Tooltip` | A short hint for an icon-only button | Never the only label; icon buttons still need `aria-label`. |
| `Badge` | A state or category, such as Managed or Custom | `tone`: `neutral`, `accent`, `ok`, `warn`, `danger`. |
| `Alert` | An inline message about the current screen | `tone`: `info`, `ok`, `warn`, `danger`. Errors and warnings are announced. |
| `EmptyState` | Where content will appear | Say what goes here and the next step, for example "Select a table to see its fields." |
| `Toolbar` | The row of controls at the top of a tool or panel | Put the primary action in `end`. |
| `DataTable` | Tabular results | Sorting and row selection. |
| `ProgressBar`, `Spinner` | Long operations | `ProgressBar` exposes `role="progressbar"`. |
| `useToast` | Brief confirmation after an action, such as "Step registered." | `success`, `info`, `error`. Errors are announced. |

## Icons

- Icons come from `lucide-react`. Do not add inline `<svg>` icons or glyph characters such as `×`, `▸`, or `⠿`.
- Size them 12–16 in dense UI (`size={14}` is the default choice), and set `aria-hidden="true"`. An icon-only button needs an `aria-label`; `title` alone is not enough.
- Common choices: `X` remove or close, `Copy` duplicate, `GripVertical` drag handle, `ChevronRight`/`ChevronDown` expand, `RotateCw` refresh, `Search` search.
- Tool icons are SVG files drawn through `ToolIcon` (`src/ui/components/layout/ToolIcon.tsx`), which uses the file as a mask filled with the current text color. Any single-color SVG works; its own colors are ignored.

## Typography

- IBM Plex Sans for UI text, IBM Plex Mono for content: GUIDs, logical names in code-like contexts, FetchXML, JSON, and logs. Both are bundled (`src/ui/styles/fonts.ts`); do not load fonts from the network.
- Use `font-sans` (the default) and `font-mono`. Weights: 400 body, 500 `font-medium` for labels and buttons, 600 `font-semibold` for headings, 700 `font-bold` sparingly.
- Fixed scale, defined in `theme.css`:

| Class | Size / line height | Use |
|---|---|---|
| `text-2xs` | 11 / 16 | Badges, dense metadata |
| `text-xs` | 12 / 16 | Labels, hints, table headers, status bar |
| `text-sm` | 13 / 20 | Body text, controls, table cells (the default) |
| `text-base` | 15 / 22 | Panel headings, emphasis |
| `text-lg` | 18 / 26 | Page and dialog titles |

Larger sizes (`text-xl` and up) are only for the Welcome page.

## Legacy names (removed)

The old variable names (`--color-primary`, `--color-bg-dark`, `--color-text-gray`, `--color-border-dark`, `--color-hover-bg`, `--color-error`, `--color-warning` and the rest of `colors.css`) no longer exist. If you see one in an old brief or branch, translate it:

| Legacy | Use instead |
|---|---|
| `--color-primary` | `accent` (fill) or `accent-text` (text, border) |
| `--color-bg-dark` | `canvas` |
| `--color-bg-darker` | `surface` |
| `--color-bg-light` | `raised` |
| `--color-text-white` | `fg-strong` |
| `--color-text-gray` | `fg` |
| `--color-text-dark-gray` | `fg-muted` |
| `--color-border-dark` | `line` |
| `--color-hover-bg` | `hover` |
| `--color-error` | `danger` |
| `--color-warning` | `warn` |

Old VS Code hex values map the same way: `#1e1e1e` → `canvas`, `#252526` → `surface`, `#2d2d2d`/`#3c3c3c` (background) → `raised`, `#3c3c3c` (border) → `line`, `#2a2d2e` → `hover`, `#cccccc` → `fg`, `#858585`/`#555` → `fg-muted`, `#f48771` → `danger`, `#3c1e1e` → `danger-soft`, `#73c991` → `ok`, `#cc7832`/`#e8a87c` → `alt`.
