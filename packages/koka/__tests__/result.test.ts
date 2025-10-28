import * as Koka from '../src/koka'
import * as Err from '../src/err'
import * as Result from '../src/result'
import * as Async from '../src/async'
import * as Gen from '../src/gen'
import * as Ctx from '../src/ctx'
import * as Opt from '../src/opt'

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

    it('should handle complex ok values', () => {
        const complexValue = { id: 1, name: 'test', data: [1, 2, 3] }
        const ok = Result.ok(complexValue)
        expect(ok.type).toBe('ok')
        expect(ok.value).toEqual(complexValue)
    })

    it('should handle complex error values', () => {
        const errorData = { code: 404, message: 'Not found', details: 'Resource not found' }
        const err = Result.err('NotFoundError', errorData)
        expect(err.type).toBe('err')
        expect(err.name).toBe('NotFoundError')
        expect(err.error).toEqual(errorData)
    })
})

describe('Result.unwrap and Result.wrap', () => {
    it('test success', () => {
        function* success() {
            return Result.ok(42)
        }

        function* testSuccess() {
            const value = yield* Result.unwrap(success())
            return value
        }

        const result = Koka.runSync(testSuccess)

        expect(result).toBe(42)
    })

    it('test failure', () => {
        class TestError extends Err.Err('TestError')<string> {}

        function* testFailure() {
            yield* Result.unwrap(Result.wrap(Err.throw(new TestError('error'))))
        }

        const failureResult = Koka.runSync(
            Koka.try(testFailure).handle({
                TestError: (error) => `Caught: ${error}`,
            }),
        )

        expect(failureResult).toBe('Caught: error')
    })
})

describe('run Result', () => {
    it('should run generator and return Result', async () => {
        class ZeroError extends Err.Err('ZeroError')<string> {}

        function* program(input: number) {
            const value = yield* Async.await(Promise.resolve(input))

            if (value === 0) {
                yield* Err.throw(new ZeroError('value is zero'))
            }

            return value
        }

        const result: Promise<Result.Ok<number> | ZeroError> = Result.runAsync(program(42))

        expect(await result).toEqual({
            type: 'ok',
            value: 42,
        })
    })

    it('should handle error in generator', () => {
        class TestError extends Err.Err('TestError')<string> {}

        function* program() {
            yield* Err.throw(new TestError('error message'))
            return 'should not reach here'
        }

        const result: Result.Result<string, TestError> = Result.runSync(program)

        expect(result).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error message',
        })
    })
})

describe('Result.runSync', () => {
    it('should run generator and return Result', () => {
        function* program() {
            return 42
        }

        const result: Result.Ok<number> = Result.runSync(program)
        expect(result).toEqual({
            type: 'ok',
            value: 42,
        })
    })

    it('should throw error if generator is async', () => {
        function* asyncProgram() {
            yield* Async.await(Promise.resolve(42))
        }

        // @ts-expect-error for test
        expect(() => Result.runSync(asyncProgram)).toThrow()
    })

    it('should handle error in generator', () => {
        class TestError extends Err.Err('TestError')<string> {}

        function* program() {
            yield* Err.throw(new TestError('error message'))
        }

        expect(Result.runSync(program)).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error message',
        })
    })
})

describe('Result.runAsync', () => {
    it('should run generator and return Result', async () => {
        function* program() {
            return 42
        }

        const result = await Result.runAsync(program)

        expect(result).toEqual({
            type: 'ok',
            value: 42,
        })
    })

    it('should handle error in generator', async () => {
        class TestError extends Err.Err('TestError')<string> {}

        function* program() {
            yield* Err.throw(new TestError('error message'))
        }

        const result = await Result.runAsync(program)

        expect(result).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error message',
        })
    })

    it('should handle async effect', async () => {
        function* asyncProgram() {
            const value = yield* Async.await(Promise.resolve(42))
            return value * 2
        }

        const result = await Result.runAsync(asyncProgram)

        expect(result).toEqual({
            type: 'ok',
            value: 84,
        })
    })
})

describe('Result.wrap', () => {
    it('should wrap successful generator', () => {
        function* success() {
            return 42
        }

        const result = Koka.runSync(Result.wrap(success()))
        expect(result).toEqual({
            type: 'ok',
            value: 42,
        })
    })

    it('should wrap failing generator', () => {
        class TestError extends Err.Err('TestError')<string> {}

        function* failure() {
            yield* Err.throw(new TestError('error'))
            return 'should not reach here'
        }

        const result = Koka.runSync(Result.wrap(failure()))
        expect(result).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error',
        })
    })

    it('should wrap async generator', async () => {
        function* asyncSuccess() {
            const value = yield* Async.await(Promise.resolve(42))
            return value * 2
        }

        const result = await Koka.runAsync(Result.wrap(asyncSuccess()))
        expect(result).toEqual({
            type: 'ok',
            value: 84,
        })
    })
})

