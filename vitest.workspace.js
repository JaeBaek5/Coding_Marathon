import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    resolve: {
      alias: {
        '@shared': path.resolve(rootDir, 'shared')
      }
    },
    test: {
      name: 'client',
      environment: 'jsdom',
      include: ['client/src/**/*.test.js']
    }
  },
  {
    test: {
      name: 'server-unit',
      environment: 'node',
      include: ['server/src/unit/**/*.test.js']
    }
  },
  {
    test: {
      name: 'server-contract',
      environment: 'node',
      include: ['server/src/contract/**/*.test.js']
    }
  },
  {
    test: {
      name: 'server-integration',
      environment: 'node',
      include: ['server/src/integration/**/*.test.js']
    }
  }
];
