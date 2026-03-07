import { expect, test, describe } from 'bun:test'
import { modifyContent } from '../src/parsers'

describe('INI Comments', () => {
    test('section with inline comment', () => {
        const content = '[Entry] ; this is a comment\nkey=old'
        const mods = [{ key: 'Entry.key', value: 'new' }]
        const result = modifyContent(content, 'ini', mods)
        expect(result).toContain('[Entry]')
        expect(result).toContain('key=new')
        expect(result).not.toContain('key=old')
    })
})
