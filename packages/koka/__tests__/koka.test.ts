import { Eff, Err, Ctx, Result, isGenerator } from '../src/koka'

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

describe('Eff.try/catch', () => {
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
})

describe('Eff.run', () => {
    it('should handle async effects', async () => {
        function* test() {
            const value = yield* Eff.await(Promise.resolve(42))
            const syncValue = yield* Eff.await(2)
            return value * syncValue
        }

        const result = await Eff.run(test())
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
                ZeroError: (error) => `Handled: ${error}`,
            }),
        )

        expect(result).toBe('Handled: ctx is zero')
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
