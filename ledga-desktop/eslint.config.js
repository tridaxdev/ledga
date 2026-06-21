import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierPlugin from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import'
import unicornPlugin from 'eslint-plugin-unicorn'
import i18next from 'eslint-plugin-i18next'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'

export default [
    { ignores: ['dist', '**/*.cjs', '**/*.gen.tsx', '**/*.generated.ts', 'vite.config.ts', 'electron.vite.config.ts', 'vitest.config.ts', 'knip.config.ts', 'sql.d.ts', 'test/**/fixtures/**'] },
    {
        files: ['scripts/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.node
        }
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname
            }
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
            prettier: prettierPlugin,
            import: importPlugin,
            unicorn: unicornPlugin,
            i18next: i18next
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            ...prettierConfig.rules,
            'prettier/prettier': 'warn',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            'no-var': 'error',
            'prefer-const': 'warn',
            'one-var': ['warn', 'never'],
            'no-array-constructor': 'warn',
            'no-new-object': 'warn',
            'guard-for-in': 'warn',
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            curly: 'off',
            '@typescript-eslint/no-namespace': 'warn',
            'default-case': 'warn',
            'no-fallthrough': 'error',
            'new-parens': 'warn',
            'prefer-arrow-callback': 'warn',
            '@typescript-eslint/only-throw-error': 'error',
            'prefer-template': 'warn',
            'no-multi-str': 'warn',
            'prefer-rest-params': 'warn',
            'prefer-spread': 'warn',
            '@typescript-eslint/consistent-type-exports': 'warn',
            '@typescript-eslint/no-require-imports': 'warn',
            'import/no-mutable-exports': 'error',
            'import/order': [
                'warn',
                { groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'] }
            ],
            'no-extend-native': 'error',
            'no-prototype-builtins': 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-octal-escape': 'error',
            'no-octal': 'error',
            '@typescript-eslint/no-invalid-this': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            'no-cond-assign': 'error',
            'for-direction': 'error',
            'no-param-reassign': 'warn',
            'no-implicit-coercion': ['error', { boolean: false }],
            'no-extra-boolean-cast': 'error',
            'new-cap': 'error',
            '@typescript-eslint/prefer-for-of': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'error',
            'max-params': 'off',
            '@typescript-eslint/no-explicit-any': 'error',
            'i18next/no-literal-string': 'error',
            '@typescript-eslint/consistent-type-imports': ['error', {
                prefer: 'type-imports',
                disallowTypeAnnotations: false,
                fixStyle: 'separate-type-imports'
            }]
        }
    },
    {
        files: ['**/*.{ts,tsx}'],
        ...betterTailwindcss.configs['recommended-error'],
        rules: {
            ...betterTailwindcss.configs['recommended-error'].rules,
            'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
            'better-tailwindcss/no-unnecessary-whitespace': 'off'
        },
        settings: {
            'better-tailwindcss': {
                entryPoint: 'src/renderer/index.css'
            }
        }
    },
    {
        files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'i18next/no-literal-string': 'off'
        }
    }
]
