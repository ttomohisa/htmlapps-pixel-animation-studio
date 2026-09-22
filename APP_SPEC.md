# Pixel Animation Studio — APP_SPEC

## 1. Product identity

- **Name:** Pixel Animation Studio
- **Japanese description:** ドット絵アニメーション
- **Repository:** `ttomohisa/htmlapps-pixel-animation-studio`
- **Slug:** `pixel-animation-studio`
- **Current stable release:** v1.0.0
- **Release artifacts:** `dist/index.html` and `dist/index.self-extract.html`

## 2. One-sentence purpose

Create small pixel-art animations frame by frame in the browser, preview motion, and eventually export PNG, animated GIF, and sprite sheets without uploading user data.

## 3. Product principles

- Keep the app intentionally smaller than a full pixel-art suite such as Piskel or Aseprite.
- Optimize for the flow: choose a small canvas → draw → duplicate frames → adjust motion → preview → export.
- Desktop and smartphone are both first-class.
- Runtime processing must remain local to the browser.
- Do not require accounts, installation, cloud storage, analytics, telemetry, or runtime CDN assets.
- Keep the normal readable standalone HTML directly usable from `file://`.

## 4. v1.0.0 scope

### Canvas

- Presets: 16×16, 32×32, 64×64, 128×128.
- Custom width and height from 1 through 128.
- Non-square canvases are valid.
- Transparent pixels are shown over a checkerboard.
- Internal canvas dimensions match sprite pixel dimensions; display enlargement uses nearest-neighbor rendering.

### Drawing

- Pencil.
- Eraser.
- Fill.
- Eyedropper.
- Rectangle Selection.
- Pencil / eraser sizes: 1, 2, 4 px.
- Pointer stroke interpolation must prevent gaps during fast mouse, pen, or touch movement.

### Navigation / view

- Integer zoom presets plus Fit.
- Pan.
- Smartphone pinch zoom / two-finger pan.
- Grid on/off.

### History

- Undo / Redo for drawing and selection edits.
- One pointer stroke counts as one history action.
- Reversible frame deletion may use the reusable `AppToast` Undo pattern.

### Frames / timing / preview

- 1–128 frames.
- Add, duplicate, delete, reorder, select.
- Each frame has a duration from 20–5000 ms, default 100 ms.
- Apply one duration to all frames.
- Live preview with Play, Pause, Restart, Loop.
- Onion Skin shows the immediately previous frame only, around 30% opacity, on/off.

### Input

- PNG only for v1.0.0.
- Single PNG can start a project when no dimension exceeds 128.
- Multiple equal-sized PNG files can become frames.
- Do not silently resize oversized or mismatched images.
- Partial failures are reported separately from successful imports.

### Output

- Current frame PNG at 1× / 2× / 4× / 8×.
- Animated GIF with frame durations, transparency, and infinite loop.
- Sprite Sheet PNG: Horizontal or Grid with configurable column count.
- Every file export provides an editable base filename before saving.

### Persistence

- IndexedDB autosave with schema versioning.
- Reload recovery.
- If IndexedDB is unavailable, editing remains usable and the data-loss risk is explained.

## 5. v1.0.0 explicit non-goals

- Layers.
- Animated WebP export.
- GIF/WebP/JPEG import.
- Sprite sheet import.
- Aseprite import.
- Project-file import/export.
- Lasso / Magic Wand.
- Line / rectangle / circle drawing tools.
- Palette editor or palette files.
- Tilemap / tile preview.
- Animation tags / clips.
- Sprite metadata JSON.
- Cloud save, accounts, collaboration, or AI generation.

## 6. v1.0.0 stable requirements

v1.0.0 freezes the first stable feature set and carries forward the v0.9.1 interaction and smartphone refinements without adding new product scope.

### Required user flow

1. Open locally or through static hosting.
2. Start from a preset/custom canvas or one or more PNG files.
3. Draw, edit frames, adjust timing, and preview motion.
4. Use Selection when a pixel region needs to be moved or reused. Leaving Selection clears the visible selection state.
5. On smartphones, use the dedicated Edit / Frames / Preview / Export dock without covering the current workspace.
6. Export PNG, Animated GIF, or Sprite Sheet output.
7. When IndexedDB is available, reload and continue the locally autosaved project.

### Stable UX requirements

- Undo / Redo has one visible control location in the editor toolbar.
- Switching from Selection to another drawing tool clears the selection overlay and selection action bar.
- Paste requires an active destination selection and must not silently paste at the canvas origin.
- Pencil and Eraser show the exact clipped 1 / 2 / 4 px affected footprint on the canvas before drawing.
- Smartphone active-project UI prioritizes the editor and uses a fixed SVG-icon dock for Edit / Frames / Preview / Export.
- The scrolling workspace reserves physical space above the fixed dock.
- Mobile tool buttons fit 320–390 px widths without horizontal page scrolling.
- Import result/error blocks retain bottom breathing room.
- Japanese labels use natural user-facing wording.

## 7. v1.0.0 responsive design

### Desktop

- Header remains aligned with the current `htmlapps-template`.
- The canvas is the largest editing area.
- Undo / Redo appears once in the canvas toolbar.
- Frames, timing, Preview, and Export remain directly reachable.
- Brush-size buttons remain numeric; the canvas itself previews the current brush footprint.
- Export keeps clear cards for Current Frame PNG, Animated GIF, and Sprite Sheet.

### Smartphone

