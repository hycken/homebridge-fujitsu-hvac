import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import tseslint from 'typescript-eslint'
// import { fileURLToPath } from 'url';
// import path from 'path';
// import { FlatCompat } from "@eslint/eslintrc";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const compat = new FlatCompat({
//     baseDirectory: __dirname,
//     recommendedConfig: js.configs.recommended,
//     allConfig: js.configs.all
// });

export default [
    {
        ignores: [
            '**/dist/*',
            '**/node_modules/*',
        ],
    },

    { files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'] },

    js.configs.recommended,
    importPlugin.flatConfigs.recommended,
    ...tseslint.configs.recommended,

    // Base Configuration
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        settings: {
            react: {
                version: 'detect',
            },
            'import/resolver': {
                typescript: true,
                alias: true,
                node: {
                    extensions: [".ts", ".tsx"],
                    moduleDirectory: ["src", "node_modules"]
                }
            },
        },
        // Rules overrides
        rules: {
            'import/named': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { args: 'none', caughtErrors: 'none' },
            ],
        },
    },

]
