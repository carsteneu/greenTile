/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * teardown model, extracted verbatim from the marked pure model block in
 * greenTile.js (no Cinnamon imports). Author of the model code: carsten_eu.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Disconnects every [target, ...ids] entry; a throwing disconnect (signal already
// gone) is swallowed so every entry is attempted — callers then reset their lists.
const disconnectEach = (entries) => {
    for (const [target, ...ids] of entries)
        for (const id of ids) {
            try {
                target.disconnect(id);
            }
            catch (e) {
                // signal was already gone
            }
        }
};

module.exports = {
    disconnectEach,
};
