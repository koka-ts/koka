import * as Async from '../src/async'
import * as Koka from '../src/koka'

describe('Async', () => {
    it('should handle basic async operations', async () => {
        function* test() {
            const value = yield* Async.await(Promise.resolve(42))
            return value * 2
        }

        const result = await Koka.runAsync(test())
        expect(result).toBe(84)
    })

    it('should handle async errors', async () => {
        function* test() {
            try {
                yield* Async.await(Promise.reject(new Error('Async error')))
                return 'should not reach here'
            } catch (err) {
                if (err instanceof Error) {
                    return `Caught: ${err.message}`
                }
                throw err
            }
        }

        const result = await Koka.runAsync(test())
        expect(result).toBe('Caught: Async error')
    })

    it('should handle mixed sync and async operations', async () => {
        function* test() {
            const syncValue = 10
            const asyncValue = yield* Async.await(Promise.resolve(32))
            return syncValue + asyncValue
        }

        const result = await Koka.runAsync(test())
        expect(result).toBe(42)
    })

    it('should handle multiple async operations', async () => {
        function* test() {
            const value1 = yield* Async.await(Promise.resolve(1))
            const value2 = yield* Async.await(Promise.resolve(2))
            const value3 = yield* Async.await(Promise.resolve(3))
            return value1 + value2 + value3
        }

        const result = await Koka.runAsync(test())
        expect(result).toBe(6)
    })

    it('should handle async operations with delays', async () => {
        function* test() {
            const start = Date.now()
            yield* Async.await(new Promise((resolve) => setTimeout(resolve, 10)))
            const end = Date.now()
            return end - start
        }

        const result = await Koka.runAsync(test())
        expect(result).toBeGreaterThanOrEqual(10)
    })

    it('should handle async operations with complex data', async () => {
        function* test() {
            const user = yield* Async.await(
                Promise.resolve({
                    id: 1,
                    name: 'Alice',
                    email: 'alice@example.com',
                }),
            )
            return `${user.name} (${user.email})`
        }

        const result = await Koka.runAsync(test())
        expect(result).toBe('Alice (alice@example.com)')
    })

    it('should handle async operations with arrays', async () => {
        function* test() {
            const numbers = yield* Async.await(Promise.resolve([1, 2, 3, 4, 5]))
            return numbers.reduce((sum, num) => sum + num, 0)
        }

        const result = await Koka.runAsync(test())
        expect(result).toBe(15)
    })

    it('should handle async operations with null and undefined', async () => {
        function* test() {
            const nullValue = yield* Async.await(Promise.resolve(null))
            const undefinedValue = yield* Async.await(Promise.resolve(undefined))
            return { nullValue, undefinedValue }
        }

        const result = await Koka.runAsync(test())
        expect(result).toEqual({ nullValue: null, undefinedValue: undefined })
    })
})
