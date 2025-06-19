import { Eff, Err, Ctx, Result, isGenerator, Async } from '../src/koka'

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

        const program0 = Eff.try(test()).catch({
            Num: 2,
        })

        const program1 = Eff.try(program0).catch({
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

        const program = Eff.try(outer()).catch({
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
            Eff.run(Eff.try(test()).catch({}))
        }).toThrow(/Unexpected effect/)
    })

    it('should catch error effect', () => {
        function* test() {
            yield* Eff.err('TestError').throw('error')
            return 'should not reach here'
        }

        const program = Eff.try(test()).catch({
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

        const program = Eff.try(test()).catch({})

        const result = Eff.run(
            Eff.try(program).catch({
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

        const program = Eff.try(test()).catch({
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
            Eff.try(outer()).catch({
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

        // @ts-expect-error
        expect(() => Eff.run(testErr())).toThrow(/\w+/)
        // @ts-expect-error
        expect(() => Eff.run(testCtx())).toThrow(/\w+/)

        expect(Eff.run(testOpt())).toBe('default')

        expect(
            Eff.run(
                Eff.try(testOpt()).catch({
                    TestOpt: 'custom value',
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

        // @ts-expect-error
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
            Eff.try(Eff.result(failure())).catch({
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
            Eff.try(testFailure).catch({
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
            Eff.try(program()).catch({
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
            Eff.try(program()).catch({
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

        const program = Eff.try(test()).catch({
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

        const program = Eff.try(outer()).catch({
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

describe('Eff.all', () => {
    it('should handle sync effects', () => {
        function* effect1() {
            return 1
        }

        function* effect2() {
            return '2'
        }

        function* program() {
            const combined: Generator<never, [number, string]> = Eff.all([effect1(), effect2()])
            const results = yield* combined
            return results[0] + Number(results[1])
        }

        const result = Eff.run(program())
        expect(result).toBe(3)
    })

    it('should handle async effects', async () => {
        function* effect1() {
            return yield* Eff.await(Promise.resolve(1))
        }

        function* effect2() {
            return yield* Eff.await(Promise.resolve('2'))
        }

        function* program() {
            const combined: Generator<Async, [number, string]> = Eff.all([effect1(), effect2()])
            const results = yield* combined

            console.log('results', results)

            return results[0] + Number(results[1])
        }

        const result = await Eff.run(program())
        expect(result).toBe(3)
    })

    it('should handle mixed sync/async effects', async () => {
        function* syncEffect() {
            return 1
        }

        function* asyncEffect() {
            return yield* Eff.await(Promise.resolve(2))
        }

        function* program() {
            const combined: Generator<Async, [number, number]> = Eff.all([syncEffect(), asyncEffect()])
            const results = yield* combined
            return results[0] + results[1]
        }

        const result = await Eff.run(program())
        expect(result).toBe(3)
    })

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
            const combined: Generator<TestErr, [number, number]> = Eff.all([effect1(), effect2()])
            const results = yield* combined
            return results[0] + results[1]
        }

        const result = Eff.run(Eff.result(program()))

        expect(result).toEqual({
            type: 'err',
            name: 'TestErr',
            error: 'error',
        })
    })

    it('should handle multiple async effects and run concurrently', async () => {
        async function delayTime(ms: number): Promise<void> {
            return new Promise((resolve) => setTimeout(resolve, ms))
        }

        function* delayedEffect<T>(value: T, delay: number) {
            if (delay === 0) {
                yield* Eff.err('DelayError').throw('Delay cannot be zero')
            }

            yield* Eff.await(delayTime(delay))

            return value
        }

        function* program() {
            const combined: Generator<Async | Err<'DelayError', string>, [number, string, boolean]> = Eff.all([
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

    it('should handle empty array', () => {
        function* program(): Generator<never, []> {
            const results = yield* Eff.all([])
            return results
        }

        const result = Eff.run(program())
        expect(result).toEqual([])
    })

    it('should handle function effects', () => {
        function* effect1(): Generator<never, number> {
            return 1
        }

        function* effect2(): Generator<never, number> {
            return 2
        }

        function* program(): Generator<never, number> {
            const results = yield* Eff.all([() => effect1(), () => effect2()])
            return results[0] + results[1]
        }

        const result = Eff.run(program())
        expect(result).toBe(3)
    })

    it('should handle async errors with native try-catch', async () => {
        function* effectWithError(): Generator<Async, number> {
            const value = yield* Eff.await(Promise.reject(new Error('Async error')))
            return value
        }

        function* program() {
            try {
                const results = yield* Eff.all([effectWithError(), Eff.await(Promise.resolve(2))])
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
            const results = yield* Eff.all([failingEffect(), Eff.await(Promise.resolve(2))])
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
                const results = yield* Eff.all([effectWithThrow(), Eff.await(Promise.resolve(2))])
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

        const result = Eff.run(Eff.try(test()).catch({ TestOpt: 21 }))
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

        const result = Eff.run(Eff.try(test()).catch({ TestOpt: undefined }))
        expect(result).toBe(100)
    })
})

describe('design first approach', () => {
    // predefined error effects
    class UserNotFoundErr extends Eff.Err('UserNotFound')<string> {}
    class UserInvalidErr extends Eff.Err('UserInvalid')<{ reason: string }> {}

    // predefined context effects
    class AuthTokenCtx extends Eff.Ctx('AuthToken')<string> {}
    class UserIdCtx extends Eff.Ctx('UserId')<string> {}

    // predefined option effects
    class LoggerOpt extends Eff.Opt('Logger')<(message: string) => void> {}

    // Helper functions using the defined types
    function* requireUserId() {
        const logger = yield* Eff.get(LoggerOpt)
        const userId = yield* Eff.get(UserIdCtx)

        if (!userId) {
            logger?.('User ID is missing, throwing UserInvalidErr')
            throw yield* Eff.throw(new UserInvalidErr({ reason: 'Missing user ID' }))
        }

        logger?.(`User ID: ${userId}`)

        return userId
    }

    function* getUser() {
        const userId = yield* requireUserId()

        const authToken = yield* Eff.get(AuthTokenCtx)

        if (!authToken) {
            yield* Eff.throw(new UserInvalidErr({ reason: 'Missing auth token' }))
        }

        // Simulate fetching user logic
        const user: { id: string; name: string } | null = yield* Eff.await(null)

        if (!user) {
            yield* Eff.throw(new UserNotFoundErr(`User with ID ${userId} not found`))
        }

        return user
    }

    it('should support design first approach', async () => {
        const program = Eff.try(getUser()).catch({
            UserNotFound: (error) => `Error: ${error}`,
            UserInvalid: (error) => `Invalid user: ${JSON.stringify(error)}`,
            AuthToken: 'valid-token',
            UserId: '12345',
        })

        const result = await Eff.run(program)

        expect(result).toBe('Error: User with ID 12345 not found')
    })

    it('should support optional effects', async () => {
        const logs = [] as string[]
        const logger = (message: string) => {
            logs.push(message)
        }

        let result = await Eff.run(
            Eff.try(getUser()).catch({
                UserNotFound: (error) => `Error: ${error}`,
                UserInvalid: (error) => `Invalid user: ${JSON.stringify(error, null, 2)}`,
                AuthToken: 'valid-token',
                UserId: '12345',
                Logger: logger,
            }),
        )

        expect(result).toBe('Error: User with ID 12345 not found')
        expect(logs).toEqual(['User ID: 12345'])

        result = await Eff.run(
            Eff.try(getUser()).catch({
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
