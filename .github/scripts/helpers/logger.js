// SPDX-License-Identifier: Apache-2.0

/**
 * Logger helper used by review bots
 * Follows patterns from hiero-sdk-cpp
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
