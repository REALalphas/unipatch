import { expect, test, describe } from 'bun:test'
import { modifyContent } from '../src/parsers'

describe('INI Object Parsing', () => {
    test('modifyContent handles object as value', () => {
        const content = ''
        const mods = [{ key: 'Entry', value: { a: 1, b: 2 } }]
        const result = modifyContent(content, 'ini', mods)
        expect(result).toContain('[Entry]')
        expect(result).toContain('a=1')
        expect(result).toContain('b=2')
    })
})
