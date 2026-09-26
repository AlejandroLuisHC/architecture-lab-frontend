import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
    { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
    {
        files: ['src/**/*.{ts,tsx}'],
        extends: [tseslint.configs.recommended, reactHooks.configs.flat.recommended],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.vitest,
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        plugins: { sonarjs },
        rules: {
            complexity: ['error', 10],
            'max-depth': ['error', 4],
            'max-params': ['error', 4],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'react-hooks/set-state-in-effect': 'off',
            'sonarjs/cognitive-complexity': ['error', 15],
        },
    },
    eslintConfigPrettier,
);
