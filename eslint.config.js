/*
 * ESLint 9 flat config. Shipped extension files run under Cinnamon's
 * fileUtils.js createExports: the body is wrapped as 'use strict';<src>; in a
 * Function(require, exports, module, ...), so CommonJS scope + `imports`/
 * `global` are the runtime surface and no source-side 'use strict' is needed.
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
    }],
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    'prefer-const': 'error',
    'no-var': 'error',
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
            sourceType: 'commonjs',
            globals: {
                imports: 'readonly',
                global: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
            },
        },
        rules,
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
        files: ['*.js', '*.mjs'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules,
    },
];
