import { expect, test, describe } from 'bun:test'
import {
    get,
    create,
    edit,
    remove,
    copy,
    move,
    rename,
    pkg,
    GetNode,
    CreateNode,
    EditNode,
    RemoveNode,
    CopyNode,
    MoveNode,
    RenameNode,
} from '../src/ast'

describe('AST & DSL', () => {
    test('GetNode builder pattern works correctly', () => {
        const node = get('https://example.com/file.zip')
            .unpack()
            .ignore('*.txt')
            .only('*.json')

        expect(node).toBeInstanceOf(GetNode)
        expect(node.url).toBe('https://example.com/file.zip')
        expect(node.shouldUnpack).toBe(true)
        expect(node.ignorePatterns).toEqual(['*.txt'])
        expect(node.onlyPatterns).toEqual(['*.json'])
    })

    test('CreateNode infers types correctly', () => {
        const jsonNode = create('config.json', { a: 1 })
        expect(jsonNode.format).toBe('json')

        const yamlNode = create('config.yaml', { a: 1 })
        expect(yamlNode.format).toBe('yaml')

        const iniNode = create('config.ini', { a: 1 })
        expect(iniNode.format).toBe('ini')

        const textNode = create('config.txt', 'hello')
        expect(textNode.format).toBe('text')

        const explicitNode = create(
            'config.unknown',
            { a: 1 },
            { type: 'json' },
        )
        expect(explicitNode.format).toBe('json')
    })

    test('EditNode builder pattern works correctly', () => {
        const node = edit('config.json')
            .typeFormat('json')
            .set('a.b', 1)
            .set('c', 2)

        expect(node).toBeInstanceOf(EditNode)
        expect(node.path).toBe('config.json')
        expect(node.format).toBe('json')
        expect(node.modifications).toEqual([
            { key: 'a.b', value: 1 },
            { key: 'c', value: 2 },
        ])
        expect(node.shouldClearComments).toBe(false)
    })

    test('EditNode clearComments works correctly', () => {
        const node = edit('config.ini').clearComments()
        expect(node.shouldClearComments).toBe(true)
    })

    test('RemoveNode works correctly', () => {
        const node = remove('config.json')
        expect(node).toBeInstanceOf(RemoveNode)
        expect(node.path).toBe('config.json')
    })

    test('CopyNode works correctly with filters', () => {
        const node = copy('src_folder', 'dest_folder')
            .ignore('*.txt')
            .only('*.json')

        expect(node).toBeInstanceOf(CopyNode)
        expect(node.src).toBe('src_folder')
        expect(node.dest).toBe('dest_folder')
        expect(node.ignorePatterns).toEqual(['*.txt'])
        expect(node.onlyPatterns).toEqual(['*.json'])
    })

    test('MoveNode works correctly with filters', () => {
        const node = move('old_name.json', 'new_name.json').ignore('temp/*')

        expect(node).toBeInstanceOf(MoveNode)
        expect(node.src).toBe('old_name.json')
        expect(node.dest).toBe('new_name.json')
        expect(node.ignorePatterns).toEqual(['temp/*'])
    })

    test('RenameNode works correctly', () => {
        const node = rename('old_name.json', 'new_name.json', { overwrite: true })

        expect(node).toBeInstanceOf(RenameNode)
        expect(node.src).toBe('old_name.json')
        expect(node.dest).toBe('new_name.json')
        expect(node.options.overwrite).toBe(true)
    })

    test('pkg context collects AST nodes', () => {
        const context = pkg().put(
            get('url').unpack(),
            edit('config.ini').set('a', 1),
            create('new.json'),
            rename('old', 'new'),
        )

        expect(context.steps.length).toBe(4)
        expect(context.steps[0]!.type).toBe('Get')
        expect(context.steps[1]!.type).toBe('Edit')
        expect(context.steps[2]!.type).toBe('Create')
        expect(context.steps[3]!.type).toBe('Rename')
    })
})
