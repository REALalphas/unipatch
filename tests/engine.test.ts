import { expect, test, describe, beforeAll, afterAll } from 'bun:test'
import {
    existsSync,
    readFileSync,
    rmSync,
    writeFileSync,
    mkdirSync,
    statSync,
} from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { pkg, get, create, edit, remove, copy, move, rename } from '../src/ast'
import { OUT_DIR, TMP_DIR_BASE } from '../src/engine'
import { clearAllCache } from '../src/cache'

const MOCK_ZIP_PATH = join(__dirname, 'mock.zip')
const MOCK_MALICIOUS_ZIP_PATH = join(__dirname, 'malicious.zip')
const LOCAL_MOCK_DIR = join(__dirname, 'local_mock_dir')
const LOCAL_MOCK_FILE = join(__dirname, 'local_mock.txt')

function createMockZip() {
    const zip = new AdmZip()
    zip.addFile('config.json', Buffer.from('{"version": 1}', 'utf8'))
    zip.addFile('data.txt', Buffer.from('hello world', 'utf8'))
    zip.addFile('ignore_me.txt', Buffer.from('ignore', 'utf8'))
    zip.writeZip(MOCK_ZIP_PATH)

    const maliciousZip = new AdmZip()
    // By default AdmZip cleans the path. So we add it with a safe name, then modify the entry directly.
    maliciousZip.addFile('hacked', Buffer.from('hacked', 'utf8'))
    maliciousZip.getEntries()[0]!.entryName = '../../etc/passwd'
    maliciousZip.writeZip(MOCK_MALICIOUS_ZIP_PATH)
}

