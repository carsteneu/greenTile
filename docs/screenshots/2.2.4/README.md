# greenTile 2.2.4 — release-note images

One image per release-note point. Screenshots were taken on the released 2.2.4 build
(`greenTile-2.2.4.zip`, tag `v2.2.4`, identical to `main` at `afbaadf`) in a headless
Cinnamon 6.6.4 VM at 1920×1080, English UI. The two `.svg` schematics are drawn in the
style of the figures in `docs/index.html` (same palette and typography) and rendered to
`.png` with cairosvg.

Note on the two span screenshots: `spans-editor.png` shows the preset painter for a
preset whose columns span 1 : 2 : 1 — the example the release notes give for a
25 / 50 / 25 layout. `spans-desktop.png` shows the shipped **Wide center** starter, which
is defined as 1 : 4 : 1 (a wide middle column with narrow side columns), so the two
images are two different presets on purpose.

| Point (release notes) | Image | Caption |
|---|---|---|
| Column spans in presets | `spans-editor.png` | The preset painter: three painted columns where the middle spans two grid columns (1 : 2 : 1). The contrasting merge/split handles sit on the boundaries. |
| Column spans in presets (extra) | `spans-desktop.png` | Three windows tiled by the new **Wide center** preset (1 : 4 : 1) — a wide middle column with narrow side columns. |
| Four new starter presets that use spans | `span-starters.png` | The preset panel with the four new span starters (Wide center, Wide center + stacks, Two thirds left, Two thirds right); **Wide center** is assigned. |
| A single window can be centered | `single-center.png` | A single window centred by *Center the window* (about 62 % of the width and 90 % of the height); whole monitor visible. |
| Window order survives a restart / monitor change | `order-kept.svg` / `order-kept.png` | Four windows keep their left-to-right order after a Cinnamon restart or a monitor change. |
| A preset card click is binding | `binding-click.svg` / `binding-click.png` | Clicking a card clears the sizes you dragged and applies the preset's own layout. |
| Dialogs are never tiled | `dialog-floats.png` | The greenTile settings dialog floats over the tiled windows (it is a default entry in the *Never tile* list). |
