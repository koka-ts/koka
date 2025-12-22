import * as Koka from '../src/koka'
import * as Task from '../src/task'
import * as Result from '../src/result'
import * as Async from '../src/async'
import * as Err from '../src/err'
import * as Ctx from '../src/ctx'
import * as Opt from '../src/opt'

const delayTime = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Task.fromTuple', () => {
    it('should handle sync effects with array input', async () => {
        function* effect1() {
            return 1
        }

        function* effect2() {
            return '2'
        }

        function* program() {
            const combined: Generator<Async.Async, [number, string]> = Task.tuple([effect1(), effect2()])
            const results = yield* combined
            return results[0] + Number(results[1])
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe(3)
    })

    it('should handle async effects with array input', async () => {
        function* effect1() {
            return yield* Async.await(Promise.resolve(1))
        }

        function* effect2() {
            return yield* Async.await(Promise.resolve('2'))
        }

        function* program() {
            const combined: Generator<Async.Async, [number, string]> = Task.tuple([effect1(), effect2()])
            const results = yield* combined
            return results[0] + Number(results[1])
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe(3)
    })

    it('should handle mixed sync/async effects with array input', async () => {
        function* syncEffect() {
            return 1
        }

        function* asyncEffect() {
            return yield* Async.await(Promise.resolve(2))
        }

        function* program() {
            const combined: Generator<Async.Async, [number, number]> = Task.tuple([
                syncEffect(),
                asyncEffect(),
            ] as const)
            const results = yield* combined
            return results[0] + results[1]
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe(3)
    })
})

describe('Task.fromObject', () => {
    it('should handle object input with generators', async () => {
        function* effect1() {
            return 1
        }

        function* effect2() {
            return 2
        }

        function* program() {
            const results: {
                a: number
                b: number
                c: number
            } = yield* Task.object({
                a: effect1(),
                b: effect2(),
                c: 3,
            })
            return results.a + results.b + results.c
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe(6)
    })

    it('should handle mixed object input with generators and values', async () => {
        function* effect1() {
            return 1
        }

        function* program() {
            const results: {
                a: number
                b: number
                c: number
            } = yield* Task.object({
                a: effect1(),
                b: 2,
                c: () => effect1(),
            })
            return results.a + results.b + results.c
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe(4)
    })

    it('should handle errors in object input', async () => {
        class TestErr extends Err.Err('TestErr')<string> {}

        function* effect1() {
            return 1
        }

        function* effect2() {
            yield* Err.throw(new TestErr('error'))
            return 2
        }

        function* program() {
            const results: {
                a: number
                b: number
            } = yield* Task.object({
                a: effect1(),
                b: effect2(),
            })
            return results.a + results.b
        }

        const result = await Result.runAsync(program())
        expect(result).toEqual({
            type: 'err',
            name: 'TestErr',
            error: 'error',
        })
    })

    it('should handle empty object input', async () => {
        function* program(): Generator<Async.Async, {}> {
            const results: {} = yield* Task.object({})
            return results
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual({})
    })

    it('should handle multiple async effects and run concurrently', async () => {
        class DelayError extends Err.Err('DelayError')<string> {}

        function* delayedEffect<T>(value: T, delay: number) {
            if (delay === 0) {
                yield* Err.throw(new DelayError('Delay cannot be zero'))
            }

            yield* Async.await(delayTime(delay))

            return value
        }

        function* program() {
            const combined: Generator<Async.Async | DelayError, [number, string, boolean]> = Task.tuple([
                delayedEffect(1, 30),
                delayedEffect('2', 20),
                delayedEffect(false, 10),
            ])

            const results = yield* combined
            return results
        }

        const start = Date.now()
        const result = await Result.runAsync(program())
        const duration = Date.now() - start

        expect(result).toEqual({
            type: 'ok',
            value: [1, '2', false],
        })

        // Should run program in parallel
        expect(duration).toBeLessThan(50) // Should complete in less than 50ms
    })

    it('should handle empty array', async () => {
        function* program(): Generator<Async.Async, []> {
            const results = yield* Task.tuple([])
            return results
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual([])
    })

    it('should handle function effects', async () => {
        function* effect1(): Generator<never, number> {
            return 1
        }

        function* effect2(): Generator<never, number> {
            return 2
        }

        function* program(): Generator<Async.Async, number> {
            const results = yield* Task.tuple([() => effect1(), () => effect2()])
            return results[0] + results[1]
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe(3)
    })

    it('should handle async errors with native try-catch', async () => {
        function* effectWithError(): Generator<Async.Async, number> {
            const value = yield* Async.await(Promise.reject(new Error('Async error')))
            return value
        }

        function* program() {
            try {
                const results = yield* Task.tuple([effectWithError(), Async.await(Promise.resolve(2))])
                return results[0] + results[1]
            } catch (err: unknown) {
                return err as Error
            }
        }

        const result = await Koka.runAsync(program())

        expect(result).toBeInstanceOf(Error)
        expect((result as Error).message).toBe('Async error')
    })

    it('should propagate async errors', async () => {
        function* failingEffect(): Generator<Async.Async, never> {
            yield* Async.await(Promise.reject(new Error('Async error')))
            /* istanbul ignore next */
            throw new Error('Should not reach here')
        }

        function* program(): Generator<Async.Async, number> {
            const results = yield* Task.tuple([failingEffect(), Async.await(Promise.resolve(2))])
            return results[0] + results[1]
        }

        await expect(Koka.runAsync(program())).rejects.toThrow('Async error')
    })

    it('should handle thrown errors in async effects', async () => {
        function* effectWithThrow(): Generator<Async.Async, number> {
            const value = yield* Async.await(
                new Promise<number>((_, reject) => {
                    setTimeout(() => {
                        try {
                            throw new Error('Thrown error')
                        } catch (err) {
                            reject(err)
                        }
                    }, 10)
                }),
            )
            return value
        }

        function* program(): Generator<Async.Async, number> {
            try {
                const results = yield* Task.tuple([effectWithThrow(), Async.await(Promise.resolve(2))])
                return results[0] + results[1]
            } catch (err) {
                if (err instanceof Error) {
                    return -100
                }
                throw err
            }
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe(-100)
    })
})

describe('Task.race', () => {
    it('should interrupt other effects when one resolves', async () => {
        let cleanupCalled = false

        function* slowEffect() {
            try {
                yield* Async.await(new Promise((resolve) => setTimeout(resolve, 100)))
                return 'slow'
            } finally {
                cleanupCalled = true
            }
        }

        function* fastEffect() {
            return 'fast'
        }

        const inputs = [slowEffect(), fastEffect()]
        const result = await Koka.runAsync(Task.race(inputs))

        expect(result).toBe('fast')
        expect(cleanupCalled).toBe(true)
    })
})

describe('Task.all', () => {
    it('should handle errors in effects', async () => {
        class TestErr extends Err.Err('TestErr')<string> {}

        function* effect1() {
            return 1
        }

        function* effect2() {
            yield* Err.throw(new TestErr('error'))
            return 2
        }

        function* program() {
            const results = yield* Task.all([effect1(), effect2()])
            return results[0] + results[1]
        }

        const result = await Result.runAsync(program())
        expect(result).toEqual({
            type: 'err',
            name: 'TestErr',
            error: 'error',
        })
    })

    it('should handle effect list with the same item type', async () => {
        function* effect1(): Generator<Async.Async, number> {
            yield* Async.await(Promise.resolve(1))
            return 1
        }

        function* effect2(): Generator<never, number> {
            return 2
        }

        function* program() {
            const list = [effect1(), effect2()]
            const results = yield* Task.all(list)
            return results
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual([1, 2])
    })
})

describe('Task.concurrent', () => {
    it('should clean up pending effects on early return', async () => {
        const cleanUp = jest.fn()
        const returnFn = jest.fn()

        function* valueGen(n: number) {
            try {
                yield* Async.await(Promise.resolve(1))
                returnFn()
                return 1
            } finally {
                cleanUp(n)
            }
        }

        const inputs = [valueGen(0), valueGen(1), valueGen(2), valueGen(3)]
        const handler = async (_stream: Task.TaskResultStream<number>) => {
            // Early return without consuming any results
            return 42
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))
        expect(result).toBe(42)
        expect(returnFn).toHaveBeenCalledTimes(0)
        expect(cleanUp).toHaveBeenCalledTimes(4)
    })

    it('should clean up pending effects on early return in for-await-of block', async () => {
        const cleanUp = jest.fn()
        const returnFn = jest.fn()

        function* produce(n: number) {
            try {
                yield* Async.await(delayTime(n))
                returnFn()
                return n
            } finally {
                cleanUp(n)
            }
        }

        const inputs = [produce(40), produce(20), produce(30), produce(10)]

        const handler = async (stream: Task.TaskResultStream<number>) => {
            const results = [] as Task.TaskResult<number>[]

            for await (const result of stream) {
                results.push(result)

                if (results.length === 2) {
                    return results
                }
            }

            throw new Error('Early return')
        }

        const results = await Koka.runAsync(Task.concurrent(inputs, handler))

        expect(results).toEqual([
            { index: 3, value: 10 },
            { index: 1, value: 20 },
        ])

        expect(returnFn).toHaveBeenCalledTimes(2)
        expect(cleanUp).toHaveBeenCalledTimes(4)
    })

    it('should process stream of values', async () => {
        function* valueGen(value: number) {
            return value
        }

        const inputs = [valueGen(1), valueGen(2), valueGen(3)]

        const program = Task.concurrent(inputs, async (stream) => {
            const results = [] as number[]

            for await (const { index, value } of stream) {
                results[index] = value * 2
            }

            return results
        })

        const result = await Koka.runAsync(program)
        expect(result).toEqual([2, 4, 6])
    })

    it('should handle empty input stream', async () => {
        const program = Task.concurrent([] as Generator<never, number>[], async (stream) => {
            const results = [] as number[]

            for await (const { index, value } of stream) {
                results[index] = value * 2
            }
            return results
        })

        const result = await Koka.runAsync(program)

        expect(result).toEqual([])
    })

    it('should handle async effects in stream', async () => {
        function* asyncValueGen(value: number) {
            const asyncValue = yield* Async.await(Promise.resolve(value))
            return asyncValue
        }

        const inputs = [asyncValueGen(1), asyncValueGen(2), asyncValueGen(3)]

        const handler = async (stream: Task.TaskResultStream<number>) => {
            const results = [] as number[]
            for await (const { index, value } of stream) {
                results[index] = value * 2
            }
            return results
        }

        const program = Task.concurrent(inputs, handler)

        const result = await Koka.runAsync(program)
        expect(result).toEqual([2, 4, 6])
    })

    it('should propagate errors from stream items', async () => {
        class StreamError extends Err.Err('StreamError')<string> {}

        function* failingGen() {
            yield* Err.throw(new StreamError('stream error'))
            return 1
        }

        const inputs = [failingGen()]
        const handler = async (stream: Task.TaskResultStream<number>) => {
            const results = [] as number[]
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Result.runAsync(Task.concurrent(inputs, handler))

        expect(result).toEqual({
            type: 'err',
            name: 'StreamError',
            error: 'stream error',
        })
    })

    it('should handle mixed sync/async stream items', async () => {
        function* syncGen() {
            return 1
        }

        function* asyncGen() {
            return yield* Async.await(Promise.resolve(2))
        }

        const inputs = [syncGen(), asyncGen()]
        const handler = async (stream: Task.TaskResultStream<number>) => {
            const results = [] as number[]

            for await (const { index, value } of stream) {
                results[index] = value * 2
            }

            return results
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))

        expect(result).toEqual([2, 4])
    })

    it('should clean up generators on error', async () => {
        class CleanupError extends Err.Err('CleanupError')<string> {}

        let cleanupCalled = false
        function* failingGen() {
            try {
                yield* Err.throw(new CleanupError('cleanup error'))
                return 1
            } finally {
                cleanupCalled = true
            }
        }

        const inputs = [failingGen()]
        const handler = async (stream: Task.TaskResultStream<number>) => {
            try {
                for await (const { value } of stream) {
                    return value
                }
                return 0
            } catch {
                return -1
            }
        }

        const result = await Result.runAsync(Task.concurrent(inputs, handler))
        expect(result).toEqual({
            type: 'err',
            name: 'CleanupError',
            error: 'cleanup error',
        })
        expect(cleanupCalled).toBe(true)
    })

    it('should handle stream with unexpected completion errors', async () => {
        function* normalGen() {
            return 42
        }

        const inputs = [normalGen()]
        const handler = async (stream: Task.TaskResultStream<number>) => {
            const results = []
            for await (const result of stream) {
                results.push(result)
            }
            return results
        }

        // This should not throw an unexpected completion error
        const result = await Koka.runAsync(Task.concurrent(inputs, handler))
        expect(result).toEqual([{ index: 0, value: 42 }])
    })

    it('should handle stream with mixed sync and async effects', async () => {
        function* syncGen() {
            return 1
        }

        function* asyncGen() {
            const value = yield* Async.await(Promise.resolve(2))
            return value
        }

        const inputs = [syncGen(), asyncGen()]
        const handler = async (stream: Task.TaskResultStream<number>) => {
            const results = []
            for await (const result of stream) {
                results.push(result)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))
        expect(result).toEqual([
            { index: 0, value: 1 },
            { index: 1, value: 2 },
        ])
    })

    it('should handle stream handler that resolves correctly', async () => {
        function* gen() {
            return 42
        }

        const inputs = [gen()]
        const handler = async (stream: Task.TaskResultStream<number>) => {
            for await (const result of stream) {
                return result.value * 2
            }
            return 0
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))
        expect(result).toBe(84)
    })
})

describe('Stream maxConcurrency and TaskProducer', () => {
    it('should respect maxConcurrency limit', async () => {
        const activeTasks: number[] = []
        const maxConcurrency = 2
        const maxActiveTasks: number[] = []

        function* task(index: number) {
            activeTasks.push(index)
            maxActiveTasks.push(activeTasks.length)
            try {
                yield* Async.await(delayTime(50))
                return `task-${index}`
            } finally {
                const taskIndex = activeTasks.indexOf(index)
                if (taskIndex > -1) {
                    activeTasks.splice(taskIndex, 1)
                }
            }
        }

        // Use TaskProducer function
        const producer = (index: number) => {
            if (index < 4) {
                return task(index)
            }
            return undefined // Early termination
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency }))

        expect(result).toEqual(['task-0', 'task-1', 'task-2', 'task-3'])
        // Verify that active task count never exceeds max concurrency limit
        expect(Math.max(...maxActiveTasks)).toBeLessThanOrEqual(maxConcurrency)
        // Verify all tasks have completed
        expect(activeTasks.length).toBe(0)
    })

    it('should handle TaskProducer with early termination', async () => {
        let callCount = 0

        const producer = (index: number) => {
            callCount++
            if (index < 3) {
                return function* () {
                    yield* Async.await(delayTime(10))
                    return `item-${index}`
                }
            }
            return undefined // Early termination
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 2 }))

        expect(result).toEqual(['item-0', 'item-1', 'item-2'])
        expect(callCount).toBe(4) // 4th call returns undefined
    })

    it('should handle empty TaskProducer', async () => {
        const producer = (index: number) => {
            return undefined // Immediate termination
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler))

        expect(result).toEqual([])
    })

    it('should handle TaskProducer with conditional task generation', async () => {
        const producer = (index: number) => {
            if (index % 2 === 0) {
                return function* () {
                    yield* Async.await(delayTime(10))
                    return `even-${index}`
                }
            } else if (index < 5) {
                return function* () {
                    yield* Async.await(delayTime(5))
                    return `odd-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = [] as string[]
            for await (const { index, value } of stream) {
                results[index] = value
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 3 }))

        expect(result).toEqual(['even-0', 'odd-1', 'even-2', 'odd-3', 'even-4'])
    })
})

describe('All maxConcurrency and TaskProducer', () => {
    it('should respect maxConcurrency in all function', async () => {
        const activeTasks: number[] = []
        const maxConcurrency = 2
        const maxActiveTasks: number[] = []

        function* task(index: number) {
            activeTasks.push(index)
            maxActiveTasks.push(activeTasks.length)
            try {
                yield* Async.await(delayTime(30))
                return `task-${index}`
            } finally {
                const taskIndex = activeTasks.indexOf(index)
                if (taskIndex > -1) {
                    activeTasks.splice(taskIndex, 1)
                }
            }
        }

        const producer = (index: number) => {
            if (index < 4) {
                return task(index)
            }
            return undefined
        }

        const result = await Koka.runAsync(Task.all(producer, { maxConcurrency }))

        expect(result).toEqual(['task-0', 'task-1', 'task-2', 'task-3'])
        // Verify that active task count never exceeds max concurrency limit
        expect(Math.max(...maxActiveTasks)).toBeLessThanOrEqual(maxConcurrency)
        expect(activeTasks.length).toBe(0)
    })

    it('should handle all with TaskProducer returning undefined', async () => {
        const producer = (index: number) => {
            if (index < 2) {
                return function* () {
                    yield* Async.await(delayTime(10))
                    return `item-${index}`
                }
            }
            return undefined
        }

        const result = await Koka.runAsync(Task.all(producer))

        expect(result).toEqual(['item-0', 'item-1'])
    })

    it('should maintain order with maxConcurrency', async () => {
        const producer = (index: number) => {
            if (index < 3) {
                return function* () {
                    // Simulate different delays, but results should maintain index order
                    yield* Async.await(delayTime((3 - index) * 10))
                    return `item-${index}`
                }
            }
            return undefined
        }

        const result = await Koka.runAsync(Task.all(producer, { maxConcurrency: 2 }))

        expect(result).toEqual(['item-0', 'item-1', 'item-2'])
    })
})

describe('Race maxConcurrency and TaskProducer', () => {
    it('should respect maxConcurrency in race function', async () => {
        const activeTasks: number[] = []
        const maxConcurrency = 2
        const maxActiveTasks: number[] = []

        function* task(index: number) {
            activeTasks.push(index)
            maxActiveTasks.push(activeTasks.length)
            try {
                yield* Async.await(delayTime((index + 1) * 20))
                return `task-${index}`
            } finally {
                const taskIndex = activeTasks.indexOf(index)
                if (taskIndex > -1) {
                    activeTasks.splice(taskIndex, 1)
                }
            }
        }

        const producer = (index: number) => {
            if (index < 3) {
                return task(index)
            }
            return undefined
        }

        const result = await Koka.runAsync(Task.race(producer, { maxConcurrency }))

        // Should return the fastest task (task-0, 20ms delay)
        expect(result).toBe('task-0')
        // Verify that active task count never exceeds max concurrency limit
        expect(Math.max(...maxActiveTasks)).toBeLessThanOrEqual(maxConcurrency)
        expect(activeTasks.length).toBe(0)
    })

    it('should handle race with TaskProducer returning undefined', async () => {
        const producer = (index: number) => {
            if (index === 0) {
                return function* () {
                    yield* Async.await(delayTime(10))
                    return 'fast'
                }
            }
            return undefined
        }

        const result = await Koka.runAsync(Task.race(producer))

        expect(result).toBe('fast')
    })

    it('should handle race with mixed fast and slow tasks', async () => {
        const producer = (index: number) => {
            if (index < 3) {
                return function* () {
                    if (index === 1) {
                        // Fastest task
                        return 'fastest'
                    } else {
                        yield* Async.await(delayTime(50))
                        return `slow-${index}`
                    }
                }
            }
            return undefined
        }

        const result = await Koka.runAsync(Task.race(producer, { maxConcurrency: 2 }))

        expect(result).toBe('fastest')
    })
})

describe('Edge cases for maxConcurrency', () => {
    it('should throw error for invalid maxConcurrency', async () => {
        const producer = (index: number) => {
            if (index < 2) {
                return function* () {
                    return `item-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        // Test maxConcurrency = 0
        await expect(() => Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 0 }))).rejects.toThrow(
            'maxConcurrency must be greater than 0',
        )

        // Test maxConcurrency = -1
        await expect(() => Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: -1 }))).rejects.toThrow(
            'maxConcurrency must be greater than 0',
        )
    })

    it('should handle maxConcurrency = 1 (sequential execution)', async () => {
        const executionOrder: number[] = []
        const activeTasks: number[] = []
        const maxActiveTasks: number[] = []

        const producer = (index: number) => {
            if (index < 3) {
                return function* () {
                    activeTasks.push(index)
                    maxActiveTasks.push(activeTasks.length)
                    executionOrder.push(index)
                    try {
                        yield* Async.await(delayTime(10))
                        return `item-${index}`
                    } finally {
                        const taskIndex = activeTasks.indexOf(index)
                        if (taskIndex > -1) {
                            activeTasks.splice(taskIndex, 1)
                        }
                    }
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 1 }))

        expect(result).toEqual(['item-0', 'item-1', 'item-2'])
        // Verify that max concurrency is indeed 1
        expect(Math.max(...maxActiveTasks)).toBe(1)
        // Execution order should be 0, 1, 2 (sequential execution)
        expect(executionOrder).toEqual([0, 1, 2])
        expect(activeTasks.length).toBe(0)
    })

    it('should handle large maxConcurrency value', async () => {
        const activeTasks: number[] = []
        const maxActiveTasks: number[] = []

        const producer = (index: number) => {
            if (index < 5) {
                return function* () {
                    activeTasks.push(index)
                    maxActiveTasks.push(activeTasks.length)
                    try {
                        yield* Async.await(delayTime(10))
                        return `item-${index}`
                    } finally {
                        const taskIndex = activeTasks.indexOf(index)
                        if (taskIndex > -1) {
                            activeTasks.splice(taskIndex, 1)
                        }
                    }
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 1000 }))

        expect(result).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4'])
        // Verify all tasks can execute concurrently (max active tasks should equal total tasks)
        expect(Math.max(...maxActiveTasks)).toBe(5)
        expect(activeTasks.length).toBe(0)
    })
})

