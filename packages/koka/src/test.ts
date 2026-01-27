import * as Koka from './koka.ts'
import * as Async from './async.ts'
import * as Task from './task.ts'
import * as Ctx from './ctx.ts'
import * as Err from './err.ts'
import * as Opt from './opt.ts'

async function main() {
    let actions: string[] = []
    class LogCtx extends Ctx.Ctx('LogCtx')<(msg: string) => void> {}
    class CleanupError extends Err.Err('CleanupError')<string> {}
    class CleanupOpt extends Opt.Opt('CleanupOpt')<string> {}

    function* program() {
        return yield* Koka.try(
            Task.all([
                function* () {
                    const log = yield* Ctx.get(LogCtx)
                    log('main1')
                    return 'done1'
                },
                function* () {
                    const log = yield* Ctx.get(LogCtx)
                    log('main2')
                    return 'done2'
                },
            ]),
        ).finally(function* () {
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
            LogCtx: (msg: string) => actions.push(msg),
            CleanupOpt: 'thorough',
            CleanupError: (err: string) => {
                actions.push(`error: ${err}`)
                return 'handled'
            },
        }),
    )

    console.log({
        result,
        actions,
    })

    actions = []
    const result2 = await Koka.runAsync(
        Koka.try(program).handle({
            LogCtx: (msg: string) => actions.push(msg),
            CleanupOpt: 'light',
            CleanupError: (err: string) => {
                actions.push(`error: ${err}`)
                return 'handled'
            },
        }),
    )

    console.log({
        result,
        actions,
        result2,
    })

    debugger
}

main().catch(console.error)
