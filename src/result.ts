import * as Eff from './koka'

export type Ok<T> = {
    type: 'ok'
    value: T
}

export type AnyOk = Ok<any>

export type Result<T, E> = Ok<T> | (E extends Eff.AnyErr ? E : never)

export type AnyResult = Result<any, Eff.AnyErr>

export const ok = <T>(value: T): Ok<T> => {
    return {
        type: 'ok',
        value,
    }
}

export const err = <Name extends string, T>(name: Name, error: T): Eff.Err<Name, T> => {
    return {
        type: 'err',
        name,
        error,
    }
}

export type InferOkValue<T> = T extends Ok<infer U> ? U : never

export function* wrap<Yield extends Eff.AnyEff, Return>(
    gen: Generator<Yield, Return>,
): Generator<Eff.ExcludeErr<Yield>, Ok<Return> | Eff.ExtractErr<Yield>> {
    try {
        let result = gen.next()

        while (!result.done) {
            const effect = result.value

            if (effect.type === 'err') {
                return effect as Eff.ExtractErr<Yield>
            } else {
                result = gen.next(yield effect as any)
            }
        }

        return {
            type: 'ok',
            value: result.value,
        }
    } finally {
        Eff.cleanUpGen(gen)
    }
}

/**
 * convert a generator to a generator that returns a value
 * move the err from return to throw
 */
export function* unwrap<Yield, Return extends AnyOk | Eff.AnyErr>(
    gen: Generator<Yield, Return>,
): Generator<Yield | Eff.ExtractErr<Return>, InferOkValue<Return>> {
    const result = yield* gen

    if (result.type === 'ok') {
        return result.value
    } else {
        throw yield result as Eff.ExtractErr<Return>
    }
}

export function run<Yield, Return>(
    input: Eff.MaybeFunction<Generator<Yield, Return>>,
): Eff.Async extends Yield ? Eff.MaybePromise<Ok<Return> | Eff.ExtractErr<Yield>> : Ok<Return> | Eff.ExtractErr<Yield> {
    const gen = typeof input === 'function' ? input() : input

    // @ts-ignore expected
    return Eff.run(wrap(gen))
}