describe('TaskProducer with error handling', () => {
    it('should handle errors in TaskProducer', async () => {
        class ProducerError extends Err.Err('ProducerError')<string> {}

        const producer: Task.TaskProducer<ProducerError | Async.Async, string> = (index: number) => {
            if (index === 1) {
                return function* () {
                    yield* Err.throw(new ProducerError('Producer failed'))
                    return 'should not reach here'
                }
            } else if (index < 3) {
                return function* () {
                    yield* Async.await(delayTime(10))
                    return `item-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            try {
                for await (const { value } of stream) {
                    results.push(value)
                }
            } catch (error) {
                if (error instanceof ProducerError) {
                    return `Error: ${error.error}`
                }
                throw error
            }
            return results
        }

        const program = Task.concurrent(producer, handler, { maxConcurrency: 2 })

        const result = await Koka.runAsync(
            Koka.try(program).handle({
                ProducerError: (error) => `Error: ${error}`,
            }),
        )

        expect(result).toBe('Error: Producer failed')
    })

    it('should verify maxConcurrency with semaphore-like tracking', async () => {
        const maxConcurrency = 3
        const activeCount = { value: 0 }
        const maxActiveCount = { value: 0 }
        const taskStartTimes: number[] = []
        const taskEndTimes: number[] = []

        const producer = (index: number) => {
            if (index < 5) {
                return function* () {
                    // Record task start
                    activeCount.value++
                    maxActiveCount.value = Math.max(maxActiveCount.value, activeCount.value)
                    taskStartTimes[index] = Date.now()

                    try {
                        // Simulate workload
                        yield* Async.await(delayTime(20))
                        return `task-${index}`
                    } finally {
                        // Record task end
                        activeCount.value--
                        taskEndTimes[index] = Date.now()
                    }
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency }))

        expect(result).toEqual(['task-0', 'task-1', 'task-2', 'task-3', 'task-4'])

        // Verify that max concurrency never exceeds the limit
        expect(maxActiveCount.value).toBeLessThanOrEqual(maxConcurrency)

        // Verify all tasks have completed
        expect(activeCount.value).toBe(0)

        // Verify tasks are truly executing concurrently (at least some tasks have overlapping time)
        const hasOverlap = taskStartTimes.some((startTime, i) => {
            if (i === 0) return false
            // Check if any task starts before another task ends
            return taskStartTimes
                .slice(0, i)
                .some((prevStart) => startTime < taskEndTimes[taskStartTimes.indexOf(prevStart)])
        })
        expect(hasOverlap).toBe(true)
    })

    it('should handle TaskProducer returning function vs generator', async () => {
        const producer = (index: number) => {
            if (index === 0) {
                // Return function
                return function* () {
                    return 'function'
                }
            } else if (index === 1) {
                // Return generator instance
                return (function* () {
                    return 'generator'
                })()
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler))

        expect(result).toEqual(['function', 'generator'])
    })
})

describe('Task.series', () => {
    it('should execute tasks sequentially', async () => {
        const executionOrder: number[] = []

        function* task(index: number) {
            executionOrder.push(index)
            yield* Async.await(delayTime(10))
            return `task-${index}`
        }

        const inputs = [task(0), task(1), task(2)]
        const handler = async (results: Task.TaskResultStream<string>) => {
            const streamResults = []
            while (true) {
                const result = await results.next()
                if (result.done) break
                streamResults.push(result.value.value)
            }
            return streamResults
        }

        const result = await Koka.runAsync(Task.series(inputs, handler))

        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        expect(executionOrder).toEqual([0, 1, 2]) // Sequential execution
    })

    it('should handle TaskProducer in series', async () => {
        const executionOrder: number[] = []

        const producer = (index: number) => {
            if (index < 3) {
                return function* () {
                    executionOrder.push(index)
                    yield* Async.await(delayTime(10))
                    return `task-${index}`
                }
            }
            return undefined
        }

        const handler = async (results: Task.TaskResultStream<string>) => {
            const streamResults = []
            for await (const { value } of results) {
                streamResults.push(value)
            }
            return streamResults
        }

        const result = await Koka.runAsync(Task.series(producer, handler))

        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        expect(executionOrder).toEqual([0, 1, 2])
    })

    it('should handle errors in series', async () => {
        class SeriesError extends Err.Err('SeriesError')<string> {}

        function* failingTask() {
            yield* Err.throw(new SeriesError('series error'))
            return 'should not reach here'
        }

        function* normalTask() {
            return 'normal'
        }

        const inputs = [failingTask(), normalTask()]
        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = [] as string[]
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Result.runAsync(Task.series(inputs, handler))

        expect(result).toEqual({
            type: 'err',
            name: 'SeriesError',
            error: 'series error',
        })
    })
})

describe('Task.parallel', () => {
    it('should execute tasks in parallel', async () => {
        const startTimes: number[] = []
        const endTimes: number[] = []

        function* task(index: number) {
            startTimes[index] = Date.now()
            yield* Async.await(delayTime(50))
            endTimes[index] = Date.now()
            return `task-${index}`
        }

        const inputs = [task(0), task(1), task(2)]
        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const start = Date.now()
        const result = await Koka.runAsync(Task.parallel(inputs, handler))
        const totalTime = Date.now() - start

        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        // Should complete in roughly 50ms (parallel execution) rather than 150ms (sequential)
        expect(totalTime).toBeLessThan(100)

        // Verify tasks started around the same time
        const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes)
        expect(maxStartDiff).toBeLessThan(10)
    })

    it('should handle TaskProducer in parallel', async () => {
        const startTimes: number[] = []

        const producer = (index: number) => {
            if (index < 3) {
                return function* () {
                    startTimes[index] = Date.now()
                    yield* Async.await(delayTime(30))
                    return `task-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const start = Date.now()
        const result = await Koka.runAsync(Task.parallel(producer, handler))
        const totalTime = Date.now() - start

        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        expect(totalTime).toBeLessThan(60)

        // Verify parallel execution
        const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes)
        expect(maxStartDiff).toBeLessThan(10)
    })

    it('should handle mixed sync and async tasks in parallel', async () => {
        function* syncTask() {
            return 'sync'
        }

        function* asyncTask() {
            yield* Async.await(delayTime(20))
            return 'async'
        }

        const inputs = [syncTask(), asyncTask()]
        const handler = async (results: Task.TaskResultStream<string>) => {
            const streamResults = []
            for await (const { value } of results) {
                streamResults.push(value)
            }
            return streamResults
        }

        const result = await Koka.runAsync(Task.parallel(inputs, handler))

        expect(result).toContain('sync')
        expect(result).toContain('async')
    })
})

describe('Task.concurrent with complex error scenarios', () => {
    it('should handle handler throwing error', async () => {
        function* normalTask() {
            return 'normal'
        }

        const inputs = [normalTask()]
        const handler = async (stream: Task.TaskResultStream<string>) => {
            throw new Error('Handler error')
        }

        await expect(Result.runAsync(Task.concurrent(inputs, handler))).rejects.toThrow('Handler error')
    })

    it('should handle handler rejecting promise', async () => {
        function* normalTask() {
            return 'normal'
        }

        const inputs = [normalTask()]
        const handler = async (stream: Task.TaskResultStream<string>) => {
            return Promise.reject(new Error('Handler rejection'))
        }

        await expect(Result.runAsync(Task.concurrent(inputs, handler))).rejects.toThrow('Handler rejection')
    })

    it('should handle multiple errors in stream', async () => {
        class StreamError extends Err.Err('StreamError')<string> {}

        function* failingTask1() {
            yield* Err.throw(new StreamError('error 1'))
            return 'should not reach here'
        }

        function* failingTask2() {
            yield* Err.throw(new StreamError('error 2'))
            return 'should not reach here'
        }

        const inputs = [failingTask1(), failingTask2()]
        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Result.runAsync(Task.concurrent(inputs, handler))

        // Should get the first error that occurs
        expect(result.type).toBe('err')
        if (result.type === 'err') {
            expect(result.name).toBe('StreamError')
            expect(['error 1', 'error 2']).toContain(result.error)
        } else {
            throw new Error('Result is not an error')
        }
    })

    it('should handle stream with no tasks', async () => {
        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent([], handler))
        expect(result).toEqual([])
    })

    it('should handle TaskProducer returning undefined immediately', async () => {
        const producer = (index: number) => {
            return undefined // No tasks
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const task = Task.concurrent(producer, handler)

        const result = await Koka.runAsync(task)
        expect(result).toEqual([])
    })
})

describe('Concurrent with complex async scenarios', () => {
    it('should handle nested async operations', async () => {
        function* nestedAsyncTask() {
            const value1 = yield* Async.await(Promise.resolve(1))
            const value2 = yield* Async.await(Promise.resolve(2))
            const value3 = yield* Async.await(Promise.resolve(3))
            return value1 + value2 + value3
        }

        const inputs = [nestedAsyncTask()]
        const handler = async (stream: Task.TaskResultStream<number>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))
        expect(result).toEqual([6])
    })

    it('should handle async operations with different timing', async () => {
        const results: string[] = []

        function* fastTask() {
            yield* Async.await(delayTime(10))
            results.push('fast')
            return 'fast'
        }

        function* slowTask() {
            yield* Async.await(delayTime(50))
            results.push('slow')
            return 'slow'
        }

        const inputs = [fastTask(), slowTask()]
        const handler = async (stream: Task.TaskResultStream<string>) => {
            const streamResults = []
            for await (const { value } of stream) {
                streamResults.push(value)
            }
            return streamResults
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))

        expect(result).toEqual(['fast', 'slow'])
        expect(results).toEqual(['fast', 'slow'])
    })

    it('should handle stream with early termination in handler', async () => {
        let cleanupCalled = false

        function* longRunningTask() {
            try {
                yield* Async.await(delayTime(100))
                return 'long'
            } finally {
                cleanupCalled = true
            }
        }

        const inputs = [longRunningTask()]
        const handler = async (stream: Task.TaskResultStream<string>) => {
            for await (const { value } of stream) {
                return value // Early return
            }
            return 'no value'
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))
        expect(result).toBe('long')
        expect(cleanupCalled).toBe(true)
    })
})

