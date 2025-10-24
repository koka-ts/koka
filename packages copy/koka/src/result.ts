import type * as Async from './async.ts'
import type * as Err from './err.ts'
import type * as Opt from './opt.ts'
import * as Gen from './gen.ts'
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

export function* wrap<Yield extends Koka.AnyEff, Return>(
    gen: Generator<Yield, Return>,
): Generator<Err.ExcludeErr<Yield>, Ok<Return> | Err.ExtractErr<Yield>> {
    try {
        let result = gen.next()

        while (!result.done) {
            const effect = result.value

            if (effect.type === 'err') {
                return effect as Err.ExtractErr<Yield>
            } else {
                result = gen.next(yield effect as any)
            }
        }

        return {
            type: 'ok',
            value: result.value,
        }
    } finally {
        Gen.cleanUpGen(gen)
    }
}

/**
 * convert a generator to a generator that returns a value
 * move the err from return to throw
 */
export function* unwrap<Yield, Return extends AnyOk | Err.AnyErr>(
    gen: Generator<Yield, Return>,
): Generator<Yield | Err.ExtractErr<Return>, InferOkValue<Return>> {
    const result = yield* gen

    if (result.type === 'ok') {
        return result.value
    } else {
        throw yield result as Err.ExtractErr<Return>
    }
}

export function runSync<E extends Err.AnyErr, Return>(input: Koka.Effector<Opt.AnyOpt | E, Return>): Ok<Return> | E {
    const gen = typeof input === 'function' ? input() : input
    return Koka.runSync(wrap(gen as any) as any)
}

export function runAsync<E extends Err.AnyErr, Return>(
    input: Koka.Effector<Async.Async | Opt.AnyOpt | E, Return>,
): Promise<Ok<Return> | E> {
    const gen = typeof input === 'function' ? input() : input
    return Koka.runAsync(wrap(gen as any) as any)
}
