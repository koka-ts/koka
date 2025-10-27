import * as Koka from '../src/koka.ts'
import * as Result from '../src/result.ts'
import * as Err from '../src/err.ts'
import * as Ctx from '../src/ctx.ts'
import * as Opt from '../src/opt.ts'
import * as Async from '../src/async.ts'

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

    it('should run finally for sync effects', () => {
        const actions: string[] = []

        const program = Koka.try(function* () {
            return 'ok'
        }).finally(function* () {
            actions.push('sync cleanup')
            return
        })

        const result = Koka.runSync(program)
        expect(result).toBe('ok')
        expect(actions).toEqual(['sync cleanup'])
    })
})

describe('Finally behavior', () => {
    it('should execute finally block on normal completion', async () => {
        const finalActions: string[] = []

        function* program() {
            return yield* Koka.try(function* () {
                return 42
            }).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe(42)
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally block when error is thrown', async () => {
        const finalActions: string[] = []
        class TestError extends Err.Err('TestError')<string> {}

        function* program() {
            return yield* Koka.try(function* () {
                yield* Err.throw(new TestError('boom'))
                return 42
            }).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Koka.runAsync(
            Koka.try(program()).handle({
                TestError: (error: string) => `Caught: ${error}`,
            }),
        )
        expect(result).toBe('Caught: boom')
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally blocks when native exceptions are thrown', async () => {
        const finalActions: string[] = []

        function* program() {
            yield* Koka.try(function* () {
                throw new Error('native error')
            }).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = Koka.runAsync(program())
        await expect(result).rejects.toThrow('native error')
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute nested finally blocks in reverse order', async () => {
        const finalActions: string[] = []

        function* inner() {
            return yield* Koka.try(function* () {
                return 'inner'
            }).finally(function* () {
                finalActions.push('inner cleanup')
            })
        }

        function* outer() {
            return yield* Koka.try(function* () {
                return yield* inner()
            }).finally(function* () {
                finalActions.push('outer cleanup')
            })
        }

        const result = await Koka.runAsync(outer())
        expect(result).toBe('inner')
        expect(finalActions).toEqual(['inner cleanup', 'outer cleanup'])
    })

    it('should execute nested finally blocks on abort in reverse order', async () => {
        const finalActions: string[] = []

        function* inner() {
            return yield* Koka.try(function* () {
                // never resolves
                yield* Async.await(new Promise(() => {}))
            }).finally(function* () {
                finalActions.push('inner cleanup')
            })
        }

        function* outer() {
            return yield* Koka.try(function* () {
                return yield* inner()
            }).finally(function* () {
                finalActions.push('outer cleanup')
            })
        }

        const controller = new AbortController()
        const promise = Koka.runAsync(outer(), { abortSignal: controller.signal })
        controller.abort()

        await expect(promise).rejects.toThrow('Operation aborted')
        expect(finalActions).toEqual(['inner cleanup', 'outer cleanup'])
    })

    it('should execute finally when aborted', async () => {
        const finalActions: string[] = []
        const controller = new AbortController()

        function* program() {
            return yield* Koka.try(function* () {
                yield* Async.await(new Promise(() => {})) // Never resolves
                return undefined
            }).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const promise = Koka.runAsync(program(), { abortSignal: controller.signal })
        controller.abort()

        await expect(promise).rejects.toThrow('Operation aborted')
        expect(finalActions).toEqual(['cleanup'])
    })

    it('should execute finally with async operations', async () => {
        const finalActions: string[] = []

        function* program() {
            return yield* Koka.try(function* () {
                return yield* Async.await(Promise.resolve(42))
            }).finally(function* () {
                yield* Async.await(Promise.resolve())
                finalActions.push('async cleanup')
            })
        }

        const result = await Koka.runAsync(program())
        expect(result).toBe(42)
        expect(finalActions).toEqual(['async cleanup'])
    })

    it('should execute async finally block on abort', async () => {
        const finalActions: string[] = []

        function* program() {
            return yield* Koka.try(function* () {
                // never resolves so we can abort
                yield* Async.await(new Promise(() => {}))
            }).finally(function* () {
                yield* Async.await(Promise.resolve())
                finalActions.push('async cleanup')
            })
        }

        const controller = new AbortController()
        const promise = Koka.runAsync(program(), { abortSignal: controller.signal })
        controller.abort()

        await expect(promise).rejects.toThrow('Operation aborted')
        expect(finalActions).toEqual(['async cleanup'])
    })

    it('should handle errors in finally block', async () => {
        const actions: string[] = []
        class CleanupError extends Err.Err('CleanupError')<string> {}

        function* inner() {
            return yield* Koka.try(function* () {
                actions.push('main')
                return 'done'
            }).finally(function* () {
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

    it('should handle errors in finally block when aborted', async () => {
        const actions: string[] = []
        class CleanupError extends Err.Err('CleanupError')<string> {}

        function* inner() {
            return yield* Koka.try(function* () {
                actions.push('main')
                // never resolves so we can abort
                yield* Async.await(new Promise(() => {}))
                return 'done'
            }).finally(function* () {
                actions.push('cleanup-start')
                yield* Err.throw(new CleanupError('cleanup failed'))
                actions.push('cleanup-end') // Should not reach here
            })
        }

        const controller = new AbortController()
        const promise = Koka.runAsync(
            Koka.try(inner()).handle({
                CleanupError: (msg: string) => {
                    actions.push(`caught: ${msg}`)
                    return 'handled'
                },
            }),
            { abortSignal: controller.signal },
        )

        controller.abort()

        await expect(promise).rejects.toThrow('Operation aborted')
        expect(actions).toEqual(['main', 'cleanup-start', 'caught: cleanup failed'])
    })

    it('should handle options in finally block', async () => {
        const actions: string[] = []
        class CleanupOpt extends Opt.Opt('CleanupOpt')<string> {}

        function* program() {
            return yield* Koka.try(function* () {
                actions.push('main')
                return 'done'
            }).finally(function* () {
                const cleanupMode = yield* Opt.get(CleanupOpt)
                actions.push(`cleanup: ${cleanupMode ?? 'default'}`)
            })
        }

        const result = await Koka.runAsync(
            Koka.try(program).handle({
                [CleanupOpt.field]: 'custom-cleanup',
            }),
        )
        expect(result).toBe('done')
        expect(actions).toEqual(['main', 'cleanup: custom-cleanup'])

        const result2 = await Koka.runAsync(Koka.try(program).handle({}))
        expect(result2).toBe('done')
        expect(actions).toEqual(['main', 'cleanup: custom-cleanup', 'main', 'cleanup: default'])
    })

    it('should handle options in finally block when aborted', async () => {
        const actions: string[] = []
        class CleanupOpt extends Opt.Opt('CleanupOpt')<string> {}

        function* program() {
            return yield* Koka.try(function* () {
                actions.push('main')
                // never resolves
                yield* Async.await(new Promise(() => {}))
                return 'done'
            }).finally(function* () {
                const cleanupMode = yield* Opt.get(CleanupOpt)
                actions.push(`cleanup: ${cleanupMode ?? 'default'}`)
            })
        }

        const controller = new AbortController()
        const promise = Koka.runAsync(
            Koka.try(program).handle({
                [CleanupOpt.field]: 'custom-cleanup',
            }),
            { abortSignal: controller.signal },
        )

        controller.abort()

        await expect(promise).rejects.toThrow('Operation aborted')
        expect(actions).toEqual(['main', 'cleanup: custom-cleanup'])
    })

    it('should handle mixed effects in finally block', async () => {
        const actions: string[] = []
        class LogCtx extends Ctx.Ctx('LogCtx')<(msg: string) => void> {}
        class CleanupError extends Err.Err('CleanupError')<string> {}
        class CleanupOpt extends Opt.Opt('CleanupOpt')<string> {}

        function* program() {
            return yield* Koka.try(function* () {
                const log = yield* Ctx.get(LogCtx)
                log('main')
                return 'done'
            }).finally(function* () {
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
                [LogCtx.field]: (msg: string) => actions.push(msg),
                [CleanupOpt.field]: 'thorough',
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
                [LogCtx.field]: (msg: string) => actions.push(msg),
                [CleanupOpt.field]: 'light',
                CleanupError: (err: string) => {
                    actions.push(`error: ${err}`)
                    return 'handled'
                },
            }),
        )
        expect(result2).toBe('done')
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

describe('runAsync abort signal edge cases', () => {
    it('should handle already aborted signal', async () => {
        const controller = new AbortController()
        controller.abort()

        function* test() {
            yield* Async.await(Promise.resolve(42))
            return 'should not reach here'
        }

        await expect(Koka.runAsync(test(), { abortSignal: controller.signal })).rejects.toThrow(
            '[Koka.runAsync]Operation aborted',
        )
    })

    it('should handle multiple abort calls', async () => {
        const controller = new AbortController()

        function* test() {
            yield* Async.await(new Promise(() => {})) // never resolves
            return 'should not reach here'
        }

        const promise = Koka.runAsync(test(), { abortSignal: controller.signal })

        // Multiple abort calls should not cause issues
        controller.abort()
        controller.abort()
        controller.abort()

        await expect(promise).rejects.toThrow('[Koka.runAsync]Operation aborted')
    })

    it('should handle invalid abort signal', async () => {
        function* test() {
            yield* Async.await(Promise.resolve(42))
            return 'success'
        }

        // Test with undefined abortSignal
        const result = await Koka.runAsync(test(), { abortSignal: undefined })
        expect(result).toBe('success')

        // Test with null abortSignal (should be handled gracefully)
        const result2 = await Koka.runAsync(test(), { abortSignal: null as any })
        expect(result2).toBe('success')
    })

    it('should handle mixed effects with abort', async () => {
        class TestCtx extends Ctx.Ctx('TestCtx')<string> {}
        class TestOpt extends Opt.Opt('TestOpt')<string> {}

        function* test() {
            const ctx = yield* Ctx.get(TestCtx)
            const opt = yield* Opt.get(TestOpt)
            yield* Async.await(new Promise(() => {})) // never resolves
            return `${ctx}-${opt}`
        }

        const controller = new AbortController()
        const promise = Koka.runAsync(
            Koka.try(test()).handle({
                TestCtx: 'context',
                TestOpt: 'option',
            }),
            { abortSignal: controller.signal },
        )

        controller.abort()
        await expect(promise).rejects.toThrow('[Koka.runAsync]Operation aborted')
    })
})

describe('runSync edge cases', () => {
    it('should throw for unexpected effects in runSync', () => {
        function* testWithErr() {
            yield { type: 'err', name: 'TestError', error: 'test' } as any
            return 'should not reach here'
        }

        expect(() => Koka.runSync(testWithErr())).toThrow('[Koka.runSync]Unexpected effect')
    })

    it('should throw for Async effects in runSync', () => {
        function* testWithAsync() {
            yield { type: 'async', promise: Promise.resolve(42) } as any
            return 'should not reach here'
        }

        expect(() => Koka.runSync(testWithAsync())).toThrow('[Koka.runSync]Unexpected effect')
    })

    it('should handle Ctx effects in runSync', () => {
        class TestCtx extends Ctx.Ctx('TestCtx')<string> {}

        function* testWithCtx() {
            const ctx = yield* Ctx.get(TestCtx)
            return ctx
        }

        const result = Koka.runSync(
            Koka.try(testWithCtx()).handle({
                TestCtx: 'test value',
            }),
        )
        expect(result).toBe('test value')
    })
})

describe('Type extraction utilities', () => {
    it('should extract effects from tuple', () => {
        class TestErr extends Err.Err('TestErr')<string> {}
        class TestCtx extends Ctx.Ctx('TestCtx')<number> {}

        function* effect1(): Generator<TestErr, string> {
            yield* Err.throw(new TestErr('error'))
            return 'result1'
        }

        function* effect2(): Generator<TestCtx, number> {
            const ctx = yield* Ctx.get(TestCtx)
            return ctx
        }

        // Test ExtractEff type
        type ExtractedEff = Koka.ExtractEff<[typeof effect1, typeof effect2]>
        const _testEff: ExtractedEff = {} as TestErr | TestCtx

        // Test ExtractReturn type
        type ExtractedReturn = Koka.ExtractReturn<[typeof effect1, typeof effect2]>
        const _testReturn: ExtractedReturn = ['result1', 42] as const

        expect(true).toBe(true) // Type test passes if compilation succeeds
    })

    it('should extract effects from object', () => {
        class TestErr extends Err.Err('TestErr')<string> {}
        class TestCtx extends Ctx.Ctx('TestCtx')<number> {}

        function* effect1(): Generator<TestErr, string> {
            yield* Err.throw(new TestErr('error'))
            return 'result1'
        }

        function* effect2(): Generator<TestCtx, number> {
            const ctx = yield* Ctx.get(TestCtx)
            return ctx
        }

        const effects = {
            errorEffect: effect1,
            contextEffect: effect2,
            plainValue: 'test',
        }

        // Test ExtractEff type
        type ExtractedEff = Koka.ExtractEff<typeof effects>
        const _testEff: ExtractedEff = {} as TestErr | TestCtx

        // Test ExtractReturn type
        type ExtractedReturn = Koka.ExtractReturn<typeof effects>
        const _testReturn: ExtractedReturn = {
            errorEffect: 'result1',
            contextEffect: 42,
            plainValue: 'test',
        }

        expect(true).toBe(true) // Type test passes if compilation succeeds
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
