import * as Err from '../src/err'
import * as Result from '../src/result'

describe('Err', () => {
    it('should create error effect class', () => {
        class TestErr extends Err.Err('TestErr')<string> {}
        const err = new TestErr('error')

        expect(err.type).toBe('err')
        expect(err.name).toBe('TestErr')
        expect(err.error).toBe('error')
    })

    it('should throw error effect', () => {
        class TestErr extends Err.Err('TestErr')<string> {}

        function* test() {
            yield* Err.throw(new TestErr('error'))
            return 'should not reach here'
        }

        const result = Result.runSync(test())

        expect(result).toEqual(new TestErr('error'))
    })

    it('should propagate error through nested calls', () => {
        const TestErr = Err.Err('TestErr')<string>

        function* inner() {
            yield* Err.throw(new TestErr('inner error'))
            return 'should not reach here'
        }

        function* outer() {
            return yield* inner()
        }

        const result = Result.runSync(outer())
        expect(result).toEqual(new TestErr('inner error'))
    })

    it('should handle complex error types', () => {
        class ComplexError extends Err.Err('ComplexError')<{ code: number; message: string }> {}

        function* test() {
            yield* Err.throw(new ComplexError({ code: 404, message: 'Not found' }))
            return 'should not reach here'
        }

        const result = Result.runSync(test())
        expect(result).toEqual(new ComplexError({ code: 404, message: 'Not found' }))
    })
})
