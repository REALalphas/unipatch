const crypto = require('crypto')

/**
 * Calculates the MD5 hash of a given string (e.g., URL).
 * @param {string} data
 * @returns {string}
 */
function getMD5(data) {
    return crypto.createHash('md5').update(data).digest('hex')
}

/**
 * Calculates the MD5 hash of a buffer.
 * @param {Buffer} buffer
 * @returns {string}
 */
function getBufferMD5(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex')
}

module.exports = {
    getMD5,
    getBufferMD5,
}
