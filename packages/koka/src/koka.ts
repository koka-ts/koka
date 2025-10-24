import type { Async, MaybePromise } from './async.ts'
import type { Ctx } from './ctx.ts'
import type { Err } from './err.ts'
import * as Gen from './gen.ts'
import type { AnyOpt, Opt } from './opt.ts'

export * from './constant.ts'

export type Eff<T> = Err<string, T> | Ctx<string, T> | Opt<string, T> | Async

export type AnyEff = Eff<any>

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type ToHandler<Effect> = Effect extends Err<infer Name, infer U>
    ? Record<Name, (error: U) => unknown>
    : Effect extends Ctx<infer Name, infer U>
    ? Record<Name, U>
    : Effect extends Opt<infer Name, infer U>
    ? Record<Name, U | undefined>
    : never

export type EffectHandlers<Effect> = UnionToIntersection<ToHandler<Effect>>

type ExtractErrorHandlerReturn<Handlers, Eff> = Eff extends Err<infer Name, infer U>
    ? Name extends keyof Handlers
        ? Handlers[Name] extends (error: U) => infer R
            ? R
            : never
        : never
    : never

export type Effector<Yield, Return> = Generator<Yield, Return> | (() => Generator<Yield, Return>)

function tryEffect<Yield extends AnyEff, Return>(input: Effector<Yield, Return>) {
    return {
        *handle<Handlers extends Partial<EffectHandlers<Yield>>>(
            handlers: Handlers,
        ): Generator<Exclude<Yield, { name: keyof Handlers }>, Return | ExtractErrorHandlerReturn<Handlers, Yield>> {
            const gen = typeof input === 'function' ? input() : input

            try {
                let result = gen.next()

                while (!result.done) {
                    const effect = result.value

                    if (effect.type === 'err') {
                        const errorHandler = handlers[effect.name as keyof Handlers]

                        if (typeof errorHandler === 'function') {
                            return errorHandler(effect.error)
                        } else {
                            result = gen.next(yield effect as any)
                        }
                    } else if (effect.type === 'ctx') {
                        if (effect.name in handlers) {
                            result = gen.next(handlers[effect.name as keyof Handlers])
                        } else {
                            result = gen.next(yield effect as any)
                        }
                    } else if (effect.type === 'opt') {
                        const optValue = handlers[effect.name as keyof Handlers]

                        if (optValue !== undefined) {
                            result = gen.next(optValue)
                        } else {
                            result = gen.next(yield effect as any)
                        }
                    } else {
                        result = gen.next(yield effect as any)
                    }
                }

                return result.value
            } finally {
                Gen.cleanUpGen(gen)
            }
        },
    }
}

export { tryEffect as try }

export function runSync<Return>(input: Effector<AnyOpt, Return>): Return {
    const gen = typeof input === 'function' ? input() : input
    let result = gen.next()

    while (!result.done) {
        const effect = result.value

        if (effect.type === 'opt') {
            result = gen.next()
        } else {
            throw new Error(`Unhandled effect: ${JSON.stringify(effect, null, 2)}`)
        }
    }

    return result.value
}

export function runAsync<Return>(input: Effector<Async | AnyOpt, Return>): Promise<Return> {
    const gen = typeof input === 'function' ? input() : input

    const process = (result: IteratorResult<Async | AnyOpt, Return>): MaybePromise<Return> => {
        while (!result.done) {
            const effect = result.value

            if (effect.type === 'async') {
                return effect.promise.then(
                    (value) => {
                        return process(gen.next(value))
                    },
                    (error) => {
                        return process(gen.throw(error))
                    },
                ) as MaybePromise<Return>
            } else if (effect.type === 'opt') {
                result = gen.next()
            } else {
                throw new Error(`Unhandled effect: ${JSON.stringify(effect, null, 2)}`)
            }
        }

        return result.value as MaybePromise<Return>
    }

    return new Promise((resolve) => {
        resolve(process(gen.next()))
    })
}

export type ExtractEffFromObject<Gens extends object> = {
    [K in keyof Gens]: Gens[K] extends Effector<infer E, any> ? E : never
}[keyof Gens]

export type ExtractEffFromTuple<Gens> = Gens extends []
    ? never
    : Gens extends [infer Head, ...infer Tail]
    ? Head extends Effector<infer Yield, any>
        ? Yield | ExtractEffFromTuple<Tail>
        : never
    : never

export type ExtractEff<Gens> = Gens extends unknown[]
    ? ExtractEffFromTuple<Gens>
    : Gens extends object
    ? ExtractEffFromObject<Gens>
    : never

export type ExtractReturnFromTuple<Gens> = Gens extends []
    ? []
    : Gens extends [infer Head, ...infer Tail]
    ? Head extends Effector<any, infer R>
        ? [R, ...ExtractReturnFromTuple<Tail>]
        : [Head, ...ExtractReturnFromTuple<Tail>]
    : never

export type ExtractReturnFromObject<Gens extends object> = {
    [K in keyof Gens]: Gens[K] extends Effector<any, infer R> ? R : Gens[K]
}

export type ExtractReturn<Gens> = Gens extends unknown[]
    ? ExtractReturnFromTuple<Gens>
    : Gens extends object
    ? {
          [key in keyof ExtractReturnFromObject<Gens>]: ExtractReturnFromObject<Gens>[key]
      }
    : never
