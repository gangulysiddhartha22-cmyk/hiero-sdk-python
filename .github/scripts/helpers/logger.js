// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview
 * Simple logger utility for GitHub Actions bots with consistent
 * prefixes and levels.
 */

/**
 * Creates a logger instance for a specific bot.
 *
 * @param {string} botName - Name of the bot (e.g. 'reviewers-assignee')
 * @returns {Object} Logger with info, warn, error methods
 */
function createLogger(botName) {
  const prefix = `[${botName}]`;
  return {
    log:   (...args) => console.log(prefix, ...args),
    info:  (...args) => console.info(prefix, ...args),
    warn:  (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}

module.exports = { createLogger };
