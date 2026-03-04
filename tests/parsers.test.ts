import { expect, test, describe } from 'bun:test'
import { setNestedValue, modifyContent } from '../src/parsers'

describe('Parsers & File Modifiers', () => {
    test('setNestedValue sets shallow keys', () => {
        const obj = {}
        setNestedValue(obj, 'key', 'value')
        expect(obj).toEqual({ key: 'value' })
    })

    test('setNestedValue sets deep keys', () => {
        const obj: Record<string, any> = { a: { d: 1 } }
        setNestedValue(obj, 'a.b.c', 'value')
        expect(obj).toEqual({ a: { b: { c: 'value' }, d: 1 } })
    })

    test('setNestedValue overwrites primitives with object for deep keys', () => {
        const obj: Record<string, any> = { a: 1 }
        setNestedValue(obj, 'a.b', 2)
        expect(obj).toEqual({ a: { b: 2 } })
    })

    test('modifyContent updates JSON', () => {
        const content = '{"a": 1}'
        const mods = [{ key: 'b.c', value: 2 }]
        const result = modifyContent(content, 'json', mods)
        // It uses JSON.stringify under the hood, so spaces will match
        expect(result).toContain('"a": 1')
        expect(result).toContain('"b": {')
        expect(result).toContain('"c": 2')
    })

    test('modifyContent updates JSON5 formats properly', () => {
        // json5 allows unquoted keys
        const content = '{a: 1}'
        const mods = [{ key: 'b.c', value: 2 }]
        const result = modifyContent(content, 'json', mods)
        const parsed = JSON.parse(result)
        expect(parsed).toEqual({ a: 1, b: { c: 2 } })
    })

    test('modifyContent updates YAML', () => {
        const content = 'a: 1\n'
        const mods = [{ key: 'b.c', value: 2 }]
        const result = modifyContent(content, 'yaml', mods)
        expect(result).toContain('a: 1')
        expect(result).toContain('b:\n  c: 2')
    })

    test('modifyContent updates INI', () => {
        const content = '[section]\na=1\n'
        const mods = [{ key: 'section.b', value: 2 }]
        const result = modifyContent(content, 'ini', mods)
        expect(result).toContain('[section]')
        expect(result).toContain('a=1')
        expect(result).toContain('b=2')
    })

    test('modifyContent updates INI preserving comments and formatting', () => {
        const content = `; this is a comment
# another comment
[exosphere]
debugmode=1
debugmode_user=0
; disable_user_exception_handlers=0

[system]
key=value`

        const mods = [
            { key: 'exosphere.debugmode_user', value: 1 },
            { key: 'system.new_key', value: 'hello' },
        ]

        const result = modifyContent(content, 'ini', mods)

        // Ensure comments are still there
        expect(result).toContain('; this is a comment')
        expect(result).toContain('# another comment')
        expect(result).toContain('; disable_user_exception_handlers=0')

        // Ensure value changed inline
        expect(result).toContain('debugmode_user=1')

        // Ensure untouched values remain
        expect(result).toContain('debugmode=1')
        expect(result).toContain('key=value')

        // Ensure new key was appended to correct section
        const lines = result.split('\n')
        const systemIndex = lines.findIndex((l) => l.trim() === '[system]')
        expect(lines[systemIndex + 1]).toBe('key=value')
        expect(lines[systemIndex + 2]).toBe('new_key=hello')
    })

    test('modifyContent updates INI and clears comments when requested', () => {
        const content = `; this is a comment
# another comment
[exosphere]
debugmode=1
debugmode_user=0
; disable_user_exception_handlers=0

[system]
key=value`

        const mods = [{ key: 'exosphere.debugmode_user', value: 1 }]

        const result = modifyContent(content, 'ini', mods, true) // true for clearComments

        // Ensure comments are gone
        expect(result).not.toContain('; this is a comment')
        expect(result).not.toContain('# another comment')
        expect(result).not.toContain('; disable_user_exception_handlers=0')

        // Ensure values remain correctly formatted
        expect(result).toContain('[exosphere]')
        expect(result).toContain('debugmode=1')
        expect(result).toContain('debugmode_user=1')
    })

    test('modifyContent throws on unsupported format', () => {
        expect(() => {
            modifyContent('{}', 'xml' as any, [])
        }).toThrow(/Unsupported format/)
    })
})
