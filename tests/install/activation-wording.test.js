'use strict';
// The activation wording of the release scripts: an install or update replaces
// FILES, it does not activate code in a running Cinnamon. Both scripts must say
// so — a user who reads only "installed" otherwise believes the new library
// code is live, while the running process keeps what it loaded at startup
// (pinned in tests/architecture/native-reload-limitation.test.js).
const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LATEST, makeEnv, seedInstalled, installedVersion, runScript, copyScript } = require('../helpers/release-env');

const cleanups = [];
after(() => {
    for (const dir of cleanups) {fs.rmSync(dir, { recursive: true, force: true });}
});

// the phrases the message must carry: files installed vs code active, where the
// activation comes from, and that the X11 restart has no Wayland equivalent
const REQUIRED = [
    'The files on disk are the new version now',
    're-reads only extension.js',
    'becomes active after a Cinnamon restart',
    'Wayland has no such restart',
];

// and the claim the message must NOT make: that installing or reloading already
// activated the new library code
const FORBIDDEN = /\b(now|already)\s+(live|active)\b|is now running/i;

const assertActivationWording = (out) => {
    for (const phrase of REQUIRED) {
        assert.ok(out.includes(phrase), `installer output must state "${phrase}", got:\n${out}`);
    }
    assert.doesNotMatch(out, FORBIDDEN, `installer output must not claim activation, got:\n${out}`);
};

test('install.sh: reports installed files and says that replaced library code needs a Cinnamon restart', () => {
    const x = makeEnv('activation-install');
    cleanups.push(x.dir);
    seedInstalled(x.home, 'none');
    const script = path.join(x.dir, 'zipstage', `greenTile-${LATEST}`, 'install.sh');
    const r = runScript(script, [], x.env);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('installed to'), `stdout: ${r.stdout}`);
    assertActivationWording(r.stdout);
    assert.equal(installedVersion(x.home), LATEST, 'the install itself still succeeded');
});

test('update.sh: the update flow carries the same activation wording', () => {
    const x = makeEnv('activation-update');
    cleanups.push(x.dir);
    seedInstalled(x.home, '1.0.0');
    const script = copyScript(x.dir, 'update.sh');
    const r = runScript(script, [], x.env);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes(`Updating greenTile 1.0.0 -> ${LATEST}`), `stdout: ${r.stdout}`);
    assertActivationWording(r.stdout);
    assert.equal(installedVersion(x.home), LATEST);
});
