import { expect, test, describe } from 'bun:test'
import { modifyContent } from '../src/parsers'

describe('INI Entry Parsing', () => {
    test('modifyContent allows adding section and key named Entry', () => {
        const content = ''
        const mods = [{ key: 'Entry.key', value: 'value' }]
        const result = modifyContent(content, 'ini', mods)
        console.log(result)
        expect(result).toContain('[Entry]')
        expect(result).toContain('key=value')
    })

    test('modifyContent allows modifying existing section named Entry', () => {
        const content = '[Entry]\nkey=old'
        const mods = [{ key: 'Entry.key', value: 'value' }]
        const result = modifyContent(content, 'ini', mods)
        console.log(result)
        expect(result).toContain('[Entry]')
        expect(result).toContain('key=value')
    })
})
