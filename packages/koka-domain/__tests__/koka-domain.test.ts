import { Domain } from '../src/koka-domain'
import { Eff } from 'koka'

describe('Domain', () => {
    describe('root()', () => {
        it('should create root domain', () => {
            const rootDomain = Domain.root<number>()
            expect(rootDomain).toBeInstanceOf(Domain)
        })

        it('should get root value', () => {
            const rootDomain = Domain.root<number>()
            const result = Eff.runResult(rootDomain.get(42))

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should set root value', () => {
            const rootDomain = Domain.root<number>()
            const setter = rootDomain.set(function* (number) {
                return number + 58
            })
            const result = Eff.runResult(setter(42))

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }
            expect(result.value).toBe(100)
        })
    })

    describe('prop()', () => {
        const objDomain = Domain.root<{ a: number }>().$prop('a')

        it('should get object property', () => {
            const result = Eff.runResult(objDomain.get({ a: 42 }))

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should set object property', () => {
            const setter = objDomain.set(function* () {
                return 100
            })
            const result = Eff.runResult(setter({ a: 42 }))

            if (result.type === 'err') {
                throw new Error('Expected an object but got an error')
            }

            expect(result.value).toEqual({ a: 100 })
        })
    })

    describe('index()', () => {
        const arrDomain = Domain.root<number[]>().$index(0)

        it('should get array index', () => {
            const result = Eff.runResult(arrDomain.get([42]))

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should set array index', () => {
            const setter = arrDomain.set(function* () {
                return 100
            })
            const result = Eff.runResult(setter([42]))

            if (result.type === 'err') {
                throw new Error('Expected an array but got an error')
            }

            expect(result.value).toEqual([100])
        })

        it('should throw when index out of bounds', () => {
            const result = Eff.runResult(arrDomain.get([]))

            if (result.type === 'ok') {
                throw new Error('Expected an error but got a number')
            }

            expect(result.type).toBe('err')
        })
    })

    describe('find()', () => {
        const findDomain = Domain.root<number[]>().$find((n) => n === 42)
        it('should find array item', () => {
            const result = Eff.runResult(findDomain.get([1, 42, 3]))

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should throw when item not found', () => {
            const result = Eff.run(Eff.result(findDomain.get([1, 2, 3])))

            if (result.type === 'ok') {
                throw new Error('Expected an error but got a number')
            }

            expect(result.type).toBe('err')
        })
    })

    describe('match()', () => {
        const matchDomain = Domain.root<string | number>().$match((v): v is number => typeof v === 'number')

        it('should match type predicate', () => {
            const result = Eff.runResult(matchDomain.get(42))

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should throw when not matched', () => {
            const result = Eff.run(Eff.result(matchDomain.get('test')))

            if (result.type === 'ok') {
                throw new Error('Expected an error but got a string')
            }

            expect(result.type).toBe('err')
        })
    })

    describe('map()', () => {
        const mapDomain = Domain.root<number[]>().$map({
            get: (n) => n * 2,
            set: (newN: number) => newN / 2,
        })

        it('should map array items', () => {
            const result = Eff.runResult(mapDomain.get([1, 2, 3]))

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toEqual([2, 4, 6])
        })

        it('should set mapped array', () => {
            const setter = mapDomain.set(function* () {
                return [4, 6, 8]
            })

            const result = Eff.runResult(setter([1, 2, 3]))

            if (result.type === 'err') {
                throw new Error('Expected an array but got an error')
            }

            expect(result.value).toEqual([2, 3, 4])
        })
    })

    describe('filter()', () => {
        const filterDomain = Domain.root<number[]>().$filter((n) => n > 2)

        it('should filter array items', () => {
            const result = Eff.runResult(filterDomain.get([1, 2, 3, 4]))

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toEqual([3, 4])
        })

        it('should set filtered array', () => {
            const setter = filterDomain.set(function* () {
                return [30, 40]
            })

            const result = Eff.runResult(setter([1, 2, 3, 4]))

            if (result.type === 'err') {
                throw new Error('Expected an array but got an error')
            }

            expect(result.value).toEqual([1, 2, 30, 40])
        })
    })

    describe('object()', () => {
        const rootDomain = Domain.root<{ a: number; b: string }>()

        const objDomain = Domain.object({
            a: rootDomain.$prop('a'),
            b: rootDomain.$prop('b'),
        })

        it('should create object domain', () => {
            const rootValue = { a: 42, b: 'test' }
            const result = Eff.runResult(objDomain.get(rootValue))

            if (result.type === 'err') {
                throw new Error('Expected an object but got an error')
            }

            expect(result.value).toEqual({ a: 42, b: 'test' })
        })

        it('should set object properties', () => {
            const setter = objDomain.set(function* () {
                return { a: 100, b: 'updated' }
            })

            const result = Eff.runResult(setter({ a: 42, b: 'test' }))

            if (result.type === 'err') {
                throw new Error('Expected an object but got an error')
            }

            expect(result.value).toEqual({ a: 100, b: 'updated' })
        })
    })

    describe('optional()', () => {
        const optDomain = Domain.optional(Domain.root<number>().$refine((n) => n > 10))
        it('should handle undefined value', () => {
            const result = Eff.runResult(optDomain.get(5))

            if (result.type === 'err') {
                throw new Error('Expected an undefined value but got an error')
            }

            expect(result.value).toBeUndefined()
        })

        it('should preserve defined value', () => {
            const result = Eff.runResult(optDomain.get(42))

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })
    })

    describe('caching behavior', () => {
        it('should cache prop access', () => {
            const domain = Domain.root<{ a: { value: number } }>().$prop('a')
            const obj = {
                a: {
                    value: 42,
                },
            }

            // First access - should cache
            const result1 = Eff.runResult(domain.get(obj))

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            // Second access - should use cache
            const result2 = Eff.runResult(domain.get(obj))

            if (result2.type === 'err') {
                throw new Error('Expected number but got error')
            }
            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache index access', () => {
            const domain = Domain.root<{ value: number }[]>().$index(0)
            const arr = [{ value: 42 }]

            // First access - should cache
            const result1 = Eff.runResult(domain.get(arr))

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            // Second access - should use cache
            const result2 = Eff.runResult(domain.get(arr))

            if (result2.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache filter results', () => {
            const domain = Domain.root<{ value: number }[]>()
                .$map((item) => item.$prop('value'))
                .$filter((n) => n > 2)
            const arr = [1, 2, 3, 4].map((n) => ({ value: n }))

            // First access - should cache
            const result1 = Eff.runResult(domain.get(arr))

            if (result1.type === 'err') {
                throw new Error('Expected array but got error')
            }

            // Second access - should use cache
            const result2 = Eff.runResult(domain.get(arr))

            if (result2.type === 'err') {
                throw new Error('Expected array but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache map operations', () => {
            const domain = Domain.root<{ value: number }[]>()
                .$map((item) => item.$prop('value'))
                .$map({
                    get: (n) => n * 2,
                    set: (newN: number) => newN / 2,
                })

            const arr = [1, 2, 3].map((n) => ({ value: n }))

            // First access - should cache
            const result1 = Eff.runResult(domain.get(arr))

            if (result1.type === 'err') {
                throw new Error('Expected array but got error')
            }

            // Second access - should use cache
            const result2 = Eff.runResult(domain.get(arr))
            if (result2.type === 'err') {
                throw new Error('Expected array but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache find operations', () => {
            const domain = Domain.root<{ value: number }[]>().$find((obj) => obj.value === 42)
            const arr = [1, 42, 3].map((n) => ({ value: n }))

            // First access - should cache
            const result1 = Eff.runResult(domain.get(arr))

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            // Second access - should use cache
            const result2 = Eff.runResult(domain.get(arr))

            if (result2.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache refine operations', () => {
            const domain = Domain.root<{ a: { value: number } }>()
                .$refine((obj) => obj.a.value > 2)
                .$prop('a')

            const okObj = {
                a: {
                    value: 42,
                },
            }

            const errObj = {
                a: {
                    value: 1,
                },
            }

            // First access - should cache
            const result1 = Eff.runResult(domain.get(okObj))
            const result2 = Eff.runResult(domain.get(errObj))

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            if (result2.type === 'ok') {
                throw new Error('Expected error but got number')
            }

            // Second access - should use cache
            const result3 = Eff.runResult(domain.get(okObj))
            const result4 = Eff.runResult(domain.get(errObj))

            if (result3.type === 'err') {
                throw new Error('Expected number but got error')
            }

            if (result4.type === 'ok') {
                throw new Error('Expected error but got number')
            }

            expect(result1.value === result3.value).toBe(true)
            expect(result2.type === result4.type).toBe(true)
        })

        it('should cache nested object operations', () => {
            const domain = Domain.root<{ a: { b: number }[] }>().$prop('a').$index(1)

            const obj = {
                a: [{ b: 42 }, { b: 100 }],
            }

            // First access - should cache
            const result1 = Eff.runResult(domain.get(obj))

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            // Second access - should use cache

            const result2 = Eff.runResult(domain.get(obj))

            if (result2.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })
    })

    describe('complex combinations', () => {
        it('should combine prop + refine + map', () => {
            const domain = Domain.root<{ a: number[] }>()
                .$prop('a')
                .$refine((arr: number[]) => arr.length > 0)
                .$map({
                    get: (value) => value * 2,
                    set: (newValue: number) => newValue / 2,
                })

            const result = Eff.runResult(domain.get({ a: [1, 2, 3] }))

            if (result.type === 'err') {
                throw new Error('Expected array but got error')
            }

            expect(result.value).toEqual([2, 4, 6])

            const setResult = Eff.runResult(
                domain.set(function* () {
                    return [4, 6, 8]
                })({ a: [1, 2, 3] }),
            )

            if (setResult.type === 'err') {
                throw new Error('Expected array but got error')
            }

            expect(setResult.value).toEqual({ a: [2, 3, 4] })

            const errResult = Eff.runResult(domain.get({ a: [] }))

            expect(errResult.type).toBe('err')
        })

        it('should combine index + filter + match', () => {
            const domain = Domain.root<(string | number)[]>()
                .$filter((v) => typeof v === 'number')
                .$index(0)

            let result = Eff.runResult(domain.get([42, 'test', 100]))

            if (result.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result.value).toBe(42)

            result = Eff.runResult(domain.get(['test', 42]))

            if (result.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result.value).toBe(42)

            result = Eff.runResult(domain.get(['test', 'test']))

            if (result.type === 'ok') {
                throw new Error('Expected error but got number')
            }

            expect(result.type).toBe('err')
        })

        it('should handle nested object operations', () => {
            const domain = Domain.root<{ user: { profile: { name: string; age: number } } }>()
                .$prop('user')
                .$prop('profile')

            const result = Eff.runResult(
                domain.get({
                    user: { profile: { name: 'Alice', age: 25 } },
                }),
            )

            if (result.type === 'err') {
                throw new Error('Expected object but got error')
            }

            expect(result.value).toEqual({ name: 'Alice', age: 25 })

            const setResult = Eff.runResult(
                domain.set(function* () {
                    return { name: 'Bob', age: 30 }
                })({
                    user: { profile: { name: 'Alice', age: 25 } },
                }),
            )

            if (setResult.type === 'err') {
                throw new Error('Expected object but got error')
            }

            expect(setResult.value).toEqual({
                user: { profile: { name: 'Bob', age: 30 } },
            })
        })
    })
})
