import * as Koka from '../src/koka'
import * as Result from '../src/result'
import * as Err from '../src/err'
import * as Ctx from '../src/ctx'
import * as Opt from '../src/opt'
import * as Async from '../src/async'

describe('Err.throw', () => {
    it('should throw error effect', () => {
        class TestError extends Err.Err('TestError')<string> {}

        function* test() {
            yield* Err.throw(new TestError('error message'))
            return 'should not reach here'
        }

        const result = Result.runSync(test())

        expect(result).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error message',
        })
    })
})

describe('Koka.try', () => {
    it('should throw for unhandled effect types', () => {
        function* test() {
            yield { type: 'unknown' } as any
            return 'should not reach here'
        }

        expect(() => {
            Koka.runSync(Koka.try(test()).handle({}))
        }).toThrow()
    })

    it('should catch error effect', () => {
        class TestError extends Err.Err('TestError')<string> {}

        function* test() {
            yield* Err.throw(new TestError('error'))
            return 'should not reach here'
        }

        const program = Koka.try(test()).handle({
            TestError: (error) => `Caught: ${error}`,
        })

        const result = Koka.runSync(program)
        expect(result).toBe('Caught: error')
    })

    it('should propagate unhandled error', () => {
        class UnhandledError extends Err.Err('UnhandledError')<string> {}

        function* test() {
            yield* Err.throw(new UnhandledError('error'))
            return 'should not reach here'
        }

        const program = Koka.try(test()).handle({})

        const result = Koka.runSync(
            Koka.try(program).handle({
                UnhandledError: (error) => ({ error }),
            }),
        )

        expect(result).toEqual({
            error: 'error',
        })
    })

    it('should handle multiple catches', () => {
        class TestCtx extends Ctx.Ctx('TestCtx')<() => 1> {}
        class FirstError extends Err.Err('FirstError')<string> {}
        class SecondError extends Err.Err('SecondError')<string> {}

        function* test() {
            yield* Ctx.get(TestCtx)
            yield* Err.throw(new FirstError('first error'))
            yield* Err.throw(new SecondError('second error'))
            return 'should not reach here'
        }

        const program = Koka.try(test()).handle({
            FirstError: (error) => `Caught first: ${error}`,
            SecondError: (error) => `Caught second: ${error}`,
            TestCtx: () => 1,
        })

        const result = Koka.runSync(program)
        expect(result).toBe('Caught first: first error')
    })

    it('should handle nested try/catch', () => {
        class InnerError extends Err.Err('InnerError')<string> {}

        function* inner() {
            yield* Err.throw(new InnerError('inner error'))
            return 'should not reach here'
        }

        function* outer() {
            return yield* inner()
        }

        const result = Koka.runSync(
            Koka.try(outer()).handle({
                InnerError: (error) => `Caught inner: ${error}`,
            }),
        )
        expect(result).toBe('Caught inner: inner error')
    })
})

