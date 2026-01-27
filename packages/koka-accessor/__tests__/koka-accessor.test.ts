import * as Accessor from '../src/koka-accessor.ts'

describe('Accessor', () => {
    describe('root()', () => {
        it('should create root accessor', () => {
            const rootAccessor = Accessor.root<number>()
            expect(rootAccessor).toBeInstanceOf(Accessor.Accessor)
        })

        it('should get root value', () => {
            const rootAccessor = Accessor.root<number>()
            const result = Accessor.get(42, rootAccessor)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should set root value', () => {
            const rootAccessor = Accessor.root<number>()
            const result = Accessor.set(42, rootAccessor, (number) => number + 58)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(100)
        })
    })

    describe('prop()', () => {
        const propAccessor = Accessor.root<{ a: number }>().prop('a')

        it('should get object property', () => {
            const result = Accessor.get({ a: 42 }, propAccessor)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should set object property', () => {
            const result = Accessor.set({ a: 42 }, propAccessor, 100)

            if (result.type === 'err') {
                throw new Error('Expected an object but got an error')
            }

            expect(result.value).toEqual({ a: 100 })
        })
    })

    describe('index()', () => {
        const indexAccessor = Accessor.root<number[]>().index(0)

        it('should get array index', () => {
            const result = Accessor.get([42], indexAccessor)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should set array index', () => {
            const result = Accessor.set([42], indexAccessor, 100)

            if (result.type === 'err') {
                throw new Error('Expected an array but got an error')
            }

            expect(result.value).toEqual([100])
        })

        it('should throw when index out of bounds', () => {
            const result = Accessor.get([], indexAccessor)
            expect(result.type).toBe('err')
            if (result.type === 'err') {
                expect(result.error).toMatch(/out of bounds/)
            }
        })
    })

    describe('find()', () => {
        const findAccessor = Accessor.root<number[]>().find((n) => n === 42)

        it('should find array item', () => {
            const result = Accessor.get([1, 2, 3, 42], findAccessor)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should throw when item not found', () => {
            const result = Accessor.get([1, 2, 3], findAccessor)

            if (result.type === 'ok') {
                throw new Error('Expected an error but got a number')
            }

            expect(result.type).toBe('err')
        })
    })

    describe('match()', () => {
        const matchAccessor = Accessor.root<string | number>().match((v): v is number => typeof v === 'number')

        it('should match type predicate', () => {
            const result = Accessor.get(42, matchAccessor)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should throw when not matched', () => {
            const result = Accessor.get('test', matchAccessor)

            if (result.type === 'ok') {
                throw new Error('Expected an error but got a string')
            }

            expect(result.type).toBe('err')
        })
    })

    describe('map()', () => {
        const mapAccessor = Accessor.root<number[]>().map({
            get: (n) => Accessor.ok(n * 2),
            set: (newN: number) => Accessor.ok(newN / 2),
        })

        it('should map array items', () => {
            const result = Accessor.get([1, 2, 3], mapAccessor)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toEqual([2, 4, 6])
        })

        it('should set mapped array', () => {
            const result = Accessor.set([1, 2, 3], mapAccessor, [4, 6, 8])

            if (result.type === 'err') {
                throw new Error('Expected an array but got an error')
            }

            expect(result.value).toEqual([2, 3, 4])
        })
    })

    describe('filter()', () => {
        const filterAccessor = Accessor.root<number[]>().filter((n) => n > 2)

        it('should filter array items', () => {
            const result = Accessor.get([1, 2, 3, 4], filterAccessor)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toEqual([3, 4])
        })

        it('should set filtered array', () => {
            const result = Accessor.set([1, 2, 3, 4], filterAccessor, [30, 40])

            if (result.type === 'err') {
                throw new Error('Expected an array but got an error')
            }

            expect(result.value).toEqual([1, 2, 30, 40])
        })
    })

    describe('object()', () => {
        const rootAccessor = Accessor.root<{ a: number; b: string }>()

        const objAccessor = Accessor.object({
            a: rootAccessor.prop('a'),
            b: rootAccessor.prop('b'),
        })

        it('should create object accessor', () => {
            const rootValue = { a: 42, b: 'test' }
            const result = Accessor.get(rootValue, objAccessor)

            if (result.type === 'err') {
                throw new Error('Expected an object but got an error')
            }

            expect(result.value).toEqual({ a: 42, b: 'test' })
        })

        it('should set object properties', () => {
            const result = Accessor.set({ a: 42, b: 'test' }, objAccessor, { a: 100, b: 'updated' })

            if (result.type === 'err') {
                throw new Error('Expected an object but got an error')
            }

            expect(result.value).toEqual({ a: 100, b: 'updated' })
        })
    })

    describe('optional()', () => {
        const optAccessor = Accessor.optional(Accessor.root<number>().refine((n) => n > 10))

        it('should handle undefined value', () => {
            const result = Accessor.get(5, optAccessor)

            if (result.type === 'err') {
                throw new Error('Expected an undefined value but got an error')
            }

            expect(result.value).toBeUndefined()
        })

        it('should preserve defined value', () => {
            const result = Accessor.get(42, optAccessor)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })
    })

    describe('caching behavior', () => {
        it('should cache prop access', () => {
            const accessor = Accessor.root<{ a: { value: number } }>().prop('a')

            const obj = {
                a: {
                    value: 42,
                },
            }

            // First access - should cache
            const result1 = Accessor.get(obj, accessor)

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            // Second access - should use cache
            const result2 = Accessor.get(obj, accessor)

            if (result2.type === 'err') {
                throw new Error('Expected number but got error')
            }
            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache index access', () => {
            const accessor = Accessor.root<{ value: number }[]>().index(0)
            const arr = [{ value: 42 }]

            // First access - should cache
            const result1 = Accessor.get(arr, accessor)

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            // Second access - should use cache
            const result2 = Accessor.get(arr, accessor)

            if (result2.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache filter results', () => {
            const accessor = Accessor.root<{ value: number }[]>()
                .map((item) => item.prop('value'))
                .filter((n) => n > 2)

            const arr = [1, 2, 3, 4].map((n) => ({ value: n }))

            // First access - should cache
            const result1 = Accessor.get(arr, accessor)

            if (result1.type === 'err') {
                throw new Error('Expected array but got error')
            }

            // Second access - should use cache
            const result2 = Accessor.get(arr, accessor)

            if (result2.type === 'err') {
                throw new Error('Expected array but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache map operations', () => {
            const accessor = Accessor.root<{ value: number }[]>()
                .map((item) => item.prop('value'))
                .map({
                    get: (n) => Accessor.ok(n * 2),
                    set: (newN: number) => Accessor.ok(newN / 2),
                })

            const arr = [1, 2, 3].map((n) => ({ value: n }))

            // First access - should cache
            const result1 = Accessor.get(arr, accessor)

            if (result1.type === 'err') {
                throw new Error('Expected array but got error')
            }

            // Second access - should use cache
            const result2 = Accessor.get(arr, accessor)
            if (result2.type === 'err') {
                throw new Error('Expected array but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache find operations', () => {
            const accessor = Accessor.root<{ value: number }[]>().find((obj) => obj.value === 42)

            const arr = [1, 42, 3].map((n) => ({ value: n }))

            // First access - should cache
            const result1 = Accessor.get(arr, accessor)

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            // Second access - should use cache
            const result2 = Accessor.get(arr, accessor)

            if (result2.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })

        it('should cache refine operations', () => {
            const accessor = Accessor.root<{ a: { value: number } }>()
                .refine((obj) => obj.a.value > 2)
                .prop('a')

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
            const result1 = Accessor.get(okObj, accessor)
            const result2 = Accessor.get(errObj, accessor)

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            if (result2.type === 'ok') {
                throw new Error('Expected error but got number')
            }

            // Second access - should use cache
            const result3 = Accessor.get(okObj, accessor)
            const result4 = Accessor.get(errObj, accessor)

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
            const accessor = Accessor.root<{ a: { b: number }[] }>().prop('a').index(1)

            const obj = {
                a: [{ b: 42 }, { b: 100 }],
            }

            // First access - should cache
            const result1 = Accessor.get(obj, accessor)

            if (result1.type === 'err') {
                throw new Error('Expected number but got error')
            }

            // Second access - should use cache

            const result2 = Accessor.get(obj, accessor)

            if (result2.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result1.value === result2.value).toBe(true)
        })
    })

    describe('complex combinations', () => {
        it('should combine prop + refine + map', () => {
            const accessor = Accessor.root<{ a: number[] }>()
                .prop('a')
                .refine((arr: number[]) => arr.length > 0)
                .map({
                    get: (value) => Accessor.ok(value * 2),
                    set: (newValue: number) => Accessor.ok(newValue / 2),
                })

            const result = Accessor.get({ a: [1, 2, 3] }, accessor)

            if (result.type === 'err') {
                throw new Error('Expected array but got error')
            }

            expect(result.value).toEqual([2, 4, 6])

            const setResult = Accessor.set({ a: [1, 2, 3] }, accessor, [4, 6, 8])

            if (setResult.type === 'err') {
                throw new Error('Expected array but got error')
            }

            expect(setResult.value).toEqual({ a: [2, 3, 4] })

            const errResult = Accessor.get({ a: [] }, accessor)

            expect(errResult.type).toBe('err')
        })

        it('should combine index + filter + match', () => {
            const accessor = Accessor.root<(string | number)[]>()
                .filter((v) => typeof v === 'number')
                .index(0)

            let result = Accessor.get([42, 'test', 100], accessor)

            if (result.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result.value).toBe(42)

            result = Accessor.get(['test', 42], accessor)

            if (result.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result.value).toBe(42)

            result = Accessor.get(['test', 'test'], accessor)

            if (result.type === 'ok') {
                throw new Error('Expected error but got number')
            }

            expect(result.type).toBe('err')
        })

        it('should handle nested object operations', () => {
            const accessor = Accessor.root<{ user: { profile: { name: string; age: number } } }>()
                .prop('user')
                .prop('profile')

            const result = Accessor.get({ user: { profile: { name: 'Alice', age: 25 } } }, accessor)

            if (result.type === 'err') {
                throw new Error('Expected object but got error')
            }

            expect(result.value).toEqual({ name: 'Alice', age: 25 })

            const setResult = Accessor.set({ user: { profile: { name: 'Alice', age: 25 } } }, accessor, {
                name: 'Bob',
                age: 30,
            })

            if (setResult.type === 'err') {
                throw new Error('Expected object but got error')
            }

            expect(setResult.value).toEqual({
                user: { profile: { name: 'Bob', age: 30 } },
            })
        })

        it('fails when updating a non-existent array item', () => {
            const accessor = Accessor.root<{ items: { value: number }[] }>().prop('items').index(5)

            const result = Accessor.set({ items: [{ value: 1 }, { value: 2 }] }, accessor, { value: 100 })

            expect(result.type).toBe('err')
        })
    })

    describe('select()', () => {
        it('should do nothing if no operations are provided', () => {
            const rootAccessor = Accessor.root<number>()
            const accessor = rootAccessor.proxy((p) => p)
            const result = Accessor.get(42, accessor)

            expect(accessor === rootAccessor).toBe(true)

            if (result.type === 'err') {
                throw new Error('Expected a number but got an error')
            }

            expect(result.value).toBe(42)
        })

        it('should create accessor from property access', () => {
            const accessor = Accessor.root<{ a: number }>().proxy((p) => p.a)

            const result = Accessor.get({ a: 42 }, accessor)

            if (result.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result.value).toBe(42)
        })

        it('should create accessor from index access', () => {
            const accessor = Accessor.root<number[]>().proxy((p) => p[0])
            const result = Accessor.get([42], accessor)

            if (result.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result.value).toBe(42)
        })

        it('should chain multiple operations', () => {
            const accessor = Accessor.root<{ items: { value: number }[] }>().proxy((p) => p.items[0].value)

            const result = Accessor.get({ items: [{ value: 42 }] }, accessor)

            if (result.type === 'err') {
                throw new Error('Expected number but got error')
            }

            expect(result.value).toBe(42)
        })

        it('should maintain type inference', () => {
            const accessor = Accessor.root<{ a: { b: string } }>().proxy((p) => p.a.b)

            const result = Accessor.get({ a: { b: 'test' } }, accessor)

            if (result.type === 'err') {
                throw new Error('Expected string but got error')
            }

            expect(result.value).toBe('test')
        })

        it('should support deep, nesting, mixed prop/index accessing', () => {
            type State = {
                a: {
                    b: {
                        c: {
                            e: {
                                f: {
                                    g: {
                                        h: string
                                    }[]
                                }
                            }
                        }[]
                    }
                }
            }
            const accessor: Accessor.Accessor<string, State> = Accessor.root<State>().proxy(
                (p: Accessor.AccessorProxy<State>): Accessor.AccessorProxy<string> => p.a.b.c[1].e.f.g[2].h,
            )

            const state: State = {
                a: {
                    b: {
                        c: [
                            { e: { f: { g: [{ h: 'first' }] } } },
                            { e: { f: { g: [{ h: 'second' }, { h: 'third' }, { h: 'target' }] } } },
                        ],
                    },
                },
            }

            const result = Accessor.get(state, accessor) // should return 'target'

            if (result.type === 'err') {
                throw new Error('Expected string but got error')
            }

            expect(result.value).toBe('target')
        })
    })
})
