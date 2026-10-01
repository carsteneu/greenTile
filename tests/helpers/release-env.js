'use strict';
// Integration scaffolding for the shell release scripts: every test runs the
// copied scripts under a fake HOME with a stub curl on PATH, so neither the
// repository nor the live installation is touched and no network is reached.
// All fixtures live under .yesmem/tmp (git-ignored, wiped with the worktree).
const fs = require('node:fs');
const path = require('node:path');
const spawn = require('node:child_process').spawnSync;
const { ROOT } = require('./cinnamon-loader');

const UUID = 'greenTile@carsteneu';
const TMP = path.join(ROOT, '.yesmem', 'tmp');

// fail fast with a clear message instead of confusing per-test failures
// when the host lacks the system tools the scripts and fixtures rely on
const toolPath = (t) => {
    const r = spawn('which', [t], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : '';
};
const REAL_MV = toolPath('mv');
if (['mv', 'zip', 'unzip', 'msgfmt'].some((t) => !toolPath(t))) {
    throw new Error('shell-script tests need the mv, zip, unzip and msgfmt tools on PATH');
}
// Version the curl stub serves from .../releases/latest
const LATEST = '9.9.9';

const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const write = (p, data) => {
    mkdir(path.dirname(p));
    fs.writeFileSync(p, data);
};

// curl stub: logs every URL to $GT_STUBLOG so tests can assert whether a
// download was attempted, and fails selectively via GT_*_FAIL.
const CURL_STUB = `#!/usr/bin/env bash
set -eu
url=""; out=""
while [ $# -gt 0 ]; do
    case "$1" in
        -fsSL) ;;
        -fsSI) head=1 ;;
        -o) out="$2"; shift ;;
        *) url="$1" ;;
    esac
    shift
done
echo "curl $url" >> "\${GT_STUBLOG:?}"
case "\${url#*://}" in
    api.github.com/*)
        [ -n "\${GT_CURL_API_FAIL:-}" ] && { exit 22; }
        printf '{"tag_name": "v%s"}\\n' "\${GT_VERSION:?}"
        ;;
    *github.com/*releases/latest)
        [ -n "\${GT_CURL_HEAD_FAIL:-}" ] && { exit 22; }
        printf 'location: https://github.com/carsteneu/greenTile/releases/tag/v%s\\r\\n' "\${GT_VERSION:?}"
        ;;
    *releases/download*)
        [ -n "\${GT_CURL_DL_FAIL:-}" ] && { exit 22; }
        [ -n "$out" ] || { echo "curl stub: download without -o" >&2; exit 2; }
        cp "\${GT_ZIP:?}" "$out"
        ;;
    *)
        echo "curl stub: unexpected url $url" >&2
        exit 2
        ;;
esac
`;

// Builds the release-zip fixture with the layout build-release.sh produces:
// greenTile-<version>/ containing install.sh (the repo's real one, so the
// update flow exercises it under the fake HOME) and the extension folder with
// two .po translations that the real msgfmt can compile.
function makeFixtureZip(dir, version) {
    const stage = path.join(dir, 'zipstage', `greenTile-${version}`);
    mkdir(path.join(stage, UUID, 'po'));
    fs.copyFileSync(path.join(ROOT, 'install.sh'), path.join(stage, 'install.sh'));
    const ext = path.join(stage, UUID);
    write(path.join(ext, 'metadata.json'), `{\n    "uuid": "${UUID}",\n    "version": "${version}"\n}\n`);
    write(path.join(ext, 'extension.js'), `// fixture ${version}\n`);
    write(path.join(ext, 'settings-schema.json'), '{}\n');
    write(path.join(ext, 'stylesheet.css'), '.fixture {}\n');
    write(path.join(ext, 'icon.png'), 'png\n');
    write(path.join(ext, 'lib', 'core.js'), 'var core = 1;\n');
    write(path.join(ext, 'lib', 'util.js'), 'var util = 1;\n');
    // the release zip ships the license inside the extension folder (issue 11)
    fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(ext, 'LICENSE'));
    const po = (id) => `msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgid "a"\nmsgstr "${id}"\n`;
    write(path.join(ext, 'po', 'de.po'), po('de'));
    write(path.join(ext, 'po', 'it.po'), po('it'));

    const zipPath = path.join(dir, `greenTile-${version}.zip`);
    const r = spawn('zip', ['-qr', zipPath, `greenTile-${version}`], { cwd: path.join(dir, 'zipstage'), encoding: 'utf8' });
    if (r.status !== 0) {
        throw new Error(`zip fixture failed: ${r.stderr}`);
    }
    return zipPath;
}

