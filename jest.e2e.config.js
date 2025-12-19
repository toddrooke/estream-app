/**
 * Jest configuration for E2E tests
 */

module.exports = {
  preset: 'react-native',
  testMatch: ['**/__tests__/e2e/**/*.test.ts'],
  testTimeout: 60000, // 60 seconds for E2E tests
  setupFilesAfterEnv: ['<rootDir>/__tests__/e2e/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testEnvironment: 'node',
  verbose: true,
};

