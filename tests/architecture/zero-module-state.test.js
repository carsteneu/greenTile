'use strict';
// Static step-3 guard: extension.js, lib/app/** and lib/runtime/** must not
// declare mutable module-level state — no top-level let, no reassignment of
// exported bindings and no top-level mutable const (object/array literal, new
// Map/Set/WeakMap, Object.create) unless wrapped in Object.freeze. Top-level
// `var` is the native exporter's public-export mechanism (CJS exposes only
// var/function declarations), so a var is accepted when its value is a
// function/arrow/class expression, a primitive or an Object.freeze — and only
// while the binding is never reassigned. The single documented exception is
// extension.js's module-private lifecycle holder (const lifecycle =
// { session: null }): the session can no longer ride `this`, because the
// extensibility of a natively imported namespace is not a contract to rely
// on; the holder is owned by exactly this one module and re-created by an
// xlet reload (module-cache clear).
//
// Detection is syntax-aware (TypeScript's AST, an existing devDependency):
// module level is the real module scope, and a reassignment of an exported
// binding is any write reference to that binding ANYWHERE in the module —
// including inside function bodies, one-line `function tick(){count++}` and
// `count += 1` bodies, and statement bodies that never sit on their own line.
// The line-anchored regexes they replaced escaped exactly those forms, which
// a module-level counter hidden in a function body exploits. Writes are
// scope-resolved: a function-local binding that shadows the module name is
// its own variable, not a reassignment of the exported one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { ROOT } = require('../helpers/cinnamon-loader');

const FILES = ['extension.js'].concat(
    ['app', 'model', 'runtime', 'ui', 'tiling'].flatMap((sub) => fs.readdirSync(path.join(ROOT, 'lib', sub))
        .filter((f) => f.endsWith('.js'))
        .map((f) => path.join('lib', sub, f)))
        .sort()
);

// Top-level container constructors that hold mutable state; `new Foo()` for
// any other constructor is treated as opaque and allowed, exactly like the
// old string-anchored check only called out the known containers.
const MUTABLE_NEW = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'Array']);

const isPropertyAccess = (node, obj, prop) =>
    node && node.kind === ts.SyntaxKind.PropertyAccessExpression
    && node.name && node.name.text === prop
    && node.expression && node.expression.kind === ts.SyntaxKind.Identifier
    && node.expression.text === obj;

const isMutable = (init) => {
    if (!init) {
        return false;
    }
    let n = init;
    while (n.kind === ts.SyntaxKind.ParenthesizedExpression) {
        n = n.expression;
    }
    switch (n.kind) {
        case ts.SyntaxKind.ObjectLiteralExpression:
        case ts.SyntaxKind.ArrayLiteralExpression:
            return true;
        case ts.SyntaxKind.NewExpression:
            // new Map/Set/WeakMap/WeakSet/Array are mutable; any other new
            // keeps unknown ownership and is allowed like the old check
            if (n.expression && n.expression.kind === ts.SyntaxKind.Identifier) {
                return MUTABLE_NEW.has(n.expression.text);
            }
            return false;
        case ts.SyntaxKind.CallExpression:
            // Object.create(null) is a mutable container; Object.freeze(...)
            // turns any of the above immutable, so it is the escape hatch
            if (isPropertyAccess(n.expression, 'Object', 'create')) {
                return true;
            }
            if (isPropertyAccess(n.expression, 'Object', 'freeze')) {
                return false;
            }
            return false;
        default:
            return false;
    }
};

// The one allowed mutable holder, and only at the entry: const lifecycle =
// { session: null }. Any other module declaring this object-literal holder is
// smuggling state, and the same name elsewhere is not exempt either.
const isLifecycleHolder = (decl, fileName) => {
    if (fileName !== 'extension.js'
        || decl.name === undefined
        || decl.name.kind !== ts.SyntaxKind.Identifier
        || decl.name.text !== 'lifecycle') {
        return false;
    }
    let init = decl.initializer;
    if (!init || init.kind !== ts.SyntaxKind.ObjectLiteralExpression) {
        return false;
    }
    const props = init.properties;
    return props.length === 1
        && props[0].kind === ts.SyntaxKind.PropertyAssignment
        && props[0].name !== undefined
        && props[0].name.kind === ts.SyntaxKind.Identifier
        && props[0].name.text === 'session'
        && props[0].initializer !== undefined
        && props[0].initializer.kind === ts.SyntaxKind.NullKeyword;
};