describe('Concurrent with maxConcurrency edge cases', () => {
    it('should handle maxConcurrency = 1 with many tasks', async () => {
        const executionOrder: number[] = []

        const producer = (index: number) => {
            if (index < 5) {
                return function* () {
                    executionOrder.push(index)
                    yield* Async.await(delayTime(10))
                    return `task-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 1 }))

        expect(result).toEqual(['task-0', 'task-1', 'task-2', 'task-3', 'task-4'])
        expect(executionOrder).toEqual([0, 1, 2, 3, 4]) // Sequential
    })

    it('should handle maxConcurrency larger than task count', async () => {
        const activeTasks: number[] = []

        const producer = (index: number) => {
            if (index < 3) {
                return function* () {
                    activeTasks.push(index)
                    yield* Async.await(delayTime(20))
                    const taskIndex = activeTasks.indexOf(index)
                    if (taskIndex > -1) {
                        activeTasks.splice(taskIndex, 1)
                    }
                    return `task-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 10 }))

        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        expect(activeTasks.length).toBe(0)
    })

    it('should handle maxConcurrency with mixed task types', async () => {
        const activeCount = { value: 0 }
        const maxActiveCount = { value: 0 }

        const producer = (index: number) => {
            if (index < 4) {
                return function* () {
                    activeCount.value++
                    maxActiveCount.value = Math.max(maxActiveCount.value, activeCount.value)

                    if (index % 2 === 0) {
                        // Sync task
                        const result = activeCount.value
                        activeCount.value--
                        return `sync-${result}`
                    } else {
                        // Async task
                        yield* Async.await(delayTime(10))
                        const result = activeCount.value
                        activeCount.value--
                        return `async-${result}`
                    }
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 2 }))

        expect(result.length).toBe(4)
        expect(maxActiveCount.value).toBeLessThanOrEqual(2)
        expect(activeCount.value).toBe(0)
    })
})

