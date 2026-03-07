import { expect, test, describe } from 'bun:test'
import { modifyContent } from '../src/parsers'

describe('INI User Reported Issues', () => {
    test('bracket in entry name should be stripped', () => {
        const content = ''
        const mods = [{ key: '[Entry].key', value: 'val' }]
        const result = modifyContent(content, 'ini', mods)
        expect(result).toContain('[Entry]')
        expect(result).not.toContain('[[Entry]]')
        expect(result).toContain('key=val')
    })

    test('setting an object as value should expand to keys', () => {
        const content = ''
        const mods = [{ key: 'Entry', value: { key1: 'val1', key2: 'val2' } }]
        const result = modifyContent(content, 'ini', mods)
        expect(result).toContain('[Entry]')
        expect(result).toContain('key1=val1')
        expect(result).toContain('key2=val2')
    })

    test('editing existing entry with object value', () => {
        const content = '[Entry]\nkey1=old'
        const mods = [{ key: 'Entry', value: { key1: 'new', key2: 'val2' } }]
        const result = modifyContent(content, 'ini', mods)
        expect(result).toContain('[Entry]')
        expect(result).toContain('key1=new')
        expect(result).toContain('key2=val2')
    })

    test('editing existing entry with brackets in key', () => {
        const content = '[Entry]\nkey=old'
        const mods = [{ key: '[Entry].key', value: 'new' }]
        const result = modifyContent(content, 'ini', mods)
        // Should only have one [Entry] section
        expect(result.match(/\[Entry\]/g)?.length).toBe(1)
        expect(result).toContain('key=new')
        expect(result).not.toContain('key=old')
    })

    test('inline comments on section header', () => {
        const content = '[Entry] ; this is a comment\nkey=old'
        const mods = [{ key: 'Entry.key', value: 'new' }]
        const result = modifyContent(content, 'ini', mods)
        expect(result.match(/\[Entry\]/g)?.length).toBe(1)
        expect(result).toContain('key=new')
        expect(result).not.toContain('key=old')
    })
})
