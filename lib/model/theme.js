/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * theme model, extracted verbatim from the marked pure model block in
 * greenTile.js (no Cinnamon imports). Author of the model code: carsten_eu.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// The preset panel follows the desktop. "system" resolves the x-apps portal color
// scheme ('prefer-dark'/'prefer-light'); 'default' or a missing schema falls back to
// the Cinnamon theme name (Mint's dark themes carry "Dark" in their name), then light.
// "light"/"dark" override the system, whatever it says.
const tile_theme_resolve = (setting, colorScheme, themeName) => {
    if (setting === 'light' || setting === 'dark')
        return setting;
    if (colorScheme === 'prefer-dark')
        return 'dark';
    if (colorScheme === 'prefer-light')
        return 'light';
    return /dark/i.test(String(themeName || '')) ? 'dark' : 'light';
};
// The header toggle switches between light and dark only; the panelTheme setting
// written is the opposite of the theme currently SHOWN, so "system" is overridden
// by a click. "Follow system" is selectable again in the settings dialog.
const tile_theme_toggle_target = (theme) => (theme === 'light' ? 'dark' : 'light');

module.exports = {
    tile_theme_resolve,
    tile_theme_toggle_target,
};