describe('Concurrent with complex data types', () => {
    it('should handle stream with objects', async () => {
        function* objectTask() {
            return { id: 1, name: 'test' }
        }

        const inputs = [objectTask()]
        const handler = async (stream: Task.TaskResultStream<{ id: number; name: string }>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))
        expect(result).toEqual([{ id: 1, name: 'test' }])
    })

    it('should handle stream with arrays', async () => {
        function* arrayTask() {
            return [1, 2, 3]
        }

        const inputs = [arrayTask()]
        const handler = async (stream: Task.TaskResultStream<number[]>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))
        expect(result).toEqual([[1, 2, 3]])
    })

    it('should handle stream with null and undefined values', async () => {
        function* nullTask(): Generator<never, null> {
            return null
        }

        function* undefinedTask(): Generator<never, undefined> {
            return undefined
        }

        const inputs = [nullTask(), undefinedTask()]
        const handler = async (stream: Task.TaskResultStream<null | undefined>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(inputs, handler))
        expect(result).toEqual([null, undefined])
    })
})

describe('Concurrent performance and stress tests', () => {
    it('should handle many concurrent tasks efficiently', async () => {
        const taskCount = 50
        const activeTasks: number[] = []
        const maxActiveTasks: number[] = []

        const producer = (index: number) => {
            if (index < taskCount) {
                return function* () {
                    activeTasks.push(index)
                    maxActiveTasks.push(activeTasks.length)
                    yield* Async.await(delayTime(5))
                    const taskIndex = activeTasks.indexOf(index)
                    if (taskIndex > -1) {
                        activeTasks.splice(taskIndex, 1)
                    }
                    return `task-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const start = Date.now()
        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 10 }))
        const duration = Date.now() - start

        expect(result.length).toBe(taskCount)
        expect(Math.max(...maxActiveTasks)).toBeLessThanOrEqual(10)
        expect(activeTasks.length).toBe(0)
        expect(duration).toBeLessThan(100) // Should complete quickly with concurrency
    })

    it('should handle rapid task completion', async () => {
        const taskCount = 100

        const producer = (index: number) => {
            if (index < taskCount) {
                return function* () {
                    return `task-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Koka.runAsync(Task.concurrent(producer, handler, { maxConcurrency: 20 }))

        expect(result.length).toBe(taskCount)
        for (let i = 0; i < taskCount; i++) {
            expect(result).toContain(`task-${i}`)
        }
    })
})

describe('Concurrent with cleanup and resource management', () => {
    it('should properly cleanup resources on error', async () => {
        const cleanupCalls: number[] = []

        function* taskWithCleanup(index: number) {
            try {
                yield* Async.await(delayTime(10))
                return `task-${index}`
            } finally {
                cleanupCalls.push(index)
            }
        }

        function* failingTask(): Generator<Async.Async, string, any> {
            yield* Async.await(delayTime(5))
            throw new Error('Task failed')
        }

        const inputs = [taskWithCleanup(0), failingTask(), taskWithCleanup(1)]
        const handler = async (stream: Task.TaskResultStream<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        await expect(Result.runAsync(Task.concurrent(inputs, handler))).rejects.toThrow('Task failed')
        expect(cleanupCalls).toEqual([0, 1])
    })

    it('should cleanup resources when handler throws', async () => {
        const cleanupCalls: number[] = []

        function* taskWithCleanup(index: number) {
            try {
                yield* Async.await(delayTime(10))
                return `task-${index}`
            } finally {
                cleanupCalls.push(index)
            }
        }

        const inputs = [taskWithCleanup(0), taskWithCleanup(1)]
        const handler = async (stream: Task.TaskResultStream<string>) => {
            throw new Error('Handler error')
        }

        await expect(Result.runAsync(Task.concurrent(inputs, handler))).rejects.toThrow('Handler error')
        expect(cleanupCalls).toEqual([0, 1])
    })
})

describe('Task methods with Koka finally behavior', () => {
    it('should execute finally block on normal completion with Task.all', async () => {
        const finalActions: string[] = []

        function* task(index: number) {
            yield* Async.await(delayTime(10))
            return `task-${index}`
        }

        function* program() {
            return yield* Koka.try(Task.all([task(0), task(1), task(2)])).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally block when error is thrown with Task.all', async () => {
        const finalActions: string[] = []
        class TaskError extends Err.Err('TaskError')<string> {}

        function* failingTask() {
            yield* Err.throw(new TaskError('task failed'))
            return 'should not reach here'
        }

        function* program() {
            return yield* Koka.try(Task.all([failingTask()])).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(
            Koka.try(program()).handle({
                TaskError: (error: string) => `Caught: ${error}`,
            }),
        )
        expect(result).toBe('Caught: task failed')
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally blocks when native exceptions are thrown with Task.all', async () => {
        const finalActions: string[] = []

        function* program() {
            yield* Koka.try(
                Task.all([
                    function* () {
                        throw new Error('native error')
                        return 'should not reach here'
                    },
                ]),
            ).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = Koka.runAsync(program())
        await expect(result).rejects.toThrow('native error')
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally block on normal completion with Task.race', async () => {
        const finalActions: string[] = []

        function* fastTask() {
            return 'fast'
        }

        function* slowTask() {
            yield* Async.await(delayTime(100))
            return 'slow'
        }

        function* program() {
            return yield* Koka.try(Task.race([fastTask(), slowTask()])).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe('fast')
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally block on normal completion with Task.concurrent', async () => {
        const finalActions: string[] = []

        function* task(index: number) {
            yield* Async.await(delayTime(10))
            return `task-${index}`
        }

        function* program() {
            return yield* Koka.try(
                Task.concurrent([task(0), task(1), task(2)], async (stream) => {
                    const results = []
                    for await (const { value } of stream) {
                        results.push(value)
                    }
                    return results
                }),
            ).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally block on normal completion with Task.series', async () => {
        const finalActions: string[] = []

        function* task(index: number) {
            yield* Async.await(delayTime(10))
            return `task-${index}`
        }

        function* program() {
            return yield* Koka.try(
                Task.series([task(0), task(1), task(2)], async (stream) => {
                    const results = []
                    for await (const { value } of stream) {
                        results.push(value)
                    }
                    return results
                }),
            ).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally block on normal completion with Task.parallel', async () => {
        const finalActions: string[] = []

        function* task(index: number) {
            yield* Async.await(delayTime(10))
            return `task-${index}`
        }

        function* program() {
            return yield* Koka.try(
                Task.parallel([task(0), task(1), task(2)], async (stream) => {
                    const results = []
                    for await (const { value } of stream) {
                        results.push(value)
                    }
                    return results
                }),
            ).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute nested finally blocks in reverse order with Task.all', async () => {
        const finalActions: string[] = []

        function* inner() {
            return yield* Koka.try(
                Task.all([
                    function* () {
                        return 'inner'
                    },
                ]),
            ).finally(function* () {
                finalActions.push('inner cleanup')
            })
        }

        function* outer() {
            return yield* Koka.try(inner()).finally(function* () {
                finalActions.push('outer cleanup')
            })
        }

        const result = await Koka.runAsync(outer())
        expect(result).toEqual(['inner'])
        expect(finalActions).toEqual(['inner cleanup', 'outer cleanup'])
    })

    it('should execute finally when aborted with Task.all', async () => {
        const finalActions: string[] = []
        const controller = new AbortController()

        function* program() {
            return yield* Koka.try(
                Task.all([
                    function* () {
                        yield* Async.await(new Promise(() => {})) // Never resolves
                        return 'should not reach here'
                    },
                ]),
            ).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const promise = Koka.runAsync(program(), { abortSignal: controller.signal })
        controller.abort()

        await expect(promise).rejects.toThrow('Operation aborted')
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally with async operations with Task.all', async () => {
        const finalActions: string[] = []

        function* program() {
            return yield* Koka.try(
                Task.all([
                    function* () {
                        return yield* Async.await(Promise.resolve(42))
                    },
                ]),
            ).finally(function* () {
                yield* Async.await(Promise.resolve())
                finalActions.push('async cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual([42])
        expect(finalActions).toEqual(['async cleanup'])
    })

    it('should handle errors in finally block with Task.all', async () => {
        const actions: string[] = []
        class CleanupError extends Err.Err('CleanupError')<string> {}

        function* inner() {
            return yield* Koka.try(
                Task.all([
                    function* () {
                        actions.push('main')
                        return 'done'
                    },
                ]),
            ).finally(function* () {
                actions.push('cleanup-start')
                yield* Err.throw(new CleanupError('cleanup failed'))
                actions.push('cleanup-end') // Should not reach here
            })
        }

        const result = await Koka.runAsync(
            Koka.try(inner()).handle({
                CleanupError: (msg: string) => {
                    actions.push(`caught: ${msg}`)
                    return 'handled'
                },
            }),
        )
        expect(result).toBe('handled')
        expect(actions).toEqual(['main', 'cleanup-start', 'caught: cleanup failed'])
    })

    it('should handle options in finally block with Task.all', async () => {
        const actions: string[] = []
        class CleanupOpt extends Opt.Opt('CleanupOpt')<string> {}

        function* program() {
            return yield* Koka.try(
                Task.all([
                    function* () {
                        actions.push('main')
                        return 'done'
                    },
                ]),
            ).finally(function* () {
                const cleanupMode = yield* Opt.get(CleanupOpt)
                actions.push(`cleanup: ${cleanupMode ?? 'default'}`)
            })
        }

        const result = await Koka.runAsync(
            Koka.try(program).handle({
                CleanupOpt: 'custom-cleanup',
            }),
        )
        expect(result).toEqual(['done'])
        expect(actions).toEqual(['main', 'cleanup: custom-cleanup'])

        const result2 = await Koka.runAsync(Koka.try(program).handle({}))
        expect(result2).toEqual(['done'])
        expect(actions).toEqual(['main', 'cleanup: custom-cleanup', 'main', 'cleanup: default'])
    })

    it('should handle mixed effects in finally block with Task.all', async () => {
        const actions: string[] = []
        class LogCtx extends Ctx.Ctx('LogCtx')<(msg: string) => void> {}
        class CleanupError extends Err.Err('CleanupError')<string> {}
        class CleanupOpt extends Opt.Opt('CleanupOpt')<string> {}

        function* program() {
            return yield* Koka.try(
                Task.all([
                    function* () {
                        const log = yield* Ctx.get(LogCtx)
                        log('main')
                        return 'done'
                    },
                ]),
            ).finally(function* () {
                // Use context
                const log = yield* Ctx.get(LogCtx)
                log('cleanup-start')

                // Use option
                const mode = yield* Opt.get(CleanupOpt)
                if (mode === 'thorough') {
                    // Use async
                    yield* Async.await(Promise.resolve())
                    actions.push('thorough cleanup')

                    // Use error
                    yield* Err.throw(new CleanupError('thorough cleanup failed'))
                }

                log('cleanup-end')
            })
        }

        const result = await Koka.runAsync(
            Koka.try(program).handle({
                LogCtx: (msg: string) => actions.push(msg),
                CleanupOpt: 'thorough',
                CleanupError: (err: string) => {
                    actions.push(`error: ${err}`)
                    return 'handled'
                },
            }),
        )

        expect(result).toBe('handled')
        expect(actions).toEqual(['main', 'cleanup-start', 'thorough cleanup', 'error: thorough cleanup failed'])

        const result2 = await Koka.runAsync(
            Koka.try(program).handle({
                LogCtx: (msg: string) => actions.push(msg),
                CleanupOpt: 'light',
                CleanupError: (err: string) => {
                    actions.push(`error: ${err}`)
                    return 'handled'
                },
            }),
        )
        expect(result2).toEqual(['done'])
        expect(actions).toEqual([
            'main',
            'cleanup-start',
            'thorough cleanup',
            'error: thorough cleanup failed',
            'main',
            'cleanup-start',
            'cleanup-end',
        ])
    })

    it('should handle TaskProducer with finally with Task.all', async () => {
        const finalActions: string[] = []

        const producer = (index: number) => {
            if (index < 3) {
                return function* () {
                    yield* Async.await(delayTime(10))
                    return `task-${index}`
                }
            }
            return undefined
        }

        function* program() {
            return yield* Koka.try(Task.all(producer)).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1', 'task-2'])
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should handle early termination in Task.concurrent with finally', async () => {
        const finalActions: string[] = []

        function* task(index: number) {
            yield* Async.await(delayTime(20))
            return `task-${index}`
        }

        function* program() {
            return yield* Koka.try(
                Task.concurrent([task(0), task(1), task(2)], async (stream) => {
                    const results = []
                    for await (const { value } of stream) {
                        results.push(value)
                        if (results.length === 2) {
                            return results // Early termination
                        }
                    }
                    return results
                }),
            ).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1'])
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should handle maxConcurrency with finally with Task.concurrent', async () => {
        const finalActions: string[] = []

        function* task(index: number) {
            yield* Async.await(delayTime(20))
            return `task-${index}`
        }

        function* program() {
            return yield* Koka.try(
                Task.concurrent(
                    [task(0), task(1), task(2), task(3)],
                    async (stream) => {
                        const results = []
                        for await (const { value } of stream) {
                            results.push(value)
                        }
                        return results
                    },
                    { maxConcurrency: 2 },
                ),
            ).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1', 'task-2', 'task-3'])
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should handle complex nested scenarios with Task methods and finally', async () => {
        const cleanupActions: string[] = []

        function* complexTaskWithFinally(index: number) {
            try {
                return yield* Koka.try(function* () {
                    const innerResult = yield* Task.all([
                        function* () {
                            yield* Async.await(delayTime(5))
                            return `inner-${index}-0`
                        },
                        function* () {
                            yield* Async.await(delayTime(5))
                            return `inner-${index}-1`
                        },
                    ])
                    return innerResult
                }).finally(function* () {
                    cleanupActions.push(`middle-cleanup-${index}`)
                })
            } finally {
                cleanupActions.push(`outer-cleanup-${index}`)
            }
        }

        function* program() {
            return yield* Koka.try(Task.all([complexTaskWithFinally(0), complexTaskWithFinally(1)])).finally(
                function* () {
                    cleanupActions.push('final-cleanup')
                },
            )
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual([
            ['inner-0-0', 'inner-0-1'],
            ['inner-1-0', 'inner-1-1'],
        ])
        expect(cleanupActions).toEqual([
            'middle-cleanup-0',
            'outer-cleanup-0',
            'middle-cleanup-1',
            'outer-cleanup-1',
            'final-cleanup',
        ])
    })

    it('should execute finally block after all sub-tasks complete with Task.all', async () => {
        const executionOrder: string[] = []

        function* subTask(index: number) {
            executionOrder.push(`sub-task-${index}-start`)
            yield* Async.await(delayTime(20))
            executionOrder.push(`sub-task-${index}-end`)
            return `task-${index}`
        }

        function* program() {
            return yield* Koka.try(Task.all([subTask(0), subTask(1), subTask(2)])).finally(function* () {
                executionOrder.push('finally-start')
                yield* Async.await(delayTime(10))
                executionOrder.push('finally-end')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1', 'task-2'])

        // Verify finally executes after all sub-tasks complete
        expect(executionOrder).toEqual([
            'sub-task-0-start',
            'sub-task-1-start',
            'sub-task-2-start',
            'sub-task-0-end',
            'sub-task-1-end',
            'sub-task-2-end',
            'finally-start',
            'finally-end',
        ])
    })

    it('should execute finally block after all sub-tasks complete with Task.concurrent', async () => {
        const executionOrder: string[] = []

        function* subTask(index: number) {
            executionOrder.push(`sub-task-${index}-start`)
            yield* Async.await(delayTime(20))
            executionOrder.push(`sub-task-${index}-end`)
            return `task-${index}`
        }

        function* program() {
            return yield* Koka.try(
                Task.concurrent([subTask(0), subTask(1), subTask(2)], async (stream) => {
                    const results = []
                    for await (const { value } of stream) {
                        results.push(value)
                    }
                    return results
                }),
            ).finally(function* () {
                executionOrder.push('finally-start')
                yield* Async.await(delayTime(10))
                executionOrder.push('finally-end')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1', 'task-2'])

        // Verify finally executes after all sub-tasks complete
        expect(executionOrder).toEqual([
            'sub-task-0-start',
            'sub-task-1-start',
            'sub-task-2-start',
            'sub-task-0-end',
            'sub-task-1-end',
            'sub-task-2-end',
            'finally-start',
            'finally-end',
        ])
    })

    it('should execute finally block after race winner completes with Task.race', async () => {
        const executionOrder: string[] = []

        function* fastTask() {
            executionOrder.push('fast-task-start')
            yield* Async.await(delayTime(10))
            executionOrder.push('fast-task-end')
            return 'fast'
        }

        function* slowTask() {
            executionOrder.push('slow-task-start')
            yield* Async.await(delayTime(50))
            executionOrder.push('slow-task-end')
            return 'slow'
        }

        function* program() {
            return yield* Koka.try(Task.race([fastTask(), slowTask()])).finally(function* () {
                executionOrder.push('finally-start')
                yield* Async.await(delayTime(5))
                executionOrder.push('finally-end')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe('fast')

        // Verify finally executes after race winner completes
        expect(executionOrder).toEqual([
            'fast-task-start',
            'slow-task-start',
            'fast-task-end',
            'finally-start',
            'finally-end',
        ])
    })

    it('should handle sub-task finally and sup-task finally execution order', async () => {
        const executionOrder: string[] = []

        function* subTaskWithFinally(index: number) {
            return yield* Koka.try(function* () {
                executionOrder.push(`sub-task-${index}-start`)
                yield* Async.await(delayTime(10))
                return `task-${index}`
            }).finally(function* () {
                executionOrder.push(`sub-task-${index}-finally`)
            })
        }

        function* program() {
            return yield* Koka.try(function* () {
                executionOrder.push('program-start')
                return yield* Task.all([subTaskWithFinally(0), subTaskWithFinally(1)])
            }).finally(function* () {
                executionOrder.push('program-finally')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toEqual(['task-0', 'task-1'])

        // Verify execution order: sub-tasks complete, then their finally blocks, then sup-task finally, then outer finally
        expect(executionOrder).toEqual([
            'program-start',
            'sub-task-0-start',
            'sub-task-1-start',
            'sub-task-0-finally',
            'sub-task-1-finally',
            'program-finally',
        ])
    })

    it('should handle sub-task finally execution when sub-task throws error', async () => {
        const executionOrder: string[] = []
        class SubTaskError extends Err.Err('SubTaskError')<string> {}

        function* failingSubTask(index: number) {
            return yield* Koka.try(function* () {
                executionOrder.push(`sub-task-${index}-start`)
                yield* Async.await(delayTime(10))
                yield* Err.throw(new SubTaskError(`error-${index}`))
            }).finally(function* () {
                executionOrder.push(`sub-task-${index}-finally`)
            })
        }

        function* program() {
            return yield* Koka.try(function* () {
                executionOrder.push('program-start')
                return yield* Task.all([failingSubTask(0), failingSubTask(1)])
            }).finally(function* () {
                executionOrder.push('program-finally')
            })
        }

        const result = await Koka.runAsync(
            Koka.try(program()).handle({
                SubTaskError: (error: string) => `Caught: ${error}`,
            }),
        )
        expect(result).toBe('Caught: error-0') // First error wins

        // Verify sub-task finally blocks execute even when sub-tasks fail
        expect(executionOrder).toEqual([
            'program-start',
            'sub-task-0-start',
            'sub-task-1-start',
            'sub-task-0-finally',
            'sub-task-1-finally',
            'program-finally',
        ])
    })

    it('should execute finally blocks when Task.all is aborted', async () => {
        const executionOrder: string[] = []
        const controller = new AbortController()

        function* longRunningSubTask(index: number) {
            return yield* Koka.try(function* () {
                executionOrder.push(`sub-task-${index}-start`)
                yield* Async.await(new Promise(() => {})) // Never resolves
                executionOrder.push(`sub-task-${index}-end`) // Should not reach here
                return `task-${index}`
            }).finally(function* () {
                executionOrder.push(`sub-task-${index}-finally`)
            })
        }

        function* program() {
            return yield* Koka.try(function* () {
                executionOrder.push('program-start')
                return yield* Task.all([longRunningSubTask(0), longRunningSubTask(1)])
            }).finally(function* () {
                executionOrder.push('program-finally')
            })
        }

        const promise = Koka.runAsync(program(), { abortSignal: controller.signal })

        // Abort after a short delay to allow tasks to start
        setTimeout(() => controller.abort(), 10)

        await expect(promise).rejects.toThrow('Operation aborted')

        // Verify finally blocks execute even when aborted
        expect(executionOrder).toEqual([
            'program-start',
            'sub-task-0-start',
            'sub-task-1-start',
            'sub-task-0-finally',
            'sub-task-1-finally',
            'program-finally',
        ])
    })

    it('should execute finally blocks when Task.concurrent is aborted', async () => {
        const executionOrder: string[] = []
        const controller = new AbortController()

        function* longRunningSubTask(index: number) {
            return yield* Koka.try(function* () {
                executionOrder.push(`sub-task-${index}-start`)
                yield* Async.await(new Promise(() => {})) // Never resolves
                executionOrder.push(`sub-task-${index}-end`) // Should not reach here
                return `task-${index}`
            }).finally(function* () {
                executionOrder.push(`sub-task-${index}-finally`)
            })
        }

        function* program() {
            return yield* Koka.try(function* () {
                executionOrder.push('program-start')
                return yield* Task.concurrent([longRunningSubTask(0), longRunningSubTask(1)], async (stream) => {
                    const results = []
                    for await (const { value } of stream) {
                        results.push(value)
                    }
                    return results
                })
            }).finally(function* () {
                executionOrder.push('program-finally')
            })
        }

        const promise = Koka.runAsync(program(), { abortSignal: controller.signal })

        // Abort after a short delay to allow tasks to start
        setTimeout(() => controller.abort(), 10)

        await expect(promise).rejects.toThrow('Operation aborted')

        // Verify finally blocks execute even when aborted
        expect(executionOrder).toEqual([
            'program-start',
            'sub-task-0-start',
            'sub-task-1-start',
            'sub-task-0-finally',
            'sub-task-1-finally',
            'program-finally',
        ])
    })

    it('should execute finally blocks when Task.race is aborted', async () => {
        const executionOrder: string[] = []
        const controller = new AbortController()

        function* longRunningSubTask(index: number) {
            return yield* Koka.try(function* () {
                executionOrder.push(`sub-task-${index}-start`)
                yield* Async.await(new Promise(() => {})) // Never resolves
                executionOrder.push(`sub-task-${index}-end`) // Should not reach here
                return `task-${index}`
            }).finally(function* () {
                executionOrder.push(`sub-task-${index}-finally`)
            })
        }

        function* program() {
            return yield* Koka.try(function* () {
                executionOrder.push('program-start')
                return yield* Task.race([longRunningSubTask(0), longRunningSubTask(1)])
            }).finally(function* () {
                executionOrder.push('program-finally')
            })
        }
        const promise = Koka.runAsync(program(), { abortSignal: controller.signal })

        // Abort after a short delay to allow tasks to start
        setTimeout(() => controller.abort(), 10)

        await expect(promise).rejects.toThrow('Operation aborted')

        // Verify finally blocks execute even when aborted
        expect(executionOrder).toEqual([
            'program-start',
            'sub-task-0-start',
            'sub-task-1-start',
            'sub-task-0-finally',
            'sub-task-1-finally',
            'program-finally',
        ])
    })

    it('should handle nested Task methods with finally blocks and abort', async () => {
        const executionOrder: string[] = []
        const controller = new AbortController()

        function* innerTask(index: number) {
            return yield* Koka.try(function* () {
                executionOrder.push(`inner-task-${index}-start`)
                yield* Async.await(new Promise(() => {})) // Never resolves
                executionOrder.push(`inner-task-${index}-end`) // Should not reach here
                return `inner-${index}`
            }).finally(function* () {
                executionOrder.push(`inner-task-${index}-finally`)
            })
        }

        function* middleTask() {
            return yield* Koka.try(function* () {
                executionOrder.push('middle-task-start')
                return yield* Task.all([innerTask(0), innerTask(1)])
            }).finally(function* () {
                executionOrder.push('middle-task-finally')
            })
        }

        function* program() {
            return yield* Koka.try(function* () {
                executionOrder.push('program-start')
                return yield* middleTask()
            }).finally(function* () {
                executionOrder.push('program-finally')
            })
        }

        const promise = Koka.runAsync(program(), { abortSignal: controller.signal })

        // Abort after a short delay to allow tasks to start
        setTimeout(() => controller.abort(), 10)

        await expect(promise).rejects.toThrow('Operation aborted')

        // Verify all finally blocks execute in reverse order when aborted
        expect(executionOrder).toEqual([
            'program-start',
            'middle-task-start',
            'inner-task-0-start',
            'inner-task-1-start',
            'inner-task-0-finally',
            'inner-task-1-finally',
            'middle-task-finally',
            'program-finally',
        ])
    })
})
