/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * gettext binding: the `_` identifier is the xgettext keyword
 * (cinnamon-xlet-makepot scans all .js files recursively, so these strings are
 * found without makepot changes).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const UUID = 'greenTile@carsteneu';
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');
/**
 * @param {string} str
 * @returns {string}
 */
function _(str) {
    const customTranslation = Gettext.dgettext(UUID, str);
    if (customTranslation !== str) {
        return customTranslation;
    }
    return Gettext.gettext(str);
}

module.exports = { _ };
