# greenTile

Window tiling for Cinnamon with column rules, presets per monitor and workspace, an auto mode and snap-on-release.

greenTile is a fork of **gTile** (version 2.2.1), see [Origin](#origin). Like gTile, greenTile is licensed under the **GNU GPL v3** (see `LICENSE`). The classic gTile grid (`Super+G`) was removed.

- **UUID:** `greenTile@carsteneu`
- **Tested with:** Cinnamon 6.6 (Linux Mint)

## Origin

greenTile is based on **gTile** (UUID `gTile@shuairan`), version 2.2.1:

- Originally developed by **vibou** as a GNOME Shell extension: [vibou/vibou.gTile](https://github.com/vibou/vibou.gTile)
- Ported to Cinnamon by **shuairan**: [shuairan/gTile](https://github.com/shuairan/gTile) (that repository only holds the old code up to v0.7)
- Now maintained by the community in the Linux Mint Spices repository: [linuxmint/cinnamon-spices-extensions, folder `gTile@shuairan`](https://github.com/linuxmint/cinnamon-spices-extensions/tree/master/gTile%40shuairan). Version 2.2.1 was taken from there.

The starting point was the shipped webpack bundle `5.4/gTile.js` of gTile 2.2.1, i.e. the code base for Cinnamon 5.4 and later that was introduced in gTile 2.2.0. greenTile modifies this bundle directly; gTile's TypeScript sources (`src/` in the Spices repository) are not used.

**Taken over from gTile:** the extension skeleton, `icon.png` and the translation sources (`po/`; they are not compiled or installed by the deploy steps below). The classic grid (`Super+G`) with its settings and the grid icons were removed.

**Changed or added in greenTile:** column hotkeys, auto mode with snap-on-release and animation, own window collector, presets per monitor and workspace plus the preset panel, new UUID and a flat directory layout without version subfolders. Modified by carsten_eu since 2026-09-04.

## Hotkeys

| Key | Action |
|---|---|
| `Super+Ctrl+3` | 3 columns of equal width |
| `Super+Ctrl+6` | 6 columns of equal width |
| `Super+Ctrl+A` | Turn automatic tiling on for the focused monitor and the active workspace and tile now (with its preset if one is assigned, otherwise with the auto grid); pressing it again tiles again |
| `Super+Ctrl+D` | Turn automatic tiling off for the focused monitor and the active workspace (also pauses its preset) |
| `Super+Ctrl+P` | Open/close the preset panel for the monitor of the focused window |
| `Super+G` | Never tile the focused window — press again to tile it again (forgotten when the window is closed) |
| `Super+Alt+Right` / `Super+Alt+Left` | Make the focused tiled window wider / narrower (tap = 1 px, hold to speed up) |
| `Super+Alt+Down` / `Super+Alt+Up` | Make the focused tiled window taller / shorter |

All keys can be changed in the extension settings (Extensions manager, or ⚙ in the preset panel).

Tiled windows glide into their new place (250 ms). **Animate tiling** on the **Settings** page (setting `tileAnimation`, default on) turns that off: the windows then jump there at once. It applies to every greenTile layout from the next tiling on; while a resize key is held down, windows always jump.

## Presets

A preset is a list of rules by window count: each rule defines how many columns there are and how many windows are stacked in each column. A preset is assigned to a monitor and workspace and applies there.

In the panel (`Super+Ctrl+P`):
- **Click a row:** assign the preset to this monitor and workspace and tile right away (this also turns automatic tiling on for it if it was off). The panel stays open, so you can try several presets in a row; close it with ✕, `Esc` or `Super+Ctrl+P`.
- **✕ in a row:** remove the assignment
- **🔧:** open the editor for this preset
- **＋ New preset:** open the editor with an empty preset
- **✕ in the title bar** or `Esc` closes the panel. While the list is open, greenTile takes the `Esc` key, so applications do not receive it until the panel is closed.
- **Auto: on / Auto: off in the title bar** shows whether automatic tiling is on for this monitor and workspace (green = on). Clicking it switches it, exactly like `Super+Ctrl+A` / `Super+Ctrl+D`; switching it on tiles right away.
- **Gap between windows − N px +** below the list sets the gap between tiled windows (0 to 48 px in steps of 2, default 0). Only the sides where two windows meet move in; windows stay flush with the screen edges. The value applies to all greenTile layouts (auto grid, presets, `Super+Ctrl+3/6`). On a workspace with automatic tiling on, every click retiles right away, so the new gap shows live; elsewhere it applies from the next tiling. Stored in the setting `windowGap`.
- **Reset sizes** appears next to it when borders were moved on this monitor and workspace (see [Moving borders](#moving-borders)); it returns every window count there to equal sizes and retiles.
- **⚙ in the title bar** closes the panel and opens the extension's settings dialog (pages **Settings** and **Hotkeys**).
- The panel can be dragged by its title bar and keeps its position when you switch workspaces. If that position is no longer on any monitor (external display unplugged), the panel opens centred again.
- **◢ in the bottom right corner** resizes the panel: width (at least 600 px) and height of the part that stretches, in the list the preset rows (at least three), in the editor the painter. List and editor keep their own size, stored in the setting `panelSize`, limited to the room on the panel's monitor (a size set on a big monitor shrinks on a small one).
- **Theme:** the setting `panelTheme` (Extensions → greenTile → configure → **Settings** → **Preset panel**) decides whether the panel and the editor follow the desktop color scheme (**Follow system**, the default, applied live: switching the desktop's theme restyles an open panel right away) or always stay **Light** or **Dark**, whatever the desktop does.
- **Theme toggle in the title bar:** the sun/moon button switches the panel between Light and Dark with one click and shows the theme a click switches to (moon in light mode); it overrides `panelTheme`, and **Follow system** stays selectable in the settings dialog.
- **Accent color:** the setting `accentMode` (**Settings** → **Preset panel**) decides where the orange comes from: **Follow theme** (the default) picks up the accent color of the current Cinnamon theme live, also when the theme is switched later; **Custom** uses the color chosen in `accentColor`. Only the accent changes (figures, stripes, hover tones, Save button); borders and greys stay as they are.
- **State color:** the setting `stateMode` (**Settings** → **Preset panel**) colors the "Auto: on" marker and the assigned rows: **Green** (the default) keeps today's look, **Follow theme** uses the accent color of the Cinnamon theme live, **Custom** uses the color chosen in `stateColor`.
- Right after switching between list and editor, clicks are ignored for 400 ms, so the second click of a double-click does not act in the new view.

The thumbnail shows the layout a click would tile right now: the matching rule, filled to the current number of windows (see below).

Tiled windows always cover the whole screen, no cell stays empty. When a rule has more cells than there are windows, the highest column loses a cell (on a tie the right one) until the count fits; with fewer windows than columns, columns drop from the right. Example: a rule `2·2` with 3 windows tiles as `2·1`, with 2 windows as `1·1`. With more windows than cells, the rightmost column takes the rest.

### Editor

- **Rules (left):** one row per rule, "from N" = the rule applies from N windows on (the last rule whose N is not larger than the window count wins). Click a row to edit it. **＋ Rule** adds a rule (N + 1, copy of the highest rule), **🗑 Delete rule** removes the selected one; a preset always keeps one rule.
- **Rule applies from [−] N [+]:** changes N of the selected rule. N can be smaller than the number of painted cells; with fewer windows the layout is filled as described above, so no cell stays empty.
- **Painter:** 6 columns × 4 rows. Click or drag: the row under the pointer sets how many windows the column holds (top = 1, bottom = 4). Dragging paints every column it passes. Right-click removes a column. With more windows than cells, the rightmost column takes the rest.
- **Name** and **Save** (or `Enter` in the name field). Saving a preset that is assigned to the active workspace retiles it right away, unless automatic tiling is off there.
- **← Back** or `Esc` returns to the list without saving.
- While the editor is open it holds the keyboard and mouse (like a dialog), so the preset hotkey does not work until you go back.

## Auto mode

Automatic tiling is switched **per monitor and workspace**:

- `Super+Ctrl+A` turns it on for the focused monitor and the active workspace and tiles right away. Pressing it again just tiles again.
- `Super+Ctrl+D` turns it off for the focused monitor and the active workspace. With a preset assigned this pauses the preset: it stays assigned (and visible in the panel) but nothing is tiled until `Super+Ctrl+A`.
- A monitor/workspace that was never switched either way is on when it has a preset and off when it has none.
- The state is shown and switched in the title bar of the preset panel (**Auto: on / Auto: off**). It is stored in the `layouts` setting together with the preset assignments (see below) and survives reloads and restarts. Both are keyed by monitor and workspace number, so they stay with the monitor they were made for; workspace numbers shift when workspaces are removed.

While automatic tiling is on for a monitor and the active workspace:
- When a window is added to or removed from the active workspace, the monitor it appeared on (or was last seen on) is retiled after 300 ms (normal windows only, no dialogs). Minimizing and restoring windows also update the layout.
- A window moved by hand snaps into the grid slot where it is dropped; its neighbours move up. Moving a window to another monitor retiles both monitors.
- All movements are animated (250 ms). The window gets its final size immediately and only the picture glides, so terminal text does not flicker.
- New windows are appended at the end.

Without a preset the auto grid applies, depending on the monitor width:
- **2100 px and wider:** up to 6 windows in one row, beyond that the windows are spread evenly over rows that each span the full width (7 = 4 + 3, 8 = 4 + 4, 12 = 6 + 6)
- **narrower than 2100 px:** up to 3 windows in one row, from 4 windows on 3 columns with stacks (4 = 1·1·2, 5 = 1·2·2, 6 = 2·2·2)

In every case only visible windows of the **active** workspace are tiled, never windows from other workspaces. Minimized windows are left out. The order follows the current position on screen, so windows you rearranged by hand keep their place.

## Excluding windows

Windows on the **Never tile** list (settings dialog, **Settings** page) are left alone by greenTile: they are never tiled — not by auto mode, presets, `Super+Ctrl+3/6` or snap-on-release — and not counted for the layout, so the rest tiles as if they were not there. The resize hotkeys ignore them too; they float freely wherever you put them. A row matches by **Window class** (the WM_CLASS equals the text — the class or the instance, case-insensitive) or **Title contains** (the window title contains the text, case-insensitive). Empty rows are ignored. Changes apply live.

For a single window, press `Super+G` while it has focus: the rest of its monitor retiles and the window floats (a short OSD shows "Window floats"). Press `Super+G` again and it is tiled back in ("Window tiles again"). This ad-hoc state is kept in memory per window and forgotten when the window is closed — or when the extension is disabled or the monitor setup changes. It is **not** saved to the list.

## Moving borders

Tiled windows do not have to share the area equally. Where automatic tiling is on:

- **Mouse:** drag the edge of a tiled window as usual. On release the border between it and its neighbour moves there, and the neighbours follow. A vertical edge moves the column border (in the wide auto grid: the border between two windows of a row); a horizontal edge moves the border inside the column (wide auto grid: the row border). Corners move both. An edge on the screen border has no neighbour, the window snaps back. A click on the edge without dragging changes nothing.
- **Keyboard:** `Super+Alt+Right` / `Left` make the focused window wider / narrower, `Super+Alt+Down` / `Up` taller / shorter. The window grows at its right/bottom border; the last column/cell uses its left/top border instead. One tap moves the border by 1 px, holding the key speeds up to 64 px per step. While a key is held, windows jump without animation. The keys can be changed on the Hotkeys page of the settings.
- No window gets narrower or lower than 120 px.
- The borders are stored per monitor, workspace **and window count** in the `layouts` setting (field `splits`, fractions of the screen, so they survive resolution changes and the gap setting). With 3 windows you get the borders you set for 3 windows; when a fourth window opens, the layout for 4 applies, and closing it brings the 3-window borders back. Borders are ignored (equal sizes) when the layout they were made for no longer applies, e.g. after the preset or its rule changed.
- **Reset sizes** in the preset panel removes all borders of the monitor and workspace.
- Not for `Super+Ctrl+3/6`. With automatic tiling off, resizing a window stays a free resize.
- Known limitation: applications with their own minimum size may refuse to shrink to their cell; windows can then overlap.

## Per-monitor layouts

Preset assignments and automatic tiling are stored per monitor **and** workspace. Every connected monitor is identified by a stable key `<vendor>|<product>|<serial>`, read from Cinnamon's display configuration. Monitors with a serial of zero or none (most built-in laptop panels) get the connector appended, e.g. `LEN|0x41a8|0x00000000|eDP`, so two identical monitors keep separate entries, and replugging or rearranging displays keeps every assignment. If the display information cannot be read, a fallback key from name and resolution is used (logged once); identical models can then collide.

- On the first start after the update, the old per-workspace settings (`wsPresets`, `autoWorkspaces`) are converted **once** into `layouts` entries for the monitor that is primary at that moment, and the marker `layoutsMigrated` is set, so deleting all layouts later does not bring the old values back. The old keys remain in the settings file as a backup but are no longer read or written.
- When Muffin's `workspaces-only-on-primary` setting is on, the other monitors show the same windows on every workspace. Their entries then use the workspace key `*` instead of a number, so one assignment covers all workspaces there; the primary monitor keeps numbered workspaces. The setting is read live, no restart needed.
- After a monitor is plugged in or out, greenTile waits for Muffin to move the windows: it retiles once 2 seconds after the last change, at the latest 15 seconds after the first (log line `greenTile monitors settled …`).
- The preset panel works on the monitor of the focused window; its title shows the workspace number and the monitor's name, e.g. `Presets — workspace 5 · AOC 49"`. When two connected monitors share a name, the connector is appended.

Known limitation: entries are keyed by workspace number, as before, so they shift when workspaces are removed.

## Installation and deploy

```bash
D=~/.local/share/cinnamon/extensions/greenTile@carsteneu
mkdir -p "$D"
node --check greenTile.js
cp extension.js greenTile.js metadata.json settings-schema.json stylesheet.css icon.png LICENSE "$D"/
rm -rf "$D"/icons
for po in po/*.po; do
  lang=$(basename "$po" .po)
  mkdir -p ~/.local/share/locale/"$lang"/LC_MESSAGES
  msgfmt --check -o ~/.local/share/locale/"$lang"/LC_MESSAGES/greenTile@carsteneu.mo "$po"
done
dbus-send --session --print-reply --dest=org.Cinnamon /org/Cinnamon org.Cinnamon.Eval \
  string:"imports.ui.extensionSystem.disableExtension('greenTile@carsteneu'); imports.ui.extensionSystem.enableExtension('greenTile@carsteneu'); 'reloaded'"
```

The first time, enable the extension in the Cinnamon settings. **gTile@shuairan must be disabled**, otherwise both extensions claim the same keys.

Check: `imports.ui.extensionSystem.runningExtensions` (an array) must contain `greenTile@carsteneu`, and `~/.xsession-errors` must not show any `JS ERROR` mentioning `greenTile.js`.

Tests for the pure models (monitor keys, layouts with migration, auto mode, preset editor): `node --test tests/*.test.js` (Node 18 or newer; passing only the directory `tests/` fails on Node 22 and later). The `tests/` folder is not copied by the deploy steps.

## Switching from gTile

Settings and presets are stored per UUID under `~/.config/cinnamon/spices/`. To take them over:

```bash
mkdir -p ~/.config/cinnamon/spices/greenTile@carsteneu
cp ~/.config/cinnamon/spices/gTile@shuairan/gTile@shuairan.json \
   ~/.config/cinnamon/spices/greenTile@carsteneu/greenTile@carsteneu.json
gsettings set org.cinnamon enabled-extensions "['greenTile@carsteneu']"
```

Back to gTile: `gsettings set org.cinnamon enabled-extensions "['gTile@shuairan']"`. gTile's folder and settings are left untouched.

## Translations

All user-visible strings are English in the source and translated via gettext. The translation domain is the UUID `greenTile@carsteneu`; compiled catalogs are installed to `~/.local/share/locale/<lang>/LC_MESSAGES/greenTile@carsteneu.mo` (see the deploy steps above).

- `po/greenTile@carsteneu.pot` is the template, `po/<lang>.po` are the translations. They were taken over from gTile, so strings added by greenTile are still untranslated in most languages; German is complete.
- After changing translatable strings in `greenTile.js`, `settings-schema.json` or `metadata.json`, run `./makepot.sh`. It regenerates the template with Cinnamon's `cinnamon-xlet-makepot` and merges it into every `.po` file. That tool needs the Python modules `polib` and `pytz`; see the comment at the top of `makepot.sh`.
- New language: `msginit -i po/greenTile@carsteneu.pot -o po/<lang>.po -l <lang>`, then translate and deploy.
- Placeholders such as `%d` must be kept in the translation; the code fills them with `String.prototype.format`.

## Pitfalls

- Muffin 6.6: use `get_frame_rect()`; `get_outer_rect()` does not exist there.
- Hotkeys live in two files: the default in the schema and the user value in `~/.config/cinnamon/spices/greenTile@carsteneu/greenTile@carsteneu.json`. The user value wins.
- `Super+N` and `Super+Shift+N` belong to the window list applet; do not use them.
- gTile's `focusMetaWindow` goes stale when switching between windows of the same application. That is why tiling uses its own window collector.
- `grab-op-begin` and `grab-op-end` pass the display twice: `(display, display, window, op)`.
- Dragging the panel needs `Main.pushModal(actor)` **and** `device.grab(actor)` together, as in Cinnamon's `dnd.js`. Either one alone loses mouse events as soon as the pointer leaves the panel.
- Diagnostics: lines `greenTile skipped …` in `~/.xsession-errors` state why a window was not tiled.
- Reload via DBus Eval as shown above; restarting Cinnamon is not necessary for code changes.
- The UUID must not contain an underscore: Cinnamon's settings dialog (`KeybindingTable.py`) splits UUIDs at `_` to find instance numbers, does not find the keybindings of such an extension and crashes, so the dialog never opens. That is why the UUID is `greenTile@carsteneu`. If the dialog does not open, run `xlet-settings extension greenTile@carsteneu` in a terminal to see the traceback.
- gTile 2.2.1 did not disconnect its `monitors-changed` handler on disable, so every reload left a handler behind that rebuilt a complete old instance on each monitor change (duplicate tiling, old hotkeys coming back). Fixed in greenTile; handlers left over from reloads of an older version disappear only with a Cinnamon restart.
- Exception, translations: gettext (glibc) caches catalogs per process, including the fact that a catalog is *missing*. New or changed `.mo` files therefore only take effect after restarting Cinnamon (`Ctrl+Alt+Esc`, or log out and in). Reloading the extension is not enough.

## License

greenTile is licensed, like gTile, under the [GNU General Public License, version 3](https://www.gnu.org/licenses/gpl-3.0.html). The full license text is in `LICENSE`.

- Original code: vibou, shuairan and the gTile contributors
- Modifications and additions: © 2026 carsten_eu
