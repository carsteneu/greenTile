'use strict';
// update.sh behavior in isolation: every test runs a copy of the script under
// its own fake HOME with the stub curl from tests/helpers/release-env.js, so
// the "latest release", its zip and the downloads are all simulated. Covers
// the missing/broken metadata handling (no silent set -e aborts, working
// --force on a fresh install) and the version decision matrix.
const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
    EXT, LATEST, makeEnv, seedInstalled, installedVersion, downloadedVersion,
    runScript, copyScript,
} = require('../helpers/release-env');
const path = require('node:path');

const cleanups = [];
after(() => {
    for (const dir of cleanups) {fs.rmSync(dir, { recursive: true, force: true });}
});

// one isolated world per test: fake HOME, stub curl, fixture zip, script copy
function setup(name, installed) {
    const x = makeEnv(name);
    cleanups.push(x.dir);
    seedInstalled(x.home, installed);
    const script = copyScript(x.dir, 'update.sh');
    return { x, script };
}

test('no installation present: installs and reaches the Installing message', () => {
    const { x, script } = setup('update-fresh', 'none');
    const r = runScript(script, [], x.env);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes(`Installing greenTile ${LATEST} …`), `stdout: ${r.stdout}`);
    assert.equal(installedVersion(x.home), LATEST);
    assert.equal(downloadedVersion(x.stublog), LATEST);
});

test('no installation present: --force installs too', () => {
    const { x, script } = setup('update-fresh-force', 'none');
    const r = runScript(script, ['--force'], x.env);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes(`Installing greenTile ${LATEST} …`), `stdout: ${r.stdout}`);
    assert.equal(installedVersion(x.home), LATEST);
});

test('same version installed: reports up to date and does not download', () => {
    const { x, script } = setup('update-same', LATEST);
    // the release lookup necessarily runs first; only the download must not
    const r = runScript(script, [], { ...x.env, GT_CURL_DL_FAIL: '1' });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes(`greenTile ${LATEST} is already installed`), `stdout: ${r.stdout}`);
    assert.equal(installedVersion(x.home), LATEST);
    assert.equal(downloadedVersion(x.stublog), null);
});

test('same version installed with --force: reinstalls despite current version', () => {
    const { x, script } = setup('update-same-force', LATEST);
    const r = runScript(script, ['--force'], x.env);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(!r.stdout.includes('already installed'), `stdout: ${r.stdout}`);
    assert.equal(downloadedVersion(x.stublog), LATEST);
    assert.equal(installedVersion(x.home), LATEST);
});

test('older version installed: updates to the latest', () => {
    const { x, script } = setup('update-older', '1.2.0');
    const r = runScript(script, [], x.env);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('Updating greenTile 1.2.0 -> 9.9.9 …'), `stdout: ${r.stdout}`);
    assert.equal(installedVersion(x.home), LATEST);
    assert.equal(downloadedVersion(x.stublog), LATEST);
});

test('newer local version: still updates (reported as Updating)', () => {
    const { x, script } = setup('update-newer', '10.0.0');
    const r = runScript(script, [], x.env);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes('Updating greenTile 10.0.0 -> 9.9.9 …'), `stdout: ${r.stdout}`);
    assert.equal(installedVersion(x.home), LATEST);
    // a downgrade still replaces the modules wholesale
    assert.ok(fs.existsSync(path.join(x.home, EXT, 'lib', 'core.js')));
});

test('broken metadata.json without --force: clear error, untouched installation', () => {
    const { x, script } = setup('update-broken', 'broken');
    const r = runScript(script, [], x.env);
    assert.ok(r.status !== 0, `expected failure, got status ${r.status} stdout ${r.stdout}`);
    assert.ok(r.stderr.length > 0, 'must explain the failure on stderr');
    assert.ok(!r.stdout.includes('Installing greenTile'), `must not report a plain install: ${r.stdout}`);
    assert.equal(installedVersion(x.home), 'broken');
    assert.equal(downloadedVersion(x.stublog), null);
});

test('broken metadata.json with --force: continues to a clean reinstall', () => {
    const { x, script } = setup('update-broken-force', 'broken');
    const r = runScript(script, ['--force'], x.env);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(installedVersion(x.home), LATEST);
});

test('existing target folder without metadata.json: installs, no abort', () => {
    const { x, script } = setup('update-dir-only', 'dir-only');
    const r = runScript(script, [], x.env);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.includes(`Installing greenTile ${LATEST} …`), `stdout: ${r.stdout}`);
    assert.equal(installedVersion(x.home), LATEST);
});

test('unreachable release URL: claims it cannot determine the latest release', () => {
    const { x, script } = setup('update-api-fail', 'none');
    const r = runScript(script, [], { ...x.env, GT_CURL_API_FAIL: '1', GT_CURL_HEAD_FAIL: '1' });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('could not determine the latest release'), `stderr: ${r.stderr}`);
    assert.equal(installedVersion(x.home), null);
});

test('download failure: clear error and no change to an existing installation', () => {
    const { x, script } = setup('update-dl-fail', '1.2.0');
    const r = runScript(script, [], { ...x.env, GT_CURL_DL_FAIL: '1' });
    assert.ok(r.status !== 0, 'download failure must fail the run');
    assert.ok(r.stderr.includes('download failed'), `stderr: ${r.stderr}`);
    assert.equal(installedVersion(x.home), '1.2.0');
});