- No horizontal page scrolling at 320 / 360 / 375 / 390 px reference widths.
- When a project is active, the landing intro is hidden and the workspace receives the vertical space.
- The main workspace scroll area ends above the fixed bottom dock.
- The fixed dock is Edit / Frames / Preview / Export with SVG icons and text labels.
- Edit uses a compact five-tool grid plus separate brush/color/settings cards.
- Selection actions appear only while an active selection exists.
- Current Frame PNG, Animated GIF, and Sprite Sheet cards stack vertically in Export.
- Long filenames remain contained within the viewport.
- One finger draws; two fingers pan / pinch zoom in Edit.

## 8. Data and privacy

- Pixel data, frame timing, editing preferences, and output filename base remain local.
- Project autosave uses IndexedDB on the same device.
- PNG, Animated GIF, and Sprite Sheet files are generated entirely in the browser.
- Data leaves the page only through an explicit user-initiated file download.
- No runtime network request.
- No external API, analytics, telemetry, fonts, images, scripts, or styles.
- CSP keeps `connect-src 'none'`.

## 9. Accessibility

- All icon buttons have accessible text or `aria-label`.
- Active tools, Grid, PNG scale, and Sprite Sheet layout use `aria-pressed`, not color alone.
- Native form labels are associated with filename and Grid column inputs.
- Keyboard focus is visible.
- Existing Undo / Redo and Selection keyboard shortcuts remain intact.
- Help / confirmation dialogs support Escape and focus restoration.
- Export status changes are surfaced through the existing toast / `aria-live` system.
- Motion respects `prefers-reduced-motion`.
- Japanese and English both fit at approximately 320 px width without page-level horizontal overflow.

## 10. Browser target

Current stable desktop and mobile Chromium, Firefox, and Safari. Direct `file://` opening is required. PNG export must work without a server or runtime network connection.

## 11. v1.0.0 acceptance criteria

- All v0.1.0 through v0.9.1 drawing, frame, timing, Preview, Onion Skin, persistence, Selection, PNG/GIF/Sprite Sheet import/export, bilingual, privacy, and template requirements continue to pass.
- 16 / 32 / 64 / 128 / Custom canvas creation works, including non-square custom sizes up to 128×128.
- Pencil / Eraser / Fill / Eyedropper / Selection work with Undo / Redo and do not corrupt another frame's history.
- Pencil and Eraser preview the exact clipped 1 / 2 / 4 px affected footprint before drawing.
- Selection clears when leaving the tool; Paste requires an active destination selection.
- Add / Duplicate / Delete / Reorder works up to 128 frames, including delete Undo.
- Per-frame timing, Apply to all, Preview, Loop, Restart, and Onion Skin work as specified.
- PNG single/multi import, Drag & Drop, dimension validation, and partial-failure reporting work without silent resize.
- Current-frame PNG 1×/2×/4×/8×, Animated GIF, Horizontal Sprite Sheet, and Grid Sprite Sheet save valid files with sanitized filenames.
- Autosave/recovery works when IndexedDB is available; storage-unavailable mode keeps editing/export usable and explains the reload risk.
- At 320 / 360 / 375 / 390 px widths there is no page-level horizontal overflow and no workspace content is covered by the bottom dock.
- Japanese and English fit without clipped navigation labels or dialogs.
- The supplied Pixel Animation Studio SVG remains the only artwork source for favicon and header icon.
- Runtime external network requests remain blocked and CSP includes `connect-src 'none'`.
- `dist/index.html` and `dist/index.self-extract.html` are generated and the self-extracting variant restores the readable HTML byte-for-byte.
- `scripts/check-repository.ps1` passes in a supported Windows PowerShell environment.

## 12. Development roadmap

### v0.1.0 — Canvas Foundation

Canvas creation, Pencil, Eraser, brush sizes, color picker / HEX, Pointer Events, stroke interpolation, responsive foundation, bilingual help.

### v0.2.0 — Editing Core

Fill, Eyedropper, Zoom/Fit/Pan, pinch zoom, Grid, Undo/Redo, recent colors, keyboard shortcuts.

### v0.3.0 — Frames

Frame model, thumbnails, add/duplicate/delete/reorder/select, max 128, dedicated smartphone Frames page.

### v0.4.0 — Timing & Preview

Frame duration, apply-to-all, Play/Pause/Restart/Loop, nearest-neighbor preview.

### v0.5.0 — Onion Skin & Persistence

Previous-frame onion skin, IndexedDB autosave, restore, schema version, storage-unavailable warning.

### v0.6.0 — Selection

Rectangle selection, move/copy/cut/paste/delete, internal clipboard, keyboard movement, Undo/Redo integration.

### v0.7.0 — PNG & Sprite Sheet Export

Current-frame scaled PNG, horizontal/grid sprite sheets, output preview, editable filename, success states.

### v0.8.0 — GIF & PNG Import

In-app GIF encoder, animated GIF output, PNG single/multi import, drag-and-drop, validation and partial-failure states.

### v0.9.0 — Release Candidate / UX

Desktop/mobile refinement, bottom-page navigation where needed, all states, accessibility, Japanese/English review, privacy/CSP/performance regression.

### v1.0.0 — First Stable Release

Full regression, README, screenshots, favicon, versioning, offline verification, both standalone variants, final release documentation.

## 13. In-app help

The upper-right help button opens bilingual guidance covering:

- choosing a canvas size,
- Pencil / Eraser / Fill / Eyedropper / Selection and brush size,
- Selection clearing and destination-required paste behavior,
- choosing a color,
- frame timing, live preview, and Onion Skin behavior,
- local-only processing and no runtime transmission,
- local autosave / restore behavior and what happens when browser storage is unavailable.

Help must be updated whenever user-facing behavior changes and remain fully scrollable on short smartphone viewports.
