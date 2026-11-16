import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import tsParser from '@typescript-eslint/parser';

export default [
    {
        ignores: [
            'dist/**',
            'dist-itch/**',
            'coverage/**',
            'node_modules/**',
            'ios/**',
            'android/**',
            'playwright-report/**',
            'test-results/**',
        ],
    },
    js.configs.recommended,
    sonarjs.configs.recommended,
    {
        files: ['src/**/*.{js,jsx,ts}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                Audio: 'readonly',
                AudioContext: 'readonly',
                webkitAudioContext: 'readonly',
                fetch: 'readonly',
                crypto: 'readonly',
                CustomEvent: 'readonly',
                Event: 'readonly',
                HTMLElement: 'readonly',
                process: 'readonly',
            },
        },
        plugins: {
            'react-hooks': reactHooks,
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^React$' }],
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'sonarjs/cognitive-complexity': ['warn', 20],
            'sonarjs/no-duplicate-string': ['warn', { threshold: 4 }],
            'sonarjs/no-nested-conditional': 'warn',
            'sonarjs/pseudo-random': 'off',
        },
    },
    { files: ['src/**/*.ts'], languageOptions: { parser: tsParser } },
];
