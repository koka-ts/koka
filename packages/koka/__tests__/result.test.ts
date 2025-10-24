import * as Koka from '../src/koka'
import * as Err from '../src/err'
import * as Result from '../src/result'
import * as Async from '../src/async'
import * as Gen from '../src/gen'

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
