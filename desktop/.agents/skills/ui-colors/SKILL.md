---
name: ui-colors
description: "Use when making any UI modification that involves color. Enforces consistent color usage: always use CSS variables from index.css / colors.css instead of hardcoded Tailwind arbitrary values like bg-[#hex] or text-[#hex]. If a required color is not in the palette, ask the user before adding it."
---

# UI Color Consistency

## When to Use
- Any time you write or edit Tailwind classes that reference a color
- Any time you review or refactor UI components for color consistency

## Color Palette

These are the **only** approved colors for this project, defined in `src/ui/index.css` and `src/ui/styles/colors.css`.

| CSS Variable | Value | Semantic Role |
|---|---|---|
| `--color-primary` | `#007acc` | Brand blue, interactive elements, focus rings |
| `--color-bg-dark` | `#1e1e1e` | Deepest background (panels, sidebars) |
| `--color-bg-darker` | `#252526` | Secondary background |
| `--color-bg-light` | `#2d2d2d` | Elevated surface (cards, rows) |
| `--color-text-white` | `#ffffff` | Primary text |
| `--color-text-gray` | `#cccccc` | Secondary text |
| `--color-text-dark-gray` | `#808080` | Muted / disabled text |
| `--color-border-dark` | `#1e1e1e` | Borders and dividers |
| `--color-hover-bg` | `#363636` | Hover background state |


## Rules

1. **Never** use Tailwind arbitrary color values such as `bg-[#007acc]`, `text-[#cccccc]`, `border-[#1e1e1e]`.
2. **Always** reference variables via Tailwind's arbitrary-property syntax: `bg-[var(--color-primary)]`, `text-[var(--color-text-gray)]`, etc.
3. If a needed color has no matching variable, **stop and ask the user** whether to add a new variable to `colors.css` before proceeding.
4. When adding a new variable: add it to `src/ui/styles/colors.css` under the appropriate comment group, then update this table.

## How to Apply a Color

| Intent | Correct Tailwind class |
|---|---|
| Brand / interactive blue | `bg-[var(--color-primary)]` / `text-[var(--color-primary)]` |
| Deep background | `bg-[var(--color-bg-dark)]` |
| Secondary background | `bg-[var(--color-bg-darker)]` |
| Light surface | `bg-[var(--color-bg-light)]` |
| Primary text | `text-[var(--color-text-white)]` |
| Secondary text | `text-[var(--color-text-gray)]` |
| Muted text | `text-[var(--color-text-dark-gray)]` |
| Border / divider | `border-[var(--color-border-dark)]` |
| Hover background | `hover:bg-[var(--color-hover-bg)]` |

## Adding a New Color

1. Confirm the hex value and semantic name with the user.
2. Add to `src/ui/styles/colors.css`:
   ```css
   --color-<name>: #<hex>;
   ```
3. Update the palette table in this file.
4. Use `bg-[var(--color-<name>)]` (or `text-`/`border-`) in the component.

## Example — Before / After

```tsx
// ❌ Before — hardcoded arbitrary values
<div className="bg-[#1e1e1e] text-[#cccccc] hover:bg-[#363636] border-[#007acc]">

// ✅ After — CSS variables
<div className="bg-[var(--color-bg-dark)] text-[var(--color-text-gray)] hover:bg-[var(--color-hover-bg)] border-[var(--color-primary)]">
```