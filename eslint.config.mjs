// Gate G4. Deliberately small: the architectural rules are enforced by
// tools/check_boundaries.py, not by lint plugins, so this config only has to catch
// ordinary correctness mistakes.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/web/components/ui/**', // shadcn-generated; kept close to upstream
      'apps/api/openapi.json',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Domain and use-case layers must stay honest about types: an `any` here erases
    // the invariants the rest of the system relies on.
    files: ['packages/core/**/*.ts', 'packages/application/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
);
