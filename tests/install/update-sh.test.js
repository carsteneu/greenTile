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
    runScript, copyScript, makeWgetOnlyBin,
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
    assert.ok(fs.readFileSync(path.join(x.home, EXT, 'LICENSE'), 'utf8')
        .trim().startsWith('GNU GENERAL PUBLIC LICENSE'), 'the installed update carries the license');
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

test('API returns no tag: the releases/latest redirect fallback takes over', () => {
    const { x, script } = setup('update-head-fallback', 'none');
    const r = runScript(script, [], { ...x.env, GT_CURL_API_FAIL: '1' });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(installedVersion(x.home), LATEST);
    assert.equal(downloadedVersion(x.stublog), LATEST);
});

test('download failure: clear error and no change to an existing installation', () => {
    const { x, script } = setup('update-dl-fail', '1.2.0');
    const r = runScript(script, [], { ...x.env, GT_CURL_DL_FAIL: '1' });
    assert.ok(r.status !== 0, 'download failure must fail the run');
    assert.ok(r.stderr.includes('download failed'), `stderr: ${r.stderr}`);
    assert.equal(installedVersion(x.home), '1.2.0');
});

// issue 14: the downloader's transfer status must gate the answer, so a
// truncated response that already contains a tag is not taken as confirmed
test('partial API transfer error: the printed tag is discarded and the redirect fallback takes over', () => {
    const { x, script } = setup('update-api-partial', '1.2.0');
    const r = runScript(script, [], { ...x.env, GT_CURL_API_PARTIAL: '1' });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // the api.github.com URL ends in releases/latest too, so match the
    // redirect host exactly to prove the fallback was actually consulted
    assert.ok(fs.readFileSync(x.stublog, 'utf8').split('\n')
        .includes('curl https://github.com/carsteneu/greenTile/releases/latest'),
    'a partial API answer must not skip the documented redirect fallback');
    assert.equal(installedVersion(x.home), LATEST);
    assert.equal(downloadedVersion(x.stublog), LATEST);
});

test('partial API transfer error with failing fallback: abort, existing installation untouched', () => {
    const { x, script } = setup('update-api-partial-nohead', '1.2.0');
    const r = runScript(script, [], { ...x.env, GT_CURL_API_PARTIAL: '1', GT_CURL_HEAD_FAIL: '1' });
    assert.equal(r.status, 1, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.ok(r.stderr.includes('could not determine the latest release'), `stderr: ${r.stderr}`);
    assert.equal(installedVersion(x.home), '1.2.0');
    assert.equal(downloadedVersion(x.stublog), null);
});

test('partial redirect transfer error: not confirmed, abort with untouched installation', () => {
    const { x, script } = setup('update-head-partial', '1.2.0');
    const r = runScript(script, [], { ...x.env, GT_CURL_API_FAIL: '1', GT_CURL_HEAD_PARTIAL: '1' });
    assert.equal(r.status, 1, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.ok(r.stderr.includes('could not determine the latest release'), `stderr: ${r.stderr}`);
    assert.equal(installedVersion(x.home), '1.2.0');
    assert.equal(downloadedVersion(x.stublog), null);
});

// issue 14 on the wget path: url_get uses wget when curl is unavailable, and
// the same transfer-status gate has to hold there. Runs on a PATH that has no
// curl at all, so wget is provably the downloader.
test('wget-only host: a successful answer installs', () => {
    const { x, script } = setup('update-wget-ok', '1.2.0');
    const r = runScript(script, [], { ...x.env, PATH: makeWgetOnlyBin(x.dir) });
    assert.equal(r.status, 0, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.ok(fs.readFileSync(x.stublog, 'utf8').includes('wget https://api.github.com/'),
        'wget must have fetched the release');
    assert.equal(installedVersion(x.home), LATEST);
    assert.equal(downloadedVersion(x.stublog), LATEST);
});

test('wget-only host: a parsable partial answer is discarded and the run aborts untouched', () => {
    const { x, script } = setup('update-wget-partial', '1.2.0');
    const r = runScript(script, [], {
        ...x.env,
        PATH: makeWgetOnlyBin(x.dir),
        GT_CURL_API_PARTIAL: '1',
    });
    assert.equal(r.status, 1, `stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.ok(fs.readFileSync(x.stublog, 'utf8').includes('wget https://api.github.com/'),
        'wget must have fetched the release answer, so the abort proves the discarded answer');
    assert.ok(r.stderr.includes('could not determine the latest release'), `stderr: ${r.stderr}`);
    assert.equal(installedVersion(x.home), '1.2.0');
    assert.equal(downloadedVersion(x.stublog), null);
});
