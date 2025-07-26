import * as Eff from '../src'
import * as Task from '../src/task'
import * as Result from '../src/result'

const delayTime = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Task.combine', () => {
    it('should handle sync effects with array input', async () => {
        function* effect1() {
            return 1
        }

        function* effect2() {
            return '2'
        }

        function* program() {
            const combined: Generator<Eff.Async, [number, string]> = Task.combine([effect1(), effect2()])
            const results = yield* combined
            return results[0] + Number(results[1])
        }

        const result = await Eff.runAsync(program())
        expect(result).toBe(3)
    })

    it('should handle async effects with array input', async () => {
        function* effect1() {
            return yield* Eff.await(Promise.resolve(1))
        }

        function* effect2() {
            return yield* Eff.await(Promise.resolve('2'))
        }

        function* program() {
            const combined: Generator<Eff.Async, [number, string]> = Task.combine([effect1(), effect2()])
            const results = yield* combined
            return results[0] + Number(results[1])
        }

        const result = await Eff.run(program())
        expect(result).toBe(3)
    })

    it('should handle mixed sync/async effects with array input', async () => {
        function* syncEffect() {
            return 1
        }

        function* asyncEffect() {
            return yield* Eff.await(Promise.resolve(2))
        }

        function* program() {
            const combined: Generator<Eff.Async, [number, number]> = Task.combine([
                syncEffect(),
                asyncEffect(),
            ] as const)
            const results = yield* combined
            return results[0] + results[1]
        }

        const result = await Eff.run(program())
        expect(result).toBe(3)
    })

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
            } = yield* Task.combine({
                a: effect1(),
                b: effect2(),
                c: 3,
            })
            return results.a + results.b + results.c
        }

        const result = await Eff.run(program())
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
            } = yield* Task.combine({
                a: effect1(),
                b: 2,
                c: () => effect1(),
            })
            return results.a + results.b + results.c
        }

        const result = await Eff.run(program())
        expect(result).toBe(4)
    })

    it('should handle errors in object input', () => {
        class TestErr extends Eff.Err('TestErr')<string> {}

        function* effect1() {
            return 1
        }

        function* effect2() {
            yield* Eff.throw(new TestErr('error'))
            return 2
        }

        function* program() {
            const results: {
                a: number
                b: number
            } = yield* Task.combine({
                a: effect1(),
                b: effect2(),
            })
            return results.a + results.b
        }

        const result = Result.run(program())
        expect(result).toEqual({
            type: 'err',
            name: 'TestErr',
            error: 'error',
        })
    })

    it('should handle empty object input', async () => {
        function* program(): Generator<Eff.Async, {}> {
            const results: {} = yield* Task.combine({})
            return results
        }

        const result = await Eff.run(program())
        expect(result).toEqual({})
    })

    it('should handle multiple async effects and run concurrently', async () => {
        class DelayError extends Eff.Err('DelayError')<string> {}

        function* delayedEffect<T>(value: T, delay: number) {
            if (delay === 0) {
                yield* Eff.throw(new DelayError('Delay cannot be zero'))
            }

            yield* Eff.await(delayTime(delay))

            return value
        }

        function* program() {
            const combined: Generator<Eff.Async | DelayError, [number, string, boolean]> = Task.combine([
                delayedEffect(1, 30),
                delayedEffect('2', 20),
                delayedEffect(false, 10),
            ])

            const results = yield* combined
            return results
        }

        const start = Date.now()
        const result = await Result.run(program())
        const duration = Date.now() - start

        expect(result).toEqual({
            type: 'ok',
            value: [1, '2', false],
        })

        // Should run program in parallel
        expect(duration).toBeLessThan(50) // Should complete in less than 50ms
    })

    it('should handle empty array', async () => {
        function* program(): Generator<Eff.Async, []> {
            const results = yield* Task.combine([])
            return results
        }

        const result = await Eff.run(program())
        expect(result).toEqual([])
    })

    it('should handle function effects', async () => {
        function* effect1(): Generator<never, number> {
            return 1
        }

        function* effect2(): Generator<never, number> {
            return 2
        }

        function* program(): Generator<Eff.Async, number> {
            const results = yield* Task.combine([() => effect1(), () => effect2()])
            return results[0] + results[1]
        }

        const result = await Eff.run(program())
        expect(result).toBe(3)
    })

    it('should handle async errors with native try-catch', async () => {
        function* effectWithError(): Generator<Eff.Async, number> {
            const value = yield* Eff.await(Promise.reject(new Error('Async error')))
            return value
        }

        function* program() {
            try {
                const results = yield* Task.combine([effectWithError(), Eff.await(Promise.resolve(2))])
                return results[0] + results[1]
            } catch (err: unknown) {
                return err as Error
            }
        }

        const result = await Eff.run(program())

        expect(result).toBeInstanceOf(Error)
        expect((result as Error).message).toBe('Async error')
    })

    it('should propagate async errors', async () => {
        function* failingEffect(): Generator<Eff.Async, never> {
            yield* Eff.await(Promise.reject(new Error('Async error')))
            /* istanbul ignore next */
            throw new Error('Should not reach here')
        }

        function* program(): Generator<Eff.Async, number> {
            const results = yield* Task.combine([failingEffect(), Eff.await(Promise.resolve(2))])
            return results[0] + results[1]
        }

        await expect(Eff.run(program())).rejects.toThrow('Async error')
    })

    it('should handle thrown errors in async effects', async () => {
        function* effectWithThrow(): Generator<Eff.Async, number> {
            const value = yield* Eff.await(
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

        function* program(): Generator<Eff.Async, number> {
            try {
                const results = yield* Task.combine([effectWithThrow(), Eff.await(Promise.resolve(2))])
                return results[0] + results[1]
            } catch (err) {
                if (err instanceof Error) {
                    return -100
                }
                throw err
            }
        }

        const result = await Eff.run(program())
        expect(result).toBe(-100)
    })
})

