import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Close to the standard `yo code` extension template: the recommended sets plus the
// naming/curly/eqeqeq/semi rules the template ships. Type-aware rules are deliberately
// not enabled - typescript-eslint cannot load the TypeScript 7 compiler API.
export default tseslint.config(
    {
        ignores: ['out/**', 'out-test/**', 'bin/**', 'node_modules/**', '**/*.js', '**/*.mjs']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase']
                }
            ],
            curly: 'warn',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: 'warn'
        }
    }
);