describe('Result.unwrap', () => {
    it('should unwrap ok result', () => {
        function* test() {
            const value = yield* Result.unwrap(Result.wrap(Gen.of(42)))
            return value * 2
        }

        const result = Koka.runSync(test())
        expect(result).toBe(84)
    })

    it('should propagate err result', () => {
        class TestError extends Err.Err('TestError')<string> {}

        function* test() {
            yield* Result.unwrap(Result.wrap(Err.throw(new TestError('error'))))
            return 'should not reach here'
        }

        const result = Result.runSync(test())
        expect(result).toEqual({
            type: 'err',
            name: 'TestError',
            error: 'error',
        })
    })

    it('should handle nested unwrapping', () => {
        function* test() {
            const value1 = yield* Result.unwrap(Result.wrap(Gen.of(10)))
            const value2 = yield* Result.unwrap(Result.wrap(Gen.of(32)))
            return value1 + value2
        }

        const result = Koka.runSync(test())
        expect(result).toBe(42)
    })
})

describe('Result.runSync finally behavior', () => {
    it('should run finally for sync effects', () => {
        const actions: string[] = []

        function* program() {
            return 'ok'
        }

        const wrappedProgram = Koka.try(program).finally(function* () {
            actions.push('sync cleanup')
            return
        })

        const result = Result.runSync(wrappedProgram)
        expect(result).toEqual({
            type: 'ok',
            value: 'ok',
        })
        expect(actions).toEqual(['sync cleanup'])
    })
})

describe('Result.runAsync finally behavior', () => {
    it('should execute finally block on normal completion', async () => {
        const finalActions: string[] = []

        function* program() {
            return yield* Koka.try(function* () {
                return 42
            }).finally(function* () {
                finalActions.push('cleanup')
            })
        }

        const result = await Result.runAsync(program)
        expect(result).toEqual({
            type: 'ok',
            value: 42,
        })
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

        const result = await Result.runAsync(
            Koka.try(program).handle({
                TestError: (error: string) => `Caught: ${error}`,
            }),
        )
        expect(result).toEqual({
            type: 'ok',
            value: 'Caught: boom',
        })
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

        const promise = Result.runAsync(program)

        await expect(promise).rejects.toThrow('native error')

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

        const result = await Result.runAsync(outer)
        expect(result).toEqual({
            type: 'ok',
            value: 'inner',
        })
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
        const promise = Result.runAsync(outer, { abortSignal: controller.signal })
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

        const promise = Result.runAsync(program, { abortSignal: controller.signal })
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

        const result = await Result.runAsync(program)
        expect(result).toEqual({
            type: 'ok',
            value: 42,
        })
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
        const promise = Result.runAsync(program, { abortSignal: controller.signal })
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

        const result = await Result.runAsync(
            Koka.try(inner).handle({
                CleanupError: (msg: string) => {
                    actions.push(`caught: ${msg}`)
                    return 'handled'
                },
            }),
        )
        expect(result).toEqual({
            type: 'ok',
            value: 'handled',
        })
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
        const promise = Result.runAsync(
            Koka.try(inner).handle({
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

        const result = await Result.runAsync(
            Koka.try(program).handle({
                [CleanupOpt.field]: 'custom-cleanup',
            }),
        )
        expect(result).toEqual({
            type: 'ok',
            value: 'done',
        })
        expect(actions).toEqual(['main', 'cleanup: custom-cleanup'])

        const result2 = await Result.runAsync(Koka.try(program).handle({}))
        expect(result2).toEqual({
            type: 'ok',
            value: 'done',
        })
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
        const promise = Result.runAsync(
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

        const result = await Result.runAsync(
            Koka.try(program).handle({
                [LogCtx.field]: (msg: string) => actions.push(msg),
                [CleanupOpt.field]: 'thorough',
                CleanupError: (err: string) => {
                    actions.push(`error: ${err}`)
                    return 'handled'
                },
            }),
        )

        expect(result).toEqual({
            type: 'ok',
            value: 'handled',
        })
        expect(actions).toEqual(['main', 'cleanup-start', 'thorough cleanup', 'error: thorough cleanup failed'])

        const result2 = await Result.runAsync(
            Koka.try(program).handle({
                [LogCtx.field]: (msg: string) => actions.push(msg),
                [CleanupOpt.field]: 'light',
                CleanupError: (err: string) => {
                    actions.push(`error: ${err}`)
                    return 'handled'
                },
            }),
        )
        expect(result2).toEqual({
            type: 'ok',
            value: 'done',
        })
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
