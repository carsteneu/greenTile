'use strict';
// Simulation of the GJS native importer for the shipped xlet tree. Both loader
// generations resolve `imports.extensions['greenTile@carsteneu']`: Cinnamon 6.6
// main.js caches the xlet directories on the imports root
// (_addXletDirectoriesToSearchPath); upstream keeps that same call (6.7.8
// main.js:248) even though installXletImporter hands the xlet a SEPARATE
// importer object for extension.imports (a fresh `imports[uuid]` resolved under
// a temporarily narrowed searchPath, verified distinct from the cached
// imports.extensions[uuid] tree on the installed engine).
//
// Native module semantics (upstream js/ui/extension.js documents them in the
// _requireLocal fallback: "let/const/class values are inaccessible via the
// native module object"): only top-level `var` declarations and `function`
// declarations are visible on a module namespace. Repeated access returns the
// same cached namespace; clearCache drops it so the next access re-evaluates
// (xlet reload). Re-entrant imports during evaluation are rejected — the real
// importer either throws or returns a partially initialized namespace, and the
// shipped graph is acyclic, so the strict behavior keeps negative tests
// meaningful.
//
// I/O is injectable (`read`, `listDir`) so the semantics tests run against
// synthetic fixtures; production passes Node fs wrappers over the repo root.

const assert = require('node:assert/strict');
const fs = require('node:fs');

const VAR_NAME_RE = /^var\s+([A-Za-z_$][\w$]*)/gm;
const FUNCTION_NAME_RE = /^function\s+([A-Za-z_$][\w$]*)/gm;

const scanNames = (src, re) => {
    const out = [];
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(src)) !== null) {
        out.push(match[1]);
    }
    return out;
};

/**
 * Public names of a natively imported module: every column-0 `var` and
 * `function` declaration. The shipped files keep every top-level statement on
 * one line, so column 0 is the module top level (same convention the
 * zero-module-state guard relies on).
 * @param {string} src
 * @returns {string[]}
 */
const publicNames = (src) => [...scanNames(src, VAR_NAME_RE), ...scanNames(src, FUNCTION_NAME_RE)];

/**
 * @typedef {Object} ImporterOptions
 * @property {string} root absolute path of the xlet directory to import through
 * @property {string} [uuid] xlet uuid for the fallback imports root (default greenTile@carsteneu)
 * @property {(file: string) => string} [read] (absPath) => source text; default fs.readFileSync
 * @property {(dir: string) => Array<{name: string, isDirectory: () => boolean, isFile: () => boolean}>} [listDir]
 */
/**
 * Creates the importer object for a directory tree. Module properties are
 * real enumerable own properties with lazy getters (files: module namespaces,
 * named without the .js suffix; directories: nested importers), so upstream's
 * clearXletImportCache loop over getOwnPropertyNames + clearCache(name) works
 * against the simulation exactly as against CJS.
 *
 * @param {ImporterOptions} options
 */
const createXletImporter = (options) => {
    const { root } = options;
    const uuid = options.uuid || 'greenTile@carsteneu';
    const read = options.read || ((file) => fs.readFileSync(file, 'utf8'));
    const listDir = options.listDir
        || ((dir) => fs.readdirSync(dir, { withFileTypes: true }));
    assert.ok(root, 'createXletImporter: root required');

    const moduleCache = new Map();
    const evaluating = [];
    // filled with the minimal imports view once the root importer exists
    const selfImports = { extensions: null };

    const evalModule = (absRel, absPath) => {
        if (moduleCache.has(absRel)) {
            return moduleCache.get(absRel);
        }
        if (evaluating.includes(absRel)) {
            throw new Error('circular native import: ' + evaluating.concat(absRel).join(' -> '));
        }
        evaluating.push(absRel);
        try {
            const src = read(absPath);
            // live bindings: the real GJS importer exposes module-level
            // declarations through the namespace so later mutations are
            // visible (getters mirror that; writes stay module-local, which
            // matches the shipped zero-module-state single-assignment rule)
            const exports = publicNames(src)
                .map((n) => `\nObject.defineProperty(ns, ${JSON.stringify(n)}, { enumerable: true, get: () => ${n} });`).join('');
            const body = `'use strict';${src};${exports};\nreturn ns;`;
            const ns = Object.create(null);
            // GJS truth: `imports` is a true global. Tests that load pure
            // subtrees (models, tiling) run without a fake environment, so
            // when no global imports exists the importer provides the minimal
            // system view both Cinnamon generations guarantee:
            // imports.extensions['<uuid>'] resolving back to this tree.
            new Function('imports', 'global', 'ns', body)
                .call(ns, globalThis.imports || selfImports, globalThis.global, ns);
            moduleCache.set(absRel, ns);
            return ns;
        }
        finally {
            evaluating.pop();
        }
    };

    const makeDirImporter = (dirRel, dirAbs) => {
        /**
         * Drops the cached module for `name` in this directory, or, when the
         * name denotes a directory, every cached module under it.
         */
        const importer = {
            __path__: dirRel,
            clearCache(name) {
                // GJS importer truth: clearing deletes the named MODULE
                // cache entry; directory importers are permanent and keep
                // their sub-module caches — clearing a directory name does
                // NOT invalidate its children. Consequence for the shipped
                // XLET tree: after an xlet reload the ENTRY re-evaluates
                // (its module entry is cleared), the lib modules under the
                // global tree stay cached until the process ends.
                moduleCache.delete(dirRel ? `${dirRel}/${name}` : name);
            },
        };
        for (const entry of listDir(dirAbs)) {
            const childRel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
            const childAbs = `${dirAbs}/${entry.name}`;
            if (entry.isDirectory()) {
                // dev-only trees never carry xlet modules
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
                    continue;
                }
                let sub = null;
                Object.defineProperty(importer, entry.name, {
                    get() {
                        if (!sub) {
                            sub = makeDirImporter(childRel, childAbs);
                        }
                        return sub;
                    },
                    enumerable: true,
                    configurable: true,
                });
            } else if (entry.name.endsWith('.js')) {
                const modRel = childRel.replace(/\.js$/, '');
                Object.defineProperty(importer, entry.name.slice(0, -3), {
                    get() {
                        return evalModule(modRel, childAbs);
                    },
                    enumerable: true,
                    configurable: true,
                });
            }
        }
        return importer;
    };

    const importer = makeDirImporter('', root);
    selfImports.extensions = { [uuid]: importer };
    return importer;
};

module.exports = { createXletImporter, publicNames };
