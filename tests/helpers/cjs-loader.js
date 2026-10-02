'use strict';
// Faithful emulation of Cinnamon 6.6 js/misc/fileUtils.js module loading
// (the legacy xlet generation), line-for-line where behavior matters:
//
// - LoadedModules: array of {path, dir, size, module}; lookup by path via
//   findModuleIndex; a cache hit needs SAME size AND module != null.
// - createExports auto-export: only when no `module.exports…=` line exists,
//   every top-level const/var/let/function/class declaration is exported —
//   EXCEPT names in importNames (compared lowercased; the fixed 6.6 list)
//   or in giImportNames (the LOADED GI namespaces, injected here since Node
//   has no typelib).
// - unloadModule(index) invalidates DIR-WIDE: every module of the same dir
//   gets module=undefined and size=-1 (slots stay, so re-require replaces
//   in place and re-evaluates with fresh module state).
// - The module function runs with `this` = exports and a require closure
//   bound to the module's dir, exactly like the real FunctionConstructor
//   call in fileUtils.js.
//
// Tests against this file pin the source-faithful semantics; the GJS native
// importer simulation lives in native-importer.js (the other generation).

const fs = require('node:fs');
const path = require('node:path');

const IMPORT_NAMES = [
    'mainloop', 'jsUnit', 'format', 'signals', 'lang', 'tweener', 'overrides',
    'gettext', 'coverage', 'package', 'cairo', 'byteArray', 'cairoNative',
];

/**
 * @typedef {Object} CjsLoaderOptions
 * @property {string} root absolute root the module paths resolve against
 * @property {string[]} [giNames] loaded GI namespaces for the auto-export skip list
 */
/**
 * @param {CjsLoaderOptions} options
 */
const createCjsLoader = (options) => {
    const { root } = options;
    const giNames = options.giNames || ['Gio', 'GLib', 'GObject', 'Meta', 'St', 'Clutter', 'Cinnamon', 'Pango'];
    const LoadedModules = [];

    const findModuleIndex = (modPath) => LoadedModules.findIndex((cached) => cached && cached.path === modPath);

    const getModuleByIndex = (index) => {
        if (!LoadedModules[index]) {
            throw new Error('[getModuleByIndex] Module does not exist.');
        }
        return LoadedModules[index].module;
    };

    const unloadModule = (index) => {
        if (!LoadedModules[index]) {
            return;
        }
        const indexes = [];
        for (let i = 0; i < LoadedModules.length; i++) {
            if (LoadedModules[i] && LoadedModules[i].dir === LoadedModules[index].dir) {
                indexes.push(i);
            }
        }
        for (const i of indexes) {
            LoadedModules[i].module = undefined;
            LoadedModules[i].size = -1;
        }
    };

    const requireModule = (modPath, dir = root) => {
        const abs = modPath.startsWith('/') ? modPath : path.resolve(dir, modPath);
        const src = fs.readFileSync(abs, 'utf8');
        const size = Buffer.byteLength(src, 'utf8');
        const importerData = { size, path: abs, dir: path.dirname(abs), module: null };
        const exports = {};
        const module = { exports: exports };

        let moduleIndex = findModuleIndex(abs);
        if (moduleIndex > -1) {
            if (size === LoadedModules[moduleIndex].size && LoadedModules[moduleIndex].module != null) {
                return LoadedModules[moduleIndex].module;
            }
            LoadedModules[moduleIndex] = importerData;
        }
        else {
            LoadedModules.push(importerData);
            moduleIndex = LoadedModules.length - 1;
        }

        let JS = `'use strict';${src};`;
        const exportsRegex = /^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m;
        const varRegex = /^(?:'use strict';){0,}(const|var|let|function|class)\s+([a-zA-Z0-9_$]+)/gm;
        let match;
        if (!exportsRegex.test(JS)) {
            while ((match = varRegex.exec(JS)) != null) {
                if (match.index === varRegex.lastIndex) {
                    varRegex.lastIndex++;
                }
                if (match[2]
                    && IMPORT_NAMES.indexOf(match[2].toLowerCase()) === -1
                    && giNames.indexOf(match[2]) === -1) {
                    JS += `exports.${match[2]} = typeof ${match[2]} !== 'undefined' ? ${match[2]} : null;`;
                }
            }
        }
        JS += `return module.exports;//# sourceURL=${abs}`;

        importerData.module = Function(
            'require',
            'exports',
            'module',
            '__meta',
            '__dirname',
            '__filename',
            JS,
        ).call(
            exports,
            function require(p) {
                return requireModule(p, path.dirname(abs));
            },
            exports,
            module,
            null,
            path.dirname(abs),
            path.basename(abs),
        );
        return importerData.module;
    };

    return { requireModule, findModuleIndex, getModuleByIndex, unloadModule, LoadedModules };
};

module.exports = { createCjsLoader, IMPORT_NAMES };
