import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

// Tests resolve @convert/* to SOURCE rather than to built dist. Production builds go
// through project references and dist; tests should not need a build step to run, or
// nobody runs them while writing code.
export default defineConfig({
  resolve: {
    alias: {
      '@convert/contracts': src('contracts'),
      '@convert/core': src('core'),
      '@convert/application': src('application'),
      '@convert/infra': src('infra'),
    },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: {
            '@convert/contracts': src('contracts'),
            '@convert/core': src('core'),
            '@convert/application': src('application'),
            '@convert/infra': src('infra'),
          },
        },
        test: {
          name: 'unit',
          globals: true,
          include: ['packages/*/src/**/*.spec.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '@convert/contracts': src('contracts'),
            '@convert/core': src('core'),
            '@convert/application': src('application'),
            '@convert/infra': src('infra'),
          },
        },
        test: {
          name: 'apps',
          globals: true,
          // Without this project a spec beside a composition root is collected by
          // nothing and passes by not existing.
          include: ['apps/*/src/**/*.spec.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '@convert/contracts': src('contracts'),
            '@convert/core': src('core'),
            '@convert/application': src('application'),
            '@convert/infra': src('infra'),
          },
        },
        test: {
          name: 'invariants',
          globals: true,
          include: ['tests/invariants/**/*.spec.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '@convert/contracts': src('contracts'),
            '@convert/core': src('core'),
            '@convert/application': src('application'),
            '@convert/infra': src('infra'),
          },
        },
        test: {
          name: 'integration',
          globals: true,
          include: ['tests/integration/**/*.spec.ts'],
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
