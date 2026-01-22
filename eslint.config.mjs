import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
// 1. Import the plugin explicitly
import importPlugin from "eslint-plugin-import";

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = path.dirname(currentFilename);

const compat = new FlatCompat({
    baseDirectory: currentDirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

function fixupConfig(config) {
    const removedRules = new Set([
        '@typescript-eslint/brace-style',
        '@typescript-eslint/comma-dangle',
        '@typescript-eslint/comma-spacing',
        '@typescript-eslint/func-call-spacing',
        '@typescript-eslint/indent',
        '@typescript-eslint/keyword-spacing',
        '@typescript-eslint/lines-between-class-members',
        '@typescript-eslint/no-extra-parens',
        '@typescript-eslint/no-extra-semi',
        '@typescript-eslint/object-curly-spacing',
        '@typescript-eslint/padding-line-between-statements',
        '@typescript-eslint/quotes',
        '@typescript-eslint/semi',
        '@typescript-eslint/space-before-blocks',
        '@typescript-eslint/space-before-function-paren',
        '@typescript-eslint/space-infix-ops',
        '@typescript-eslint/type-annotation-spacing',
        '@typescript-eslint/no-throw-literal',
        '@typescript-eslint/no-useless-constructor',
        '@typescript-eslint/no-implied-eval',
        '@typescript-eslint/return-await',
        "@typescript-eslint/no-unused-vars"
    ]);

    return config.map(entry => {
        if (entry.rules) {
            for (const key of Object.keys(entry.rules)) {
                if (removedRules.has(key)) {
                    delete entry.rules[key];
                }
            }
        }
        return entry;
    });
}

const airbnbConfig = fixupConfig(compat.extends("airbnb-typescript/base"));

export default [
    {
        ignores: ['dist/', 'node_modules/', 'docs/', 'docs-sorted/', '.changelogs/'],
    },
    ...airbnbConfig,
    {
        // 2. Register the plugin here so your custom rules know what "import/" means
        plugins: {
            import: importPlugin,
        },
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: currentDirname,
            },
        },
        settings: {
            'import/resolver': {
                typescript: {
                    project: './tsconfig.json',
                },
            },
        },
        rules: {
            '@typescript-eslint/only-throw-error': 'error',
            '@typescript-eslint/no-redeclare': ['error', { ignoreDeclarationMerge: true }],
            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'variable',
                    format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
                },
                {
                    selector: 'variable',
                    modifiers: ['destructured'],
                    format: null,
                },
            ],
            'import/extensions': [
                'error',
                'ignorePackages',
                {
                    ts: 'always',
                    tsx: 'always',
                    js: 'always',
                    jsx: 'always',
                },
            ],
            'no-console': 'off',
        },
    },
    {
        files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**/*.ts', '**/tests/**/*.tsx'],
        rules: {
            'import/no-extraneous-dependencies': 'off',
        },
    },
    {
        files: ['*.config.mjs', '*.config.ts', '*.config.js', 'scripts/**/*.ts'],
        rules: {
            'import/no-extraneous-dependencies': 'off',
        },
    },
    {
        files: ['src/types/**/*.ts'],
        rules: {
            '@typescript-eslint/no-redeclare': 'off',
        },
    }
];
