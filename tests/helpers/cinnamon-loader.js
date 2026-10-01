'use strict';
// Shared loader for shipped extension files across both Cinnamon module
// generations.
//
// load() (default): native importer semantics, as the shipped code is loaded
// through imports.extensions['greenTile@carsteneu'] on both generations since
// the native-imports migration — only top-level `var` and function
// declarations are visible on a module namespace, const/let/class stay
// private, modules are cached per path and re-evaluated after clearCache (see
// native-importer.js for the pinned contract).
//
// cinnamonLoad(): the legacy entry generation — evaluates the entry the way
// Cinnamon 6.6 fileUtils.js createExports does: body wrapped as
// 'use strict';<src>; inside a Function(require, exports, module, ...), and
// without an explicit module.exports line every top-level name is auto-
// exported (deliberate superset). Used for extension.js entry-contract tests.
const path = require('node:path');
const { createXletImporter } = require('./native-importer');

const ROOT = path.join(__dirname, '..', '..');
const UUID = 'greenTile@carsteneu';

const cinnamonLoad = (src, requireStub, filename) => {
    const module = { exports: {} };
    let body = `'use strict';${src};`;
    if (!/^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m.test(body)) {
        const varRegex = /^(?:'use strict';){0,}(const|var|let|function|class)\s+([a-zA-Z0-9_$]+)/gm;
        let match;
        while ((match = varRegex.exec(body)) != null)
            {body += `exports.${match[2]} = typeof ${match[2]} !== 'undefined' ? ${match[2]} : null;`;}
    }
    body += `return module.exports;`;
    const fn = new Function('require', 'exports', 'module', '__meta', '__dirname', '__filename', body);
    return fn.call(module.exports, requireStub, module.exports, module, null, '.', filename);
};

let cachedImporter = null;

/** The xlet importer over the repo root; one instance per process. */
const xletImporter = () => {
    if (!cachedImporter) {
        cachedImporter = createXletImporter({ root: ROOT });
    }
    return cachedImporter;
};

/**
 * Loads a shipped module namespace through the importer, path form
 * './lib/<dir>/<file>'; './extension' resolves the entry.
 */
const load = (spec) => {
    if (spec !== './extension' && !spec.startsWith('./lib/')) {
        throw new Error(`unsupported load '${spec}' — shipped modules resolve through the xlet importer ('./lib/…' or './extension')`);
    }
    if (spec.includes('..')) {
        throw new Error(`'../' paths are unsupported: '${spec}'`);
    }
    let node = xletImporter();
    for (const part of spec.replace(/^\.\//, '').replace(/\.js$/, '').split('/')) {
        node = node[part];
        if (node === undefined) {
            throw new Error(`native import: '${spec}' does not resolve inside the shipped set`);
        }
    }
    return node;
};

/**
 * The extensions subtree as Cinnamon exposes it on the imports root
 * (6.6 main.js _addXletDirectoriesToSearchPath): one object keyed by the UUID.
 */
const extensionsRoot = () => ({ [UUID]: xletImporter() });

module.exports = { load, cinnamonLoad, ROOT, UUID, extensionsRoot };
