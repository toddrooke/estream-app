/**
 * Jest setup for E2E tests
 */

// Increase timeout for all tests
jest.setTimeout(60000);

// Global setup
beforeAll(() => {
  console.log('='.repeat(80));
  console.log('Starting E2E Test Suite');
  console.log('='.repeat(80));
});

// Global teardown
afterAll(() => {
  console.log('='.repeat(80));
  console.log('E2E Test Suite Complete');
  console.log('='.repeat(80));
});

