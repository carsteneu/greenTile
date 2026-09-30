# greenTile features

Every feature in one line or two. Details and screenshots are in the [README](README.md).

## Tiling

- **Auto mode**: tiles the windows of a monitor and workspace automatically. Switched per monitor and workspace with `Super+Ctrl+A` / `Super+Ctrl+D` or in the preset panel; on by default where a preset is assigned.
- **Auto retile**: opening, closing, minimizing or restoring a window retiles its monitor after 300 ms. Dialogs are ignored.
- **Retile on workspace switch**: switching to a workspace with auto mode on tiles it again.
- **Auto grid**: the layout used without a preset. From 2100 px width up to 6 windows in a row, then evenly filled full-width rows; on narrower monitors up to 3 in a row, then 3 columns with stacks.
- **Screen-position order**: windows are placed in the order they already have on screen, so a hand-made arrangement is kept.
- **Active workspace only**: only visible windows of the active workspace are tiled; minimized windows and other workspaces are left alone.
- **Fixed columns**: `Super+Ctrl+3` and `Super+Ctrl+6` tile the windows of the focused monitor into 3 or 6 columns of equal width, in screen order; works without auto mode.
- **Panel-aware work area**: Cinnamon panels that do not auto-hide are kept free; tiled windows are unmaximized first.
- **Snap on release**: a window moved by hand snaps into the slot where it is dropped; its neighbours move up.
- **Cross-monitor moves**: dragging a window to another monitor retiles both monitors.
- **Animation**: windows glide into place in 250 ms. The window gets its final size at once, only the picture moves, so terminal text does not flicker. Can be turned off (**Animate tiling**).
- **Window gap**: 0 to 48 px between tiled windows, set in the preset panel. Only inner edges move; windows stay flush with the screen edges.

## Presets

- **Presets**: named layouts made of rules by window count. Each rule sets the columns and how many windows each column stacks.
- **Per monitor and workspace**: every monitor and workspace can have its own preset.
- **Gap-free fill**: no cell stays empty: with fewer windows, stacked cells and then columns are dropped; with more windows, the rightmost column takes the rest.
- **Pause**: `Super+Ctrl+D` pauses an assigned preset without removing it.

## Preset panel

- **Panel**: `Super+Ctrl+P` opens the list of presets for the monitor of the focused window, titled with workspace and monitor name.
- **Live thumbnails**: each row shows the layout a click would produce with the current number of windows.
- **Assignment marker**: the assigned preset is highlighted and marked with the workspace number; ✕ removes the assignment.
- **One-click assign**: a click assigns the preset and tiles at once; the panel stays open for trying more.
- **Auto switch**: the title bar shows and toggles auto mode (green = on).
- **Reset sizes**: returns moved borders and dragged layouts of this monitor and workspace to equal sizes.
- **Movable and resizable**: drag the title bar to move, ◢ to resize. Position and size are kept and fit the current monitor.
- **Closes like a popup**: `Esc`, ✕, a click outside or a newly focused window closes it; the click still reaches its target.
- **Settings shortcut**: ⚙ opens the extension settings.
- **Follows the workspace**: switching workspaces while the list is open updates title, assignment and thumbnails.
- **Scrolling list**: with many presets the list scrolls instead of growing off screen.

## Preset editor

- **Rule list**: add, select and delete rules; "from N" sets the window count a rule starts at, changed with − / +.
- **Painter**: 6 × 4 grid. Click or drag to set how many windows each column holds, right-click removes a column.
- **Result line**: shows the column stacks of the selected rule, e.g. `[1,2,2]`.
- **Name check**: a preset cannot be saved without a name.
- **Save and retile**: saving a preset in use retiles right away. `Esc` or ← Back discards the draft.
- **Delete preset**: the solid red button right of Save deletes the preset after an inline confirmation and removes its workspace assignments. Hidden for a new, not-yet-saved preset. `Enter` always runs Save.

## Adjusting layouts

- **Moving borders by mouse**: drag a tiled window's edge; the shared border moves and the neighbours follow. Corners move both axes.
- **Moving borders by keyboard**: `Super+Alt+Arrow` makes the focused window wider, narrower, taller or shorter. A tap moves 1 px, holding speeds up to 64 px per step.
- **Minimum size**: no window gets smaller than 120 px.
- **Borders per window count**: borders are remembered per monitor, workspace and window count and survive resolution and gap changes.
- **Split by drag**: dropping a window on the outer 25 % of another window's cell stacks it above or below, or opens a new column or row beside it. A translucent preview shows the result before release.
- **Cross-monitor split**: split drops also work onto another monitor.
- **Swap by keyboard**: `Super+Ctrl+Arrow` swaps the focused window with its neighbour; borders stay where they are.
- **Walk across monitors and workspaces**: Left/Right continue onto the next monitor and past the outermost one onto the previous or next workspace. Focus stays on the moved window.

## Excluding windows

- **Never tile list**: rows matching window class, title or app id are never tiled and do not count for the layout.
- **App picker**: adds an installed application to the list by its app id, including flatpaks. The app list updates when software is installed or removed.
- **Float one window**: `Super+G` lets the focused window float until pressed again or the window closes; an on-screen message confirms the state.

## Multiple monitors

- **Stable monitor keys**: monitors are recognised by vendor, product and serial (plus connector for identical panels), so replugging or rearranging keeps assignments.
- **Settle after hotplug**: after a monitor change greenTile waits until windows have moved and then retiles once.
- **Workspaces only on primary**: with this Muffin setting, secondary monitors use one layout for all workspaces. Read live.
- **Automatic migration**: old per-workspace settings are converted once into per-monitor entries.

## Appearance

- **Panel theme**: follow the desktop, or always light or dark; toggle with the sun/moon button.
- **Accent color**: taken from the current Cinnamon theme (updates live) or a custom color.
- **State color**: color of "Auto: on" and assigned rows: green, theme accent or custom.

## General

- **Configurable hotkeys**: every key can be changed on the **Hotkeys** settings page.
- **Live settings**: changes to hotkeys, the never tile list and colors apply without reloading.
- **Translations**: all strings go through gettext; German is complete.
- **Release zip with installer**: `install.sh` installs the extension and compiles the translations.
- **Diagnostics**: `~/.xsession-errors` logs which windows were skipped and why (minimized, excluded, other monitor, no app, window type).
