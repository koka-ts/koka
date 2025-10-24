import * as Opt from '../src/opt'
import * as Koka from '../src/koka'
import * as Async from '../src/async'

describe('Opt', () => {
    it('should return undefined when no value provided', () => {
        class TestOpt extends Opt.Opt('TestOpt')<number> {}

        function* test() {
            return yield* Opt.get(TestOpt)
        }

        const result = Koka.runSync(test())
        expect(result).toBeUndefined()
    })

    it('should return value when provided', () => {
        class TestOpt extends Opt.Opt('TestOpt')<number> {}

        function* test() {
            const optValue = yield* Opt.get(TestOpt)
            return optValue ?? 42
        }

        const result = Koka.runSync(Koka.try(test()).handle({ TestOpt: 21 }))
        expect(result).toBe(21)
    })

    it('should work with async effects', async () => {
        class TestOpt extends Opt.Opt('TestOpt')<number> {}

        function* test() {
            const optValue = yield* Opt.get(TestOpt)
            const asyncValue = yield* Async.await(Promise.resolve(optValue ?? 42))
            return asyncValue
        }

        const result = await Koka.runAsync(test())
        expect(result).toBe(42)
    })

    it('should handle undefined context value', () => {
        class TestOpt extends Opt.Opt('TestOpt')<number> {}

        function* test() {
            const optValue = yield* Opt.get(TestOpt)
            return optValue ?? 100
        }

        const result = Koka.runSync(Koka.try(test()).handle({ TestOpt: undefined }))
        expect(result).toBe(100)
    })

    it('should handle complex optional types', () => {
        class ConfigOpt extends Opt.Opt('Config')<{ theme: string; language: string }> {}

        function* test() {
            const config = yield* Opt.get(ConfigOpt)
            return config ?? { theme: 'dark', language: 'en' }
        }

        const result = Koka.runSync(
            Koka.try(test()).handle({
                Config: { theme: 'light', language: 'zh' },
            }),
        )
        expect(result).toEqual({ theme: 'light', language: 'zh' })
    })

    it('should handle optional functions', () => {
        class LoggerOpt extends Opt.Opt('Logger')<(message: string) => void> {}

        function* test() {
            const logger = yield* Opt.get(LoggerOpt)
            const message = 'Hello, World!'
            logger?.(message)
            return message
        }

        const logs: string[] = []
        const logger = (message: string) => logs.push(message)

        const result = Koka.runSync(Koka.try(test()).handle({ Logger: logger }))
        expect(result).toBe('Hello, World!')
        expect(logs).toEqual(['Hello, World!'])
    })

    it('should handle multiple optional effects', () => {
        class ThemeOpt extends Opt.Opt('Theme')<string> {}
        class LanguageOpt extends Opt.Opt('Language')<string> {}
        class DebugOpt extends Opt.Opt('Debug')<boolean> {}

        function* test() {
            const theme = yield* Opt.get(ThemeOpt)
            const language = yield* Opt.get(LanguageOpt)
            const debug = yield* Opt.get(DebugOpt)

            return {
                theme: theme ?? 'dark',
                language: language ?? 'en',
                debug: debug ?? false,
            }
        }

        const result = Koka.runSync(
            Koka.try(test()).handle({
                Theme: 'light',
                Debug: true,
            }),
        )

        expect(result).toEqual({
            theme: 'light',
            language: 'en',
            debug: true,
        })
    })
})