// Creates <dir>/{home,bin} plus the release-zip fixture and returns the env to
// pass to runScript: HOME is private, PATH puts the stub curl first.
function makeEnv(name) {
    const dir = fs.mkdtempSync(path.join(TMP, `${name}-`));
    const home = path.join(dir, 'home');
    const bin = path.join(dir, 'bin');
    mkdir(home);
    mkdir(bin);
    write(path.join(bin, 'curl'), CURL_STUB);
    fs.chmodSync(path.join(bin, 'curl'), 0o755);
    const stublog = path.join(dir, 'stub.log');
    write(stublog, '');
    const zipPath = makeFixtureZip(dir, LATEST);
    return {
        dir,
        home,
        bin,
        stublog,
        zipPath,
        env: {
            HOME: home,
            PATH: `${bin}:${process.env.PATH}`,
            GT_VERSION: LATEST,
            GT_STUBLOG: stublog,
            GT_ZIP: zipPath,
        },
    };
}

const EXT = path.join('.local', 'share', 'cinnamon', 'extensions', UUID);

// Pre-install helper for fake HOMEs: 'none' removes the extension dir, a
// version string writes a matching metadata.json plus an old lib module,
// 'broken' writes junk metadata, and 'dir-only' leaves an empty folder.
function seedInstalled(home, state) {
    const dest = path.join(home, EXT);
    fs.rmSync(dest, { recursive: true, force: true });
    if (state === 'none') {
        return dest;
    }
    if (state === 'broken') {
        mkdir(dest);
        write(path.join(dest, 'metadata.json'), '{\n    "uuid": "greenTile@carsteneu",\n    "version": \n');
        return dest;
    }
    if (state === 'dir-only') {
        mkdir(dest);
        return dest;
    }
    write(path.join(dest, 'metadata.json'), `{\n    "uuid": "${UUID}",\n    "version": "${state}"\n}\n`);
    mkdir(path.join(dest, 'lib'));
    write(path.join(dest, 'lib', 'old.js'), 'var old = 1;\n');
    return dest;
}

const installedVersion = (home) => {
    const meta = path.join(home, EXT, 'metadata.json');
    if (!fs.existsSync(meta)) {
        return null;
    }
    const m = fs.readFileSync(meta, 'utf8').match(/"version": *"([^"]*)"/);
    return m === null ? 'broken' : m[1];
};
const downloadedVersion = (stublog) => {
    if (!fs.existsSync(stublog)) {return null;}
    const line = fs.readFileSync(stublog, 'utf8').split('\n')
        .filter((l) => l.includes('releases/download')).pop();
    if (line === undefined) {return null;}
    return (line.match(/greenTile-([^/]+)\.zip/) || [])[1] || null;
};

// Runs a copied shell script under the prepared env; never throws on a
// non-zero exit — the caller inspects status/stdout/stderr.
function runScript(scriptPath, args, env) {
    const r = spawn('bash', [scriptPath, ...args], {
        cwd: path.dirname(scriptPath),
        env,
        encoding: 'utf8',
    });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
const copyScript = (dir, name) => {
    const dst = path.join(dir, name);
    fs.copyFileSync(path.join(ROOT, name), dst);
    return dst;
};

module.exports = {
    UUID, TMP, LATEST, EXT, REAL_MV,
    makeFixtureZip, makeEnv, seedInstalled,
    installedVersion, downloadedVersion,
    runScript, copyScript, mkdir, write,
};
