import { expect, test, describe, beforeAll, afterAll } from 'bun:test'
import {
    existsSync,
    readFileSync,
    rmSync,
    writeFileSync,
    mkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { pkg, get, create, edit, remove, copy, move } from '../src/ast'
import { OUT_DIR, TMP_DIR_BASE } from '../src/engine'
import { clearAllCache } from '../src/cache'

const MOCK_ZIP_PATH = join(__dirname, 'mock.zip')

function createMockZip() {
    const zip = new AdmZip()
    zip.addFile('config.json', Buffer.from('{"version": 1}', 'utf8'))
    zip.addFile('data.txt', Buffer.from('hello world', 'utf8'))
    zip.addFile('ignore_me.txt', Buffer.from('ignore', 'utf8'))
    zip.writeZip(MOCK_ZIP_PATH)
}

describe('Execution Engine', () => {
    beforeAll(() => {
        clearAllCache()
        createMockZip()

        // Mock fetch to simulate downloading the local zip
        // Fix diagnostics:
        // 1. Cast global.fetch to 'any' to resolve 'Property 'preconnect' is missing' error.
        // 2. Rename 'url' to '_url' to resolve the 'url' is declared but its value is never read' error.
        // 3. Replace 'RequestInfo' with 'string | URL | Request' to resolve 'Cannot find name 'RequestInfo'' error.
        ;(global.fetch as any) = async (_url: string | URL | Request) => {
            const buf = readFileSync(MOCK_ZIP_PATH)
            // We must mock the body so it can be used as a Web ReadableStream
            const response = new Response(buf, { status: 200 })
            return response as unknown as Response
        }
    })

    afterAll(() => {
        clearAllCache()
        if (existsSync(MOCK_ZIP_PATH)) rmSync(MOCK_ZIP_PATH)
        if (existsSync(OUT_DIR))
            rmSync(OUT_DIR, { recursive: true, force: true })
    })

    test('Full E2E Execution Flow', async () => {
        const pipeline = pkg().put(
            get('http://mock.com/mock.zip').unpack().ignore('ignore_me.txt'),
            create('new_config.yaml', { author: 'jules' }),
            edit('config.json').set('version', 2).set('new_key', 'value'),
            remove('data.txt'),
        )

        await pipeline.execute()

        // 1. Verify `out` directory exists
        expect(existsSync(OUT_DIR)).toBe(true)

        // 2. Verify tmp directory is cleaned up
        expect(existsSync(TMP_DIR_BASE)).toBe(false)

        // 3. Verify GetNode unpack & ignore worked
        expect(existsSync(join(OUT_DIR, 'config.json'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'ignore_me.txt'))).toBe(false) // Ignored
        expect(existsSync(join(OUT_DIR, 'data.txt'))).toBe(false) // Removed by later step

        // 4. Verify CreateNode worked
        const yamlContent = readFileSync(
            join(OUT_DIR, 'new_config.yaml'),
            'utf-8',
        )
        expect(yamlContent).toContain('author: jules')

        // 5. Verify EditNode worked
        const jsonContent = readFileSync(join(OUT_DIR, 'config.json'), 'utf-8')
        const parsed = JSON.parse(jsonContent)
        expect(parsed.version).toBe(2)
        expect(parsed.new_key).toBe('value')
    })

    test('Engine merges subdirectories instead of replacing them', async () => {
        // execute() clears the out dir first, so we need to set up the files using AST steps
        // to properly test the merge functionality.
        const pipeline = pkg().put(
            create('system/data.txt', 'preserve me'),
            create('system/config.ini', { a: 1 }, { type: 'ini' }), // INI format requires an object to serialize properly
            edit('system/config.ini').set('b', 2),
        )

        await pipeline.execute()

        // Ensure data.txt is still there
        expect(existsSync(join(OUT_DIR, 'system', 'data.txt'))).toBe(true)
        expect(readFileSync(join(OUT_DIR, 'system', 'data.txt'), 'utf8')).toBe(
            'preserve me',
        )

        // Ensure config.ini was updated
        const updatedIni = readFileSync(
            join(OUT_DIR, 'system', 'config.ini'),
            'utf8',
        )
        expect(updatedIni).toContain('a=1')
        expect(updatedIni).toContain('b=2')
    })

    test('Copy and Move file operations', async () => {
        const pipeline = pkg().put(
            create('docs/readme.txt', 'hello'),
            copy('docs/readme.txt', 'docs/backup.txt'),
            move('docs/readme.txt', 'docs/archive/readme.md'),
        )

        await pipeline.execute()

        expect(existsSync(join(OUT_DIR, 'docs', 'backup.txt'))).toBe(true)
        expect(readFileSync(join(OUT_DIR, 'docs', 'backup.txt'), 'utf-8')).toBe(
            'hello',
        )

        expect(existsSync(join(OUT_DIR, 'docs', 'readme.txt'))).toBe(false) // Original moved

        expect(existsSync(join(OUT_DIR, 'docs', 'archive', 'readme.md'))).toBe(
            true,
        ) // Moved to new loc
        expect(
            readFileSync(
                join(OUT_DIR, 'docs', 'archive', 'readme.md'),
                'utf-8',
            ),
        ).toBe('hello')
    })

    test('Copy and Move directory operations with filters', async () => {
        const pipeline = pkg().put(
            create('src/index.js', 'code'),
            create('src/test.spec.js', 'test code'),
            create('src/data.json', '{}'),

            // Copy src to build, but ignore .spec.js files
            copy('src', 'build').ignore('*.spec.js'),

            // Move src to archive, but only take .json files
            move('src', 'archive').only('*.json'),
        )

        await pipeline.execute()

        // 1. Verify Copy
        expect(existsSync(join(OUT_DIR, 'build', 'index.js'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'build', 'data.json'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'build', 'test.spec.js'))).toBe(false) // Ignored

        // 2. Verify Move
        expect(existsSync(join(OUT_DIR, 'src'))).toBe(false) // Should be gone

        expect(existsSync(join(OUT_DIR, 'archive', 'data.json'))).toBe(true) // Kept by only
        expect(existsSync(join(OUT_DIR, 'archive', 'index.js'))).toBe(false) // Filtered out by only
        expect(existsSync(join(OUT_DIR, 'archive', 'test.spec.js'))).toBe(false) // Filtered out by only
    })

    test('Glob pattern support for file operations', async () => {
        const pipeline = pkg().put(
            create('file1.json', { a: 1 }),
            create('file2.json', { a: 2 }),
            create('delete_me_1.json', { a: 3 }),
            create('delete_me_2.json', { a: 4 }),
            create('other.txt', 'hello'),
            edit('*.json').set('b', 3),
            copy('file*.json', 'copied_jsons'),
            move('other.txt', 'moved_other.txt'),
            remove('delete_me_*.json')
        )

        await pipeline.execute()

        // 1. Verify edit on multiple files
        // Wait, files are removed by the last step, let's copy them first
        // Actually, we copy them, so copied_jsons/file1.json should have the edit.
        const copiedFile1 = readFileSync(join(OUT_DIR, 'copied_jsons', 'file1.json'), 'utf-8')
        const parsed = JSON.parse(copiedFile1)
        expect(parsed.a).toBe(1)
        expect(parsed.b).toBe(3) // Edit applied

        // 2. Verify copy with multiple matches creates a directory
        expect(existsSync(join(OUT_DIR, 'copied_jsons', 'file2.json'))).toBe(true)

        // 3. Verify move
        expect(existsSync(join(OUT_DIR, 'moved_other.txt'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'other.txt'))).toBe(false)

        // 4. Verify remove with glob
        expect(existsSync(join(OUT_DIR, 'delete_me_1.json'))).toBe(false)
        expect(existsSync(join(OUT_DIR, 'delete_me_2.json'))).toBe(false)
    })

    test('Glob pattern errors on non-existent matches for copy, move, and edit', async () => {
        const copyPipeline = pkg().put(copy('non_existent_*.json', 'dest'))
        await expect(copyPipeline.execute()).rejects.toThrow('Cannot copy non_existent_*.json: No matching source files found.')

        const movePipeline = pkg().put(move('non_existent_*.json', 'dest'))
        await expect(movePipeline.execute()).rejects.toThrow('Cannot move non_existent_*.json: No matching source files found.')

        const editPipeline = pkg().put(edit('non_existent_*.json').set('a', 1))
        await expect(editPipeline.execute()).rejects.toThrow('Cannot edit non_existent_*.json: No matching files found in the output directory.')
    })
})
