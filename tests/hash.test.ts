import { expect, test, describe } from 'bun:test'
// @ts-ignore
import { getMD5, getBufferMD5 } from '../src/utils/hash.js'

describe('Hash Utils', () => {
    test('getMD5 should return correct MD5 hash for a string', () => {
        const input = 'hello world'
        const expected = '5eb63bbbe01eeed093cb22bb8f5acdc3'
        expect(getMD5(input)).toBe(expected)
    })

    test('getMD5 should return correct MD5 hash for an empty string', () => {
        const input = ''
        const expected = 'd41d8cd98f00b204e9800998ecf8427e'
        expect(getMD5(input)).toBe(expected)
    })

    test('getBufferMD5 should return correct MD5 hash for a buffer', () => {
        const input = Buffer.from('hello world')
        const expected = '5eb63bbbe01eeed093cb22bb8f5acdc3'
        expect(getBufferMD5(input)).toBe(expected)
    })

    test('getBufferMD5 should return correct MD5 hash for an empty buffer', () => {
        const input = Buffer.from('')
        const expected = 'd41d8cd98f00b204e9800998ecf8427e'
        expect(getBufferMD5(input)).toBe(expected)
    })

    test('hashes should be consistent', () => {
        const input = 'consistent test'
        const hash1 = getMD5(input)
        const hash2 = getMD5(input)
        expect(hash1).toBe(hash2)

        const bufferInput = Buffer.from('consistent test')
        const hash3 = getBufferMD5(bufferInput)
        expect(hash3).toBe(hash1)
    })
})
