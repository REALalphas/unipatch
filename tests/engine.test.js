import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test'
import { get, create, edit, remove as del, pkg } from '../src/index'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'

const OUT_DIR = path.join(process.cwd(), 'out')
const CACHE_DIR = path.join(process.cwd(), '.cache')
const TMP_DIR = path.join(process.cwd(), '.unipatch_tmp')

const originalFetch = global.fetch;

describe('Declarative Firmware Deployment Engine (Legacy JS Test)', () => {
    beforeEach(() => {
        if (fs.existsSync(OUT_DIR))
            fs.rmSync(OUT_DIR, { recursive: true, force: true })
        if (fs.existsSync(TMP_DIR))
            fs.rmSync(TMP_DIR, { recursive: true, force: true })
        if (fs.existsSync(CACHE_DIR))
            fs.rmSync(CACHE_DIR, { recursive: true, force: true })

        global.fetch = mock(async (url) => {
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('Dummy Content'));
                    controller.close();
                }
            });
            return {
                ok: true,
                body: stream,
                arrayBuffer: async () => new ArrayBuffer(8)
            };
        });
    })

    afterAll(() => {
        if (fs.existsSync(OUT_DIR))
            fs.rmSync(OUT_DIR, { recursive: true, force: true })
        if (fs.existsSync(TMP_DIR))
            fs.rmSync(TMP_DIR, { recursive: true, force: true })
        if (fs.existsSync(CACHE_DIR))
            fs.rmSync(CACHE_DIR, { recursive: true, force: true })

        global.fetch = originalFetch;
    })

    it('should build the AST correctly', () => {
        const source = get('github:user/repo', { version: 'latest' })
            .unpack()
            .ignore('*.txt')

        const createNode = create('config/settings.ini', '', { type: 'ini' })
        const editNode = edit('config/settings.ini').typeFormat('ini').set('Core.Enabled', 'true')
        const delNode = del('useless_folder')

        const pipeline = pkg().put(source, createNode, editNode, delNode)

        const nodes = pipeline.steps

        expect(nodes.length).toBe(4)
        expect(nodes[0].type).toBe('Get')
        expect(nodes[1].type).toBe('Create')
        expect(nodes[2].type).toBe('Edit')
        expect(nodes[3].type).toBe('Remove') // the new name is RemoveNode

        expect(nodes[0].options.version).toBe('latest')
        expect(nodes[0].shouldUnpack).toBe(true)
        expect(nodes[0].ignorePatterns).toContain('*.txt')
        expect(nodes[2].modifications[0].key).toBe('Core.Enabled')
    })

    it('should download a simple file and put it in out/', async () => {
        const source = get('http://example.com/dummy.txt')
        const createNode = create('test_file.txt', 'Hello World')
        const createIni = create('config.ini', { Core: { Version: '1.0' } }, { type: 'ini' })

        const pipeline = pkg().put(source, createNode, createIni)

        await pipeline.execute()

        expect(fs.existsSync(path.join(OUT_DIR, 'test_file.txt'))).toBe(true)
        expect(
            fs.readFileSync(path.join(OUT_DIR, 'test_file.txt'), 'utf8'),
        ).toBe('Hello World')

        const iniContent = fs.readFileSync(
            path.join(OUT_DIR, 'config.ini'),
            'utf8',
        )
        expect(iniContent).toContain('Version=1.0')
    })
})
