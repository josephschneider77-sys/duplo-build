# Duplo Build

A kid-friendly 3D brick builder for **Joe Schneider**. Pick a chunky brick, pick a candy color, and snap pieces onto a studded board.

Bricks use **Duplo-compatible proportions** (about 2× System / LEGO scale: 16-unit stud pitch, full brick vs plate heights, cylindrical studs). Geometry is procedural Three.js `BoxGeometry` + `CylinderGeometry` — no STL, LDraw, or official brick assets.

**Not affiliated with the LEGO Group or the DUPLO brand.** Those names appear only so you know the *scale* this toy aims for.

## Play

1. Choose a brick from the compact picker (tap to open the dropdown). The kit includes:
   - Bricks: **2×2**, **2×3**, **2×4**, **2×6**, **2×8**, **1×1**, **1×2**, **1×4**
   - Plates: **1×2**, **2×2**, **2×4**, **4×4**, **4×8**
   - Specials: **2×4 arch** (bridge), **2×3 slope** (ramp), **2×2 round** (cylinder)
   
   A **4×2** brick is just a rotated **2×4** — use Rotate / `R`.
2. Choose a color (eight bright + pastel plastics).
3. Move over the green **24×24** baseplate (~4× the original 12×12 area) — a ghost brick snaps to the stud grid. Saved builds stay in the same stud cells.
4. Click or tap to place. Stack when **at least one stud clicks** — overhangs and gaps are OK, like real Duplo. The camera eases out as a tower grows.
5. **Rotate** (button or `R`) before placing long pieces.
6. **Delete** mode: tap a brick to remove it (`X` / Delete also toggles).
7. **Undo** last place, delete, or clear (`Z` or Ctrl/Cmd+Z).
8. **Clear** twice to wipe the board.

Drag to orbit, right-drag or two-finger drag to pan, scroll or pinch to zoom. The HUD uses its own pointer events so tools do not steal canvas drags. Builds autosave in `localStorage` on this device.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (this project pins **http://127.0.0.1:43173/**).

```bash
npm run build
npm run preview
```

## GitHub Pages base path

Production builds set Vite `base` to **`/duplo-build/`** (see `vite.config.ts`). Serve the `dist/` folder at:

`https://<user>.github.io/duplo-build/`

Local `vite` / `vite preview` keep `base: '/'` so the cloud preview and a normal localhost server work at the site root. Do not change the Pages path to `/` unless the repo is a user/org `*.github.io` root site.

This repo does not deploy Pages itself.

## Stack

- Vite + TypeScript
- Three.js (procedural meshes, `OrbitControls`)
- One full-viewport page — the canvas does not scroll under the UI