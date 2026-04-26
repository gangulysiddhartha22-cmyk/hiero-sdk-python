// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview
 * Unit tests for the bot-pr-add-reviewers-as-assignees.js script.
 * 
 * Tests cover individual reviewers, team ignoring, deduplication, assignee cap,
 * workflow_dispatch support, error handling (403 graceful, 500 rethrow), etc.
 */

const assert = require('assert');
const { createLogger } = require('../helpers/index.js');

const logger = createLogger('test-reviewers-assignee');

/**
 * Creates fresh state for each test to prevent leakage between tests.
 *
 * @returns {Object} Test state object
 */
function createTestState() {
  return {
    addAssigneesCalls: [],
    currentPrData: null
  };
}

/**
 * Creates a mock GitHub Actions context object.
 *
 * @param {Object} payload - The payload to include in the context
 * @returns {Object} Mock context
 */
const createMockContext = (payload) => ({
  repo: { owner: 'hiero-ledger', repo: 'hiero-sdk-python' },
  eventName: 'pull_request_target',
  payload
});

/**
 * Creates a properly configured mock GitHub client that returns test-specific PR data.
 *
 * @param {Object} state - Test state containing currentPrData and addAssigneesCalls
 * @returns {Object} Mock GitHub client
 */
function createMockGithub(state) {
  return {
    rest: {
      pulls: {
        get: async ({ pull_number }) => ({
          data: {
            number: pull_number,
            requested_reviewers: state.currentPrData?.requested_reviewers || [],
            requested_teams: state.currentPrData?.requested_teams || [],
            assignees: state.currentPrData?.assignees || []
          }
        })
      },
      issues: {
        addAssignees: async (params) => {
          state.addAssigneesCalls.push(params);
          return { data: {} };
        }
      }
    }
  };
}

/**
 * Creates an error mock for testing error handling paths (403, 500, etc.).
 *
 * @param {number} status - HTTP status code to throw
 * @returns {Object} Mock GitHub client that throws on addAssignees
 */
const createErrorMock = (status) => ({
  rest: {
    pulls: {
      get: async ({ pull_number }) => ({
        data: {
          number: pull_number,
          requested_reviewers: [{ login: 'x' }],
          requested_teams: [],
          assignees: []
        }
      })
    },
    issues: {
      addAssignees: async () => {
        throw { status, message: `Error ${status}` };
      }
    }
  }
});

// ==================== Test Cases ====================

/**
 * Test that individual reviewers are correctly added as assignees.
 */
async function testIndividualReviewers(handler) {
  console.log('Test 1: Individual reviewers');
  const state = createTestState();

  state.currentPrData = {
    requested_reviewers: [{ login: 'alice' }, { login: 'bob' }],
    assignees: []
  };

  const mockGithub = createMockGithub(state);
  const ctx = createMockContext({ pull_request: { number: 123, ...state.currentPrData } });

  await handler({ github: mockGithub, context: ctx });

  assert.strictEqual(state.addAssigneesCalls.length, 1);
  assert.deepStrictEqual(state.addAssigneesCalls[0].assignees.sort(), ['alice', 'bob']);
  console.log('✅ Passed');
}

async function testTeamIgnored(handler) {
  console.log('Test 2: Teams ignored');
  const state = createTestState();

  state.currentPrData = {
    requested_reviewers: [{ login: 'charlie' }],
    requested_teams: [{ slug: 'team1' }],
    assignees: []
  };

  const mockGithub = createMockGithub(state);
  const ctx = createMockContext({ pull_request: { number: 124, ...state.currentPrData } });

  await handler({ github: mockGithub, context: ctx });

  assert.strictEqual(state.addAssigneesCalls.length, 1, 'Should make exactly one addAssignees call');
  assert.deepStrictEqual(state.addAssigneesCalls[0].assignees, ['charlie'],
    'Should assign only individual reviewers, not team members');
  console.log('✅ Passed');
}

async function testDeduplication(handler) {
  console.log('Test 3: Deduplication');
  const state = createTestState();

  state.currentPrData = {
    requested_reviewers: [{ login: 'alice' }],
    assignees: [{ login: 'alice' }]
  };

  const mockGithub = createMockGithub(state);
  const ctx = createMockContext({ pull_request: { number: 125, ...state.currentPrData } });

  await handler({ github: mockGithub, context: ctx });

  assert.strictEqual(state.addAssigneesCalls.length, 0);
  console.log('✅ Passed');
}

async function testCapAtTwo(handler) {
  console.log('Test 4: Cap at 2');
  const state = createTestState();

  state.currentPrData = {
    requested_reviewers: [{ login: 'u1' }, { login: 'u2' }, { login: 'u3' }],
    assignees: []
  };

  const mockGithub = createMockGithub(state);
  const ctx = createMockContext({ pull_request: { number: 126, ...state.currentPrData } });

  await handler({ github: mockGithub, context: ctx });

  assert.strictEqual(state.addAssigneesCalls[0].assignees.length, 2);
  console.log('✅ Passed');
}

