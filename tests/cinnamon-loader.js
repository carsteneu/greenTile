'use strict';
// Shared loader: evaluates shipped extension files the way Cinnamon's
// fileUtils.js createExports does — the body is wrapped as 'use strict';<src>;
// inside a Function(require, exports, module, ...) and, without an explicit
// module.exports line, every top-level name is appended to exports (deliberate
// superset: the importNames/giImportNames suppression lists are ignored).
// require() resolves like fileUtils.js requireModule: gi./ui./misc. prefixes
// would reach into the imports global (not available in tests — every shipped
// module keeps its Cinnamon imports out of the models), everything else is
// ROOT-relative against the xlet root (the repo root here), './' stripped,
// '.js' appended, '../' rejected because fileUtils mangles it into '.<name>'.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const cache = new Map();

const cinnamonLoad = (src, requireStub, filename) => {
    const module = { exports: {} };
    let body = `'use strict';${src};`;
    if (!/^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m.test(body)) {
        const varRegex = /^(?:'use strict';){0,}(const|var|let|function|class)\s+([a-zA-Z0-9_$]+)/gm;
        let match;
        while ((match = varRegex.exec(body)) != null)
            body += `exports.${match[2]} = typeof ${match[2]} !== 'undefined' ? ${match[2]} : null;`;
    }
    body += `return module.exports;`;
    const fn = new Function('require', 'exports', 'module', '__meta', '__dirname', '__filename', body);
    return fn.call(module.exports, requireStub, module.exports, module, null, '.', filename);
};

const load = (spec) => {
    if (!spec.startsWith('./'))
        throw new Error(`unsupported require '${spec}' — tests resolve root-relative './' paths only`);
    if (spec.includes('..'))
        throw new Error(`'../' paths are mangled by Cinnamon's fileUtils and unsupported: '${spec}'`);
    const rel = spec.replace(/\.\//g, '').endsWith('.js') ? spec.replace(/\.\//g, '') : spec.replace(/\.\//g, '') + '.js';
    const abs = path.join(ROOT, rel);
    if (cache.has(abs))
        return cache.get(abs);
    const exports = cinnamonLoad(fs.readFileSync(abs, 'utf8'), load, rel);
    cache.set(abs, exports);
    return exports;
};

module.exports = { load, cinnamonLoad, ROOT };
