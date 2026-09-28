# greenTile

Window tiling for Cinnamon with column rules, per-workspace presets, an auto mode and snap-on-release.

greenTile is a fork of **gTile** (version 2.2.1), see [Origin](#origin). Like gTile, greenTile is licensed under the **GNU GPL v3** (see `LICENSE`). The classic gTile grid (`Super+G`) is still included.

- **UUID:** `greenTile@carsteneu`
- **Tested with:** Cinnamon 6.6 (Linux Mint)

## Origin

greenTile is based on **gTile** (UUID `gTile@shuairan`), version 2.2.1:

- Originally developed by **vibou** as a GNOME Shell extension: [vibou/vibou.gTile](https://github.com/vibou/vibou.gTile)
- Ported to Cinnamon by **shuairan**: [shuairan/gTile](https://github.com/shuairan/gTile) (that repository only holds the old code up to v0.7)
- Now maintained by the community in the Linux Mint Spices repository: [linuxmint/cinnamon-spices-extensions, folder `gTile@shuairan`](https://github.com/linuxmint/cinnamon-spices-extensions/tree/master/gTile%40shuairan). Version 2.2.1 was taken from there.

The starting point was the shipped webpack bundle `5.4/gTile.js` of gTile 2.2.1, i.e. the code base for Cinnamon 5.4 and later that was introduced in gTile 2.2.0. greenTile modifies this bundle directly; gTile's TypeScript sources (`src/` in the Spices repository) are not used.

**Taken over from gTile:** the extension skeleton, the classic grid (`Super+G`) with its settings, the icons (`icons/`, `icon.png`) and the translation sources (`po/`; they are not compiled or installed by the deploy steps below).

**Changed or added in greenTile:** column hotkeys, auto mode with snap-on-release and animation, own window collector, per-workspace presets and the preset panel, new UUID and a flat directory layout without version subfolders. Modified by carsten_eu since 2026-09-04.

## Hotkeys

| Key | Action |
|---|---|
| `Super+Ctrl+3` | 3 columns of equal width |
| `Super+Ctrl+6` | 6 columns of equal width |
| `Super+Ctrl+A` | Turn automatic tiling on for the active workspace and tile now (with its preset if one is assigned, otherwise with the auto grid); pressing it again tiles again |
| `Super+Ctrl+D` | Turn automatic tiling off for the active workspace (also pauses its preset) |
| `Super+Ctrl+P` | Open/close the preset panel for the active workspace |
| `Super+G` | Classic gTile grid |

All keys can be changed in the extension settings (Extensions manager, or ⚙ in the preset panel).

## Presets

A preset is a list of rules by window count: each rule defines how many columns there are and how many windows are stacked in each column. A preset is assigned to a workspace and applies there.

In the panel (`Super+Ctrl+P`):
- **Click a row:** assign the preset to this workspace and tile right away (this also turns automatic tiling on for the workspace if it was off)
- **✕ in a row:** remove the assignment
- **🔧:** open the editor for this preset
- **＋ New preset:** open the editor with an empty preset
- **✕ in the title bar** or `Esc` closes the panel. While the list is open, greenTile takes the `Esc` key, so applications do not receive it until the panel is closed.
- **Auto: on / Auto: off in the title bar** shows whether automatic tiling is on for this workspace (green = on). Clicking it switches it, exactly like `Super+Ctrl+A` / `Super+Ctrl+D`; switching it on tiles right away.
- **Gap between windows − N px +** below the list sets the gap between tiled windows (0 to 48 px in steps of 2, default 0). Only the sides where two windows meet move in; windows stay flush with the screen edges. The value applies to all greenTile layouts (auto grid, presets, `Super+Ctrl+3/6`), not to the classic `Super+G` grid. On a workspace with automatic tiling on, every click retiles right away, so the new gap shows live; elsewhere it applies from the next tiling. Stored in the setting `windowGap`.
- **⚙ in the title bar** closes the panel and opens the extension's settings dialog (pages **Settings** and **Hotkeys**).
- The panel can be dragged by its title bar and keeps its position when you switch workspaces. If that position is no longer on any monitor (external display unplugged), the panel opens centred again.
- Right after switching between list and editor, clicks are ignored for 400 ms, so the second click of a double-click does not act in the new view.

The thumbnail shows the rule that would apply for the current number of windows.

### Editor

- **Rules (left):** one row per rule, "from N" = the rule applies from N windows on (the last rule whose N is not larger than the window count wins). Click a row to edit it. **＋ Rule** adds a rule (N + 1, copy of the highest rule), **🗑 Delete rule** removes the selected one; a preset always keeps one rule.
- **Rule applies from [−] N [+]:** changes N of the selected rule. N can be smaller than the number of painted cells; the remaining cells then stay empty (e.g. six columns from 2 windows on).
- **Painter:** 6 columns × 4 rows. Click or drag: the row under the pointer sets how many windows the column holds (top = 1, bottom = 4). Dragging paints every column it passes. Right-click removes a column. With more windows than cells, the rightmost column takes the rest.
- **Name** and **Save** (or `Enter` in the name field). Saving a preset that is assigned to the active workspace retiles it right away, unless automatic tiling is off there.
- **← Back** or `Esc` returns to the list without saving.
- While the editor is open it holds the keyboard and mouse (like a dialog), so the preset hotkey does not work until you go back.

## Auto mode

Automatic tiling is switched **per workspace**:

- `Super+Ctrl+A` turns it on for the active workspace and tiles right away. Pressing it again on the same workspace just tiles again.
- `Super+Ctrl+D` turns it off for the active workspace. On a workspace with a preset this pauses the preset: it stays assigned (and visible in the panel) but nothing is tiled until `Super+Ctrl+A`.
- A workspace that was never switched either way is on when it has a preset and off when it has none.
- The state is shown and switched in the title bar of the preset panel (**Auto: on / Auto: off**). It is stored in the list setting `autoWorkspaces` (rows `{workspace: <number from 1>, auto: true|false}`), which is not shown in the settings dialog, and survives reloads and restarts. Like the preset assignments it is keyed by workspace number, so it shifts when workspaces are removed.

While automatic tiling is on for the active workspace:
- When a window is added to or removed from the active workspace, the layout is retiled after 300 ms (normal windows only, no dialogs). Minimizing and restoring windows also updates the layout.
- A window moved by hand snaps into the grid slot where it is dropped; its neighbours move up.
- All movements are animated (250 ms). The window gets its final size immediately and only the picture glides, so terminal text does not flicker.
- New windows are appended at the end.

Without a preset the auto grid applies, depending on the monitor width:
- **2100 px and wider:** up to 6 windows in one row, beyond that balanced rows (8 = 4×2, 12 = 6×2)
- **narrower than 2100 px:** up to 3 windows in one row, from 4 windows on 3 columns with stacks (4 = 1·1·2, 5 = 1·2·2, 6 = 2·2·2)

In every case only visible windows of the **active** workspace are tiled, never windows from other workspaces. Minimized windows are left out. The order follows the current position on screen, so windows you rearranged by hand keep their place.

## Installation and deploy

```bash
D=~/.local/share/cinnamon/extensions/greenTile@carsteneu
mkdir -p "$D"
node --check greenTile.js
cp extension.js greenTile.js metadata.json settings-schema.json stylesheet.css icon.png LICENSE "$D"/
cp -r icons "$D"/
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

Tests for the pure models (preset editor, auto mode per workspace): `node --test tests/*.test.js` (Node 18 or newer; passing only the directory `tests/` fails on Node 22 and later). The `tests/` folder is not copied by the deploy steps.

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
