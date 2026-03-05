import { createHash } from 'node:crypto'
import {
    createReadStream,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
    statSync,
} from 'node:fs'
import { join } from 'node:path'

/**
 * Cache directory path.
 */
export const CACHE_DIR = '.cache'

/**
 * Cache directory path for provider data.
 */
export const PROVIDER_CACHE_DIR = join(CACHE_DIR, 'providers')

/**
 * Generates an MD5 hash for a given URL or identifier.
 * @param url The URL or identifier.
 * @returns The MD5 hash string.
 */
export function getUrlHash(url: string): string {
    return createHash('md5').update(url).digest('hex')
}

/**
 * Returns the path to the cache directory for a given URL.
 * @param url The URL.
 * @returns The path to the cache directory.
 */
export function getCachePath(url: string): string {
    const hash = getUrlHash(url)
    return join(CACHE_DIR, hash)
}

/**
 * Calculates the MD5 hash of a file's content.
 * @param filePath The path to the file.
 * @returns A promise that resolves to the MD5 hash string.
 */
export async function calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash('md5')
        const stream = createReadStream(filePath)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', reject)
    })
}

/**
 * Checks if a valid cached file exists for the given URL and filename.
 * Verifies that the `.hash` file exists and matches the actual file content's MD5 hash.
 * @param url The download URL.
 * @param filename The name of the downloaded file.
 * @returns A promise resolving to true if valid cache exists, false otherwise.
 */
export async function verifyCache(
    url: string,
    filename: string,
): Promise<boolean> {
    const dir = getCachePath(url)
    const hashFile = join(dir, '.hash')
    const filePath = join(dir, filename)

    if (!existsSync(hashFile) || !existsSync(filePath)) {
        return false
    }

    try {
        const storedHash = readFileSync(hashFile, 'utf-8').trim()
        const actualHash = await calculateFileHash(filePath)
        return storedHash === actualHash
    } catch (e) {
        return false
    }
}

/**
 * Clears the cache entry for a given URL.
 * @param url The download URL.
 */
export function clearCacheItem(url: string): void {
    const dir = getCachePath(url)
    if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
    }
}

/**
 * Clears the entire cache directory.
 */
export function clearAllCache(): void {
    if (existsSync(CACHE_DIR)) {
        rmSync(CACHE_DIR, { recursive: true, force: true })
    }
}

/**
 * Prepares the cache directory for a given URL and returns the path to save the file.
 * @param url The download URL.
 * @param filename The name of the file to save.
 * @returns The absolute path where the file should be saved.
 */
export function prepareCacheDir(url: string, filename: string): string {
    const dir = getCachePath(url)
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    return join(dir, filename)
}

/**
 * Marks a downloaded file as successfully cached by calculating its hash and writing the `.hash` file.
 * @param url The download URL.
 * @param filename The name of the downloaded file.
 */
export async function markAsCached(
    url: string,
    filename: string,
): Promise<void> {
    const dir = getCachePath(url)
    const filePath = join(dir, filename)
    const hashFile = join(dir, '.hash')

    const actualHash = await calculateFileHash(filePath)
    writeFileSync(hashFile, actualHash, 'utf-8')
}

/**
 * Retrieves cached provider data if it exists and is not older than the TTL.
 * @param provider The name of the provider (e.g., 'github', 'gitlab').
 * @param repo The repository name (e.g., 'user/repo').
 * @param ttlMs Time-to-live in milliseconds.
 * @returns The cached data object or null if expired/not found.
 */
export function getCachedProviderData(
    provider: string,
    repo: string,
    ttlMs: number,
): any | null {
    const safeRepo = repo.replace(/[^a-zA-Z0-9_-]/g, '_')
    const cacheFile = join(PROVIDER_CACHE_DIR, `${provider}_${safeRepo}.json`)

    if (existsSync(cacheFile)) {
        try {
            const stats = statSync(cacheFile)
            const now = Date.now()
            if (now - stats.mtimeMs < ttlMs) {
                const data = readFileSync(cacheFile, 'utf-8')
                return JSON.parse(data)
            }
        } catch (e) {
            // Error reading or parsing, ignore and return null
        }
    }
    return null
}

/**
 * Saves provider data to the cache.
 * @param provider The name of the provider (e.g., 'github', 'gitlab').
 * @param repo The repository name (e.g., 'user/repo').
 * @param data The data to cache.
 */
export function setCachedProviderData(
    provider: string,
    repo: string,
    data: any,
): void {
    if (!existsSync(PROVIDER_CACHE_DIR)) {
        mkdirSync(PROVIDER_CACHE_DIR, { recursive: true })
    }

    const safeRepo = repo.replace(/[^a-zA-Z0-9_-]/g, '_')
    const cacheFile = join(PROVIDER_CACHE_DIR, `${provider}_${safeRepo}.json`)

    try {
        writeFileSync(cacheFile, JSON.stringify(data), 'utf-8')
    } catch (e) {
        // Error writing, ignore
    }
}
