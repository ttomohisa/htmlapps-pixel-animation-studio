# Changelog

All notable changes to Pixel Animation Studio will be documented in this file.

## [1.0.0] - 2026-09-22

### Changed

- Promoted Pixel Animation Studio to the first stable release without expanding the frozen v1.0 feature scope.
- Reworked `README.md` and `README.ja.md` to match the established Browser Kitty repository format used by PDF Organizer, including demo, usage, build, privacy, limitations, and dependency sections.
- Updated in-app version/help labels, APP_SPEC, offline verification, third-party notices, screenshots, and generated standalone artifacts for v1.0.0.

### Verified

- Drawing, brush-footprint preview, Selection, frame management, timing, Preview, Onion Skin, autosave/recovery, PNG import, PNG/GIF/Sprite Sheet export, Japanese/English, and smartphone layout.
- Runtime network blocking, favicon/header icon consistency, standalone placeholder replacement, and self-extracting byte-for-byte restoration.

## [0.9.1] - 2026-09-22

### Changed

- Replaced the brush-size button hover color swatch with an on-canvas brush footprint preview.
- Pencil preview uses the current drawing color and matches the actual 1 / 2 / 4 px affected area.
- Eraser preview shows the exact area that will be cleared.
- Brush footprint preview is clipped at canvas edges and hidden while panning or using non-brush tools.

## [0.9.0] - 2026-09-22

### Changed

- Removed the duplicate History Undo / Redo controls and kept the canvas-toolbar controls as the single visible history location.
- Switching away from Selection now clears the visible selection overlay and action bar.
- Paste now requires an active destination selection instead of silently pasting at the canvas origin.
- Brush-size controls show the current drawing color on hover/focus.
- Reworked the smartphone active-project layout into an app-like scroll area with a fixed SVG-icon workspace dock that does not cover content.
- Compacted the smartphone drawing tools into a five-tool row and improved card spacing, project status, and import-result breathing room.
- Japanese drawing-tool labels now use natural user-facing wording.

### Verified

- Selection clear-on-tool-switch, Paste gating, brush-color hover, single Undo / Redo control location, and mobile layout behavior.
- 320–390 px smartphone widths without page-level horizontal overflow or workspace-dock overlap.
- Existing PNG import, GIF export, Sprite Sheet, autosave, CSP, favicon, and standalone build constraints remain unchanged.

## [0.8.0] - 2026-09-22

### Added

- PNG import from a single file or multiple matching-size files.
- File picker and Drag & Drop import with dimension, format, decode, and frame-limit validation.
- Partial import results that separate successfully added frames from rejected files.
- Animated GIF export using all frame delays, transparent pixels, and infinite looping.
- GIF encoding progress and palette reduction for frames that exceed GIF color limits.

### Changed

- Export now covers PNG, Animated GIF, and Sprite Sheet output under one editable filename base.
- Header metadata, help, APP_SPEC, README files, and offline verification now describe PNG import and GIF export.
- v0.8.0 keeps zero third-party runtime dependencies; GIF encoding is implemented in the standalone app.

## [0.7.0] - 2026-09-22

### Added

- Current-frame PNG export at 1× / 2× / 4× / 8× with transparency and nearest-neighbor scaling.
- Horizontal and Grid sprite-sheet PNG export for all frames.
- Configurable Grid column count with output-size, frame-size, row, and column preview.
- Editable and sanitized output filename shared by PNG and sprite-sheet exports.
- Dedicated Export workspace on smartphones.

### Changed

- Header metadata now highlights pixel animation, frame editing, and PNG export.
- Autosave also remembers the output filename base.
- Help, APP_SPEC, README files, and offline verification now cover the export workflow.

## [0.6.0] - 2026-09-22

### Added

- Rectangle selection with move, copy, cut, paste, delete, keyboard nudging, and mobile actions.
- Internal pixel clipboard for selection operations.

### Changed

- Selection edits integrate with per-frame Undo / Redo and autosave.
- Frame switching and new-project actions clear the active selection safely.

## [0.5.0] - 2026-09-22

### Added

- Previous-frame Onion Skin rendered at approximately 30% opacity with desktop and smartphone on/off controls.
- IndexedDB project autosave with `schemaVersion: 1` and a 700 ms debounce.
- Reload recovery with Continue / Start new choice showing saved canvas size and frame count.
- Autosave status for saving, saved, and unavailable storage states.
- Visible storage warning that keeps the editor usable when IndexedDB cannot be used.

### Changed

- New Canvas now confirms replacement of the current autosaved project rather than describing all work as unrecoverable.
- Header metadata now highlights pixel animation, Onion Skin, and autosave.
- Help, APP_SPEC, README files, and offline verification now describe the persistence behavior.

## [0.4.0] - 2026-09-22

### Added

- Per-frame display time from 20 to 5000 ms in 10 ms steps, with a 100 ms default.
- Apply-to-all timing control for quickly setting the same delay across every frame.
- Live animation preview with Play, Pause, Restart, and Loop.
- Dedicated Preview workspace on smartphones alongside Edit and Frames.

### Changed

- Replaced the app icon and embedded favicon with the supplied Pixel Animation Studio SVG.
- Realigned the header markup, spacing, controls, responsive behavior, and help button with the current `htmlapps-template` header.
- Replaced the developer-oriented header metadata with app-specific copy: pixel animation, frame editing, and live preview.
- Frame cards now show each frame's display time, and Duplicate carries the source frame's timing forward.

## [0.3.0] - 2026-09-22

### Added

- Multi-frame data model with a maximum of 128 frames.
- Frame thumbnails and current-frame selection.
- Add and Duplicate Frame actions.
- Delete Frame with toast-based Undo while keeping at least one frame.
- Reorder current frame earlier or later.
- Independent Undo / Redo history for each frame.
- Responsive frame strip and smartphone frame controls.

### Changed

- The editor now preserves the current frame before switching, reordering, or creating frames.
- Bilingual help, README files, APP_SPEC, and release metadata now describe the v0.3.0 Frames milestone.

## [0.2.0] - 2026-09-22

### Added

- Fill and Eyedropper tools.
- Undo / Redo history with a 100-action cap.
- Integer zoom, Fit, wheel zoom, Space + Drag pan, and two-finger pan / pinch zoom.
- Optional pixel Grid and Recent Colors.

## [0.1.0] - 2026-09-22

### Added

- Canvas presets and Custom sizes from 1 to 128 pixels per side.
- Pencil / Eraser, 1 / 2 / 4 px brushes, color picker / HEX, and Pointer Events drawing.
- Japanese / English responsive UI and Browser Kitty local-only baseline.
