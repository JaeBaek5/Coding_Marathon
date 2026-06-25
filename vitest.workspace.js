export default [
  {
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
