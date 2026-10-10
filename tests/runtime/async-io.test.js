'use strict';
// No synchronous file I/O in the shipped runtime.
//
// Cinnamon's compositor has a single JS thread: a synchronous file call made while
// the shell starts up or right after a placement blocks everything. The Spices
// pattern checker (linuxmint/github-actions, pattern-checker/patterns/async-io.yml)
// warns on exactly these calls, and it scans raw text — a mention inside a comment
// counts — so this guard scans raw text too, with the checker's own expressions,
// plus GLib.mkdir_with_parents (the same blocking stat/mkdir walk, not covered by
// the checker) and the shell helpers Cinnamon marks as unsafe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

// Each entry: the checker's regex (minus the leading file-type group) and the name
// reported on a hit. The `(?!.*async)` lookahead is the checker's own trick: the
// async variant sits before the parenthesis (`.load_contents_async(`), so only the
// synchronous spelling matches. Without the `m` flag `.` stops at the line end,
// which is what the checker's per-line scan does.
const FORBIDDEN = [
    [/(g_file_load_contents|\.load_contents)\s*\((?!.*async)/, 'load_contents()'],
    [/(g_file_replace_contents|\.replace_contents)\s*\((?!.*async)/, 'replace_contents()'],
    [/(g_file_query_info|\.query_info)\s*\((?!.*async)/, 'query_info()'],
    [/(g_file_enumerate_children|\.enumerate_children)\s*\((?!.*async)/, 'enumerate_children()'],
    [/(g_file_test|GLib\.file_test)\s*\(/, 'file_test()'],
    [/(g_file_query_exists|\.query_exists)\s*\(/, 'query_exists()'],
    [/GLib\.file_get_contents\s*\(/, 'file_get_contents()'],
    [/Cinnamon\.get_file_contents_utf8_sync\s*\(/, 'get_file_contents_utf8_sync()'],
    [/GLib\.mkdir_with_parents\s*\(/, 'mkdir_with_parents()'],
];

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
        return walk(full);
    }
    return entry.name.endsWith('.js') ? [full] : [];
});

test('the shipped runtime makes no synchronous file call', () => {
    const files = [...walk(path.join(ROOT, 'lib')), path.join(ROOT, 'extension.js')];
    assert.ok(files.length > 30, 'the walk found the runtime (' + files.length + ' files)');
    const hits = [];
    for (const file of files) {
        fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
            for (const [pattern, what] of FORBIDDEN) {
                if (pattern.test(line)) {
                    hits.push(path.relative(ROOT, file) + ':' + (index + 1) + ' ' + what + ' => ' + line.trim());
                }
            }
        });
    }
    assert.deepEqual(hits, [], 'synchronous file I/O in the shipped runtime:\n' + hits.join('\n'));
});

test('the store and the accent sheet still use the asynchronous calls', () => {
    // The guard above must not be satisfiable by dropping the file access: both
    // components keep their asynchronous API.
    const orders = fs.readFileSync(path.join(ROOT, 'lib', 'runtime', 'orders.js'), 'utf8');
    const theme = fs.readFileSync(path.join(ROOT, 'lib', 'runtime', 'theme.js'), 'utf8');
    for (const call of ['query_info_async', 'load_contents_async', 'replace_contents_bytes_async', 'make_directory_async']) {
        assert.ok(orders.includes(call) || theme.includes(call), 'no asynchronous ' + call + ' anywhere');
    }
});
