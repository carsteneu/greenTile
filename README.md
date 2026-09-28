# greenTile

Window tiling for Cinnamon with column rules, per-workspace presets, an auto mode and snap-on-release.

greenTile is a fork of **gTile** (version 2.2.1), see [Origin](#origin). Like gTile, greenTile is licensed under the **GNU GPL v3** (see `LICENSE`). The classic gTile grid (`Super+G`) is still included.

- **UUID:** `greenTile@carsten_eu`
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
| `Super+Ctrl+A` | Toggle auto mode (tiles immediately when switched on); on a workspace with a preset: apply the preset again |
| `Super+Ctrl+P` | Open/close the preset panel for the active workspace |
| `Super+G` | Classic gTile grid |

All keys can be changed in the extension settings.

## Presets

A preset is a list of rules by window count: each rule defines how many columns there are and how many windows are stacked in each column. A preset is assigned to a workspace and applies there.

In the panel (`Super+Ctrl+P`):
- **Click a row:** assign the preset to this workspace and tile right away
- **✕ in a row:** remove the assignment
- **🔧:** editor (coming later)
- The panel can be dragged by its title bar and keeps its position when you switch workspaces.

The thumbnail shows the rule that would apply for the current number of windows.

A workspace with a preset is always retiled automatically, even when auto mode is off.

## Auto mode

- When a window is added to or removed from the active workspace, the layout is retiled after 300 ms (normal windows only, no dialogs). Minimizing and restoring windows also updates the layout.
- A window moved by hand snaps into the grid slot where it is dropped; its neighbours move up.
- All movements are animated (250 ms). The window gets its final size immediately and only the picture glides, so terminal text does not flicker.
- New windows are appended at the end.

Without a preset the auto grid applies (only while auto mode is on), depending on the monitor width:
- **2100 px and wider:** up to 6 windows in one row, beyond that balanced rows (8 = 4×2, 12 = 6×2)
- **narrower than 2100 px:** up to 3 windows in one row, from 4 windows on 3 columns with stacks (4 = 1·1·2, 5 = 1·2·2, 6 = 2·2·2)

In every case only visible windows of the **active** workspace are tiled, never windows from other workspaces. Minimized windows are left out. The order follows the current position on screen, so windows you rearranged by hand keep their place.

## Installation and deploy

```bash
D=~/.local/share/cinnamon/extensions/greenTile@carsten_eu
mkdir -p "$D"
node --check greenTile.js
cp extension.js greenTile.js metadata.json settings-schema.json stylesheet.css icon.png LICENSE "$D"/
cp -r icons "$D"/
for po in po/*.po; do
  lang=$(basename "$po" .po)
  mkdir -p ~/.local/share/locale/"$lang"/LC_MESSAGES
  msgfmt --check -o ~/.local/share/locale/"$lang"/LC_MESSAGES/greenTile@carsten_eu.mo "$po"
done
dbus-send --session --print-reply --dest=org.Cinnamon /org/Cinnamon org.Cinnamon.Eval \
  string:"imports.ui.extensionSystem.disableExtension('greenTile@carsten_eu'); imports.ui.extensionSystem.enableExtension('greenTile@carsten_eu'); 'reloaded'"
```

The first time, enable the extension in the Cinnamon settings. **gTile@shuairan must be disabled**, otherwise both extensions claim the same keys.

Check: `imports.ui.extensionSystem.runningExtensions` (an array) must contain `greenTile@carsten_eu`, and `~/.xsession-errors` must not show any `JS ERROR` mentioning `greenTile.js`.

## Switching from gTile

Settings and presets are stored per UUID under `~/.config/cinnamon/spices/`. To take them over:

```bash
mkdir -p ~/.config/cinnamon/spices/greenTile@carsten_eu
cp ~/.config/cinnamon/spices/gTile@shuairan/gTile@shuairan.json \
   ~/.config/cinnamon/spices/greenTile@carsten_eu/greenTile@carsten_eu.json
gsettings set org.cinnamon enabled-extensions "['greenTile@carsten_eu']"
```

Back to gTile: `gsettings set org.cinnamon enabled-extensions "['gTile@shuairan']"`. gTile's folder and settings are left untouched.

## Translations

All user-visible strings are English in the source and translated via gettext. The translation domain is the UUID `greenTile@carsten_eu`; compiled catalogs are installed to `~/.local/share/locale/<lang>/LC_MESSAGES/greenTile@carsten_eu.mo` (see the deploy steps above).

- `po/greenTile@carsten_eu.pot` is the template, `po/<lang>.po` are the translations. They were taken over from gTile, so strings added by greenTile are still untranslated in most languages; German is complete.
- After changing translatable strings in `greenTile.js`, `settings-schema.json` or `metadata.json`, run `./makepot.sh`. It regenerates the template with Cinnamon's `cinnamon-xlet-makepot` and merges it into every `.po` file. That tool needs the Python modules `polib` and `pytz`; see the comment at the top of `makepot.sh`.
- New language: `msginit -i po/greenTile@carsten_eu.pot -o po/<lang>.po -l <lang>`, then translate and deploy.
- Placeholders such as `%d` must be kept in the translation; the code fills them with `String.prototype.format`.

## Pitfalls

- Muffin 6.6: use `get_frame_rect()`; `get_outer_rect()` does not exist there.
- Hotkeys live in two files: the default in the schema and the user value in `~/.config/cinnamon/spices/greenTile@carsten_eu/greenTile@carsten_eu.json`. The user value wins.
- `Super+N` and `Super+Shift+N` belong to the window list applet; do not use them.
- gTile's `focusMetaWindow` goes stale when switching between windows of the same application. That is why tiling uses its own window collector.
- `grab-op-begin` and `grab-op-end` pass the display twice: `(display, display, window, op)`.
- Dragging the panel needs `Main.pushModal(actor)` **and** `device.grab(actor)` together, as in Cinnamon's `dnd.js`. Either one alone loses mouse events as soon as the pointer leaves the panel.
- Diagnostics: lines `greenTile skipped …` in `~/.xsession-errors` state why a window was not tiled.
- Reload via DBus Eval as shown above; restarting Cinnamon is not necessary for code changes.
- Exception, translations: gettext (glibc) caches catalogs per process, including the fact that a catalog is *missing*. New or changed `.mo` files therefore only take effect after restarting Cinnamon (`Ctrl+Alt+Esc`, or log out and in). Reloading the extension is not enough.

## License

greenTile is licensed, like gTile, under the [GNU General Public License, version 3](https://www.gnu.org/licenses/gpl-3.0.html). The full license text is in `LICENSE`.

- Original code: vibou, shuairan and the gTile contributors
- Modifications and additions: © 2026 carsten_eu
