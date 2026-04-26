// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview
 * Automatically adds requested individual reviewers as assignees on Pull Requests.
 * 
 * This is part of the generic "on-review" infrastructure.
 * Team reviewers are intentionally ignored (only individual users are assigned).
 * Caps the number of assignees at MAX_ASSIGNEES (default: 2).
 */

const { createLogger, MAX_ASSIGNEES, BOT_NAME_ASSIGNEES } = require('./helpers/index.js');

const logger = createLogger(BOT_NAME_ASSIGNEES);

/**
 * Main handler that adds requested reviewers as assignees on a PR.
 *
 * Triggered by:
 *   - pull_request_target: review_requested
 *   - workflow_dispatch (for manual testing)
 *
 * Behavior:
 *   - Only processes individual reviewers (requested_reviewers)
 *   - Ignores team reviewers (requested_teams)
 *   - Skips users who are already assignees
 *   - Caps at MAX_ASSIGNEES (prevents too many assignments)
 *   - Warns when reviewers are dropped due to the cap
 *
 * @param {Object} params
 * @param {Object} params.github - GitHub Octokit client instance
 * @param {Object} params.context - GitHub Actions context object
 * @returns {Promise<void>}
 */
module.exports = async ({ github, context }) => {
  try {
    let prNumber = context.payload.pull_request?.number;
    const owner = context.repo.owner;
    const repo = context.repo.repo;

    // Support workflow_dispatch with manual PR number
    if (context.eventName === 'workflow_dispatch' && context.payload.inputs?.pr_number !== undefined) {
      const manual = Number(context.payload.inputs.pr_number);
      if (!Number.isInteger(manual) || manual <= 0) {
        logger.warn('Invalid PR number supplied. Skipping.');
        return;
      }
      prNumber = manual;
    }

    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      logger.warn('No PR number found. Skipping.');
      return;
    }

    logger.log(`Processing PR #${prNumber}`);

    const { data: pr } = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber
    });

    const requestedReviewers = pr.requested_reviewers || [];
    const currentAssignees = new Set((pr.assignees || []).map(a => a.login));

    const usersToAssign = new Set();

    // Only individual reviewers
    for (const reviewer of requestedReviewers) {
      if (reviewer?.login && !currentAssignees.has(reviewer.login)) {
        usersToAssign.add(reviewer.login);
      }
    }

    const assigneesList = Array.from(usersToAssign).slice(0, MAX_ASSIGNEES);

    if (assigneesList.length === 0) {
      logger.log('No new users to assign. Done.');
      return;
    }

    logger.log(`Will assign: ${assigneesList.join(', ')}`);

    // Warn if some reviewers were dropped due to cap
    if (usersToAssign.size > MAX_ASSIGNEES) {
      const dropped = Array.from(usersToAssign).slice(MAX_ASSIGNEES);
      logger.warn(`Assignee cap (${MAX_ASSIGNEES}) reached. Dropping: ${dropped.join(', ')}`);
    }

    await github.rest.issues.addAssignees({
      owner,
      repo,
      issue_number: prNumber,
      assignees: assigneesList
    });

    logger.log(`✅ Successfully added ${assigneesList.length} reviewer(s) as assignee(s)`);

  } catch (error) {
    logger.error('Failed:', error.message);
    if (error.status === 403) {
      logger.warn('Insufficient permissions - skipping');
      return;
    }
    throw error;
  }
};
