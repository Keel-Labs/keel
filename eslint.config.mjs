import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'android/**',
      'dist/**',
      'ios/**',
      'node_modules/**',
      'server/**',
      'ui-design-helper/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'electron/**/*.ts',
      'src/**/*.{ts,tsx}',
      '*.ts',
      '*.mts',
      '*.cts',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'off',
      'no-misleading-character-class': 'off',
      'prefer-const': 'off',
    },
  },
);
