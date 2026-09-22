# Offline Verification — Pixel Animation Studio

## v1.0.0 readable build

1. Run `build-standalone.bat` on Windows.
2. Open `dist/index.html` directly with `file://`.
3. Open browser developer tools, clear Network and Console, enable offline mode, and reload.
4. Confirm the supplied Pixel Animation Studio artwork appears identically as the browser favicon and upper-left app icon.
5. Confirm the header follows the current htmlapps-template layout and shows the app-specific subtitle `ドット絵アニメ・PNG読み込み・GIF書き出し` (or its English equivalent).
6. Recheck Pencil / Eraser / Fill / Eyedropper / Selection, Undo / Redo, Zoom / Fit / Pan / Pinch Zoom, Grid, Recent Colors, frames, timing, Preview, Onion Skin, autosave/recovery, and Japanese / English switching. Confirm Undo / Redo appears only once in the editor toolbar.
7. From the setup screen, import one 32×32 PNG and confirm it starts a 32×32 project. Then import multiple matching 32×32 PNG files and confirm they become frames in selected order.
8. In one multi-file selection include a 64×64 PNG, an oversized PNG, and a non-PNG file. Confirm valid 32×32 PNG files are added while failures are listed separately with reasons.
9. Repeat PNG import through Drag & Drop and confirm the same validation behavior.
10. Create or keep at least 3 frames and open **Export**.
11. Save the current frame at 1× / 2× / 4× / 8× and confirm 32×32 / 64×64 / 128×128 / 256×256 PNG output, transparent background, and nearest-neighbor pixels.
12. Change the filename base and confirm the displayed filename and downloaded filename both change. Verify invalid path characters are sanitized.
13. Export an Animated GIF and confirm the GIF dimensions, frame count, frame delays, transparency, and infinite loop in an independent image viewer.
14. Export a Horizontal Sprite Sheet and confirm its dimensions are `frameWidth × frameCount` by `frameHeight`.
15. Switch to Grid, set 2 columns, and confirm rows are calculated automatically and the preview dimensions match the saved PNG.
16. Reorder frames and confirm Sprite Sheet order follows the frame strip.
17. Wait for autosave, reload, choose **Continue**, and confirm the output filename base is restored along with the existing project state.
18. At 320, 360, 375, and 390 CSS px widths, confirm there is no page-level horizontal scroll, the editor has side/bottom breathing room, and the fixed **Edit / Frames / Preview / Export** dock does not cover the scrollable workspace.
19. On smartphone, confirm the dock has SVG icons, all five drawing tools fit without horizontal scrolling, and a very long filename does not widen the page or hide save controls.
20. Create a Selection, then switch to another tool and confirm the selection overlay/actions disappear. Copy pixels, clear the selection, and confirm Paste is disabled until a new destination selection exists. Move the pointer over the canvas with Pencil and Eraser at 1/2/4 px and confirm the exact affected footprint is previewed and clipped correctly at canvas edges.
21. Test a context where IndexedDB is blocked or unavailable. Confirm editing and export still work while the visible storage warning explains the reload risk.
22. Confirm no external runtime request is made and the Console has no application error.
23. Confirm CSP still contains `connect-src 'none'`.

For GitHub Pages, one initial request downloads the HTML. Clear Network after load, enable offline mode, then repeat the same checks.

## Self-extracting variant

1. Open `dist/index.self-extract.html` directly.
2. Confirm the loader uses the same embedded favicon as `dist/index.html`.
3. Confirm the loader disappears and Pixel Animation Studio starts normally.
4. Repeat the core drawing, Selection, Preview, Export, language, and smartphone checks above.
5. Confirm PNG import plus PNG, GIF, and Sprite Sheet downloads work after self-extraction without a network request.
6. Confirm the Console contains no decompression or CSP errors.
7. Run `scripts/verify-self-extract.ps1`; it must enforce the ASCII-only loader and byte-for-byte restoration of `dist/index.html`.
