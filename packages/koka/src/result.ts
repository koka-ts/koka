import type * as Async from './async.ts'
import type * as Err from './err.ts'
import type * as Opt from './opt.ts'
import * as Koka from './koka.ts'

export type Ok<T> = {
    type: 'ok'
    value: T
}

export type AnyOk = Ok<any>

export type Result<T, E> = Ok<T> | (E extends Err.AnyErr ? E : never)

export type AnyResult = Result<any, Err.AnyErr>

export const ok = <T>(value: T): Ok<T> => {
    return {
        type: 'ok',
        value,
    }
}

export const err = <Name extends string, T>(name: Name, error: T): Err.Err<Name, T> => {
    return {
        type: 'err',
        name,
        error,
    }
}

export type InferOkValue<T> = T extends Ok<infer U> ? U : never

export function* wrap<Return, Yield extends Koka.AnyEff = never>(
    effector: Koka.Effector<Yield, Return>,
): Generator<Err.ExcludeErr<Yield> | Koka.Final, Ok<Return> | Err.ExtractErr<Yield>> {
    const gen = Koka.runEffector(effector)
    let status: 'running' | 'returned' | 'thrown' = 'running'
    try {
        let result = gen.next()

        while (!result.done) {
            const effect = result.value

            if (effect.type === 'err') {
                status = 'thrown'
                return effect as Err.ExtractErr<Yield>
            } else {
                result = gen.next(yield effect as any)
            }
        }

        status = 'returned'
        return {
            type: 'ok',
            value: result.value,
        }
    } catch (error) {
        status = 'thrown'
        throw error
    } finally {
        const finalEffector = Koka.extractFinalEffector(gen)
        if (finalEffector) {
            if (status === 'running') {
                yield { type: 'final', effector: finalEffector }
            } else {
                yield* Koka.runEffector(finalEffector) as Generator<Koka.Final, void>
            }
        }
    }
}

/**
 * convert a generator to a generator that returns a value
 * move the err from return to throw
 */
export function* unwrap<Return extends AnyOk | Err.AnyErr, Yield>(
    effector: Koka.Effector<Yield, Return>,
): Generator<Yield | Err.ExtractErr<Return>, InferOkValue<Return>> {
    const gen = Koka.runEffector(effector)
    const result = yield* gen

    if (result.type === 'ok') {
        return result.value
    } else {
        throw yield result as Err.ExtractErr<Return>
    }
}

export function runSync<E extends Err.AnyErr | Opt.AnyOpt | Koka.Final, Return>(
    effector: Koka.Effector<E, Return>,
): Ok<Return> | Err.ExtractErr<E> {
    return Koka.runSync(wrap(effector) as any)
}

export function runAsync<E extends Err.AnyErr | Opt.AnyOpt | Async.Async | Koka.Final, Return>(
    effector: Koka.Effector<E, Return>,
    options?: Koka.RunAsyncOptions,
): Promise<Ok<Return> | Err.ExtractErr<E>> {
    return Koka.runAsync(wrap(effector) as any, options)
}