describe('Koka.runAsync', () => {
    it('should handle async effects', async () => {
        function* test() {
            const value = yield* Async.await(Promise.resolve(42))
            const syncValue = yield* Async.await(2)
            return value * syncValue
        }

        const result = await Koka.runAsync(test())
        expect(result).toBe(84)
    })

    it('should handle mixed sync/async effects', async () => {
        function* test() {
            const syncValue = 21
            const asyncValue = yield* Async.await(Promise.resolve(21))
            return syncValue + asyncValue
        }

        const result = await Koka.runAsync(test())
        expect(result).toBe(42)
    })

    it('should handle errors in async effects', async () => {
        function* testThrow() {
            yield* Async.await(Promise.reject(new Error('Async error')))
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

        const result = await Koka.runAsync(test())
        expect(result).toBe('Caught: Async error')
    })

    it('should throw error when received unexpected effect type', () => {
        class TestErr extends Err.Err('TestErr')<string> {}
        class TestCtx extends Ctx.Ctx('TestCtx')<string> {}
        class TestOpt extends Opt.Opt('TestOpt')<string> {}

        function* testErr(): Generator<TestErr, string> {
            yield* Err.throw(new TestErr('error'))
            return 'should not reach here'
        }

        function* testCtx(): Generator<TestCtx, string> {
            const ctx = yield* Ctx.get(TestCtx)
            return ctx
        }

        function* testOpt(): Generator<TestOpt, string> {
            const opt = yield* Opt.get(TestOpt)
            return opt ?? 'default'
        }

        // @ts-expect-error for test
        expect(() => Koka.runSync(testErr())).toThrow(/\w+/)
        // @ts-expect-error for test
        expect(() => Koka.runSync(testCtx())).toThrow(/\w+/)

        expect(Koka.runSync(testOpt())).toBe('default')

        expect(
            Koka.runSync(
                Koka.try(testOpt()).handle({
                    [TestOpt.field]: 'custom value',
                }),
            ),
        ).toBe('custom value')
    })
})

describe('Koka.runSync', () => {
    it('should run sync effects', () => {
        function* test() {
            return 42
        }

        const result = Koka.runSync(test())
        expect(result).toBe(42)
    })

    it('should throw for async effects', () => {
        function* test(): Generator<Async.Async, number> {
            yield* Async.await(Promise.resolve(42))
            return 42
        }

        // @ts-expect-error for test
        expect(() => Koka.runSync(test())).toThrow()
    })
})

describe('Complex scenarios', () => {
    it('should handle successful nested effects', async () => {
        class TestCtx extends Ctx.Ctx('TestCtx')<number> {}

        function* program() {
            const ctxValue = yield* Ctx.get(TestCtx)
            const asyncValue = yield* Async.await(Promise.resolve(ctxValue * 2))
            return asyncValue + 1
        }

        const result = await Koka.runAsync(
            Koka.try(program()).handle({
                TestCtx: 21,
            }),
        )
        expect(result).toBe(43)
    })

    it('should handle error in nested effects', async () => {
        class TestCtx extends Ctx.Ctx('TestCtx')<number> {}
        class ZeroError extends Err.Err('ZeroError')<string> {}

        function* program() {
            const ctxValue = yield* Ctx.get(TestCtx)
            if (ctxValue === 0) {
                yield* Err.throw(new ZeroError('ctx is zero'))
            }
            const asyncValue = yield* Async.await(Promise.resolve(ctxValue * 2))
            return asyncValue + 1
        }

        const result = await Koka.runAsync(
            Koka.try(program()).handle({
                TestCtx: 0,
                ZeroError: (error) => `Handled: ${error}`,
            }),
        )

        expect(result).toBe('Handled: ctx is zero')
    })
})

describe('design first approach', () => {
    // predefined error effects
    class UserNotFound extends Err.Err('UserNotFound')<string> {}
    class UserInvalid extends Err.Err('UserInvalid')<{ reason: string }> {}

    // predefined context effects
    class AuthToken extends Ctx.Ctx('AuthToken')<string> {}
    class UserId extends Ctx.Ctx('UserId')<string> {}

    // predefined option effects
    class LoggerOpt extends Opt.Opt('Logger')<(message: string) => void> {}

    // Helper functions using the defined types
    function* requireUserId() {
        const logger = yield* Opt.get(LoggerOpt)
        const userId = yield* Ctx.get(UserId)

        if (!userId) {
            logger?.('User ID is missing, throwing UserInvalidErr')
            throw yield* Err.throw(new UserInvalid({ reason: 'Missing user ID' }))
        }

        logger?.(`User ID: ${userId}`)

        return userId
    }

    function* getUser() {
        const userId = yield* requireUserId()

        const authToken = yield* Ctx.get(AuthToken)

        if (!authToken) {
            yield* Err.throw(new UserInvalid({ reason: 'Missing auth token' }))
        }

        // Simulate fetching user logic
        const user: { id: string; name: string } | null = yield* Async.await(null)

        if (!user) {
            yield* Err.throw(new UserNotFound(`User with ID ${userId} not found`))
        }

        return user
    }

    it('should support design first approach', async () => {
        const program = Koka.try(getUser()).handle({
            [UserNotFound.field]: (error) => `Error: ${error}`,
            [UserInvalid.field]: (error) => `Invalid user: ${JSON.stringify(error)}`,
            [AuthToken.field]: 'valid-token',
            [UserId.field]: '12345',
        })

        const result = await Koka.runAsync(program)

        expect(result).toBe('Error: User with ID 12345 not found')
    })

    it('should support optional effects', async () => {
        const logs = [] as string[]
        const logger = (message: string) => {
            logs.push(message)
        }

        const program = Koka.try(getUser()).handle({
            UserNotFound: (error) => `Error: ${error}`,
            UserInvalid: (error) => `Invalid user: ${JSON.stringify(error, null, 2)}`,
            AuthToken: 'valid-token',
            UserId: '12345',
            Logger: logger,
        })

        let result = await Koka.runAsync(program)

        expect(result).toBe('Error: User with ID 12345 not found')
        expect(logs).toEqual(['User ID: 12345'])

        result = await Koka.runAsync(
            Koka.try(getUser()).handle({
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
