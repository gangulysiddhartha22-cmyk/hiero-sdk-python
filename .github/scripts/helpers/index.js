// SPDX-License-Identifier: Apache-2.0

const { createLogger } = require('./logger.js');
const constants = require('./constants.js');

module.exports = {
  createLogger,
  MAX_ASSIGNEES: constants.MAX_ASSIGNEES,
  BOT_NAME_ASSIGNEES: constants.BOT_NAME_ASSIGNEES,
};
