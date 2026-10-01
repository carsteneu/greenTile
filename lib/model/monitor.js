/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * monitor model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Stable monitor identity from the DisplayConfig tuple (connector, vendor, product,
// serial): the key survives rearrangements and re-plugging, identical models are
// separated by serial, and panels with a zero serial (typical laptop screens) by
// the connector. Workspace key '*' covers all workspaces of non-primary monitors
// when workspaces-only-on-primary is on.
const monitorKey = (connector, vendor, product, serial) => {
    const base = vendor + '|' + product + '|' + serial;
    return (!serial || /^(0x)?0+$/.test(serial)) ? base + '|' + connector : base;
};
const monitorFallbackKey = (name, width, height) => 'name:' + name + '|' + width + 'x' + height;
const monitorStates = (monitors) => {
    if (!Array.isArray(monitors)) {
        return [];
    }
    const states = [];
    for (const item of monitors) {
        if (!Array.isArray(item) || !Array.isArray(item[0]) || !item[0][0]) {
            continue;
        }
        const [connector, vendor, product, serial] = item[0];
        states.push({ connector: connector, key: monitorKey(connector, vendor, product, serial) });
    }
    return states;
};
const monitorWsKey = (wsIndex, isPrimary, onlyPrimary) => {
    return (onlyPrimary && !isPrimary) ? '*' : String(wsIndex + 1);
};
const monitorLabels = (names, connectors) => {
    const duplicate = (name) => names.indexOf(name) !== names.lastIndexOf(name);
    return names.map((name, i) => {
        if (!duplicate(name)) {
            return name;
        }
        return name + ' (' + (connectors[i] || i + 1) + ')';
    });
};

module.exports = {
    monitorKey,
    monitorFallbackKey,
    monitorStates,
    monitorWsKey,
    monitorLabels,
};