async function testWorkflowDispatch(handler) {
  console.log('Test 5: workflow_dispatch');
  const state = createTestState();

  state.currentPrData = { requested_reviewers: [{ login: 'eve' }], assignees: [] };

  const mockGithub = createMockGithub(state);
  const ctx = {
    repo: { owner: 'hiero-ledger', repo: 'hiero-sdk-python' },
    eventName: 'workflow_dispatch',
    payload: { inputs: { pr_number: 128 } }
  };

  await handler({ github: mockGithub, context: ctx });

  assert.strictEqual(state.addAssigneesCalls[0].issue_number, 128);
  console.log('✅ Passed');
}

async function testNoReviewers(handler) {
  console.log('Test 6: No reviewers');
  const state = createTestState();

  state.currentPrData = { requested_reviewers: [], assignees: [] };

  const mockGithub = createMockGithub(state);
  const ctx = createMockContext({ pull_request: { number: 129, ...state.currentPrData } });

  await handler({ github: mockGithub, context: ctx });

  assert.strictEqual(state.addAssigneesCalls.length, 0);
  console.log('✅ Passed');
}

async function testInvalidPrNumber(handler) {
  console.log('Test 7: Invalid PR number on workflow_dispatch');
  const badValues = ['0', '-1', '12.5', 'abc', ''];

  for (const v of badValues) {
    const state = createTestState();
    const ctx = {
      repo: { owner: 'hiero-ledger', repo: 'hiero-sdk-python' },
      eventName: 'workflow_dispatch',
      payload: { inputs: { pr_number: v } }
    };
    await handler({ github: createMockGithub(state), context: ctx });
    assert.strictEqual(state.addAssigneesCalls.length, 0);
  }
  console.log('✅ Passed');
}

async function testTeamOnly(handler) {
  console.log('Test 8: Team-only request');
  const state = createTestState();

  state.currentPrData = {
    requested_reviewers: [],
    requested_teams: [{ slug: 'team' }],
    assignees: []
  };

  const mockGithub = createMockGithub(state);
  const ctx = createMockContext({ pull_request: { number: 130, ...state.currentPrData } });

  await handler({ github: mockGithub, context: ctx });

  assert.strictEqual(state.addAssigneesCalls.length, 0);
  console.log('✅ Passed');
}

async function testPartialDeduplication(handler) {
  console.log('Test 9: Partial deduplication');
  const state = createTestState();

  state.currentPrData = {
    requested_reviewers: [{ login: 'alice' }, { login: 'bob' }],
    assignees: [{ login: 'alice' }]
  };

  const mockGithub = createMockGithub(state);
  const ctx = createMockContext({ pull_request: { number: 131, ...state.currentPrData } });

  await handler({ github: mockGithub, context: ctx });

  assert.deepStrictEqual(state.addAssigneesCalls[0].assignees, ['bob']);
  console.log('✅ Passed');
}

async function test403Graceful(handler) {
  console.log('Test 10: 403 graceful handling');
  const state = createTestState();
  let addAssigneesWasCalled = false;

  const errorMock = {
    rest: {
      pulls: {
        get: async () => ({
          data: { requested_reviewers: [{ login: 'x' }], assignees: [] }
        })
      },
      issues: {
        addAssignees: async () => {
          addAssigneesWasCalled = true;
          throw { status: 403, message: 'Permission denied' };
        }
      }
    }
  };

  const ctx = createMockContext({ pull_request: { number: 132 } });

  await handler({ github: errorMock, context: ctx });

  assert.strictEqual(addAssigneesWasCalled, true);
  console.log('✅ Passed (403 was caught and handled gracefully)');
}

async function test500Rethrow(handler) {
  console.log('Test 11: 500 should rethrow');
  const ctx = createMockContext({ pull_request: { number: 133 } });

  await assert.rejects(
    () => handler({ github: createErrorMock(500), context: ctx }),
    (err) => err.status === 500
  );
  console.log('✅ Passed');
}

async function runTests() {
  console.log('\n🚀 Running tests for bot-pr-add-reviewers-as-assignees.js...\n');

  const handler = require('../bot-pr-add-reviewers-as-assignees.js');

  await testIndividualReviewers(handler);
  await testTeamIgnored(handler);
  await testDeduplication(handler);
  await testCapAtTwo(handler);
  await testWorkflowDispatch(handler);
  await testNoReviewers(handler);
  await testInvalidPrNumber(handler);
  await testTeamOnly(handler);
  await testPartialDeduplication(handler);
  await test403Graceful(handler);
  await test500Rethrow(handler);

  console.log('\n🎉 All 11 tests passed!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
