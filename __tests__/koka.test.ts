import * as Eff from '../src'
import * as Result from '../src/result'

describe('Eff.throw', () => {
    it('should throw error effect', () => {
        class TestError extends Eff.Err('TestError')<string> {}

        function* test() {
            yield* Eff.throw(new TestError('error message'))
            return 'should not reach here'
        }

        const result = Result.run(test())

        expect(result).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error message',
        })
    })
})

describe('Eff.get', () => {
    it('should get context value', () => {
        class TestCtx extends Eff.Ctx('TestCtx')<number> {}
        class Num extends Eff.Ctx('Num')<number> {}

        function* test() {
            const value = yield* Eff.get(TestCtx)
            const num = yield* Eff.get(Num)
            return value * num
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
        class TestCtx extends Eff.Ctx('TestCtx')<number> {}

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

describe('Eff.try', () => {
    it('should throw for unhandled effect types', () => {
        function* test() {
            yield { type: 'unknown' } as any
            return 'should not reach here'
        }

        expect(() => {
            Eff.run(Eff.try(test()).handle({}))
        }).toThrow()
    })

    it('should catch error effect', () => {
        class TestError extends Eff.Err('TestError')<string> {}

        function* test() {
            yield* Eff.throw(new TestError('error'))
            return 'should not reach here'
        }

        const program = Eff.try(test()).handle({
            TestError: (error) => `Caught: ${error}`,
        })

        const result = Eff.run(program)
        expect(result).toBe('Caught: error')
    })

    it('should propagate unhandled error', () => {
        class UnhandledError extends Eff.Err('UnhandledError')<string> {}

        function* test() {
            yield* Eff.throw(new UnhandledError('error'))
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
        class TestCtx extends Eff.Ctx('TestCtx')<() => 1> {}
        class FirstError extends Eff.Err('FirstError')<string> {}
        class SecondError extends Eff.Err('SecondError')<string> {}

        function* test() {
            yield* Eff.get(TestCtx)
            yield* Eff.throw(new FirstError('first error'))
            yield* Eff.throw(new SecondError('second error'))
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
        class InnerError extends Eff.Err('InnerError')<string> {}

        function* inner() {
            yield* Eff.throw(new InnerError('inner error'))
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
        function* test(): Generator<Eff.Async, number> {
            yield* Eff.await(Promise.resolve(42))
            return 42
        }

        // @ts-expect-error for test
        expect(() => Eff.runSync(test())).toThrow(/Expected synchronous effect, but got asynchronous effect/)
    })
})

describe('Result.fromErr', () => {
    it('should convert generator to Result', () => {
        class TestCtx extends Eff.Ctx('TestCtx')<string> {}
        class TestError extends Eff.Err('TestError')<string> {}

        function* success() {
            return 42
        }

        function* failure() {
            const message = yield* Eff.get(TestCtx)
            yield* Eff.throw(new TestError(message))
            return 'should not reach here'
        }

        const successResult = Result.run(success())

        expect(successResult).toEqual({
            type: 'ok',
            value: 42,
        })

        const failureResult = Eff.run(
            Eff.try(Result.wrap(failure())).handle({
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

        const result = Result.run(test())

        expect(result).toEqual({
            type: 'ok',
            value: 'Caught: TestError',
        })
    })
})

describe('Complex scenarios', () => {
    it('should handle successful nested effects', async () => {
        class TestCtx extends Eff.Ctx('TestCtx')<number> {}

        function* program() {
            const ctxValue = yield* Eff.get(TestCtx)
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
        class TestCtx extends Eff.Ctx('TestCtx')<number> {}
        class ZeroError extends Eff.Err('ZeroError')<string> {}

        function* program() {
            const ctxValue = yield* Eff.get(TestCtx)
            if (ctxValue === 0) {
                yield* Eff.throw(new ZeroError('ctx is zero'))
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

        const result = Result.run(test())

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

        const result = Result.run(outer())
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

        expect(Eff.isGenerator(gen())).toBe(true)
        expect(Eff.isGenerator(notGen())).toBe(false)
    })
})

describe('Eff.opt', () => {
    it('should return undefined when no value provided', () => {
        class TestOpt extends Eff.Opt('TestOpt')<number> {}

        function* test() {
            return yield* Eff.get(TestOpt)
        }

        const result = Eff.run(test())
        expect(result).toBeUndefined()
    })

    it('should return value when provided', () => {
        class TestOpt extends Eff.Opt('TestOpt')<number> {}

        function* test() {
            const optValue = yield* Eff.get(TestOpt)
            return optValue ?? 42
        }

        const result = Eff.run(Eff.try(test()).handle({ TestOpt: 21 }))
        expect(result).toBe(21)
    })

    it('should work with async effects', async () => {
        class TestOpt extends Eff.Opt('TestOpt')<number> {}

        function* test() {
            const optValue = yield* Eff.get(TestOpt)
            const asyncValue = yield* Eff.await(Promise.resolve(optValue ?? 42))
            return asyncValue
        }

        const result = await Eff.run(test())
        expect(result).toBe(42)
    })

    it('should handle undefined context value', () => {
        class TestOpt extends Eff.Opt('TestOpt')<number> {}

        function* test() {
            const optValue = yield* Eff.get(TestOpt)
            return optValue ?? 100
        }

        const result = Eff.run(Eff.try(test()).handle({ TestOpt: undefined }))
        expect(result).toBe(100)
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
