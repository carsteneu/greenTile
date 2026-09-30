# greenTile

Window tiling for Cinnamon: presets per monitor and workspace, an auto mode, snap-on-release, draggable borders and keyboard swapping. A fork of gTile, rebuilt for Cinnamon 6.6 and newer on X11.

## Features

- **Presets per monitor and workspace** — rules by window count, e.g. "3 windows = 2 columns", "6 = 2·2·2". Assigned presets reapply when the window count changes.
- **Auto mode** (`Super+Ctrl+A`) — new, closed, minimized and restored windows retile after 300 ms; windows you drop are snapped into their slot.
- **Preset panel** (`Super+Ctrl+P`) — apply presets with one click, set the gap between windows (0–48 px), switch auto mode, all on the monitor of the focused window.
- **Preset editor** — paint up to 6 columns × 4 rows, name it, and the preset retiles immediately if it is in use. Delete presets you no longer want.
- **Moving borders** — drag a border or use `Super+Alt+Arrow` for finer control; neighbours follow, and border positions are remembered per window count.
- **Splitting by drag** — drop a window at the edge zone of a tiled window to stack it, add a column or a row; a preview shows where it lands.
- **Swapping** — `Super+Ctrl+Arrow` swaps the focused window with its neighbour, across monitors and even across workspaces.
- **Focus navigation** — `Super+Arrow` moves the focus, with a short border flash so you can see where it went.
- **Never tile** — a settings list by window class, title or app id (covers flatpaks); `Super+G` floats a single window temporarily.
- **Theming** — light/dark/follow-system panel theme, accent and state colors (follow the Cinnamon theme or custom), animated tiling.

## Hotkeys

| Key | Action |
|---|---|
| `Super+Ctrl+A` / `D` | Auto mode on / off for this monitor and workspace |
| `Super+Ctrl+P` | Open or close the preset panel |
| `Super+Ctrl+3` / `6` | Tile all windows into 3 / 6 equal columns |
| `Super+Ctrl+←/→/↑/↓` | Swap the focused window with its neighbour |
| `Super+←/→/↑/↓` | Move the keyboard focus (auto mode; native edge tiling elsewhere) |
| `Super+Alt+←/→/↓/↑` | Make the focused window narrower / wider / taller / shorter |
| `Super+G` | Float the focused window until pressed again |

All hotkeys can be changed on the **Hotkeys** page of the settings.

## Notes

- Monitors are recognised by vendor, product and serial — presets and settings survive replugging and rearranging displays.
- If **gTile** is still installed, disable it: both extensions claim the same keys.
- greenTile is self-contained: no configuration outside the standard xlet settings, no runtime downloads.

## Source and license

Source, issue tracker and releases: [github.com/carsteneu/greenTile](https://github.com/carsteneu/greenTile)

GNU General Public License, version 3, like gTile. Original code by vibou and shuairan (gTile), modifications and additions © 2026 carsten_eu.
