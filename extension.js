/*
 * greenTile — window tiling extension for Cinnamon
 *
 * Modified version of 5.4/extension.js from gTile (UUID gTile@shuairan),
 * version 2.2.1, by vibou, shuairan and the gTile contributors.
 * Modified by carsten_eu, 2026-09-28: loads ./greenTile instead of ./gTile.
 * Modified by carsten_eu, 2026-09-30: greenTile exports init/enable/disable directly (webpack bootstrap removed).
 * Modified by carsten_eu, 2026-10-01: the greenTile module alias (gtile) is renamed to greenTile.
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */
const greenTile = require('./greenTile');

/**
 * called when extension is loaded
 */
function init(metadata) {
    //extensionMeta holds your metadata.json info
    greenTile.init(metadata);
}

/**
 * called when extension is loaded
 */
function enable() {
    greenTile.enable();
}

/**
 * called when extension gets disabled
 */
function disable() {
    greenTile.disable();
}