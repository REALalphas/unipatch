import { expect, test, describe, beforeAll, afterAll } from 'bun:test'
import {
    existsSync,
    readFileSync,
    rmSync,
    writeFileSync,
    mkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import {
    CACHE_DIR,
    getUrlHash,
    getCachePath,
    calculateFileHash,
    verifyCache,
    clearCacheItem,
    clearAllCache,
    prepareCacheDir,
    markAsCached,
} from '../src/cache'

describe('Cache System', () => {
    beforeAll(() => {
        clearAllCache()
    })

    afterAll(() => {
        clearAllCache()
    })

    test('getUrlHash generates consistent md5 hash', () => {
        const url = 'https://example.com/file.zip'
        const hash1 = getUrlHash(url)
        const hash2 = getUrlHash(url)
        expect(hash1).toBe(hash2)
        expect(hash1).toHaveLength(32)
    })

    test('getCachePath returns correct path', () => {
        const url = 'https://example.com/file.zip'
        const hash = getUrlHash(url)
        expect(getCachePath(url)).toBe(join(CACHE_DIR, hash))
    })

    test('calculateFileHash computes correct md5 of a file', async () => {
        const testFilePath = join(__dirname, 'test.txt')
        writeFileSync(testFilePath, 'hello world')
        const hash = await calculateFileHash(testFilePath)
        rmSync(testFilePath)
        // MD5 of "hello world" is 5eb63bbbe01eeed093cb22bb8f5acdc3
        expect(hash).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3')
    })

    test('verifyCache returns false for non-existent cache', async () => {
        const url = 'https://example.com/missing.zip'
        expect(await verifyCache(url, 'missing.zip')).toBe(false)
    })

    test('cache flow: prepare, mark, verify, clear', async () => {
        const url = 'https://example.com/flow.zip'
        const filename = 'flow.zip'

        // 1. Prepare
        const filePath = prepareCacheDir(url, filename)
        expect(existsSync(getCachePath(url))).toBe(true)
        expect(filePath).toBe(join(getCachePath(url), filename))

        // Create a dummy file
        writeFileSync(filePath, 'dummy content')

        // 2. Mark as cached
        await markAsCached(url, filename)
        const hashFile = join(getCachePath(url), '.hash')
        expect(existsSync(hashFile)).toBe(true)
        expect(readFileSync(hashFile, 'utf-8')).not.toBe('')

        // 3. Verify
        expect(await verifyCache(url, filename)).toBe(true)

        // 4. Corrupt cache and verify
        writeFileSync(filePath, 'corrupted content')
        expect(await verifyCache(url, filename)).toBe(false)

        // 5. Clear
        clearCacheItem(url)
        expect(existsSync(getCachePath(url))).toBe(false)
    })
})
