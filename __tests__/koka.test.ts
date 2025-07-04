import { Eff, Err, Result, isGenerator, Async, StreamResult, StreamResults } from '../src/koka'

const delayTime = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Result', () => {
    it('should create ok result', () => {
        const ok = Result.ok(42)
        expect(ok.type).toBe('ok')
        expect(ok.value).toBe(42)
    })

    it('should create err result', () => {
        const err = Result.err('TestError', 'error message')
        expect(err.type).toBe('err')
        expect(err.name).toBe('TestError')
        expect(err.error).toBe('error message')
    })
})

describe('Eff.err', () => {
    it('should throw error effect', () => {
        function* test() {
            yield* Eff.err('TestError').throw('error message')
            return 'should not reach here'
        }

        const result = Eff.run(Eff.result(test()))

        expect(result).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error message',
        })
    })
})

describe('Eff.ctx', () => {
    it('should get context value', () => {
        function* test() {
            const value = yield* Eff.ctx('TestCtx').get<number>()
            const num = yield* Eff.ctx('Num').get<number>()
            return value * 2
        }

        const program0 = Eff.try(test()).handle({
            Num: 2,
        })

        const program1 = Eff.try(program0).handle({
            TestCtx: 21,
        })

        const result = Eff.run(program1)
        expect(result).toBe(42)
    })

    it('should propagate context when not handled', () => {
        function* inner() {
            return yield* Eff.ctx('TestCtx').get<number>()
        }

        function* outer() {
            return yield* inner()
        }

        const program = Eff.try(outer()).handle({
            TestCtx: 42,
        })

        const result = Eff.run(program)
        expect(result).toBe(42)
    })
})

describe('Eff.try', () => {
    it('should throw for unhandled effect types', () => {
        function* test() {
            yield { type: 'unknown' } as any
            return 'should not reach here'
        }

        expect(() => {
            Eff.run(Eff.try(test()).handle({}))
        }).toThrow(/Unexpected effect/)
    })

    it('should catch error effect', () => {
        function* test() {
            yield* Eff.err('TestError').throw('error')
            return 'should not reach here'
        }

        const program = Eff.try(test()).handle({
            TestError: (error) => `Caught: ${error}`,
        })

        const result = Eff.run(program)
        expect(result).toBe('Caught: error')
    })

    it('should propagate unhandled error', () => {
        function* test() {
            yield* Eff.err('UnhandledError').throw('error')
            return 'should not reach here'
        }

        const program = Eff.try(test()).handle({})

        const result = Eff.run(
            Eff.try(program).handle({
                UnhandledError: (error) => ({ error }),
            }),
        )

        expect(result).toEqual({
            error: 'error',
        })
    })

    it('should handle multiple catches', () => {
        function* test() {
            yield* Eff.ctx('TestCtx').get<() => 1>()
            yield* Eff.err('FirstError').throw<void | string>('first error')
            yield* Eff.err('SecondError').throw('second error')
            return 'should not reach here'
        }

        const program = Eff.try(test()).handle({
            FirstError: (error) => `Caught first: ${error}`,
            SecondError: (error) => `Caught second: ${error}`,
            TestCtx: () => 1,
        })

        const result = Eff.runSync(program)
        expect(result).toBe('Caught first: first error')
    })

    it('should handle nested try/catch', () => {
        function* inner() {
            yield* Eff.err('InnerError').throw('inner error')
            return 'should not reach here'
        }

        function* outer() {
            return yield* inner()
        }

        const result = Eff.run(
            Eff.try(outer()).handle({
                InnerError: (error) => `Caught inner: ${error}`,
            }),
        )
        expect(result).toBe('Caught inner: inner error')
    })
})

describe('Eff.run', () => {
    it('should handle async effects', async () => {
        function* test() {
            const value = yield* Eff.await(Promise.resolve(42))
            const syncValue = yield* Eff.await(2)
            return value * syncValue
        }

        const result = await Eff.runAsync(test())
        expect(result).toBe(84)
    })

    it('should handle mixed sync/async effects', async () => {
        function* test() {
            const syncValue = 21
            const asyncValue = yield* Eff.await(Promise.resolve(21))
            return syncValue + asyncValue
        }

        const result = await Eff.run(test())
        expect(result).toBe(42)
    })

    it('should handle errors in async effects', async () => {
        function* testThrow() {
            yield* Eff.await(Promise.reject(new Error('Async error')))
        }

        function* test() {
            try {
                yield* testThrow()
            } catch (err) {
                if (err instanceof Error) {
                    return `Caught: ${err.message}`
                }
            }
        }

        const result = await Eff.run(test())
        expect(result).toBe('Caught: Async error')
    })

    it('should throw error when received unexpected effect type', () => {
        class TestErr extends Eff.Err('TestErr')<string> {}
        class TestCtx extends Eff.Ctx('TestCtx')<string> {}
        class TestOpt extends Eff.Opt('TestOpt')<string> {}

        function* testErr(): Generator<TestErr, string> {
            yield* Eff.throw(new TestErr('error'))
            return 'should not reach here'
        }

        function* testCtx(): Generator<TestCtx, string> {
            const ctx = yield* Eff.get(TestCtx)
            return ctx
        }

        function* testOpt(): Generator<TestOpt, string> {
            const opt = yield* Eff.get(TestOpt)
            return opt ?? 'default'
        }

        // @ts-expect-error for test
        expect(() => Eff.run(testErr())).toThrow(/\w+/)
        // @ts-expect-error for test
        expect(() => Eff.run(testCtx())).toThrow(/\w+/)

        expect(Eff.run(testOpt())).toBe('default')

        expect(
            Eff.run(
                Eff.try(testOpt()).handle({
                    [TestOpt.field]: 'custom value',
                }),
            ),
        ).toBe('custom value')
    })
})

