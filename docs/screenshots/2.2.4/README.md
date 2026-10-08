# greenTile 2.2.4 — release-note images

One image per release-note point. Screenshots were taken on the released 2.2.4 build
(`greenTile-2.2.4.zip`, tag `v2.2.4`, identical to `main` at `afbaadf`) in a headless
Cinnamon 6.6.4 VM, English UI. The two `.svg` schematics are drawn in the style of the
figures in `docs/index.html` (same palette and typography) and rendered to `.png` with
cairosvg; the `.png` is the deterministic artifact (the `.svg` names a `JBMono` font it
does not ship, so a viewer falls back to its own monospace metrics).

Pixel sizes: the two desktop screenshots (`dialog-floats.png`, `spans-desktop.png`) are
1920×1080; `single-center.png` is the same frame downscaled to 1600×900 to stay under the
size budget; `span-starters.png` and `spans-editor.png` are cropped to the panel; the two
schematics are 1200×680.

Note on the span images: the release notes give `1 : 2 : 1` (a 25 / 50 / 25 layout) as the
example for user-drawn column spans. That ratio is **not** one of the shipped starters, so
`spans-editor.png` shows the painter on a user preset with spans 1 : 2 : 1. `spans-desktop.png`
shows the shipped **Wide center** starter, which the schema defines as `spans [1,4,1]` — i.e.
**1 : 4 : 1** (a wide middle column with narrow side columns), not 25 / 50 / 25. These are two
different presets on purpose; the four shipped span starters are in `span-starters.png`.

| Point (release notes) | Image | Caption |
|---|---|---|
| Column spans in presets | `spans-editor.png` | The preset painter: three painted columns where the middle spans two grid columns (1 : 2 : 1). The contrasting merge/split handles sit on the boundaries. |
| Column spans in presets (extra) | `spans-desktop.png` | Three windows tiled by the new **Wide center** preset (1 : 4 : 1) — a wide middle column with narrow side columns. |
| Four new starter presets that use spans | `span-starters.png` | The preset panel with the four new span starters (Wide center, Wide center + stacks, Two thirds left, Two thirds right); **Wide center** is assigned. |
| A single window can be centered | `single-center.png` | A single window centred by *Center the window* (about 62 % of the width and 90 % of the height); whole monitor visible. |
| Window order survives a restart / monitor change (X11) | `order-kept.svg` / `order-kept.png` | Four windows keep their left-to-right order after a Cinnamon restart or a monitor change. X11 only — on Wayland the order is not restored. |
| A preset card click is binding | `binding-click.svg` / `binding-click.png` | Clicking a card clears the sizes you dragged and applies the preset's own layout. |
| Dialogs are never tiled | `dialog-floats.png` | The greenTile settings dialog floats over the tiled windows (it is a default entry in the *Never tile* list). |
