/*
 * ESLint 9 flat config. Shipped extension files load through Cinnamon's
 * native xlet importer on both module generations: top-level var and function
 * declarations are the public export mechanism (const/let/class stay
 * private), `imports`/`global` are the runtime surface and no source-side
 * 'use strict' is needed (CJS evaluates strict inside the importer wrapper).
 */
const js = require('@eslint/js');
const globals = require('globals');

const rules = {
    ...js.configs.recommended.rules,
    // loop 4c-C had a rename-induced shadowing bug — keep this on permanently
    'no-shadow': 'error',
    'no-unused-vars': ['error', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
    }],
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    'curly': ['error', 'multi-line'],
};

module.exports = [
    {
        ignores: [
            'node_modules/',
            'dist/',
            '.yesmem/',
            '.worktrees/',
            'docs/**',
            'spices/**',
        ],
    },
    {
        files: ['extension.js', 'lib/**/*.js'],
        languageOptions: {
            // script scope: the GJS native importer evaluates files as
            // function-scoped script bodies, not CommonJS wrappers — top-level
            // var/function declarations are the module's public surface
            sourceType: 'script',
            globals: {
                imports: 'readonly',
                global: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
            },
        },
        rules: {
            ...rules,
            'no-unused-vars': ['error', {
                args: 'after-used',
                argsIgnorePattern: '^_',
                vars: 'local',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            // top-level var is the native exporter's public-declaration
            // mechanism (zero-module-state.test.js pins single-assignment);
            // the lifecycle holder in extension.js is a const
            'no-var': 'off',
            'prefer-const': 'off',
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules,
    },
    {
        // GJS-script fixtures: the loader self-test cycle fixtures read the
        // imports global like a real xlet module does
        files: ['tests/helpers/fixtures/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: {
                imports: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': 'off',
        },
    },
    {
        // .mjs scripts run on Node ESM; extension.js and lib/** are covered by
        // the shipped-scope block above (flat-config `*.js` patterns match at
        // any depth, which is why this block names .mjs only)
        files: ['**/*.mjs'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
        rules,
    },
];