describe('Eff.runSync', () => {
    it('should run sync effects', () => {
        function* test() {
            return 42
        }

        const result = Eff.runSync(test())
        expect(result).toBe(42)
    })

    it('should throw for async effects', () => {
        function* test(): Generator<Async, number> {
            yield* Eff.await(Promise.resolve(42))
            return 42
        }

        // @ts-expect-error for test
        expect(() => Eff.runSync(test())).toThrow(/Expected synchronous effect, but got asynchronous effect/)
    })
})

describe('Eff.result', () => {
    it('should convert generator to Result', () => {
        function* success() {
            return 42
        }

        function* failure() {
            const message = yield* Eff.ctx('TestCtx').get<string>()

            yield* Eff.err('TestError').throw(message)
            return 'should not reach here'
        }

        const successResult = Eff.run(Eff.result(success()))

        expect(successResult).toEqual({
            type: 'ok',
            value: 42,
        })

        const failureResult = Eff.run(
            Eff.try(Eff.result(failure())).handle({
                TestCtx: 'error',
            }),
        )
        expect(failureResult).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error',
        })
    })

    it('should throw err result', () => {
        function* failure() {
            throw new Error('TestError')
        }

        function* test() {
            try {
                yield* failure()
                return 'should not reach here'
            } catch (err) {
                if (err instanceof Error) {
                    return `Caught: ${err.message}`
                }
            }
        }

        const result = Eff.run(Eff.result(test()))

        expect(result).toEqual({
            type: 'ok',
            value: 'Caught: TestError',
        })
    })
})

describe('Eff.ok', () => {
    it('test success', () => {
        function* success() {
            return Result.ok(42)
        }

        function* testSuccess() {
            const value = yield* Eff.ok(success())
            return value
        }

        const result = Eff.run(testSuccess)

        expect(result).toBe(42)
    })

    it('test failure', () => {
        function* testFailure() {
            yield* Eff.ok(Eff.result(Eff.err('TestError').throw('error')))
        }

        const failureResult = Eff.run(
            Eff.try(testFailure).handle({
                TestError: (error) => `Caught: ${error}`,
            }),
        )

        expect(failureResult).toBe('Caught: error')
    })
})

describe('Eff.runResult', () => {
    it('should run generator and return Result', async () => {
        function* program(input: number) {
            const value = yield* Eff.await(Promise.resolve(input))

            if (value === 0) {
                yield* Eff.err('ZeroError').throw('value is zero')
            }

            return value
        }

        const result = await Eff.runResult(program(42))

        expect(result).toEqual({
            type: 'ok',
            value: 42,
        })
    })

    it('should handle error in generator', () => {
        function* program() {
            yield* Eff.err('TestError').throw('error message')
            return 'should not reach here'
        }

        const result = Eff.runResult(program)

        expect(result).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error message',
        })
    })
})

describe('Complex scenarios', () => {
    it('should handle successful nested effects', async () => {
        function* program() {
            const ctxValue = yield* Eff.ctx('TestCtx').get<number>()
            const asyncValue = yield* Eff.await(Promise.resolve(ctxValue * 2))
            return asyncValue + 1
        }

        const result = await Eff.run(
            Eff.try(program()).handle({
                TestCtx: 21,
            }),
        )
        expect(result).toBe(43)
    })

    it('should handle error in nested effects', async () => {
        function* program() {
            const ctxValue = yield* Eff.ctx('TestCtx').get<number>()
            if (ctxValue === 0) {
                yield* Eff.err('ZeroError').throw('ctx is zero')
            }
            const asyncValue = yield* Eff.await(Promise.resolve(ctxValue * 2))
            return asyncValue + 1
        }

        const result = await Eff.run(
            Eff.try(program()).handle({
                TestCtx: 0,
                e: 1,
                ZeroError: (error) => `Handled: ${error}`,
            }),
        )

        expect(result).toBe('Handled: ctx is zero')
    })
})

describe('Eff.Ctx/Eff.Err', () => {
    it('should create context effect class', () => {
        class TestCtx extends Eff.Ctx('TestCtx')<number> {}

        const ctx = new TestCtx()
        ctx.context = 42

        expect(ctx.type).toBe('ctx')
        expect(ctx.name).toBe('TestCtx')
        expect(ctx.context).toBe(42)
    })

    it('should create error effect class', () => {
        class TestErr extends Eff.Err('TestErr')<string> {}
        const err = new TestErr('error')

        expect(err.type).toBe('err')
        expect(err.name).toBe('TestErr')
        expect(err.error).toBe('error')
    })
})

describe('Eff.throw', () => {
    it('should throw error effect', () => {
        class TestErr extends Eff.Err('TestErr')<string> {}

        function* test() {
            yield* Eff.throw(new TestErr('error'))
            return 'should not reach here'
        }

        const result = Eff.run(Eff.result(test()))

        expect(result).toEqual(new TestErr('error'))
    })

    it('should propagate error through nested calls', () => {
        const TestErr = Eff.Err('TestErr')<string>

        function* inner() {
            yield* Eff.throw(new TestErr('inner error'))
            return 'should not reach here'
        }

        function* outer() {
            return yield* inner()
        }

        const result = Eff.run(Eff.result(outer()))
        expect(result).toEqual(new TestErr('inner error'))
    })
})

