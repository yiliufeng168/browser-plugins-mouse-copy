# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Single-file Tampermonkey userscript that enables text extraction, encoding/hashing, and AI translation directly on any webpage via keyboard+mouse interaction.

**No build system, no package manager, no tests.** The script is `main.js`; `main.meta.js` is a hand-maintained copy of just its `==UserScript==` metadata block, used as the lightweight `@updateURL` target. Changes are validated by manually pasting the updated script into Tampermonkey's editor and testing in a browser.

## Auto-Update

Tampermonkey native update via header directives: `@updateURL` → `main.meta.js` (metadata-only, cheap version poll), `@downloadURL` → `main.js` (full script). An in-script notifier (end of the IIFE) polls `main.meta.js` every 6h, compares `@version` numerically, and shows a top banner + registers a "检查更新" menu command.

`main.meta.js` is generated, not hand-edited: edit only `main.js`'s header. A `pre-commit` hook (`.githooks/pre-commit` → `scripts/gen-meta.sh`) extracts the `==UserScript==` block from `main.js` into `main.meta.js` and stages it on every commit, so the two blocks (esp. `@version`) can never drift. Run `sh scripts/gen-meta.sh` to regenerate manually.

The hook lives in the repo but `core.hooksPath` is local git config, **not** cloned — after a fresh clone run once: `git config core.hooksPath .githooks`.

## Installation / Deployment

1. Open Tampermonkey → "Create new script"
2. Paste the contents of `main.js`
3. Save — the script activates on all pages immediately

## Architecture of `main.js`

The file is a ~1140-line monolith organized in vertical sections:

| Lines | Section |
|-------|---------|
| 1–18 | Tampermonkey header (`@grant`, `@require`, `@connect` directives) |
| 19–327 | CSS injected via `GM_addStyle` — dark theme, multi-panel flex layout |
| 329–493 | DOM construction — overlay container with panels: content, translation, encode, hash, markdown |
| 500–525 | State variables — flags (`commandPressed`, `shiftPressed`, `userEditing`, `autoTranslate`, `mouseMoving`), caches, request handles |
| 528–749 | Utility functions — `extractStructuredText()`, `renderWithCVE()`, codec encoders, MD5 implementation, SHA via Web Crypto |
| 751–900 | Panel logic — `showCodecPanel()`, `translateText()`, `callDeepSeekStream()`, `getApiKey()` |
| 902–1137 | Event listeners — keyboard, mouse, button clicks |

## Key Interaction Model

- `Cmd+Shift+P`: Show overlay (or enter free-input mode if content is empty)
- Hold `Cmd+Shift` + hover: Extract text from hovered element in real-time
- Release `Cmd+Shift` while mouse idle: Dismiss overlay
- Overlay is persistent while `userEditing = true` (click to enter edit mode)

## External Dependencies

- **Turndown** (`https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js`) — HTML-to-Markdown, loaded via `@require`
- **DeepSeek API** (`https://api.deepseek.com/chat/completions`) — streaming translation; API key stored via `GM_setValue`/`GM_getValue`
- **Web Crypto API** — SHA-1/256/384/512 hashing (browser built-in)
- MD5 is implemented inline (pure JS, no external library)

## CVE Detection

`CVE_REGEX` (`/CVE-\d{4}-\d+/g`) auto-detects CVE IDs and renders them as red clickable `<span>` tags. `renderWithCVE()` handles this substitution on any text before inserting into the content panel.

## DeepSeek Streaming

`callDeepSeekStream()` uses `GM_xmlhttpRequest` for CORS bypass and parses SSE (`data: ...` lines) incrementally. The translation panel updates in real-time. Results are cached in `translationCache` (a `Map` keyed by source text) to avoid redundant API calls within the same page session.

## Auto-Translate

Toggle persisted via `GM_setValue('autoTranslate', ...)`. Only triggers for text ≤500 characters; fires 800ms after text extraction settles. Short-circuits if `userEditing` is active.

## Panel Layout

4-column flex layout (left → right):
1. **Content panel** — extracted text, edit-in-place, CVE tags
2. **Translation panel** — DeepSeek output, copy button
3. **Encode panel** — URL encode (partial/full), Base64, Hex, Unicode, ASCII escapes
4. **Hash + Markdown panel** — MD5, SHA-1/256/384/512; HTML→Markdown via Turndown

Panels 2–4 toggle visibility with their respective header buttons. Panel widths were set to 1.5× browser default in recent commits.
