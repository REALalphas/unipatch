import { expect, test, describe } from 'bun:test'
import { modifyContent } from '../src/parsers'

describe('INI Edge Cases', () => {
    test('last section without trailing newline', () => {
        const content = '[Entry]\nkey1=val1'
        const mods = [{ key: 'Entry.key2', value: 'val2' }]
        const result = modifyContent(content, 'ini', mods)
        expect(result).toContain('key2=val2')
        console.log("TEST 1:\n" + result)
    })

    test('add to empty file', () => {
        const content = ''
        const mods = [{ key: 'Entry.key', value: 'val' }]
        const result = modifyContent(content, 'ini', mods)
        expect(result).toContain('[Entry]\nkey=val')
        console.log("TEST 2:\n" + result)
    })

    test('edit existing key', () => {
        const content = '[Entry]\nkey=old'
        const mods = [{ key: 'Entry.key', value: 'new' }]
        const result = modifyContent(content, 'ini', mods)
        expect(result).toContain('key=new')
        console.log("TEST 3:\n" + result)
    })
})