describe('Eff.get', () => {
    it('should get context value', () => {
        const TestCtx = Eff.Ctx('TestCtx')<number>

        function* test() {
            const value = yield* Eff.get(TestCtx)
            return value * 2
        }

        const program = Eff.try(test()).handle({
            TestCtx: 42,
        })

        const result = Eff.run(program)
        expect(result).toBe(84)
    })

    it('should propagate context when not handled', () => {
        const TestCtx = Eff.Ctx('TestCtx')<number>

        function* inner() {
            return yield* Eff.get(TestCtx)
        }

        function* outer() {
            return yield* inner()
        }

        const program = Eff.try(outer()).handle({
            TestCtx: 42,
        })

        const result = Eff.run(program)
        expect(result).toBe(42)
    })
})

describe('helpers', () => {
    it('should check if value is a generator', () => {
        function* gen() {}
        const notGen = () => {}

        expect(isGenerator(gen())).toBe(true)
        expect(isGenerator(notGen())).toBe(false)
    })
})

describe('Eff.combine', () => {
    it('should handle sync effects with array input', async () => {
        function* effect1() {
            return 1
        }

        function* effect2() {
            return '2'
        }

        function* program() {
            const combined: Generator<Async, [number, string]> = Eff.combine([effect1(), effect2()])
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
            const combined: Generator<Async, [number, string]> = Eff.combine([effect1(), effect2()])
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
            const combined: Generator<Async, [number, number]> = Eff.combine([syncEffect(), asyncEffect()] as const)
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
            } = yield* Eff.combine({
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
            } = yield* Eff.combine({
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
            } = yield* Eff.combine({
                a: effect1(),
                b: effect2(),
            })
            return results.a + results.b
        }

        const result = Eff.run(Eff.result(program()))
        expect(result).toEqual({
            type: 'err',
            name: 'TestErr',
            error: 'error',
        })
    })

    it('should handle empty object input', async () => {
        function* program(): Generator<Async, {}> {
            const results: {} = yield* Eff.combine({})
            return results
        }

        const result = await Eff.run(program())
        expect(result).toEqual({})
    })

    it('should handle multiple async effects and run concurrently', async () => {
        function* delayedEffect<T>(value: T, delay: number) {
            if (delay === 0) {
                yield* Eff.err('DelayError').throw('Delay cannot be zero')
            }

            yield* Eff.await(delayTime(delay))

            return value
        }

        function* program() {
            const combined: Generator<Async | Err<'DelayError', string>, [number, string, boolean]> = Eff.combine([
                delayedEffect(1, 30),
                delayedEffect('2', 20),
                delayedEffect(false, 10),
            ])

            const results = yield* combined
            return results
        }

        const start = Date.now()
        const result = await Eff.runResult(program())
        const duration = Date.now() - start

        expect(result).toEqual({
            type: 'ok',
            value: [1, '2', false],
        })

        // Should run program in parallel
        expect(duration).toBeLessThan(50) // Should complete in less than 50ms
    })

    it('should handle empty array', async () => {
        function* program(): Generator<Async, []> {
            const results = yield* Eff.combine([])
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

        function* program(): Generator<Async, number> {
            const results = yield* Eff.combine([() => effect1(), () => effect2()])
            return results[0] + results[1]
        }

        const result = await Eff.run(program())
        expect(result).toBe(3)
    })

    it('should handle async errors with native try-catch', async () => {
        function* effectWithError(): Generator<Async, number> {
            const value = yield* Eff.await(Promise.reject(new Error('Async error')))
            return value
        }

        function* program() {
            try {
                const results = yield* Eff.combine([effectWithError(), Eff.await(Promise.resolve(2))])
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
        function* failingEffect(): Generator<Async, never> {
            yield* Eff.await(Promise.reject(new Error('Async error')))
            /* istanbul ignore next */
            throw new Error('Should not reach here')
        }

        function* program(): Generator<Async, number> {
            const results = yield* Eff.combine([failingEffect(), Eff.await(Promise.resolve(2))])
            return results[0] + results[1]
        }

        await expect(Eff.run(program())).rejects.toThrow('Async error')
    })

    it('should handle thrown errors in async effects', async () => {
        function* effectWithThrow(): Generator<Async, number> {
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

        function* program(): Generator<Async, number> {
            try {
                const results = yield* Eff.combine([effectWithThrow(), Eff.await(Promise.resolve(2))])
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

describe('Eff.race', () => {
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
        const result = await Eff.run(Eff.race(inputs))

        expect(result).toBe('fast')
        expect(cleanupCalled).toBe(true)
    })
})

describe('Eff.all', () => {
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
            const results = yield* Eff.all([effect1(), effect2()])
            return results[0] + results[1]
        }

        const result = Eff.run(Eff.result(program()))
        expect(result).toEqual({
            type: 'err',
            name: 'TestErr',
            error: 'error',
        })
    })

    it('should handle effect list with the same item type', async () => {
        function* effect1(): Generator<Async, number> {
            yield* Eff.await(Promise.resolve(1))
            return 1
        }

        function* effect2(): Generator<never, number> {
            return 2
        }

        function* program() {
            const list = [effect1(), effect2()]
            const results = yield* Eff.all(list)
            return results
        }

        const result = await Eff.run(program())
        expect(result).toEqual([1, 2])
    })
})

describe('Eff.opt', () => {
    it('should return undefined when no value provided', () => {
        function* test() {
            return yield* Eff.ctx('TestOpt').opt<number>()
        }

        const result = Eff.run(test())
        expect(result).toBeUndefined()
    })

    it('should return value when provided', () => {
        function* test() {
            const optValue = yield* Eff.ctx('TestOpt').opt<number>()
            return optValue ?? 42
        }

        const result = Eff.run(Eff.try(test()).handle({ TestOpt: 21 }))
        expect(result).toBe(21)
    })

    it('should work with async effects', async () => {
        function* test() {
            const optValue = yield* Eff.ctx('TestOpt').opt<number>()
            const asyncValue = yield* Eff.await(Promise.resolve(optValue ?? 42))
            return asyncValue
        }

        const result = await Eff.run(test())
        expect(result).toBe(42)
    })

    it('should handle undefined context value', () => {
        function* test() {
            const optValue = yield* Eff.ctx('TestOpt').opt<number>()
            return optValue ?? 100
        }

        const result = Eff.run(Eff.try(test()).handle({ TestOpt: undefined }))
        expect(result).toBe(100)
    })
})

describe('Eff.stream', () => {
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
        const handler = async (_stream: StreamResults<number>) => {
            // Early return without consuming all results
            return 42
        }

        const result = await Eff.run(Eff.stream(inputs, handler))
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

        const handler = async (stream: StreamResults<number>) => {
            const results = [] as StreamResult<number>[]

            for await (const result of stream) {
                results.push(result)

                if (results.length === 2) {
                    return results
                }
            }

            throw new Error('Early return')
        }

        const results = await Eff.run(Eff.stream(inputs, handler))

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

        const program = Eff.stream(inputs, async (stream) => {
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
        const program = Eff.stream([] as Generator<never, number>[], async (stream) => {
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

        const handler = async (stream: StreamResults<number>) => {
            const results = [] as number[]
            for await (const { index, value } of stream) {
                results[index] = value * 2
            }
            return results
        }

        const program = Eff.stream(inputs, handler)

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
        const handler = async (stream: StreamResults<number>) => {
            const results = [] as number[]
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        }

        const result = await Eff.runResult(Eff.stream(inputs, handler))

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
        const handler = async (stream: StreamResults<number>) => {
            const results = [] as number[]

            for await (const { index, value } of stream) {
                results[index] = value * 2
            }

            return results
        }

        const result = await Eff.run(Eff.stream(inputs, handler))

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
        const handler = async (stream: StreamResults<number>) => {
            try {
                for await (const { value } of stream) {
                    return value
                }
                return 0
            } catch {
                return -1
            }
        }

        const result = await Eff.run(Eff.result(Eff.stream(inputs, handler)))
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
        const handler = async (stream: StreamResults<number>) => {
            const results = []
            for await (const result of stream) {
                results.push(result)
            }
            return results
        }

        // This should not throw an unexpected completion error
        const result = await Eff.run(Eff.stream(inputs, handler))
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
        const handler = async (stream: StreamResults<number>) => {
            const results = []
            for await (const result of stream) {
                results.push(result)
            }
            return results
        }

        const result = await Eff.run(Eff.stream(inputs, handler))
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
        const handler = async (stream: StreamResults<number>) => {
            for await (const result of stream) {
                return result.value * 2
            }
            return 0
        }

        const result = await Eff.run(Eff.stream(inputs, handler))
        expect(result).toBe(84)
    })
})

describe('design first approach', () => {
    // predefined error effects
    class UserNotFound extends Eff.Err('UserNotFound')<string> {}
    class UserInvalid extends Eff.Err('UserInvalid')<{ reason: string }> {}

    // predefined context effects
    class AuthToken extends Eff.Ctx('AuthToken')<string> {}
    class UserId extends Eff.Ctx('UserId')<string> {}

    // predefined option effects
    class LoggerOpt extends Eff.Opt('Logger')<(message: string) => void> {}

    // Helper functions using the defined types
    function* requireUserId() {
        const logger = yield* Eff.get(LoggerOpt)
        const userId = yield* Eff.get(UserId)

        if (!userId) {
            logger?.('User ID is missing, throwing UserInvalidErr')
            throw yield* Eff.throw(new UserInvalid({ reason: 'Missing user ID' }))
        }

        logger?.(`User ID: ${userId}`)

        return userId
    }

    function* getUser() {
        const userId = yield* requireUserId()

        const authToken = yield* Eff.get(AuthToken)

        if (!authToken) {
            yield* Eff.throw(new UserInvalid({ reason: 'Missing auth token' }))
        }

        // Simulate fetching user logic
        const user: { id: string; name: string } | null = yield* Eff.await(null)

        if (!user) {
            yield* Eff.throw(new UserNotFound(`User with ID ${userId} not found`))
        }

        return user
    }

    it('should support design first approach', async () => {
        const program = Eff.try(getUser()).handle({
            [UserNotFound.field]: (error) => `Error: ${error}`,
            [UserInvalid.field]: (error) => `Invalid user: ${JSON.stringify(error)}`,
            [AuthToken.field]: 'valid-token',
            [UserId.field]: '12345',
        })

        const result = await Eff.run(program)

        expect(result).toBe('Error: User with ID 12345 not found')
    })

    it('should support optional effects', async () => {
        const logs = [] as string[]
        const logger = (message: string) => {
            logs.push(message)
        }

        const program = Eff.try(getUser()).handle({
            UserNotFound: (error) => `Error: ${error}`,
            UserInvalid: (error) => `Invalid user: ${JSON.stringify(error, null, 2)}`,
            AuthToken: 'valid-token',
            UserId: '12345',
            Logger: logger,
        })

        let result = await Eff.run(program)

        expect(result).toBe('Error: User with ID 12345 not found')
        expect(logs).toEqual(['User ID: 12345'])

        result = await Eff.run(
            Eff.try(getUser()).handle({
                UserNotFound: (error) => `Error: ${error}`,
                UserInvalid: (error) => `Invalid user: ${JSON.stringify(error, null, 2)}`,
                AuthToken: 'valid-token',
                UserId: '', // Simulate missing user ID
                Logger: logger,
            }),
        )

        expect(result).toBe(`Invalid user: ${JSON.stringify({ reason: 'Missing user ID' }, null, 2)}`)
        expect(logs).toEqual(['User ID: 12345', 'User ID is missing, throwing UserInvalidErr'])
    })
})

describe('Eff.communicate', () => {
    it('should handle basic message send and receive', () => {
        function* sender() {
            yield* Eff.msg('Greeting').send('Hello, World!')
            return 'sent'
        }

        function* receiver() {
            const message = yield* Eff.msg('Greeting').wait<string>()
            return `received: ${message}`
        }

        const result = Eff.run(
            Eff.communicate({
                sender,
                receiver,
            }),
        )

        expect(result).toEqual({
            sender: 'sent',
            receiver: 'received: Hello, World!',
        })
    })

    it('should handle Eff.send and Eff.recv syntax', () => {
        class DataMsg extends Eff.Msg('Data')<{ id: number; value: string }> {}

        function* producer() {
            yield* Eff.send(new DataMsg({ id: 1, value: 'test data' }))
            return 'produced'
        }

        function* consumer() {
            const data = yield* Eff.wait(DataMsg)
            return `consumed: ${data.id} - ${data.value}`
        }

        const result = Eff.runSync(
            Eff.communicate({
                producer,
                consumer,
            }),
        )

        expect(result).toEqual({
            producer: 'produced',
            consumer: 'consumed: 1 - test data',
        })
    })

    it('should handle multiple messages between generators', () => {
        function* client() {
            yield* Eff.msg('Request').send('get user data')
            const response = yield* Eff.msg('Response').wait<string>()
            return `client: ${response}`
        }

        function* server() {
            const request = yield* Eff.msg('Request').wait<string>()
            yield* Eff.msg('Response').send(`processed: ${request}`)
            return `server: handled ${request}`
        }

        const result = Eff.runSync(
            Eff.communicate({
                client,
                server,
            }),
        )

        expect(result).toEqual({
            client: 'client: processed: get user data',
            server: 'server: handled get user data',
        })
    })

    it('should handle complex message passing scenarios', () => {
        class UserRequest extends Eff.Msg('UserRequest')<{ userId: string }> {}
        class UserResponse extends Eff.Msg('UserResponse')<{ user: { id: string; name: string } }> {}

        function* apiClient() {
            yield* Eff.send(new UserRequest({ userId: '123' }))
            const userResponse = yield* Eff.wait(UserResponse)
            yield* Eff.msg('Log').send(`Retrieved user: ${userResponse.user.name}`)
            return `API client: ${userResponse.user.name}`
        }

        function* apiServer() {
            const request = yield* Eff.wait(UserRequest)
            yield* Eff.msg('Log').send(`Processing request for user: ${request.userId}`)
            yield* Eff.send(new UserResponse({ user: { id: request.userId, name: 'John Doe' } }))
            return `API server: processed ${request.userId}`
        }

        function* logger() {
            const log1 = yield* Eff.msg('Log').wait<string>()
            const log2 = yield* Eff.msg('Log').wait<string>()
            return `Logger: ${log1}, ${log2}`
        }

        const result = Eff.runSync(
            Eff.communicate({
                apiClient,
                apiServer,
                logger,
            }),
        )

        expect(result).toEqual({
            apiClient: 'API client: John Doe',
            apiServer: 'API server: processed 123',
            logger: 'Logger: Processing request for user: 123, Retrieved user: John Doe',
        })
    })

    it('should handle mixed message passing syntax', () => {
        class StatusMsg extends Eff.Msg('Status')<{ status: string; timestamp: number }> {}

        function* worker1() {
            yield* Eff.msg('Status').send({ status: 'working', timestamp: Date.now() })
            const status = yield* Eff.wait(StatusMsg)
            return `worker1: saw ${status.status}`
        }

        function* worker2() {
            const status = yield* Eff.msg('Status').wait<{ status: string; timestamp: number }>()
            yield* Eff.send(new StatusMsg({ status: 'done', timestamp: Date.now() }))
            return `worker2: processed ${status.status}`
        }

        const result = Eff.runSync(
            Eff.communicate({
                worker1,
                worker2,
            }),
        )

        expect(result.worker1).toMatch(/worker1: saw done/)
        expect(result.worker2).toMatch(/worker2: processed working/)
    })

    it('should handle async message passing', async () => {
        function* asyncProducer() {
            const data = yield* Eff.await(Promise.resolve('async data'))
            yield* Eff.msg('AsyncData').send(data)
            return 'async produced'
        }

        function* asyncConsumer() {
            const data = yield* Eff.msg('AsyncData').wait<string>()
            const processed = yield* Eff.await(Promise.resolve(`processed: ${data}`))
            return processed
        }

        const result = await Eff.runAsync(
            Eff.communicate({
                asyncProducer,
                asyncConsumer,
            }),
        )

        expect(result).toEqual({
            asyncProducer: 'async produced',
            asyncConsumer: 'processed: async data',
        })
    })

    it('should throw error for unmatched messages', () => {
        function* sender() {
            yield* Eff.msg('Test').send('message')
            return 'sent'
        }

        function* receiver() {
            return 'received'
        }

        expect(() =>
            Eff.runSync(
                Eff.communicate({
                    sender,
                    receiver,
                }),
            ),
        ).toThrow(/Message 'Test' sent by 'sender' was not received/)
    })

    it('should throw error for unsent messages', () => {
        function* sender() {
            return 'sent'
        }

        function* receiver() {
            yield* Eff.msg('Test').wait<string>()
            return 'received'
        }

        expect(() =>
            Eff.runSync(
                Eff.communicate({
                    sender,
                    receiver,
                }),
            ),
        ).toThrow(/Message 'Test' waited by 'receiver' was not sent/)
    })

    it('should throw specific error messages for unmatched send/wait pairs', () => {
        function* sender1() {
            yield* Eff.msg('Test1').send('message1')
            return 'sent1'
        }

        function* sender2() {
            yield* Eff.msg('Test2').send('message2')
            return 'sent2'
        }

        function* receiver() {
            const msg1 = yield* Eff.msg('Test1').wait<string>()
            // Missing wait for Test2
            return `received: ${msg1}`
        }

        expect(() =>
            Eff.runSync(
                Eff.communicate({
                    sender1,
                    sender2,
                    receiver,
                }),
            ),
        ).toThrow(/Message 'Test2' sent by 'sender2' was not received/)
    })

    it('should handle multiple unmatched messages correctly', () => {
        function* sender() {
            yield* Eff.msg('Test1').send('message1')
            yield* Eff.msg('Test2').send('message2')
            return 'sent'
        }

        function* receiver() {
            // Only waiting for one message, leaving the other unmatched
            const msg = yield* Eff.msg('Test1').wait<string>()
            return `received: ${msg}`
        }

        expect(() =>
            Eff.runSync(
                Eff.communicate({
                    sender,
                    receiver,
                }),
            ),
        ).toThrow(/Message 'Test2' sent by 'sender' was not received/)
    })

    it('should handle generator inputs', () => {
        const sender = function* () {
            yield* Eff.msg('Greeting').send('Hello')
            return 'sent'
        }

        const receiver = function* () {
            const msg = yield* Eff.msg('Greeting').wait<string>()
            return `received: ${msg}`
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender: sender(),
                receiver: receiver(),
            }),
        )

        expect(result).toEqual({
            sender: 'sent',
            receiver: 'received: Hello',
        })
    })

    it('should handle mixed function and generator inputs', () => {
        function* producer() {
            yield* Eff.msg('Data').send({ value: 100 })
            return 'produced'
        }

        const consumer = function* () {
            const data = yield* Eff.msg('Data').wait<{ value: number }>()
            return `consumed: ${data.value}`
        }

        const result = Eff.runSync(
            Eff.communicate({
                producer: producer(),
                consumer,
            }),
        )

        expect(result).toEqual({
            producer: 'produced',
            consumer: 'consumed: 100',
        })
    })

    it('should handle complex nested message passing', () => {
        class CommandMsg extends Eff.Msg('Command')<{ cmd: string; args: string[] }> {}
        class ResultMsg extends Eff.Msg('Result')<{ success: boolean; data: any }> {}

        function* commandProcessor() {
            const command = yield* Eff.wait(CommandMsg)
            yield* Eff.msg('Log').send(`Processing command: ${command.cmd}`)

            if (command.cmd === 'calculate') {
                const result = command.args.reduce((sum, arg) => sum + parseInt(arg, 10), 0)
                yield* Eff.send(new ResultMsg({ success: true, data: result }))
            } else {
                yield* Eff.send(new ResultMsg({ success: false, data: 'Unknown command' }))
            }

            return `processed: ${command.cmd}`
        }

        function* commandClient() {
            yield* Eff.send(new CommandMsg({ cmd: 'calculate', args: ['1', '2', '3'] }))
            const result = yield* Eff.wait(ResultMsg)
            yield* Eff.msg('Log').send(`Command result: ${result.success ? result.data : result.data}`)
            return `client: ${result.data}`
        }

        function* logger() {
            const log1 = yield* Eff.msg('Log').wait<string>()
            const log2 = yield* Eff.msg('Log').wait<string>()
            return `Logger: ${log1} | ${log2}`
        }

        const result = Eff.runSync(
            Eff.communicate({
                commandProcessor,
                commandClient,
                logger,
            }),
        )

        expect(result).toEqual({
            commandProcessor: 'processed: calculate',
            commandClient: 'client: 6',
            logger: 'Logger: Processing command: calculate | Command result: 6',
        })
    })

    it('should handle message passing with context', () => {
        class UserCtx extends Eff.Ctx('User')<{ id: string; name: string }> {}

        function* configProvider() {
            yield* Eff.msg('Config').send({ apiKey: 'secret-key' })
            return 'config provided'
        }

        function* service() {
            const config = yield* Eff.msg('Config').wait<{ apiKey: string }>()
            const user = yield* Eff.get(UserCtx)
            return `service: ${user.name} with key ${config.apiKey.slice(0, 5)}...`
        }

        const program = Eff.try(
            Eff.communicate({
                configProvider,
                service,
            }),
        ).handle({
            User: { id: '1', name: 'Alice' },
        })

        const result = Eff.runSync(program)

        expect(result).toEqual({
            configProvider: 'config provided',
            service: expect.stringContaining('Alice'),
        })
    })

    it('should handle message passing with error handling', () => {
        class ValidationError extends Eff.Err('ValidationError')<string> {}

        class RequestMsg extends Eff.Msg('Request')<{ id: string }> {}
        class ResponseMsg extends Eff.Msg('Response')<{ success: boolean; data?: any; error?: string }> {}

        function* validator() {
            const request = yield* Eff.wait(RequestMsg)

            if (!request.id || request.id.length < 3) {
                yield* Eff.send(
                    new ResponseMsg({
                        success: false,
                        error: 'Invalid ID',
                    }),
                )
                yield* Eff.throw(new ValidationError('ID validation failed'))
                return 'validation failed'
            }

            yield* Eff.send(
                new ResponseMsg({
                    success: true,
                    data: { id: request.id, status: 'valid' },
                }),
            )
            return 'validation passed'
        }

        function* client() {
            yield* Eff.msg('Request').send({ id: 'ab' })
            const response = yield* Eff.wait(ResponseMsg)
            return `client: ${response.success ? response.data?.status : response.error}`
        }

        const program = Eff.try(
            Eff.communicate({
                validator,
                client,
            }),
        ).handle({
            ValidationError: (error) => `Handled: ${error}`,
        })

        const result = Eff.runSync(program)

        expect(result).toEqual('Handled: ID validation failed')
    })

    it('should allow generators to catch send/wait errors with try-catch', () => {
        function* sender() {
            try {
                yield* Eff.msg('Test').send('message')
                return 'sent successfully'
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not received')) {
                    return 'caught send error: message not received'
                }
                throw error
            }
        }

        function* receiver() {
            return 'received without waiting'
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender,
                receiver,
            }),
        )

        expect(result).toEqual({
            sender: 'caught send error: message not received',
            receiver: 'received without waiting',
        })
    })

    it('should allow generators to catch wait errors with try-catch', () => {
        function* sender() {
            return 'sent nothing'
        }

        function* receiver() {
            try {
                const message = yield* Eff.msg('Test').wait<string>()
                return `received: ${message}`
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not sent')) {
                    return 'caught wait error: message not sent'
                }
                throw error
            }
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender,
                receiver,
            }),
        )

        expect(result).toEqual({
            sender: 'sent nothing',
            receiver: 'caught wait error: message not sent',
        })
    })

    it('should handle multiple generators with error catching', () => {
        function* sender1() {
            try {
                yield* Eff.msg('Test1').send('message1')
                return 'sent1 successfully'
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not received')) {
                    return 'sender1 caught error'
                }
                throw error
            }
        }

        function* sender2() {
            try {
                yield* Eff.msg('Test2').send('message2')
                return 'sent2 successfully'
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not received')) {
                    return 'sender2 caught error'
                }
                throw error
            }
        }

        function* receiver() {
            try {
                const msg1 = yield* Eff.msg('Test1').wait<string>()
                return `received: ${msg1}`
            } catch (error) {
                if (error instanceof Error && error.message.includes('was not sent')) {
                    return 'receiver caught error'
                }
                throw error
            }
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender1,
                sender2,
                receiver,
            }),
        )

        expect(result).toEqual({
            sender1: 'sent1 successfully',
            sender2: 'sender2 caught error',
            receiver: 'received: message1',
        })
    })

    it('should continue processing after gen.throw and clear queue', () => {
        let processedCount = 0

        function* sender() {
            try {
                yield* Eff.msg('Test').send('message')
                processedCount++
                return 'sent'
            } catch (error) {
                processedCount++
                return 'caught send error'
            }
        }

        function* receiver() {
            try {
                const message = yield* Eff.msg('Test').wait<string>()
                processedCount++
                return `received: ${message}`
            } catch (error) {
                processedCount++
                return 'caught wait error'
            }
        }

        function* extraGenerator() {
            processedCount++
            return 'extra processed'
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender,
                receiver,
                extraGenerator,
            }),
        )

        // All generators should be processed, even after errors
        expect(processedCount).toBe(3)
        expect(result).toHaveProperty('sender')
        expect(result).toHaveProperty('receiver')
        expect(result).toHaveProperty('extraGenerator')
    })

    it('should allow continuing send/wait after catching errors', () => {
        function* sender() {
            try {
                yield* Eff.msg('Test1').send('message1')
                return 'sent1 successfully'
            } catch (error) {
                // Continue sending other messages after catching error
                yield* Eff.msg('Test2').send('message2')
                return 'sent2 after error'
            }
        }

        function* receiver() {
            try {
                const msg1 = yield* Eff.msg('Test1').wait<string>()
                return `received1: ${msg1}`
            } catch (error) {
                // Continue waiting for other messages after catching error
                const msg2 = yield* Eff.msg('Test2').wait<string>()
                return `received2: ${msg2}`
            }
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender,
                receiver,
            }),
        )

        // Since messages match successfully, no error is thrown
        expect(result).toEqual({
            sender: 'sent1 successfully',
            receiver: 'received1: message1',
        })
    })

    it('should handle multiple send/wait operations after error recovery', () => {
        function* sender() {
            try {
                yield* Eff.msg('Test1').send('message1')
                yield* Eff.msg('Test2').send('message2')
                return 'sent both successfully'
            } catch (error) {
                // Send multiple messages after catching error
                yield* Eff.msg('Test3').send('message3')
                yield* Eff.msg('Test4').send('message4')
                yield* Eff.msg('Test5').send('message5')
                return 'sent three after error'
            }
        }

        function* receiver() {
            const messages = []
            try {
                const msg1 = yield* Eff.msg('Test1').wait<string>()
                messages.push(msg1)
                const msg2 = yield* Eff.msg('Test2').wait<string>()
                messages.push(msg2)
                return `received: ${messages.join(', ')}`
            } catch (error) {
                // Wait for multiple messages after catching error
                const msg3 = yield* Eff.msg('Test3').wait<string>()
                messages.push(msg3)
                const msg4 = yield* Eff.msg('Test4').wait<string>()
                messages.push(msg4)
                const msg5 = yield* Eff.msg('Test5').wait<string>()
                messages.push(msg5)
                return `received after error: ${messages.join(', ')}`
            }
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender,
                receiver,
            }),
        )

        // Since messages match successfully, no error is thrown
        expect(result).toEqual({
            sender: 'sent both successfully',
            receiver: 'received: message1, message2',
        })
    })

    it('should implement log collection with try-finally', () => {
        function* logger() {
            const logs = []
            try {
                // Continuously wait for log messages without matching count
                while (true) {
                    const log = yield* Eff.msg('Log').wait<string>()
                    logs.push(log)
                }
            } finally {
                // eslint-disable-next-line no-unsafe-finally
                return `Collected logs: ${logs.join(' | ')}`
            }
        }

        function* producer1() {
            yield* Eff.msg('Log').send('Producer1: Started')
            yield* Eff.msg('Log').send('Producer1: Processing')
            yield* Eff.msg('Log').send('Producer1: Completed')
            return 'producer1 done'
        }

        function* producer2() {
            yield* Eff.msg('Log').send('Producer2: Started')
            yield* Eff.msg('Log').send('Producer2: Error occurred')
            return 'producer2 done'
        }

        const result = Eff.runSync(
            Eff.communicate({
                logger,
                producer1,
                producer2,
            }),
        )

        expect(result.logger).toBe(
            'Collected logs: Producer1: Started | Producer1: Processing | Producer1: Completed | Producer2: Started | Producer2: Error occurred',
        )
        expect(result.producer1).toBe('producer1 done')
        expect(result.producer2).toBe('producer2 done')
    })

    it('should handle mixed error recovery and log collection', () => {
        function* logger() {
            const logs = []
            try {
                while (true) {
                    const log = yield* Eff.msg('Log').wait<string>()
                    logs.push(log)
                }
            } finally {
                // eslint-disable-next-line no-unsafe-finally
                return `Logs: ${logs.join(' | ')}`
            }
        }

        function* sender() {
            try {
                yield* Eff.msg('Test').send('message')
                yield* Eff.msg('Log').send('Sender: Message sent successfully')
                return 'sent successfully'
            } catch (error) {
                // Continue sending logs after catching error
                yield* Eff.msg('Log').send('Sender: Message failed, but continuing')
                yield* Eff.msg('Log').send('Sender: Recovery completed')
                return 'sent after error'
            }
        }

        function* receiver() {
            try {
                const message = yield* Eff.msg('Test').wait<string>()
                yield* Eff.msg('Log').send('Receiver: Message received')
                return `received: ${message}`
            } catch (error) {
                yield* Eff.msg('Log').send('Receiver: Message not received, but continuing')
                return 'received nothing'
            }
        }

        const result = Eff.runSync(
            Eff.communicate({
                logger,
                sender,
                receiver,
            }),
        )

        // Since messages match successfully, no error is thrown
        expect(result.logger).toContain('Sender: Message sent successfully')
        expect(result.logger).toContain('Receiver: Message received')
        expect(result.sender).toBe('sent successfully')
        expect(result.receiver).toBe('received: message')
    })

    it('should demonstrate error recovery with unmatched messages', () => {
        function* sender1() {
            try {
                yield* Eff.msg('Test1').send('message1')
                return 'sent1 successfully'
            } catch (error) {
                // Send other messages after catching error
                yield* Eff.msg('Test2').send('message2')
                return 'sent2 after error'
            }
        }

        function* sender2() {
            try {
                yield* Eff.msg('Test3').send('message3')
                return 'sent3 successfully'
            } catch (error) {
                return 'sent3 failed'
            }
        }

        function* receiver() {
            try {
                const msg2 = yield* Eff.msg('Test2').wait<string>()
                const msg3 = yield* Eff.msg('Test3').wait<string>()
                return `received: ${msg2}, ${msg3}`
            } catch (error) {
                return 'receiver caught error'
            }
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender1,
                sender2,
                receiver,
            }),
        )

        // sender1 will successfully send Test1, then catch Test3's error, then send Test2
        expect(result.sender1).toBe('sent2 after error')
        expect(result.sender2).toBe('sent3 successfully')
        expect(result.receiver).toBe('received: message2, message3')
    })
})
