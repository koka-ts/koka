import * as Koka from 'koka'
import * as Opt from 'koka/opt'
import * as Async from 'koka/async'
import * as Ctx from 'koka/ctx'

const actions: string[] = []
class CleanupOpt extends Opt.Opt('CleanupOpt')<string> {}
class CleanupCtx extends Ctx.Ctx('CleanupCtx')<string> {}

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

async function test() {
    try {
        const result = await Koka.try(program)
            .handle({
                [CleanupOpt.field]: 'custom-cleanup',
            })
            .runAsync({ abortSignal: controller.signal })

        console.log(result)
    } finally {
        console.log(actions)
    }
}

test()
controller.abort()
