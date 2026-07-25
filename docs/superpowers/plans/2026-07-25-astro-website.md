# Astro Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Astro website for PowerTools with landing, download, and contact author pages.

**Architecture:** Create a top-level `website/` Astro project that is independent from the existing `desktop/` and `api/` projects. Use shared Astro layouts and CSS variables for consistent navigation, responsive layout, and product-specific content.

**Tech Stack:** Astro, TypeScript, static HTML/CSS, npm scripts.

## Global Constraints

- The site must position PowerTools as a modern open-source desktop toolkit for Dataverse developers.
- The first available tools must be listed as Data Migration first and FetchXML Builder second.
- Do not position the product as metadata-explorer-first.
- Do not name future tools in the first version.
- Mention that user data never leaves the machine.
- Use the GitHub URL `https://github.com/AbdallahNagy/PowerTools`.
- Use the author email `abdallahnagy773@gmail.com`.
- Keep the tone developer-friendly rather than corporate or sales-heavy.

---

### Task 1: Scaffold Astro Website

**Files:**
- Create: `website/package.json`
- Create: `website/astro.config.mjs`
- Create: `website/tsconfig.json`
- Create: `website/src/layouts/BaseLayout.astro`
- Create: `website/src/styles/global.css`

**Interfaces:**
- Produces: `BaseLayout` with `title`, `description`, and optional `currentPath` props.
- Produces: npm scripts `dev`, `build`, and `preview`.

- [x] **Step 1: Create Astro project configuration**

Create minimal Astro config, TypeScript config, package metadata, and a reusable base layout.

- [x] **Step 2: Create global styling**

Add responsive CSS for navigation, hero sections, buttons, content bands, cards, and page layouts.

- [x] **Step 3: Verify config files are syntactically valid**

Run: `npm install` from `website/`, then `npm run build`.

Expected: Astro builds static pages successfully.

### Task 2: Build Requested Pages

**Files:**
- Create: `website/src/pages/index.astro`
- Create: `website/src/pages/download.astro`
- Create: `website/src/pages/contact.astro`

**Interfaces:**
- Consumes: `BaseLayout` from `website/src/layouts/BaseLayout.astro`.
- Produces: static routes `/`, `/download`, and `/contact`.

- [x] **Step 1: Create landing page**

Add toolkit-first hero, developer-focused value points, current tools section, local security section, open-source section, and final CTAs.

- [x] **Step 2: Create download page**

Add Windows download action, GitHub releases link, requirements, install notes, and local security reminder.

- [x] **Step 3: Create contact page**

Add author email, GitHub link, and suggested contact reasons.

- [x] **Step 4: Verify pages build**

Run: `npm run build` from `website/`.

Expected: `/`, `/download/`, and `/contact/` are generated.

### Task 3: Final Verification

**Files:**
- Verify: `website/dist/`

**Interfaces:**
- Consumes: completed Astro app.
- Produces: build output suitable for static hosting.

- [x] **Step 1: Run production build**

Run: `npm run build` from `website/`.

Expected: build completes without errors.

- [x] **Step 2: Check git diff**

Run: `git status --short` and `git diff --stat`.

Expected: only the website implementation and plan files are changed.