const findViolations = (src, file, _opts = {}) => {
    const problems = [];
    const sourceFile = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    // module-level variable declarations: names of exported bindings tracked
    // for reassignment, plus the mutability/let violations themselves
    const moduleVars = new Set();
    const seenVars = new Set();
    for (const stmt of sourceFile.statements) {
        if (stmt.kind !== ts.SyntaxKind.VariableStatement) {
            continue;
        }
        const declKind = stmt.declarationList.flags;
        const isLet = (declKind & ts.NodeFlags.Let) !== 0;
        const isConst = (declKind & ts.NodeFlags.Const) !== 0;
        for (const decl of stmt.declarationList.declarations) {
            if (isLifecycleHolder(decl, file)) {
                continue;
            }
            if (isLet) {
                problems.push(`${file}:${lineOf(decl)} top-level let ${decl.name.getText(sourceFile)}`);
                continue;
            }
            if (isConst && isMutable(decl.initializer)) {
                problems.push(`${file}:${lineOf(decl)} mutable top-level const ${decl.name.getText(sourceFile)}`);
                continue;
            }
            // var: the native export mechanism — a primitive/function/class/
            // frozen value is fine, but a mutable literal or a second module
            // declaration of the same name is module state
            if (isConst) {
                continue;
            }
            const name = decl.name.kind === ts.SyntaxKind.Identifier ? decl.name.text : null;
            if (name === null) {
                continue;
            }
            if (isMutable(decl.initializer)) {
                problems.push(`${file}:${lineOf(decl)} mutable top-level var ${name}`);
            }
            if (seenVars.has(name)) {
                problems.push(`${file}:${lineOf(decl)} exported binding redeclared: ${name}`);
            }
            seenVars.add(name);
            moduleVars.add(name);
        }
    }
    if (moduleVars.size === 0) {
        return problems;
    }

    // scope-resolved reassignment scan: every write to a module `var` name,
    // skipping writes that target a function-local shadowing binding
    const isWrite = (node) => {
        if (node.kind === ts.SyntaxKind.PrefixUnaryExpression
            || node.kind === ts.SyntaxKind.PostfixUnaryExpression) {
            const op = node.operator;
            return (op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken)
                && node.operand && node.operand.kind === ts.SyntaxKind.Identifier;
        }
        if (node.kind === ts.SyntaxKind.BinaryExpression) {
            const op = node.operatorToken.kind;
            const isAssign = op === ts.SyntaxKind.EqualsToken
                || op === ts.SyntaxKind.PlusEqualsToken
                || op === ts.SyntaxKind.MinusEqualsToken
                || op === ts.SyntaxKind.AsteriskEqualsToken
                || op === ts.SyntaxKind.SlashEqualsToken
                || op === ts.SyntaxKind.PercentEqualsToken
                || op === ts.SyntaxKind.AsteriskAsteriskEqualsToken
                || op === ts.SyntaxKind.QuestionQuestionEqualsToken
                || op === ts.SyntaxKind.BarBarEqualsToken
                || op === ts.SyntaxKind.AmpersandAmpersandEqualsToken;
            return isAssign && node.left && node.left.kind === ts.SyntaxKind.Identifier;
        }
        return false;
    };
    const identifierOf = (node) => {
        if (node.kind === ts.SyntaxKind.PrefixUnaryExpression
            || node.kind === ts.SyntaxKind.PostfixUnaryExpression) {
            return node.operand.text;
        }
        return node.left.text;
    };

    // walk ancestors collecting shadow names introduced between module scope
    // and the write; a name declared anywhere in between hides the module one
    const shadedBy = (writeNode) => {
        const shadow = new Set();
        let cur = writeNode.parent;
        while (cur && cur !== sourceFile) {
            if (cur.kind === ts.SyntaxKind.FunctionDeclaration
                || cur.kind === ts.SyntaxKind.FunctionExpression
                || cur.kind === ts.SyntaxKind.ArrowFunction) {
                // function params shadow the whole function body
                for (const p of cur.parameters) {
                    if (p.name && p.name.kind === ts.SyntaxKind.Identifier) {
                        shadow.add(p.name.text);
                    }
                }
                // var declarations are hoisted: any `var` declared inside the
                // function (outside nested functions) shadows the module name
                for (const v of moduleVars) {
                    if (collectVarNamesInFunction(cur).has(v)) {
                        shadow.add(v);
                    }
                }
            }
            else if (cur.kind === ts.SyntaxKind.CatchClause) {
                const v = cur.variableDeclaration;
                if (v && v.name.kind === ts.SyntaxKind.Identifier) {
                    shadow.add(v.name.text);
                }
            }
            else if (cur.kind === ts.SyntaxKind.Block
                || cur.kind === ts.SyntaxKind.ForStatement
                || cur.kind === ts.SyntaxKind.ForInStatement
                || cur.kind === ts.SyntaxKind.ForOfStatement) {
                // block-scoped declarations (let/const) in THIS block
                for (const n of collectBlockScopedNames(cur)) {
                    shadow.add(n);
                }
            }
            cur = cur.parent;
        }
        return shadow;
    };

    const visit = (node) => {
        if (isWrite(node)) {
            const name = identifierOf(node);
            if (moduleVars.has(name) && !shadedBy(node).has(name)) {
                problems.push(`${file}:${lineOf(node)} exported binding reassigned: ${name}`);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return problems;
};

// names of `var` declarations anywhere inside one function body (skipping
// nested function bodies) — these are function-scoped and shadow at the top
const collectVarNamesInFunction = (fnNode) => {
    const out = new Set();
    const walk = (node) => {
        if (node === fnNode) {
            // descend into the body
        }
        else if (node.kind === ts.SyntaxKind.FunctionDeclaration
            || node.kind === ts.SyntaxKind.FunctionExpression
            || node.kind === ts.SyntaxKind.ArrowFunction
            || node.kind === ts.SyntaxKind.MethodDeclaration
            || node.kind === ts.SyntaxKind.ClassDeclaration
            || node.kind === ts.SyntaxKind.ClassExpression) {
            return; // nested function/class boundaries stop the hoist walk
        }
        if (node.kind === ts.SyntaxKind.VariableDeclaration
            && node.name && node.name.kind === ts.SyntaxKind.Identifier) {
            const list = node.parent;
            // a declaration is `var` when it is neither let nor const
            if (list.kind === ts.SyntaxKind.VariableDeclarationList
                && (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0) {
                out.add(node.name.text);
            }
        }
        ts.forEachChild(node, walk);
    };
    ts.forEachChild(fnNode, walk);
    return out;
};

// let/const/function names declared directly in one block (not nested blocks)
const collectBlockScopedNames = (blockNode) => {
    const out = new Set();
    const addLetConstList = (list) => {
        if (list && (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0) {
            for (const d of list.declarations) {
                if (d.name && d.name.kind === ts.SyntaxKind.Identifier) {
                    out.add(d.name.text);
                }
            }
        }
    };
    // a for/for-in/for-of loop is its own scope: the loop variable shadows too
    if (blockNode.kind === ts.SyntaxKind.ForStatement
        || blockNode.kind === ts.SyntaxKind.ForInStatement
        || blockNode.kind === ts.SyntaxKind.ForOfStatement) {
        addLetConstList(blockNode.initializer);
    }
    ts.forEachChild(blockNode, (child) => {
        if (child.kind === ts.SyntaxKind.VariableStatement && child.parent === blockNode) {
            addLetConstList(child.declarationList);
        }
        else if ((child.kind === ts.SyntaxKind.FunctionDeclaration) && child.parent === blockNode) {
            if (child.name) {
                out.add(child.name.text);
            }
        }
    });
    return out;
};

test('guard flags mutable top-level state and accepts the allowed forms', () => {
    assert.equal(findViolations('let x = 0;', 'f.js').length, 1);
    assert.equal(findViolations('var x = 1;', 'f.js').length, 0, 'var export with primitive value is the native export mechanism');
    assert.equal(findViolations('var x = () => {};', 'f.js').length, 0, 'var export with arrow value allowed');
    assert.equal(findViolations('var x = class {};', 'f.js').length, 0, 'var-bound class expression allowed');
    assert.equal(findViolations('var x = Object.freeze({});', 'f.js').length, 0);
    assert.equal(findViolations('var x = {};', 'f.js').length, 1, 'var export of a mutable literal flagged');
    assert.equal(findViolations('var x = {}\nvar y = 1;\nx = y;', 'f.js').length, 2, 'reassignment of an exported binding flagged');
    assert.equal(findViolations('var counter = 0;\ncounter++;', 'f.js').length, 1, 'postfix increment flagged');
    assert.equal(findViolations('var counter = 0;\ncounter++', 'f.js').length, 1, 'postfix without semicolon flagged');
    assert.equal(findViolations('var counter = 0;\n++counter;', 'f.js').length, 1, 'prefix form pinned');
    assert.equal(findViolations('var counter = 0;\ncounter++; // tick', 'f.js').length, 1, 'a trailing comment does not hide the reassignment');
    assert.equal(findViolations('var counter = 0;\ncounter += 1;', 'f.js').length, 1, 'compound assignment to an exported binding flagged');
    // R3: body-embedded reassignments at base line anchors — the reported
    // counterexamples the line-shaped guard let through
    assert.equal(findViolations('var count = 0;\nfunction tick(){count++;}', 'f.js').length, 1,
        'one-line function body increment is module state');
    assert.equal(findViolations('var count = 0;\nfunction tick(){count += 1;}', 'f.js').length, 1,
        'one-line function body +=1 is module state');
    assert.equal(findViolations('var count = 0;\nfunction tick(){count++;} // done', 'f.js').length, 1,
        'the same one-line body with a trailing comment stays flagged');
    assert.equal(findViolations('var count = 0;\nif (x) count++;', 'f.js').length, 1,
        'a single-line statement body reassignment is module state');
    assert.equal(findViolations('var count = 0;\nfor (;;) { count++; }', 'f.js').length, 1,
        'a loop body reassignment is module state');
    assert.equal(findViolations('var count = 0;\nfunction tick() { count--; }', 'f.js').length, 1,
        '-- inside a function body is module state');
    // scope resolution: a function-local shadowing binding is NOT a reassign
    // of the exported one
    assert.equal(findViolations('var count = 0;\nfunction tick(){ const count = 3; count++; }', 'f.js').length, 0,
        'a function-local let/const shadowing the module name is not module state');
    assert.equal(findViolations('var count = 0;\nfunction tick(count){ count++; }', 'f.js').length, 0,
        'a function parameter shadowing the module name is not module state');
    assert.equal(findViolations('var count = 0;\ntry{}catch(count){ count++; }', 'f.js').length, 0,
        'a catch binding shadowing the module name is not module state');
    assert.equal(findViolations('var count = 0;\nfunction f(){ var count; count++; }', 'f.js').length, 0,
        'a hoisted function-local var shadowing the module name is not module state');
    assert.equal(findViolations('var count = 0;\nfor (const count of wins) { count++; }', 'f.js').length, 0,
        'a loop variable shadowing the module name is not module state');
    assert.equal(findViolations('var count = 0;\nfunction tick(){ let local; { count += 2; } }', 'f.js').length, 1,
        'a write to the module name inside nested blocks still counts');
    assert.equal(findViolations('var count = 0;\nvar count = 1;', 'f.js').length, 1,
        'a second module-level var declaration of the same name is a reassignment (redeclaration)');
    assert.equal(findViolations('var count = 0;\nvar other = 2;\nother = count;', 'f.js').length, 1,
        'reading the module var is not a write');
    assert.equal(findViolations('var x = {};', 'f.js').length, 1);
    assert.equal(findViolations('const x = [];', 'f.js').length, 1);
    assert.equal(findViolations('const x = new Map();', 'f.js').length, 1);
    assert.equal(findViolations('const x = new Set();', 'f.js').length, 1);
    assert.equal(findViolations('const x = new WeakMap();', 'f.js').length, 1);
    assert.equal(findViolations('var x = new WeakSet();', 'f.js').length, 1, 'WeakSet is the same mutable class (reviewer mutation)');
    assert.equal(findViolations('var x = new Array();', 'f.js').length, 1);
    assert.equal(findViolations('const x = Object.create(null);', 'f.js').length, 1);
    assert.equal(findViolations('const x =\n{};', 'f.js').length, 1, 'value on the next line is checked too');
    assert.equal(findViolations('const x = Object.freeze({});', 'f.js').length, 0);
    assert.equal(findViolations('const x = Object.freeze(new Map());', 'f.js').length, 0);
    assert.equal(findViolations('const f = () => {};', 'f.js').length, 0, 'functions allowed');
    assert.equal(findViolations('const f = function () {};', 'f.js').length, 0, 'functions allowed');
    assert.equal(findViolations('const f = (a) => ({ ...a });', 'f.js').length, 0, 'arrow params are not an object literal');
    assert.equal(findViolations('class C {}', 'f.js').length, 0, 'classes allowed (private in the native namespace)');
    assert.equal(findViolations('const g = () => {};', 'f.js').length, 0, 'const-bound arrow functions are private and inert');
    assert.equal(findViolations('const t = `text ${x}`;', 'f.js').length, 0, 'template literals are primitives');
    // the lifecycle holder is the documented exception — but ONLY in the entry
    assert.equal(findViolations('const lifecycle = { session: null };', 'extension.js').length, 0, 'the extension.js lifecycle holder is the documented exception');
    assert.equal(findViolations('const lifecycle = { session: null };', 'f.js').length, 1, 'the holder pattern outside the entry is smuggled module state (reviewer mutation)');
    assert.equal(findViolations('const lifecycle = { session: 1 };', 'extension.js').length, 1, 'only the exact { session: null } holder is exempt');
    assert.equal(findViolations('const other = { session: null };', 'f.js').length, 1, 'only the lifecycle holder pattern is exempt');
    assert.equal(findViolations('const { a, b } = XLET.lib.model.split;', 'f.js').length, 0, 'importer destructuring allowed');
    assert.equal(findViolations('const Main = imports.ui.main;', 'f.js').length, 0, 'imports allowed');
    assert.equal(findViolations('const N = 400 * 1000;', 'f.js').length, 0, 'primitives allowed');
    assert.equal(findViolations('const s = "text";', 'f.js').length, 0, 'primitives allowed');
    // module scope is syntax scope: an indented top-level let is still module
    // state (the old column-0 heuristic treated any indentation as function
    // local; the syntax-aware guard resolves the actual scope instead)
    assert.equal(findViolations('    let x = 0;', 'f.js').length, 1, 'an indented top-level let is still module level (syntax scope)');
    assert.equal(findViolations('function f(){ let x = 0; x++; }', 'f.js').length, 0, 'a real function-local let is not module state');
    // the holder's OWN sessions are written via property assignment, which
    // mutates the object, never the binding — the documented exception is not
    // required to extend to property writes anywhere (they only exist here)
    assert.equal(findViolations('const lifecycle = { session: null };\nfunction enable(){ lifecycle.session = new Session(); }', 'extension.js').length, 0,
        'property mutation of the holder in the entry is the documented lifecycle write');
});

test('extension.js, lib/app/**, lib/model/**, lib/runtime/**, lib/ui/** and lib/tiling/** carry no mutable module-level state', () => {
    const seen = [];
    for (const file of FILES) {
        const violations = findViolations(fs.readFileSync(path.join(ROOT, file), 'utf8'), file);
        seen.push(file);
        assert.deepEqual(violations, [], file + ' has top-level mutable state');
    }
    assert.ok(seen.includes('extension.js'), 'extension.js covered');
    assert.ok(seen.includes(path.join('lib/app', 'app.js')), 'lib/app/app.js covered');
    assert.ok(seen.includes(path.join('lib/app', 'config.js')), 'lib/app/config.js covered');
    assert.ok(seen.includes(path.join('lib/model', 'settings-keys.js')), 'lib/model/settings-keys.js covered');
    assert.ok(seen.includes(path.join('lib/runtime', 'hotkeys.js')), 'lib/runtime/hotkeys.js covered');
    assert.ok(seen.includes(path.join('lib/runtime', 'exclusions.js')), 'lib/runtime/exclusions.js covered');
    assert.ok(seen.includes(path.join('lib/runtime', 'panel-state.js')), 'lib/runtime/panel-state.js covered');
    assert.ok(seen.includes(path.join('lib/ui', 'panel.js')), 'lib/ui/panel.js covered');
    assert.ok(seen.includes(path.join('lib/ui', 'editor.js')), 'lib/ui/editor.js covered');
    assert.ok(seen.includes(path.join('lib/ui', 'draw.js')), 'lib/ui/draw.js covered');
    assert.ok(seen.includes(path.join('lib/ui', 'i18n.js')), 'lib/ui/i18n.js covered');
    assert.ok(seen.includes(path.join('lib/tiling', 'layout.js')), 'lib/tiling/layout.js covered');
    assert.ok(seen.includes(path.join('lib/tiling', 'retile.js')), 'lib/tiling/retile.js covered');
});
