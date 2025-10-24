import * as Ctx from '../src/ctx'
import * as Koka from '../src/koka'

describe('Ctx', () => {
    it('should create context effect class', () => {
        class TestCtx extends Ctx.Ctx('TestCtx')<number> {}

        const ctx = new TestCtx()
        ctx.context = 42

        expect(ctx.type).toBe('ctx')
        expect(ctx.name).toBe('TestCtx')
        expect(ctx.context).toBe(42)
    })

    it('should get context value', () => {
        class TestCtx extends Ctx.Ctx('TestCtx')<number> {}
        class Num extends Ctx.Ctx('Num')<number> {}

        function* test() {
            const value = yield* Ctx.get(TestCtx)
            const num = yield* Ctx.get(Num)
            return value * num
        }

        const program0 = Koka.try(test()).handle({
            Num: 2,
        })

        const program1 = Koka.try(program0).handle({
            TestCtx: 21,
        })

        const result = Koka.runSync(program1)
        expect(result).toBe(42)
    })

    it('should propagate context when not handled', () => {
        class TestCtx extends Ctx.Ctx('TestCtx')<number> {}

        function* inner() {
            return yield* Ctx.get(TestCtx)
        }

        function* outer() {
            return yield* inner()
        }

        const program = Koka.try(outer()).handle({
            TestCtx: 42,
        })

        const result = Koka.runSync(program)
        expect(result).toBe(42)
    })

    it('should handle complex context types', () => {
        class UserCtx extends Ctx.Ctx('User')<{ id: string; name: string; role: string }> {}

        function* test() {
            const user = yield* Ctx.get(UserCtx)
            return `${user.name} (${user.role})`
        }

        const program = Koka.try(test()).handle({
            User: { id: '1', name: 'Alice', role: 'admin' },
        })

        const result = Koka.runSync(program)
        expect(result).toBe('Alice (admin)')
    })

    it('should handle nested context propagation', () => {
        class ConfigCtx extends Ctx.Ctx('Config')<{ apiUrl: string }> {}
        class AuthCtx extends Ctx.Ctx('Auth')<{ token: string }> {}

        function* service() {
            const config = yield* Ctx.get(ConfigCtx)
            const auth = yield* Ctx.get(AuthCtx)
            return `${config.apiUrl} with token ${auth.token}`
        }

        function* controller() {
            return yield* service()
        }

        const program = Koka.try(controller()).handle({
            Config: { apiUrl: 'https://api.example.com' },
            Auth: { token: 'secret-token' },
        })

        const result = Koka.runSync(program)
        expect(result).toBe('https://api.example.com with token secret-token')
    })
})