describe('Execution Engine', () => {
    beforeAll(async () => {
        clearAllCache()
        createMockZip()

        // Create local files for local get tests
        mkdirSync(LOCAL_MOCK_DIR, { recursive: true })
        writeFileSync(join(LOCAL_MOCK_DIR, 'file1.txt'), 'file1 content')
        writeFileSync(join(LOCAL_MOCK_DIR, 'file2.txt'), 'file2 content')
        writeFileSync(LOCAL_MOCK_FILE, 'local file content')

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
        if (existsSync(MOCK_MALICIOUS_ZIP_PATH)) rmSync(MOCK_MALICIOUS_ZIP_PATH)
        if (existsSync(LOCAL_MOCK_DIR))
            rmSync(LOCAL_MOCK_DIR, { recursive: true, force: true })
        if (existsSync(LOCAL_MOCK_FILE)) rmSync(LOCAL_MOCK_FILE)
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
        // Verify it's a file, not a directory
        expect(statSync(join(OUT_DIR, 'docs', 'backup.txt')).isFile()).toBe(
            true,
        )
        expect(readFileSync(join(OUT_DIR, 'docs', 'backup.txt'), 'utf-8')).toBe(
            'hello',
        )

        expect(existsSync(join(OUT_DIR, 'docs', 'readme.txt'))).toBe(false) // Original moved

        expect(existsSync(join(OUT_DIR, 'docs', 'archive', 'readme.md'))).toBe(
            true,
        ) // Moved to new loc
        expect(
            statSync(join(OUT_DIR, 'docs', 'archive', 'readme.md')).isFile(),
        ).toBe(true)
        expect(
            readFileSync(
                join(OUT_DIR, 'docs', 'archive', 'readme.md'),
                'utf-8',
            ),
        ).toBe('hello')
    })

    test('Array src and trailing slash works for copy/move', async () => {
        const pipeline = pkg().put(
            create('file1.txt', '1'),
            create('file2.txt', '2'),
            create('dir1/a.txt', 'a'),
            copy(['file1.txt', 'file2.txt'], 'dest1'), // array implies destination is dir
            move('dir1', 'dest2/'), // trailing slash implies destination is dir
        )

        await pipeline.execute()

        expect(existsSync(join(OUT_DIR, 'dest1', 'file1.txt'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'dest1', 'file2.txt'))).toBe(true)

        expect(existsSync(join(OUT_DIR, 'dest2', 'dir1', 'a.txt'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'dir1'))).toBe(false)
    })

    test('Rename operations works for files and folders', async () => {
        const pipeline = pkg().put(
            create('old_name.txt', 'content'),
            create('old_folder/data.txt', 'data'),
            rename('old_name.txt', 'new_name.txt'),
            rename('old_folder', 'new_folder'),
        )

        await pipeline.execute()

        expect(existsSync(join(OUT_DIR, 'old_name.txt'))).toBe(false)
        expect(existsSync(join(OUT_DIR, 'new_name.txt'))).toBe(true)
        expect(readFileSync(join(OUT_DIR, 'new_name.txt'), 'utf-8')).toBe(
            'content',
        )

        expect(existsSync(join(OUT_DIR, 'old_folder'))).toBe(false)
        expect(existsSync(join(OUT_DIR, 'new_folder', 'data.txt'))).toBe(true)
        expect(
            readFileSync(join(OUT_DIR, 'new_folder', 'data.txt'), 'utf-8'),
        ).toBe('data')
    })

    test('Rename and copy overwrite checks', async () => {
        const pipeline1 = pkg().put(
            create('src.txt', 'a'),
            create('dest.txt', 'b'),
            copy('src.txt', 'dest.txt'),
        )
        await expect(pipeline1.execute()).rejects.toThrow(
            'Destination file already exists and overwrite is false',
        )

        const pipeline2 = pkg().put(
            create('src.txt', 'a'),
            create('dest.txt', 'b'),
            rename('src.txt', 'dest.txt'),
        )
        await expect(pipeline2.execute()).rejects.toThrow(
            'Destination already exists and overwrite is false',
        )

        // With overwrite true, it should succeed
        const pipeline3 = pkg().put(
            create('src.txt', 'a'),
            create('dest.txt', 'b'),
            copy('src.txt', 'dest.txt', { overwrite: true }),
        )
        await pipeline3.execute()
        expect(readFileSync(join(OUT_DIR, 'dest.txt'), 'utf-8')).toBe('a')
    })

    test('Rename multiple files throws error', async () => {
        const pipeline = pkg().put(
            create('file1.txt', '1'),
            create('file2.txt', '2'),
            rename('file*.txt', 'dest'),
        )
        await expect(pipeline.execute()).rejects.toThrow(
            'Multiple matches found',
        )
    })

    test('Copy multiple files without trailing slash throws error', async () => {
        const pipeline = pkg().put(
            create('file1.txt', '1'),
            create('file2.txt', '2'),
            copy('file*.txt', 'dest'), // no trailing slash
        )
        await expect(pipeline.execute()).rejects.toThrow(
            'Cannot copy multiple files to a single file path without a trailing slash: dest',
        )
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
            copy('file*.json', 'copied_jsons/'), // Added trailing slash to indicate directory
            move('other.txt', 'moved_other.txt'),
            remove('delete_me_*.json'),
        )

        await pipeline.execute()

        // 1. Verify edit on multiple files
        // Wait, files are removed by the last step, let's copy them first
        // Actually, we copy them, so copied_jsons/file1.json should have the edit.
        const copiedFile1 = readFileSync(
            join(OUT_DIR, 'copied_jsons', 'file1.json'),
            'utf-8',
        )
        const parsed = JSON.parse(copiedFile1)
        expect(parsed.a).toBe(1)
        expect(parsed.b).toBe(3) // Edit applied

        // 2. Verify copy with multiple matches creates a directory
        expect(existsSync(join(OUT_DIR, 'copied_jsons', 'file2.json'))).toBe(
            true,
        )

        // 3. Verify move
        expect(existsSync(join(OUT_DIR, 'moved_other.txt'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'other.txt'))).toBe(false)

        // 4. Verify remove with glob
        expect(existsSync(join(OUT_DIR, 'delete_me_1.json'))).toBe(false)
        expect(existsSync(join(OUT_DIR, 'delete_me_2.json'))).toBe(false)
    })

    test('Glob pattern errors on non-existent matches for copy, move, and edit', async () => {
        const copyPipeline = pkg().put(copy('non_existent_*.json', 'dest'))
        await expect(copyPipeline.execute()).rejects.toThrow(
            'Cannot copy non_existent_*.json: No matching source files found.',
        )

        const movePipeline = pkg().put(move('non_existent_*.json', 'dest'))
        await expect(movePipeline.execute()).rejects.toThrow(
            'Cannot move non_existent_*.json: No matching source files found.',
        )

        const editPipeline = pkg().put(edit('non_existent_*.json').set('a', 1))
        await expect(editPipeline.execute()).rejects.toThrow(
            'Cannot edit non_existent_*.json: No matching files found in the output directory.',
        )
    })

    test('Hacker case: Path traversal is prevented across operations', async () => {
        const traversalPaths = [
            '../../etc/passwd',
            '../outside.json',
            '/root/secret',
        ]

        for (const badPath of traversalPaths) {
            const createPipeline = pkg().put(create(badPath, 'hacked'))
            await expect(createPipeline.execute()).rejects.toThrow(
                /Security Error: Path traversal detected/,
            )

            const editPipeline = pkg().put(edit(badPath).set('hacked', true))
            await expect(editPipeline.execute()).rejects.toThrow(
                /Security Error: Path traversal detected/,
            )

            const removePipeline = pkg().put(remove(badPath))
            await expect(removePipeline.execute()).rejects.toThrow(
                /Security Error: Path traversal detected/,
            )

            const copySrcPipeline = pkg().put(copy(badPath, 'dest'))
            await expect(copySrcPipeline.execute()).rejects.toThrow(
                /Security Error: Path traversal detected/,
            )

            const copyDestPipeline = pkg().put(copy('src', badPath))
            await expect(copyDestPipeline.execute()).rejects.toThrow(
                /Security Error: Path traversal detected/,
            )

            const moveSrcPipeline = pkg().put(move(badPath, 'dest'))
            await expect(moveSrcPipeline.execute()).rejects.toThrow(
                /Security Error: Path traversal detected/,
            )

            const moveDestPipeline = pkg().put(move('src', badPath))
            await expect(moveDestPipeline.execute()).rejects.toThrow(
                /Security Error: Path traversal detected/,
            )
        }
    })

    test('Absurd case: downloading from random mock URL that returns bad HTTP status', async () => {
        // We temporarily override the mock fetch
        const originalFetch = global.fetch
        ;(global.fetch as any) = async (_url: string | URL | Request) => {
            return new Response('Not Found', {
                status: 404,
                statusText: 'Not Found',
            }) as unknown as Response
        }

        try {
            const pipeline = pkg().put(
                get('http://random-repo.com/bad-file.zip'),
            )
            await expect(pipeline.execute()).rejects.toThrow(
                'Failed to download http://random-repo.com/bad-file.zip: Not Found',
            )
        } finally {
            global.fetch = originalFetch
        }
    })

    test('Hacker case: Zip Slip vulnerability is mitigated', async () => {
        const originalFetch = global.fetch
        ;(global.fetch as any) = async (_url: string | URL | Request) => {
            const buf = readFileSync(MOCK_MALICIOUS_ZIP_PATH)
            return new Response(buf, { status: 200 }) as unknown as Response
        }

        try {
            const pipeline = pkg().put(
                get('http://mock.com/malicious.zip').unpack(),
            )
            await expect(pipeline.execute()).rejects.toThrow(
                /Security Error: Path traversal detected/,
            )
        } finally {
            global.fetch = originalFetch
        }
    })

    test('Local Get: File and Directory Copying', async () => {
        const pipeline = pkg().put(
            get(`local:${LOCAL_MOCK_FILE}`),
            get(`local:${LOCAL_MOCK_DIR}`),
        )

        await pipeline.execute()

        expect(existsSync(join(OUT_DIR, 'local_mock.txt'))).toBe(true)
        expect(readFileSync(join(OUT_DIR, 'local_mock.txt'), 'utf-8')).toBe(
            'local file content',
        )

        expect(existsSync(join(OUT_DIR, 'local_mock_dir', 'file1.txt'))).toBe(
            true,
        )
        expect(existsSync(join(OUT_DIR, 'local_mock_dir', 'file2.txt'))).toBe(
            true,
        )
        expect(
            readFileSync(join(OUT_DIR, 'local_mock_dir', 'file1.txt'), 'utf-8'),
        ).toBe('file1 content')
    })

    test('Local Get: Unpacking Directory', async () => {
        const pipeline = pkg().put(get(`local:${LOCAL_MOCK_DIR}`).unpack())

        await pipeline.execute()

        // Unpacking a directory should copy its contents directly into OUT_DIR
        expect(existsSync(join(OUT_DIR, 'file1.txt'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'file2.txt'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'local_mock_dir'))).toBe(false)
        expect(readFileSync(join(OUT_DIR, 'file1.txt'), 'utf-8')).toBe(
            'file1 content',
        )
    })

    test('Local Get: Unpacking and Filtering Directory', async () => {
        const pipeline = pkg().put(
            get(`local:${LOCAL_MOCK_DIR}`).unpack().ignore('file2.txt'),
        )

        await pipeline.execute()

        expect(existsSync(join(OUT_DIR, 'file1.txt'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'file2.txt'))).toBe(false) // Ignored
    })

    test('Local Get: Non-existent path', async () => {
        const pipeline = pkg().put(get('local:/path/that/does/not/exist.txt'))
        await expect(pipeline.execute()).rejects.toThrow('Local path not found')
    })

    test('Local Get: Empty path', async () => {
        const pipeline1 = pkg().put(get('local:'))
        await expect(pipeline1.execute()).rejects.toThrow('Local path cannot be empty: local:')

        const pipeline2 = pkg().put(get('local:   '))
        await expect(pipeline2.execute()).rejects.toThrow('Local path cannot be empty: local:   ')
    })

    test('Local Get: Unpacking a local zip file', async () => {
        const pipeline = pkg().put(get(`local:${MOCK_ZIP_PATH}`).unpack())
        await pipeline.execute()

        expect(existsSync(join(OUT_DIR, 'config.json'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'data.txt'))).toBe(true)
    })

    test('Local Get: Unpacking a local 7z file', async () => {
        const mock7zPath = join(__dirname, 'mock.7z')
        const pipeline = pkg().put(get(`local:${mock7zPath}`).unpack())
        await pipeline.execute()

        expect(existsSync(join(OUT_DIR, 'config.json'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'data.txt'))).toBe(true)
    })

    test('Unpack overwrite options', async () => {
        // execute() cleans OUT_DIR initially, so we need to run multiple nodes in one pipeline
        // to test the overwrite conflict, or manually create files.
        // We will create data.txt and then try to unpack.

        const pipelineConflict = pkg().put(
            create('data.txt', 'existing data'),
            get('http://mock.com/mock.zip').unpack({ overwrite: false }),
        )
        await expect(pipelineConflict.execute()).rejects.toThrow(
            /Cannot unpack because the following files already exist and overwrite is false:/,
        )

        const pipelineSuccess = pkg().put(
            create('data.txt', 'existing data'),
            get('http://mock.com/mock.zip').unpack({ overwrite: true }),
        )
        // With overwrite true (or undefined), it should not throw and the unpack should overwrite.
        await expect(pipelineSuccess.execute()).resolves.toBeUndefined()

        // Let's verify data.txt from the zip replaced "existing data"
        expect(readFileSync(join(OUT_DIR, 'data.txt'), 'utf8')).toBe(
            'hello world',
        )
    })

    test('GetNode to folder option works', async () => {
        const pipeline = pkg().put(
            get('http://mock.com/mock.zip').to('remote_dest').unpack(),
            get(`local:${LOCAL_MOCK_FILE}`).to('local_dest_file'),
            get(`local:${LOCAL_MOCK_DIR}`).to('local_dest_dir').unpack(),
        )

        await pipeline.execute()

        // Verify remote zip was unpacked into remote_dest
        expect(existsSync(join(OUT_DIR, 'remote_dest', 'config.json'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'remote_dest', 'data.txt'))).toBe(true)
        // The mock zip does not have a top-level folder, so they should be directly inside remote_dest

        // Verify local file was copied into local_dest_file
        expect(existsSync(join(OUT_DIR, 'local_dest_file', 'local_mock.txt'))).toBe(true)

        // Verify local dir was unpacked into local_dest_dir
        expect(existsSync(join(OUT_DIR, 'local_dest_dir', 'file1.txt'))).toBe(true)
        expect(existsSync(join(OUT_DIR, 'local_dest_dir', 'file2.txt'))).toBe(true)
    })

    test('GetNode to folder path traversal prevention', async () => {
        const pipeline = pkg().put(
            get('http://mock.com/mock.zip').to('../../etc/passwd').unpack(),
        )

        await expect(pipeline.execute()).rejects.toThrow(/Security Error: Path traversal detected/)
    })
})

    test('Local Get: Folder with trailing slash copies contents', async () => {
        const testDir = join(__dirname, 'test_trailing_slash')
        mkdirSync(join(testDir, 'sub'), { recursive: true })
        writeFileSync(join(testDir, 'file.txt'), 'content')
        writeFileSync(join(testDir, 'sub/file2.txt'), 'content2')

        try {
            await pkg().put(get(`local:${testDir}/`)).execute()

            expect(existsSync(join(OUT_DIR, 'file.txt'))).toBe(true)
            expect(existsSync(join(OUT_DIR, 'sub', 'file2.txt'))).toBe(true)
            // The folder itself shouldn't be created in OUT_DIR (except contents)
            expect(existsSync(join(OUT_DIR, 'test_trailing_slash'))).toBe(false)
        } finally {
            if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
        }
    })

    test('Local Get: Glob patterns copy matched files preserving structure', async () => {
        const testDir = join(__dirname, 'test_glob')
        mkdirSync(join(testDir, 'sub/nested'), { recursive: true })
        writeFileSync(join(testDir, 'file.txt'), 'content')
        writeFileSync(join(testDir, 'sub/file2.json'), 'content2')
        writeFileSync(join(testDir, 'sub/nested/file3.txt'), 'content3')
        writeFileSync(join(testDir, 'sub/nested/file4.json'), 'content4')

        try {
            // Should copy all .json files and preserve their directory structure relative to the glob base
            await pkg().put(get(`local:${testDir}/**/*.json`)).execute()

            expect(existsSync(join(OUT_DIR, 'sub', 'file2.json'))).toBe(true)
            expect(existsSync(join(OUT_DIR, 'sub', 'nested', 'file4.json'))).toBe(true)

            expect(existsSync(join(OUT_DIR, 'file.txt'))).toBe(false)
            expect(existsSync(join(OUT_DIR, 'sub', 'nested', 'file3.txt'))).toBe(false)
        } finally {
            if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
        }
    })
