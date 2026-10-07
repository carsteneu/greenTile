'use strict';
// Single source of truth for "which lines carry the release version", shared by
// the consistency guard and the bump-script tests. metadata.json is the
// reference; every other marker must equal it. Today: 24 markers in 23 files —
// metadata.json, package.json, package-lock.json (two lines), po/*.po (19) and
// the pot template. scripts/bump-version.sh must edit exactly this set.
const fs = require('node:fs');
const path = require('node:path');

const UUID = 'greenTile@carsteneu';
const POT = `po/${UUID}.pot`;

// Every file carrying a version marker, relative to a repo root, po/ sorted.
function markerFiles(root) {
    const pos = fs.readdirSync(path.join(root, 'po'))
        .filter((name) => name.endsWith('.po'))
        .sort()
        .map((name) => path.join('po', name));
    return ['metadata.json', 'package.json', 'package-lock.json', POT, ...pos];
}

function readVersion(root) {
    return JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8')).version;
}

// "Project-Id-Version: greenTile X.Y.Z\n" — the version sitting in the po header.
const PO_HEADER = /^"Project-Id-Version: greenTile ([^\\"]*)\\n"$/m;

// Every (file, value) marker in the tree. JSON entries are read structurally;
// the catalogs through their exact Project-Id-Version header line. A missing
// marker yields value === undefined rather than being silently dropped.
function collectMarkers(root) {
    const markers = [];
    const add = (file, value) => markers.push({ file, value });

    const meta = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8'));
    add('metadata.json', meta.version);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    add('package.json', pkg.version);
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    add('package-lock.json', lock.version);
    add('package-lock.json', lock.packages && lock.packages[''] ? lock.packages[''].version : undefined);

    for (const rel of markerFiles(root)) {
        if (!rel.endsWith('.po') && rel !== POT) {
            continue;
        }
        const text = fs.readFileSync(path.join(root, rel), 'utf8');
        const m = text.match(PO_HEADER);
        add(rel, m ? m[1] : undefined);
    }
    return markers;
}

// Human-readable mismatch descriptions, empty when every marker agrees.
function findMismatches(root) {
    const expected = readVersion(root);
    return collectMarkers(root)
        .filter((marker) => marker.value !== expected)
        .map((marker) => `${marker.file}: ${marker.value === undefined ? 'no marker found' : marker.value} (expected ${expected})`);
}

module.exports = { UUID, POT, markerFiles, readVersion, collectMarkers, findMismatches };
