import { expect, test, describe } from 'bun:test'
// @ts-ignore
import FileUtils from '../src/utils/fs.js'

describe('FileUtils', () => {
    describe('unpackArchive', () => {
        test('throws an error for unsupported archive formats', () => {
            const sourceFile = 'test-archive.tar.gz'
            const destDir = '/tmp/dest'

            expect(() => {
                FileUtils.unpackArchive(sourceFile, destDir)
            }).toThrow('Critical Error: Unsupported archive format for test-archive.tar.gz. Only .zip is currently supported.')
        })
    })
})
