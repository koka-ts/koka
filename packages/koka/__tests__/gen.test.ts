import * as Gen from '../src/gen'

describe('Gen', () => {
    it('should check if value is a generator', () => {
        function* gen() {}
        const notGen = () => {}

        expect(Gen.isGen(gen())).toBe(true)
        expect(Gen.isGen(notGen())).toBe(false)
    })

    it('should handle different types of generators', () => {
        function* emptyGen() {}
        function* numberGen() {
            yield 1
            yield 2
            yield 3
        }
        function* stringGen() {
            yield 'hello'
            yield 'world'
        }

        expect(Gen.isGen(emptyGen())).toBe(true)
        expect(Gen.isGen(numberGen())).toBe(true)
        expect(Gen.isGen(stringGen())).toBe(true)
    })

    it('should handle non-generator values', () => {
        expect(Gen.isGen(42)).toBe(false)
        expect(Gen.isGen('hello')).toBe(false)
        expect(Gen.isGen({})).toBe(false)
        expect(Gen.isGen([])).toBe(false)
        expect(Gen.isGen(null)).toBe(false)
        expect(Gen.isGen(undefined)).toBe(false)
        expect(Gen.isGen(() => {})).toBe(false)
    })

    it('should handle async generators', () => {
        async function* asyncGen() {
            yield 1
            yield 2
        }

        expect(Gen.isGen(asyncGen())).toBe(true)
    })
})
