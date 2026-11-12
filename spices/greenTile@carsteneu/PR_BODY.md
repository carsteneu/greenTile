This adds **greenTile**, a tiling extension for Cinnamon. Every window in its place.

greenTile tiles your Cinnamon desktop the moment a window opens. Start with sixteen editable presets, choose a layout from live preview cards, and let windows snap where you drop them. Turn it on per monitor and workspace; everything else happens on its own, or with one shortcut.

- **Auto mode** (`Super+Ctrl+A`): open a window and the grid makes room. Up to six windows share one row on a wide screen, beyond that they spread over full rows. Close one and the rest close the gap.
- **Presets you paint** (`Super+Ctrl+P`): choose from sixteen editable starters in a card grid with live previews, or paint your own in the 6 × 4 editor, with columns as wide as you like. Assign a preset to any monitor and workspace.
- **Drag to split**: hold a window over the edge of another. A preview shows the new column, stack or row before you let go.
- **Move borders**: drag an edge, or nudge it from the keyboard (`Super+Alt+Arrow`). Borders are remembered per window count.
- **Swap windows** (`Super+Ctrl+Arrow`): trade places with the neighbour, walk on to the next monitor and further onto the next workspace.
- **Never tile**: let a window float with one key (`Super+G`), or keep whole apps out of the grid with a list you fill from your installed applications. Dialogs and fixed-size windows float on their own.
- **A single window**: the last window on a workspace is centered at about 56 % of the width and 90 % of the height, fills the monitor, or is left untouched. Move or resize it and the tiling lets go: it stays where you put it, and a second window, a preset or `Super+Ctrl+A` takes it back.
- **Space at the screen edge**: set a margin between the tiled area and the screen (0–48 px), independent of the gap between windows. Off by default: at 0 the frames are exactly where they have always been.
- **Animation**: windows glide into place at their final size, so terminal text does not reflow; the duration is adjustable from 50 to 1000 ms (250 by default) and it can be switched off.
- **Wears your theme**: the preset panel picks up the accent color of your Cinnamon theme, live, or uses your own. Light, dark or automatic.
- **Order that survives a restart**: after a Cinnamon restart or a monitor replug, your windows come back in the order you left them (X11).

### Maintenance
I wrote greenTile and will maintain it here. Every new release will come as its own PR from my fork, titled `greenTile@carsteneu: ...`. Development and the issue tracker live at https://github.com/carsteneu/greenTile. The extension files in this PR are built from the tagged 2.4.2 release there and are the complete extension; there is no other or extended version. Translation updates sent to this repository are welcome: I take them back into my source tree before each update, so a later release does not overwrite them.

### Origin
greenTile started as a fork of gTile (`gTile@shuairan`); about 98 % of today's code is new, either rewritten or added since. The headers of the files that come from gTile keep the original attribution (vibou, shuairan and the gTile contributors), and the README credits them as well; everything is under GPL-3.0. greenTile is not meant to replace gTile, which keeps its grid approach. Both claim the same hotkeys, so only one of them should be enabled at a time; the README says so.

### Testing
Installed the way Cinnamon Spices installs extensions and tested with real windows on Linux Mint 21.3 (Cinnamon 6.0.4, the oldest supported version) and Linux Mint 22.3 (Cinnamon 6.6.9) under X11: loading without errors, auto mode, presets, the preset panel, swapping, drag and drop, the settings dialog, the translations, and restoring the window order after a Cinnamon restart. Newer Cinnamon versions are not verified yet. `validate-spice` and the pattern checker pass locally without findings.

The extension is self-contained: no runtime downloads, no bundled binaries or compiled translations, and all settings use the standard xlet settings. It ships 19 translations as `.po` files.

Beyond my own setups, reports from users on 4k and 3440×1440 ultrawide monitors, with display scaling between 125 % and 200 % and on Cinnamon 6.0.4, led to fixes and to the centered single-window mode in 2.2.1–2.2.6; the thread is [here](https://www.reddit.com/r/linuxmint/comments/1wzqar6/greentile_new_dynamic_tiling_manager_automatic/).


