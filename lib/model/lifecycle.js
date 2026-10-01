/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * lifecycle model, extracted verbatim from the marked pure model block in
 * greenTile.js (no Cinnamon imports). Author of the model code: carsten_eu.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Tracks the current pending operation: begin() marks a new one and returns its token,
// is_current() tells whether that token may still act, invalidate() drops everything
// in flight (teardown). A superset of the old ++epoch monitor-refresh guard.
const pendingRegistry = () => {
    let epoch = 0;
    return {
        begin: () => ++epoch,
        is_current: (token) => token === epoch,
        invalidate: () => epoch++,
    };
};

module.exports = {
    pendingRegistry,
};
