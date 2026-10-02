/*
 * Generates types/xlet/** — the typed mirror of the shipped module tree.
 *
 * The native GJS importer exposes only top-level var/function declarations
 * across modules, and tsc cannot see those as exports of a checked .js
 * module (no runtime-visible export markers exist). This generator makes
 * each declaration surface visible to tsc: it prefixes `export` onto every
 * column-0 var/function declaration of a TEMP copy of each lib module and
 * runs one declaration-only tsc program over the copies. The emitted .d.ts
 * files land in types/xlet/<sub>/<name>.d.ts with real signatures (JSDoc
 * types, inferred class shapes); types/cinnamon.d.ts maps
 * imports.extensions['greenTile@carsteneu'] through them.
 *
 * Run:  node scripts/generate-xlet-types.mjs [--out DIR] [--check]
 * Exit: 0 — mirror written (or, with --check, already up to date)
 *       1 — --check found drift (regenerate and commit)
 * lib/ stays pure JavaScript — nothing generated ships to the user.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = path.join(dirname(fileURLToPath(import.meta.url)), '..');
const outDirArg = argValue('--out');
const check = process.argv.includes('--check');
// check mode NEVER writes the committed tree: generation always lands in a
// temp dir and is compared against the existing OUT afterwards
const OUT = path.resolve(root, outDirArg || path.join('types', 'xlet'));
const EMIT_DIR = check ? path.join(root, '.yesmem', 'tmp', 'xlet-type-check') : OUT;
const TMP = path.join(root, '.yesmem', 'tmp', 'xlet-type-src');

function argValue(name) {
    const at = process.argv.indexOf(name);
    return at !== -1 ? process.argv[at + 1] : null;
}
function dirname(p) {
    return path.dirname(p);
}

const BANNER = '// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;\n// regenerate with: npm run gen:types\n';

const libFiles = (function walk(dir, prefix) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            {out.push(...walk(path.join(dir, entry.name), rel));}
        else if (entry.name.endsWith('.js'))
            {out.push(rel);}
    }
    return out;
})(path.join(root, 'lib'), '');

fs.rmSync(TMP, { recursive: true, force: true });
for (const rel of libFiles) {
    const src = fs.readFileSync(path.join(root, 'lib', rel), 'utf8');
    // column-0 var/function lines are the module's public native surface
    const exported = src
        .split('\n')
        .map((line) => (/^(var\s|function\s)/.test(line) ? `export ${line}` : line))
        .join('\n');
    const tmpPath = path.join(TMP, 'lib', rel);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, exported);
}
// minimal ambient context for the temp program: `imports` stays untyped so
// the emitted mirrors stay SELF-CONTAINED (no import statements reaching
// across modules — each mirror carries only its own signatures over the
// shared ambient vocabulary of greenTile.d.ts). The typed consumer-side tree
// lives in types/cinnamon.d.ts.
const ambientPath = path.join(TMP, 'ambient.d.ts');
fs.writeFileSync(ambientPath, [
    '// generator-local: untyped shell globals for the declaration emit',
    'declare const imports: any;',
    'declare const global: any;',
    'declare const log: any;',
].join('\n') + '\n');

const program = ts.createProgram(
    [
        ...libFiles.map((rel) => path.join(TMP, 'lib', rel)),
        ambientPath,
        path.join(root, 'types', 'greenTile.d.ts'),
    ],
    {
        allowJs: true,
        declaration: true,
        emitDeclarationOnly: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2022,
        strict: true,
        noEmitOnError: false,
        types: [],
    },
);

const emitted = [];
const result = program.emit(undefined, (filePath, data) => {
    const m = /lib\/(.*)\.d\.ts$/.exec(filePath.split('\\').join('/'));
    if (!m)
        {return;}
    const target = path.join(EMIT_DIR, m[1] + '.d.ts');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, BANNER + data);
    emitted.push(`lib/${m[1]}.d.ts`);
});
if (result.emitSkipped)
    {throw new Error('generate-xlet-types: declaration emit was skipped');}

if (check) {
    try {
        const drift = [];
        for (const rel of libFiles) {
            const mirrorRel = rel.replace(/^lib\//, '').replace(/\.js$/, '.d.ts');
            const committed = path.join(OUT, mirrorRel);
            const fresh = path.join(EMIT_DIR, mirrorRel);
            if (!fs.existsSync(committed)) {
                drift.push(`missing mirror for lib/${rel}`);
                continue;
            }
            if (!fs.existsSync(fresh)) {
                drift.push(`generator produced no mirror for lib/${rel}`);
                continue;
            }
            if (fs.readFileSync(fresh, 'utf8') !== fs.readFileSync(committed, 'utf8'))
                {drift.push(`stale mirror for lib/${rel}`);}
        }
        if (drift.length) {
            console.error('generate-xlet-types --check: ' + drift.join('; '));
            process.exit(1);
        }
        console.log(`generate-xlet-types --check: ${emitted.length} mirrors up to date`);
    }
    finally {
        fs.rmSync(EMIT_DIR, { recursive: true, force: true });
    }
}
else {
    console.log(`generate-xlet-types: wrote ${emitted.length} mirrors to ${path.relative(root, OUT)}`);
}
