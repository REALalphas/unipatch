const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getMD5, getBufferMD5 } = require('./hash');

const CACHE_DIR = path.join(process.cwd(), '.cache');

/**
 * Ensures the cache directory exists.
 */
function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * Downloads a file with retries and caching.
 * @param {string} url The URL to download.
 * @param {number} retries Number of retries (default 3).
 * @param {number} delay Delay between retries in ms (default 5000).
 * @returns {Promise<string>} The path to the cached file.
 */
async function downloadFile(url, retries = 3, delay = 5000) {
    ensureCacheDir();
    const urlHash = getMD5(url);
    // Extract extension from URL, fallback to .bin
    const urlExtMatch = url.match(/\.([a-z0-9]+)(?:[\?#]|$)/i);
    const ext = urlExtMatch ? `.${urlExtMatch[1]}` : '.bin';
    const cachedFilePath = path.join(CACHE_DIR, `${urlHash}${ext}`);
    const hashFilePath = path.join(CACHE_DIR, `${urlHash}.hash`);

    // Check cache
    if (fs.existsSync(cachedFilePath) && fs.existsSync(hashFilePath)) {
        const expectedHash = fs.readFileSync(hashFilePath, 'utf8').trim();
        const fileBuffer = fs.readFileSync(cachedFilePath);
        const actualHash = getBufferMD5(fileBuffer);

        if (expectedHash === actualHash) {
            return cachedFilePath; // Cache hit
        } else {
            // Invalid cache, remove
            fs.unlinkSync(cachedFilePath);
            fs.unlinkSync(hashFilePath);
        }
    }

    // Download with retries
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'arraybuffer'
            });

            const fileBuffer = Buffer.from(response.data);
            const fileHash = getBufferMD5(fileBuffer);

            fs.writeFileSync(cachedFilePath, fileBuffer);
            fs.writeFileSync(hashFilePath, fileHash);

            return cachedFilePath;
        } catch (error) {
            // If it's the last attempt or it's a critical error (like 404), throw
            if (attempt === retries || (error.response && error.response.status === 404)) {
                throw new Error(`Critical Error: Failed to download ${url} - ${error.message}`);
            }

            console.warn(`[Warning] Download failed for ${url} (Attempt ${attempt}/${retries}). Retrying in ${delay / 1000}s...`);
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

module.exports = {
    downloadFile,
    CACHE_DIR
};
