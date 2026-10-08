# <img src="docs/icon.svg" width="32" height="32" alt=""> greenTile

Window tiling for Cinnamon: presets per monitor and workspace, an auto mode, snap-on-release, draggable borders and keyboard swapping. This README explains how to use it; the complete list of features, each with a short explanation, is in [FEATURES.md](FEATURES.md).

[![greenTile in action: windows tile as they open, then a window is split into another one by drag, with a translucent preview](docs/screenshots/demo.gif)](https://youtu.be/niI0LHYb1A8)

![greenTile 2.2.1 preset selection: twelve starter cards with layout previews, edit controls and an assigned preset](docs/screenshots/preset-panel.png)

_The preset selection in 2.2.1: twelve editable starters in a responsive card grid. Example previews for six windows; click a card to apply it or ✎ to edit._

- **UUID:** `greenTile@carsteneu`
- **Requires:** Cinnamon 6.0.4 or newer; tested on Linux Mint 21.3–22.3 (Cinnamon 6.0.4–6.6) with X11. Newer Cinnamon versions are not yet verified.
- **Wayland:** works in first tests on Linux Mint 22.3 (Cinnamon 6.6): auto tiling, retiling, preset panel, settings and native Wayland windows. Swap, border resize and multi-monitor are not tested on Wayland yet. Feedback welcome.
- **Website:** [carsteneu.github.io/greenTile](https://carsteneu.github.io/greenTile/)
- **Video tour (6 min):** [YouTube](https://youtu.be/niI0LHYb1A8)
- **All features at a glance:** [FEATURES.md](FEATURES.md)

## Installation

1. Download `greenTile-<version>.zip` from [Releases](https://github.com/carsteneu/greenTile/releases) and unzip it.
2. Run `./install.sh`. It copies the extension to `~/.local/share/cinnamon/extensions/greenTile@carsteneu/` and compiles the translations (needs `msgfmt` from gettext, otherwise the UI stays English; it also needs `flock` from util-linux). Two installs of this version started at once for the same account share one lock: the first runs, the later one stops with a note instead of interleaving (an older installer that predates the lock is not covered).
3. Restart Cinnamon (`Ctrl+Alt+Esc`, or `Alt+F2` → `r`). For an update this is what activates the replaced files: a running Cinnamon keeps the extension code it loaded at startup. On Wayland that restart does not exist, log out and back in instead.
4. Enable greenTile in System Settings → Extensions.

To update an installed greenTile, run `./update.sh` from the unpacked zip instead: it downloads the latest release from GitHub and installs it (needs `unzip`, `curl` or `wget`, and `flock` from util-linux, which the bundled installer uses to serialize concurrent installs). Re-running it does nothing when the newest version is already installed; `--force` reinstalls. An update replaces the installed files, but the running Cinnamon keeps the library code it loaded at startup — enabling the extension again or reloading it re-reads only `extension.js`. Restart Cinnamon (X11) or log out and back in (Wayland) before judging the new version.

**Updating from 1.2.0 or older:** the settings of four hotkeys have new internal names — *Tile all windows into 3 columns*, *Tile all windows into 6 columns* and turning automatic tiling on and off. On the first start Cinnamon resets these four to their defaults (`Super+Ctrl+3`, `Super+Ctrl+6`, `Super+Ctrl+A`, `Super+Ctrl+D`). If you had changed them, set them again on the **Hotkeys** page. All other settings, presets and layouts are kept.

## Hotkeys

| Key | Action |
|---|---|
| `Super+Ctrl+A` | Auto mode on for this monitor and workspace, tile now (again: retile) |
| `Super+Ctrl+D` | Auto mode off for this monitor and workspace (pauses its preset) |
| `Super+Ctrl+P` | Open or close the preset panel |
| `Super+Ctrl+3` / `6` | 3 or 6 columns of equal width |
| `Super+Ctrl+←/→/↑/↓` | Swap the focused window with its neighbour |
| `Super+←/→/↑/↓` | Move the keyboard focus to the neighbouring tiled window (auto mode; native edge tiling elsewhere) |
| `Super+Alt+→/←` | Focused window wider / narrower (tap = 1 px, hold to speed up) |
| `Super+Alt+↓/↑` | Focused window taller / shorter |
| `Super+G` | Let the focused window float; press again to tile it again |

All keys can be changed on the **Hotkeys** page of the settings (Extensions manager, or ⚙ in the preset panel).

## Presets

A preset is a list of rules by window count. Each rule sets the number of columns and how many windows each column stacks. You assign a preset to a monitor and workspace.

A painted column can span several of the six painter grid columns. Painted columns always stretch over the whole monitor, so the spans are the starting widths: three columns with the spans `[1, 2, 1]` tile 25 % / 50 % / 25 % — the four-column arrangement with the two middle columns merged. A border you dragged for the current window count, and a window layout you dropped for it, still win over the spans — until you click a card again, which clears them like **Reset sizes** does.

Fresh installations include sixteen editable starter presets: Two columns, Three columns, Four columns, Six columns, Vertical stack, Five columns, Grid 2 × 2, Grid 3 × 2, Grid 4 × 2, Left main + stacks, Right main, Center main, Wide center, Wide center + stacks, Two thirds left and Two thirds right. They adapt to the current window count; names describe their base arrangement. Four of them (Wide center, Wide center + stacks, Two thirds left, Two thirds right) ship painted spans, so their wide column starts wide and the other columns take the extra windows. The initial selection panel uses four columns at the default 100 % UI scale (a HiDPI or fractionally scaled session fits fewer, wider cards so they keep their preview), is sized for four rows and uses slightly smaller text; a shorter display scrolls the card area, and the existing 600 px minimum panel width still applies.

On the first start after upgrading to a version with these starters, greenTile adds them **once** to the existing list, even if that list is empty. Existing definitions, assignments and saved panel sizes are not replaced. A preset with the same name is kept as-is, and new presets receive unused IDs. A saved completion marker prevents later starts or updates from restoring starters you delete or modifying ones you rename or edit. Starters added by a later version arrive once as well, for installs and fresh setups alike, and are recorded separately — so they never come back either, as long as the settings file survives; replacing it, for instance by downgrading to a version that does not know the record, starts the import over. Unreadable preset or layout data is left untouched, with the import postponed until it can be read safely. No starter preset is assigned automatically. This runs inside the extension, so it works with the updater, manual installation and Spices alike.

**Preset panel** (`Super+Ctrl+P`, works on the monitor of the focused window):

- Click a card to assign the preset and tile right away. A click is binding: it also clears this workspace's moved borders and dragged layouts — every window count, exactly what **Reset sizes** does — and then tiles the preset's own widths. The panel stays open, so you can try several presets.
- The cards form a grid: as many equal-width columns as the panel width holds, each with a large preview of the layout a click would apply.
- ✎ on a card opens that preset in the editor; ✕ on the assigned card removes the assignment. **＋ New preset** starts an empty one.
- **Auto: on / off** in the title bar shows and switches auto mode (green = on).
- **Gap between windows** sets the gap between tiled windows (0 to 48 px). Screen edges stay flush.
- **Reset sizes** is offered when borders were moved or layouts dragged on this monitor and workspace, and returns to the preset's widths — the column spans when the rule has them, equal sizes otherwise. Clicking a card does the same and takes the button away; sizes made while the panel is open bring it back the next time the panel is opened.
- The sun/moon button switches between light and dark; ⚙ opens the settings.
- Drag the title bar to move the panel, ◢ to resize it. `Esc`, ✕ or a click outside closes it.

The preview on each card shows what a click would tile right now. No cell ever stays empty: with fewer windows than cells, the highest column gives up a cell (on a tie the right one), with fewer windows than columns, columns drop from the right. With more windows than cells, the rightmost column takes the rest.

### Editor

![Preset editor](docs/screenshots/preset-editor.png)

- **Rules** (left): "from N" means the rule applies from N windows on; the last matching rule wins. **＋ Rule** adds one, **🗑** deletes the selected one.
- **Painter:** 6 columns × 4 rows. Click or drag to set how many windows a column holds (top = 1, bottom = 4). Right-click removes a column. The handle on the line between two painted columns merges them into one wide column, the handle inside a merged column splits one grid column off again.
- **Save** (or `Enter` in the name field) retiles right away if the preset is in use. **← Back** or `Esc` discards the draft.
- **🗑 Delete preset** (solid red, right of Save) removes the preset after a confirmation and clears its workspace assignments. `Enter` in the name field always saves.

## Auto mode

Auto mode is switched per monitor and workspace. It is on by default where a preset is assigned, otherwise off. While it is on:

- New, closed, minimized and restored windows retile the monitor after 300 ms. New windows are appended at the end.
- A window moved by hand snaps into the slot where you drop it. Moving it to another monitor retiles both.
- Movements are animated (250 ms, can be turned off with **Animate tiling**).

Only visible windows of the active workspace are tiled. The order follows their position on screen.

After a Cinnamon restart on X11 (`Alt+F2` → `r`) the first retile of each monitor and workspace restores the window order it had before the restart, instead of re-deriving it from the positions Muffin moved the windows to while Cinnamon was coming up. The record is kept in the session's runtime directory and is gone after a log out; windows that are no longer there are simply skipped and the rest keep the position order. Without a record — the first run, or any run after a log out — the order follows the positions as usual. A window you place by hand (dragging it into another cell, or the swap hotkey) is the newer arrangement and is recorded at once, so it is never overwritten by an older record. Unplugging and replugging a monitor behaves the same way: the reconnect keeps the window order and retiles every workspace the monitor tiles, not only the one you are looking at.

Pausing keeps the preset assigned but stops automatic tiling, snap-on-release and swapping on that monitor and workspace: nothing there is rearranged. `Super+Ctrl+Left/Right` can still send the focused window away from it (see **Swapping**). Turning auto mode on or selecting a preset explicitly resumes tiling. A pause requested before monitor detection finishes is retained until it can be applied. New windows normally join the end of the layout; an explicit successful drop takes precedence over that automatic ordering.

Without a preset, the auto grid depends on the monitor width:

- **2100 px and wider:** up to 6 windows in one row, then evenly spread over full-width rows (7 = 4 + 3, 8 = 4 + 4).
- **Narrower:** up to 3 windows in one row, then 3 columns with stacks (4 = 1·1·2, 5 = 1·2·2, 6 = 2·2·2).

With **A single window** (settings, **Settings** page) you choose what happens to the last tiled window of a workspace: **Leave it untouched** leaves it where it is, **Fill the monitor** makes it fill the whole usable area, and **Center the window** centers it at about 62 % of the width (the golden ratio) and 90 % of the height. This applies with an assigned preset too — a preset's own rules never place a lone window, they start at two. Changing the select retiles right away. New installs start on **Center the window**; an install that had the old **Fill the monitor with a single window** switch keeps its choice (fill or untouched). In the two placing modes the lone window is a tiled window like any other: a manual resize or drag snaps back on the next retile; a window that is already maximized (both directions) or fullscreen is left exactly as it is, whether you maximized it or the application opened that way. Downgrading to a version without the select falls back to the old switch, so a choice made here is lost then.

## Adjusting the layout

**Moving borders.** Drag the edge of a tiled window, or use `Super+Alt+Arrow`. Neighbours follow. greenTile targets a minimum of 120 px per dimension when the available area and gaps allow it. When that is impossible, it distributes the remaining space evenly and reduces oversized gap insets; invalid or unplaceable frames are left untouched. Applications can enforce larger minimum sizes, so their actual windows may not fit the requested cells. Borders are remembered per monitor, workspace and window count, so opening a fourth window uses the 4-window layout and closing it brings the 3-window borders back. Clicking a preset card, or **Reset sizes**, clears all of them for that monitor and workspace at once — every window count, not just the current one — and there is no undo; editing a preset does not clear them, so an edit of the assigned preset stays under the dragged sizes until the next card click.

**Splitting by drag.** While moving a window over another tiled window, a preview shows where it will land. The outer 25 % of a cell are drop zones:

| Zone | Columns layout (presets, narrow grid) | Rows layout (wide grid) |
|---|---|---|
| top / bottom | stack above / below it in its column | new row above / below its row |
| left / right | new column left / right of it | insert left / right of it in its row |

The centre keeps the normal snap. `Esc` during the drag cancels. Dropping onto another monitor works too.

**Swapping.** `Super+Ctrl+Arrow` swaps the focused window with its neighbour, all borders stay. Left/Right continue across monitors (the window moves over and is inserted at the edge) and past the outermost monitor to the previous or next workspace. Focus stays on the moved window, so repeated presses walk it along. The walk also passes monitors and workspaces without tiling or with tiling paused: there Left/Right move the window straight on to the next monitor or workspace without rearranging anything that stays behind, and Up/Down do nothing. Where tiling is active the window is inserted at the edge; elsewhere it only moves and keeps its size and position, so it may lie on top of the windows already there. The walk stops at the first and the last workspace.

**Focus and border.** `Super+Arrow` moves the keyboard focus to the neighbouring tiled window, without touching the layout. Left/Right cross over to the adjacent monitor at the edge, nothing wraps. Outside auto mode, and for windows the tiling does not manage, the key keeps its native edge-tiling behaviour. After each `Super+Arrow` move the newly focused window flashes a thin **focus border** in the state color for three seconds, so you see where the focus went; mouse clicks and `Alt+Tab` do not show it. It can be turned off in the settings (**Border around the focused window**).

Borders and dragged layouts apply only in auto mode, not to `Super+Ctrl+3/6`.

## Excluding windows

- **Never tile list** (settings, **Settings** page): match by window class, title or app id. **Add an installed application** adds an app id row for you, which also covers flatpaks. Excluded windows float freely and do not count for the layout. A window that is transient for another (a child or properties dialog) and a window that cannot be resized are never tiled either, and the list starts with a row for the Cinnamon xlet settings dialogs — that includes greenTile's own settings window; delete the row to tile it like any other window.
- **`Super+G`** lets a single window float until you press it again or close the window. This is not saved.

## Multiple monitors

Presets and auto mode are stored per monitor and workspace. When DisplayConfig provides a hardware identity, greenTile uses vendor, product and serial, with the connector added when the serial is missing or all zeros, to find the saved assignments after replugging or rearranging displays. If hardware detection fails, it uses a separate name-and-size fallback key. Assignments under the hardware key and the fallback key are not automatically joined. After a monitor change, greenTile waits until the windows have settled and then retiles every workspace that is tiled, not only the active one.

With `workspaces-only-on-primary` on, secondary monitors share one layout across all workspaces.

Known limitation: layouts are keyed by workspace number and shift when a workspace is removed.

An external layout reset or import cancels older pending resize writes when Cinnamon delivers a changed value. Identical-value imports and the short interval before an external file change is delivered are not fully protected; avoid resetting or importing layouts while a resize is still pending.

## Appearance

On the **Settings** page under **Preset panel**:

- **Panel theme:** follow the desktop (default), always light, or always dark.
- **Accent color:** follow the Cinnamon theme (default) or a custom color.
- **State color** for "Auto: on" and the assigned card: green (default), follow the theme, or custom.

Looking for a specific feature? [FEATURES.md](FEATURES.md) lists all of them.

## Development

Build and install from a checkout using the same validated package as a release. The installer stages the extension and translations before replacing the existing installation, and serializes cooperating installs for the same account on one lock. These commands install files; they do not activate changed library code in a running Cinnamon:

```bash
npm ci
npm run check
./build-release.sh
version=$(node -p "require('./metadata.json').version")
"./dist/greenTile-$version/install.sh"
# Then restart Cinnamon on X11: Alt+F2, type r, press Enter.
# Under Wayland, log out and back in instead.
```

extension.js is the single entry and imports the modules from `lib/` — always
deploy `lib/` alongside it. Copying `extension.js` alone fails with an import
error when `lib/` was never deployed; when an older `lib/` is still on disk the
entry loads instead and silently runs that old library code.

- **Tests:** `npm test` (or `node --test tests/*/*.test.js`) — every test file exactly once, on Node 18 or newer. Test files live one level below `tests/` (`tests/<area>/<name>.test.js`); `node --test tests/` would only work on Node 18/20.
- **Tooling:** `npm ci` once, then `npm run check` — tests, typecheck, lint and a catalog check in one run (the catalog check compiles every `po/*.po` with `msgfmt`, so it needs gettext like the installer; CI installs it). Types are JSDoc checked with `tsc --checkJs` (`npm run typecheck`); there are no TypeScript sources and no build step, everything ships as plain JavaScript.
- **CI:** `.github/workflows/ci.yml` runs `npm run check` on Node 18 and 22 for every push and pull request, and builds the release zip to check that it holds the runtime files only.
- **Release guard:** `tests/architecture/shipped-files.test.js` freezes the zip surface: dev-only material (npm configs, types, tests, research, CI) must never reach `build-release.sh` or `lib/`.
- **Releasing:** run the **release-dispatch** workflow on `main` (Actions → release-dispatch → Run workflow, input `version`, e.g. `2.2.4`; plain `X.Y.Z` only, pre-release suffixes are not supported). One run bumps every version marker with `scripts/bump-version.sh`, runs `npm run check`, commits, tags `vX.Y.Z` and publishes the release. The bump script and `tests/architecture/version-consistency.test.js` keep the markers in step, so a version that drifts from `metadata.json` fails `npm run check`.
- **Releases:** pushing a `v*` tag runs the checks, verifies that the tag matches the version in `metadata.json`, builds the zip and attaches it to the release (`.github/workflows/release.yml`).
- **Diagnostics:** `~/.xsession-errors` shows `JS ERROR` lines and `greenTile skipped …` lines explaining why a window was not tiled.
- **Translations:** the domain is `greenTile@carsteneu`, template `po/greenTile@carsteneu.pot`. After changing strings, run `./makepot.sh` (needs gettext and cinnamon-xlet-makepot; the script scans a staging copy of the shipped files only, never tests or dev tooling — point `MAKEPOT_PYTHON` at an interpreter with `polib`/`pytz` if they are not installed system-wide). New or changed `.mo` files only take effect after a Cinnamon restart.

### Architecture

Plain JavaScript modules, loaded through the native GJS importer, in five layers. A module may only import modules of its own or a lower layer, and the dependency graph is strictly acyclic:

| Layer | Concern |
|---|---|
| `lib/model/` | pure logic without any Cinnamon access: layouts, splits, presets and rules, drop zones, swap steps, colors, settings keys. Runs in plain Node. |
| `lib/tiling/` | tiling services on top of Cinnamon: work area, collecting windows, placing and animating, reading order, retiling, swapping, focus navigation |
| `lib/runtime/` | components owned by one App, each with its own signals, timers and `destroy()` (auto tiling observer, focus border, drop preview, splits, theme and accent, hotkeys, monitors, exclusions, panel state), plus the session that lives from `enable()` to `disable()` |
| `lib/ui/` | preset panel, editor, Cairo drawing, gettext binding |
| `lib/app/` | composition root: `App` builds the components, `Config` binds the settings and the hotkeys |

`extension.js` starts the session in `enable()` and destroys it in `disable()`; a monitor change replaces the App inside the session. Library modules resolve their dependencies via `imports.extensions['greenTile@carsteneu'].lib.…`, and top-level `var`/function declarations expose their public API. On Cinnamon 6.6 the entry still uses Cinnamon's legacy wrapper, while `lib/` already uses native imports. This loading boundary has also been checked against pinned upstream source, not a complete Cinnamon 6.8 runtime. Native library modules stay cached until Cinnamon restarts. The guards in `tests/architecture/` enforce the layer table, the acyclic graph, no mutable module-level state apart from the entry's private lifecycle holder, model purity, the settings key list and the shipped file list. Generated declarations in `types/xlet/` keep cross-module JSDoc types checked without adding runtime build output. `tests/` is organised like `lib/` (`model/`, `tiling/`, `runtime/`, `app/`) plus `architecture/`, `i18n/` and `helpers/`.

## Origin

greenTile is a fork of **gTile** 2.2.1 (`gTile@shuairan`):

- originally written by **vibou** for GNOME Shell: [vibou/vibou.gTile](https://github.com/vibou/vibou.gTile)
- ported to Cinnamon by **shuairan**: [shuairan/gTile](https://github.com/shuairan/gTile)
- maintained in the Linux Mint Spices repository: [cinnamon-spices-extensions/gTile@shuairan](https://github.com/linuxmint/cinnamon-spices-extensions/tree/master/gTile%40shuairan)

The starting point was gTile's shipped bundle `5.4/gTile.js`. The extension skeleton and the translation sources (`po/`) come from gTile; the classic grid was removed, everything else described above was added in greenTile. If gTile is still installed, disable it, since both claim the same keys.

greenTile has been largely rebuilt. Nearly unchanged code inherited from gTile accounts for **less than 1% of today's runtime code** in the source comparison described below. Several gTile-derived helpers remain, and the project's original attribution and GPL licensing are unchanged.

<details>
<summary>Source comparison: scope and method</summary>

A source comparison for **greenTile 2.2.0** (`15ec54f`) found **250 matching code tokens** in near-verbatim sequences:

| Compared runtime code | Total tokens | Tokens in matching sequences | Share |
|---|---:|---:|---:|
| gTile 2.2.1 reference | 11,083 | 250 | **2.26%** |
| Current greenTile | 54,180 | 250 | **0.46%** |

This measures near-verbatim textual overlap, not independent authorship or a percentage of the tool that is "completely new": shorter or structurally rewritten derived code is not fully captured.

**Measurement scope and method:** the reference is gTile 2.2.1 at Linux Mint Spices commit [`f17b3da36c6bb8db7359c3f978aebe8c93ec6968`](https://github.com/linuxmint/cinnamon-spices-extensions/tree/f17b3da36c6bb8db7359c3f978aebe8c93ec6968/gTile%40shuairan). Its `src/base` and `src/5_4` TypeScript runtime sources are transpiled to ES2022 with TypeScript 5.9.3, preserving upstream's legacy decorator mode and excluding generated helper definitions and type-only module markers. Espree 10.4.0 tokenizes these and greenTile's `extension.js` plus `lib/**/*.js`, without comments. The comparison counts each token once if it belongs to a matching contiguous sequence of at least 30 tokens, normalizing quote style, `const`/`let`/`var`, strict versus loose equality, and five known helper renames (`getPanelHeight` → `panelHeight`, `getUsableScreenArea` → `usableArea`, `reset_window` → `windowReset`, `move_resize_window` → `windowMoveResize`, `_` → `translate`). Tests, documentation, type declarations, tooling, CSS, configuration and translation catalogs are excluded. With a 50- or 80-token minimum, the measured shares are 1.59% of the reference and 0.32% of current greenTile, illustrating the threshold dependence.

</details>

## License

[GNU General Public License, version 3](https://www.gnu.org/licenses/gpl-3.0.html), like gTile. See `LICENSE`.

- Original code: vibou, shuairan and the gTile contributors
- Modifications and additions: © 2026 carsten_eu
