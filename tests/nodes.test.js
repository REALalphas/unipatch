import { describe, expect, test } from 'bun:test'
import { ASTNode, GetNode, CreateNode, EditNode, DeleteNode, PutNode } from '../src/ast/nodes.js'

describe('AST Nodes (Legacy JS)', () => {
    describe('ASTNode', () => {
        test('initializes with correct nodeType', () => {
            const node = new ASTNode('TestType')
            expect(node.nodeType).toBe('TestType')
        })
    })

    describe('GetNode', () => {
        test('initializes with correct source and default options', () => {
            const node = new GetNode('github:user/repo')
            expect(node.nodeType).toBe('Get')
            expect(node.source).toBe('github:user/repo')
            expect(node.options).toEqual({})
            expect(node.artifactPattern).toBeNull()
            expect(node.shouldUnpack).toBe(false)
            expect(node.unpackFormat).toBeNull()
            expect(node.ignorePatterns).toEqual([])
            expect(node.onlyPatterns).toEqual([])
        })

        test('initializes with custom options', () => {
            const node = new GetNode('http://example.com', { version: '1.0' })
            expect(node.options).toEqual({ version: '1.0' })
        })

        test('builder method: artifact()', () => {
            const node = new GetNode('source').artifact('*.zip')
            expect(node.artifactPattern).toBe('*.zip')
            expect(node).toBeInstanceOf(GetNode)
        })

        test('builder method: unpack()', () => {
            const node = new GetNode('source').unpack()
            expect(node.shouldUnpack).toBe(true)
            expect(node.unpackFormat).toBeNull()

            const nodeWithFormat = new GetNode('source').unpack('zip')
            expect(nodeWithFormat.shouldUnpack).toBe(true)
            expect(nodeWithFormat.unpackFormat).toBe('zip')
        })

        test('builder method: ignore()', () => {
            const node = new GetNode('source')
            node.ignore('*.txt').ignore('temp/*')
            expect(node.ignorePatterns).toEqual(['*.txt', 'temp/*'])
        })

        test('builder method: only()', () => {
            const node = new GetNode('source')
            node.only('*.json').only('config/*')
            expect(node.onlyPatterns).toEqual(['*.json', 'config/*'])
        })

        test('chaining builder methods', () => {
            const node = new GetNode('source')
                .artifact('*.tar.gz')
                .unpack('tar')
                .ignore('test/*')
                .only('src/*')

            expect(node.artifactPattern).toBe('*.tar.gz')
            expect(node.shouldUnpack).toBe(true)
            expect(node.unpackFormat).toBe('tar')
            expect(node.ignorePatterns).toEqual(['test/*'])
            expect(node.onlyPatterns).toEqual(['src/*'])
        })
    })

    describe('CreateNode', () => {
        test('initializes as file with correct path, contents, and default options', () => {
            const node = new CreateNode('path/to/file.txt', 'Hello World')
            expect(node.nodeType).toBe('Create')
            expect(node.targetPath).toBe('path/to/file.txt')
            expect(node.contents).toBe('Hello World')
            expect(node.options).toEqual({})
        })

        test('initializes as folder when contents is null', () => {
            const node = new CreateNode('path/to/folder', null)
            expect(node.targetPath).toBe('path/to/folder')
            expect(node.contents).toBeNull()
        })

        test('initializes with custom options', () => {
            const node = new CreateNode('path/to/config.ini', { key: 'value' }, { type: 'ini' })
            expect(node.targetPath).toBe('path/to/config.ini')
            expect(node.contents).toEqual({ key: 'value' })
            expect(node.options).toEqual({ type: 'ini' })
        })
    })

    describe('EditNode', () => {
        test('initializes with target path and default properties', () => {
            const node = new EditNode('path/to/file.json')
            expect(node.nodeType).toBe('Edit')
            expect(node.targetPath).toBe('path/to/file.json')
            expect(node.editType).toBe('raw')
            expect(node.changes).toEqual([])
        })

        test('builder method: type()', () => {
            const node = new EditNode('path').type('json')
            expect(node.editType).toBe('json')
            expect(node).toBeInstanceOf(EditNode)
        })

        test('builder method: set()', () => {
            const node = new EditNode('path')

            // raw mode: set(search, replace)
            node.set('foo', 'bar')
            expect(node.changes.length).toBe(1)
            expect(node.changes[0]).toEqual({ action: 'set', args: ['foo', 'bar'] })

            // ini mode: set(section, key, value)
            node.set('Core', 'Enabled', 'true')
            expect(node.changes.length).toBe(2)
            expect(node.changes[1]).toEqual({ action: 'set', args: ['Core', 'Enabled', 'true'] })
        })

        test('chaining builder methods', () => {
            const node = new EditNode('path')
                .type('ini')
                .set('key1', 'value1')
                .set('section2', 'key2', 'value2')

            expect(node.editType).toBe('ini')
            expect(node.changes).toEqual([
                { action: 'set', args: ['key1', 'value1'] },
                { action: 'set', args: ['section2', 'key2', 'value2'] }
            ])
        })
    })

    describe('DeleteNode', () => {
        test('initializes with target path', () => {
            const node = new DeleteNode('path/to/delete')
            expect(node.nodeType).toBe('Delete')
            expect(node.targetPath).toBe('path/to/delete')
        })
    })

    describe('PutNode', () => {
        test('initializes with source node', () => {
            const source = new GetNode('source')
            const node = new PutNode(source)
            expect(node.nodeType).toBe('Put')
            expect(node.sourceNode).toBe(source)
        })
    })
})