describe('Task.race', () => {
    it('should interrupt other effects when one resolves', async () => {
        let cleanupCalled = false

        function* slowEffect() {
            try {
                yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 100)))
                return 'slow'
            } finally {
                cleanupCalled = true
            }
        }

        function* fastEffect() {
            return 'fast'
        }

        const inputs = [slowEffect(), fastEffect()]
        const result = await Eff.run(Task.race(inputs))

        expect(result).toBe('fast')
        expect(cleanupCalled).toBe(true)
    })
})

describe('Task.all', () => {
    it('should handle errors in effects', () => {
        class TestErr extends Eff.Err('TestErr')<string> {}

        function* effect1() {
            return 1
        }

        function* effect2() {
            yield* Eff.throw(new TestErr('error'))
            return 2
        }

        function* program() {
            const results = yield* Task.all([effect1(), effect2()])
            return results[0] + results[1]
        }

        const result = Result.run(program())
        expect(result).toEqual({
            type: 'err',
            name: 'TestErr',
            error: 'error',
        })
    })

    it('should handle effect list with the same item type', async () => {
        function* effect1(): Generator<Eff.Async, number> {
            yield* Eff.await(Promise.resolve(1))
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

        const result = await Eff.run(program())
        expect(result).toEqual([1, 2])
    })
})

describe('Task.stream', () => {
    it('should clean up pending effects on early return', async () => {
        const cleanUp = jest.fn()
        const returnFn = jest.fn()

        function* valueGen(n: number) {
            try {
                yield* Eff.await(Promise.resolve(1))
                returnFn()
                return 1
            } finally {
                cleanUp(n)
            }
        }

        const inputs = [valueGen(0), valueGen(1), valueGen(2), valueGen(3)]
        const handler = async (_stream: Task.StreamResults<number>) => {
            // Early return without consuming all results
            return 42
        }

        const result = await Eff.run(Task.stream(inputs, handler))
        expect(result).toBe(42)
        expect(returnFn).toHaveBeenCalledTimes(0)
        expect(cleanUp).toHaveBeenCalledTimes(4)
    })

    it('should clean up pending effects on early return in for-await-of block', async () => {
        const cleanUp = jest.fn()
        const returnFn = jest.fn()

        function* produce(n: number) {
            try {
                yield* Eff.await(delayTime(n))
                returnFn()
                return n
            } finally {
                cleanUp(n)
            }
        }

        const inputs = [produce(40), produce(20), produce(30), produce(10)]

        const handler = async (stream: Task.StreamResults<number>) => {
            const results = [] as Task.StreamResult<number>[]

            for await (const result of stream) {
                results.push(result)

                if (results.length === 2) {
                    return results
                }
            }

            throw new Error('Early return')
        }

        const results = await Eff.run(Task.stream(inputs, handler))

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

        const program = Task.stream(inputs, async (stream) => {
            const results = [] as number[]

            for await (const { index, value } of stream) {
                results[index] = value * 2
            }

            return results
        })

        const result = await Eff.run(program)
        expect(result).toEqual([2, 4, 6])
    })

    it('should handle empty input stream', async () => {
        const program = Task.stream([] as Generator<never, number>[], async (stream) => {
            const results = [] as number[]

            for await (const { index, value } of stream) {
                results[index] = value * 2
            }
            return results
        })

        const result = await Eff.runAsync(program)

        expect(result).toEqual([])
    })

    it('should handle async effects in stream', async () => {
        function* asyncValueGen(value: number) {
            const asyncValue = yield* Eff.await(Promise.resolve(value))
            return asyncValue
        }

        const inputs = [asyncValueGen(1), asyncValueGen(2), asyncValueGen(3)]

        const handler = async (stream: Task.StreamResults<number>) => {
            const results = [] as number[]
            for await (const { index, value } of stream) {
                results[index] = value * 2
            }
            return results
        }

        const program = Task.stream(inputs, handler)

        const result = await Eff.run(program)
        expect(result).toEqual([2, 4, 6])
    })

    it('should propagate errors from stream items', async () => {
        class StreamError extends Eff.Err('StreamError')<string> {}

        function* failingGen() {
            yield* Eff.throw(new StreamError('stream error'))
            return 1
        }

        const inputs = [failingGen()]
        const handler = async (stream: Task.StreamResults<number>) => {
            const results = [] as number[]
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Result.run(Task.stream(inputs, handler))

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
            return yield* Eff.await(Promise.resolve(2))
        }

        const inputs = [syncGen(), asyncGen()]
        const handler = async (stream: Task.StreamResults<number>) => {
            const results = [] as number[]

            for await (const { index, value } of stream) {
                results[index] = value * 2
            }

            return results
        }

        const result = await Eff.run(Task.stream(inputs, handler))

        expect(result).toEqual([2, 4])
    })

    it('should clean up generators on error', async () => {
        class CleanupError extends Eff.Err('CleanupError')<string> {}

        let cleanupCalled = false
        function* failingGen() {
            try {
                yield* Eff.throw(new CleanupError('cleanup error'))
                return 1
            } finally {
                cleanupCalled = true
            }
        }

        const inputs = [failingGen()]
        const handler = async (stream: Task.StreamResults<number>) => {
            try {
                for await (const { value } of stream) {
                    return value
                }
                return 0
            } catch {
                return -1
            }
        }

        const result = await Result.run(Task.stream(inputs, handler))
        expect(result).toEqual({
            type: 'err',
            name: 'CleanupError',
            error: 'cleanup error',
        })
        expect(cleanupCalled).toBe(true)
    })

    it('should handle unexpected completion errors in stream', async () => {
        function* normalGen() {
            return 42
        }

        const inputs = [normalGen()]
        const handler = async (stream: Task.StreamResults<number>) => {
            const results = []
            for await (const result of stream) {
                results.push(result)
            }
            return results
        }

        // This should not throw an unexpected completion error
        const result = await Eff.run(Task.stream(inputs, handler))
        expect(result).toEqual([{ index: 0, value: 42 }])
    })

    it('should handle stream with mixed sync and async effects', async () => {
        function* syncGen() {
            return 1
        }

        function* asyncGen() {
            const value = yield* Eff.await(Promise.resolve(2))
            return value
        }

        const inputs = [syncGen(), asyncGen()]
        const handler = async (stream: Task.StreamResults<number>) => {
            const results = []
            for await (const result of stream) {
                results.push(result)
            }
            return results
        }

        const result = await Eff.run(Task.stream(inputs, handler))
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
        const handler = async (stream: Task.StreamResults<number>) => {
            for await (const result of stream) {
                return result.value * 2
            }
            return 0
        }

        const result = await Eff.run(Task.stream(inputs, handler))
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
                yield* Eff.await(delayTime(50))
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

        const handler = async (stream: Task.StreamResults<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Eff.run(Task.stream(producer, handler, { maxConcurrency }))

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
                    yield* Eff.await(delayTime(10))
                    return `item-${index}`
                }
            }
            return undefined // Early termination
        }

        const handler = async (stream: Task.StreamResults<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Eff.run(Task.stream(producer, handler, { maxConcurrency: 2 }))

        expect(result).toEqual(['item-0', 'item-1', 'item-2'])
        expect(callCount).toBe(4) // 4th call returns undefined
    })

    it('should handle empty TaskProducer', async () => {
        const producer = (index: number) => {
            return undefined // Immediate termination
        }

        const handler = async (stream: Task.StreamResults<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Eff.run(Task.stream(producer, handler))

        expect(result).toEqual([])
    })

    it('should handle TaskProducer with conditional task generation', async () => {
        const producer = (index: number) => {
            if (index % 2 === 0) {
                return function* () {
                    yield* Eff.await(delayTime(10))
                    return `even-${index}`
                }
            } else if (index < 5) {
                return function* () {
                    yield* Eff.await(delayTime(5))
                    return `odd-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.StreamResults<string>) => {
            const results = [] as string[]
            for await (const { index, value } of stream) {
                results[index] = value
            }
            return results
        }

        const result = await Eff.run(Task.stream(producer, handler, { maxConcurrency: 3 }))

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
                yield* Eff.await(delayTime(30))
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

        const result = await Eff.run(Task.all(producer, { maxConcurrency }))

        expect(result).toEqual(['task-0', 'task-1', 'task-2', 'task-3'])
        // Verify that active task count never exceeds max concurrency limit
        expect(Math.max(...maxActiveTasks)).toBeLessThanOrEqual(maxConcurrency)
        expect(activeTasks.length).toBe(0)
    })

    it('should handle all with TaskProducer returning undefined', async () => {
        const producer = (index: number) => {
            if (index < 2) {
                return function* () {
                    yield* Eff.await(delayTime(10))
                    return `item-${index}`
                }
            }
            return undefined
        }

        const result = await Eff.run(Task.all(producer))

        expect(result).toEqual(['item-0', 'item-1'])
    })

    it('should maintain order with maxConcurrency', async () => {
        const producer = (index: number) => {
            if (index < 3) {
                return function* () {
                    // Simulate different delays, but results should maintain index order
                    yield* Eff.await(delayTime((3 - index) * 10))
                    return `item-${index}`
                }
            }
            return undefined
        }

        const result = await Eff.run(Task.all(producer, { maxConcurrency: 2 }))

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
                yield* Eff.await(delayTime((index + 1) * 20))
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

        const result = await Eff.run(Task.race(producer, { maxConcurrency }))

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
                    yield* Eff.await(delayTime(10))
                    return 'fast'
                }
            }
            return undefined
        }

        const result = await Eff.run(Task.race(producer))

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
                        yield* Eff.await(delayTime(50))
                        return `slow-${index}`
                    }
                }
            }
            return undefined
        }

        const result = await Eff.run(Task.race(producer, { maxConcurrency: 2 }))

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

        const handler = async (stream: Task.StreamResults<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        // Test maxConcurrency = 0
        expect(() => Eff.run(Task.stream(producer, handler, { maxConcurrency: 0 }))).toThrow(
            'maxConcurrency must be greater than 0',
        )

        // Test maxConcurrency = -1
        expect(() => Eff.run(Task.stream(producer, handler, { maxConcurrency: -1 }))).toThrow(
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
                        yield* Eff.await(delayTime(10))
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

        const handler = async (stream: Task.StreamResults<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Eff.run(Task.stream(producer, handler, { maxConcurrency: 1 }))

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
                        yield* Eff.await(delayTime(10))
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

        const handler = async (stream: Task.StreamResults<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Eff.run(Task.stream(producer, handler, { maxConcurrency: 1000 }))

        expect(result).toEqual(['item-0', 'item-1', 'item-2', 'item-3', 'item-4'])
        // Verify all tasks can execute concurrently (max active tasks should equal total tasks)
        expect(Math.max(...maxActiveTasks)).toBe(5)
        expect(activeTasks.length).toBe(0)
    })
})

describe('TaskProducer with error handling', () => {
    it('should handle errors in TaskProducer', async () => {
        class ProducerError extends Eff.Err('ProducerError')<string> {}

        const producer: Task.TaskProducer<ProducerError | Eff.Async, string> = (index: number) => {
            if (index === 1) {
                return function* () {
                    yield* Eff.throw(new ProducerError('Producer failed'))
                    return 'should not reach here'
                }
            } else if (index < 3) {
                return function* () {
                    yield* Eff.await(delayTime(10))
                    return `item-${index}`
                }
            }
            return undefined
        }

        const handler = async (stream: Task.StreamResults<string>) => {
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

        const program = Task.stream(producer, handler, { maxConcurrency: 2 })

        const result = await Eff.runAsync(
            Eff.try(program).handle({
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
                        yield* Eff.await(delayTime(20))
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

        const handler = async (stream: Task.StreamResults<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Eff.run(Task.stream(producer, handler, { maxConcurrency }))

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

        const handler = async (stream: Task.StreamResults<string>) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Eff.run(Task.stream(producer, handler))

        expect(result).toEqual(['function', 'generator'])
    })
})
