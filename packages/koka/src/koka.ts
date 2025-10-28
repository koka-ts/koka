import type { Async, MaybePromise } from './async.ts'
import type { Ctx } from './ctx.ts'
import type { Err } from './err.ts'
import type { AnyOpt, Opt } from './opt.ts'
import { withResolvers } from './util.ts'

export * from './constant.ts'

type FinalEffector = Effector<AnyEff, void>

export type Final = {
    type: 'final'
    effector: FinalEffector
}

export type Eff<T> = Err<string, T> | Ctx<string, T> | Opt<string, T> | Async | Final

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

export type Effector<Yield, Return> = (() => Generator<Yield, Return>) | GeneratorIterable<Yield, Return>

type GeneratorIterable<Yield, Return> = {
    [Symbol.iterator]: () => Generator<Yield, Return>
}

export function runEffector<Yield, Return>(effector: Effector<Yield, Return>): Generator<Yield, Return> {
    return typeof effector === 'function' ? effector() : effector[Symbol.iterator]()
}

type InferPhaseYield<G extends GeneratorIterable<any, any>> = G extends GeneratorIterable<infer Yield, any>
    ? Yield
    : never

type InferPhaseReturn<G extends GeneratorIterable<any, any>> = G extends GeneratorIterable<any, infer Return>
    ? Return
    : never

abstract class EffPhase {
    abstract [Symbol.iterator](): Generator<AnyEff, unknown>
    runAsync(
        this: InferPhaseYield<this> extends Async | AnyOpt | Final ? this : `runAsync is not available for this type`,
        options?: RunAsyncOptions,
    ): Promise<InferPhaseReturn<this>> {
        return runAsync(this as any, options)
    }
    runSync(
        this: InferPhaseYield<this> extends AnyOpt | Final ? this : `runSync is not available for this type`,
    ): InferPhaseReturn<this> {
        return runSync(this as any)
    }
}

class TryPhase<Yield extends AnyEff, Return> extends EffPhase {
    effector: Effector<Yield, Return>
    constructor(effector: Effector<Yield, Return>) {
        super()
        this.effector = effector
    }
    [Symbol.iterator]() {
        return runEffector(this.effector)
    }
    handle<Handlers extends Partial<EffectHandlers<Yield>>>(handlers: Handlers) {
        return new HandledPhase(this.effector, handlers)
    }
    finally<Eff extends AnyEff = never>(effector: Effector<Eff, void>) {
        return new FinalPhase<Yield | Eff, Return>(this.effector, effector)
    }
}

class HandledPhase<Yield extends AnyEff, Return, Handlers extends Partial<EffectHandlers<Yield>>> extends EffPhase {
    effector: Effector<Yield, Return>
    handlers: Handlers
    constructor(effector: Effector<Yield, Return>, handlers: Handlers) {
        super()
        this.effector = effector
        this.handlers = handlers
    }
    *handleEffects(): Generator<
        Exclude<Yield, { name: keyof Handlers }> | Final,
        Return | ExtractErrorHandlerReturn<Handlers, Yield>
    > {
        const effector = this.effector
        const handlers = this.handlers
        const gen = runEffector(effector)
        let result = gen.next()
        let status: 'returned' | 'thrown' | 'running' = 'running'

        try {
            while (!result.done) {
                const effect = result.value

                if (effect.type === 'err') {
                    const errorHandler = handlers[effect.name as keyof Handlers]

                    if (typeof errorHandler === 'function') {
                        status = 'thrown'
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

            status = 'returned'
            return result.value
        } catch (error) {
            status = 'thrown'
            throw error
        } finally {
            const finalEffector = extractFinalEffector(gen)

            if (finalEffector) {
                const finalHandledEffector = new TryPhase(finalEffector).handle(this.handlers)
                if (status === 'thrown') {
                    /**
                     * normal control flow, so we just run the final effectors
                     */
                    const finalGen = runEffector(finalHandledEffector)
                    yield* finalGen as Generator<any, void>
                } else if (status === 'running') {
                    /**
                     * trigger from gen.return(undefined) that can only yield once with Final effect
                     */
                    yield {
                        type: 'final',
                        effector: finalHandledEffector,
                    } as Final
                } else {
                    /**
                     * when status is 'returned', it means gen should not yield again, so we throw an error
                     */
                    throw new Error(`[Koka]Unexpected status: ${status}`)
                }
            }
        }
    }
    [Symbol.iterator]() {
        return this.handleEffects()
    }
    finally<Eff extends AnyEff = never>(effector: Effector<Eff, void>) {
        const gen = this[Symbol.iterator]()
        return new FinalPhase(gen, effector)
    }
}

class FinalPhase<Yield extends AnyEff, Return> extends EffPhase {
    effector: Effector<Yield, Return>
    finalEffector: FinalEffector
    constructor(effector: Effector<Yield, Return>, finalEffector: FinalEffector) {
        super()
        this.effector = effector
        this.finalEffector = finalEffector
    }
    *[Symbol.iterator](): Generator<Yield | Final, Return> {
        const gen = runEffector(this.effector)
        const finalEffector = this.finalEffector
        let status: 'returned' | 'thrown' | 'running' = 'running'
        try {
            let result = gen.next()
            while (!result.done) {
                result = gen.next(yield result.value)
            }
            status = 'returned'
            return result.value
        } catch (error) {
            const childFinalEffector = extractFinalEffector(gen)
            if (childFinalEffector) {
                const finalGen = runEffector(childFinalEffector)
                yield* finalGen as Generator<any, void>
            }
            status = 'thrown'
            throw error
        } finally {
            if (status === 'running') {
                const childFinalEffector = extractFinalEffector(gen)
                const combinedFinalEffector = childFinalEffector
                    ? serializeEffectors(childFinalEffector, finalEffector)
                    : finalEffector

                yield {
                    type: 'final',
                    effector: combinedFinalEffector,
                }
            } else {
                const finalGen = runEffector(finalEffector)
                yield* finalGen as any
            }
        }
    }
}

function tryEffect<Yield extends AnyEff, Return>(effector: Effector<Yield, Return>) {
    return new TryPhase(effector)
}

export { tryEffect as try }

export const extractFinalEffector = function (gen: Generator<AnyEff, any>) {
    let finalEffector: FinalEffector | undefined
    let result = (gen as any).return(undefined)

    while (!result.done) {
        const effect = result.value
        if (effect?.type === 'final') {
            if (finalEffector) {
                throw new Error(`[Koka]Multiple 'final' effects yielded. Only one 'final' effect is allowed.`)
            }
            finalEffector = effect.effector
        } else {
            throw new Error(`[Koka]Unsupported yield value in 'finally block': ${JSON.stringify(effect, null, 2)}`)
        }

        result = (gen as any).return(undefined)
    }

    return finalEffector
}

const serializeEffectors = function* (first: FinalEffector, second: FinalEffector): Generator<AnyEff, void> {
    const firstGen = runEffector(first)
    yield* firstGen

    const secondGen = runEffector(second)
    yield* secondGen
}

export function runSync<E extends AnyOpt | Final, Return>(input: Effector<E, Return>): Return {
    const gen = runEffector(input)
    let result = gen.next()

    while (!result.done) {
        const effect = result.value

        if (effect.type === 'opt') {
            result = gen.next()
        } else {
            throw new Error(`[Koka.runSync]Unexpected effect: ${JSON.stringify(effect, null, 2)}`)
        }
    }

    return result.value
}

export type RunAsyncOptions = {
    abortSignal?: AbortSignal
}

export async function runAsync<E extends Async | AnyOpt | Final, Return>(
    effector: Effector<E, Return>,
    options?: RunAsyncOptions,
): Promise<Return> {
    if (options?.abortSignal?.aborted) {
        throw new Error('[Koka.runAsync]Operation aborted')
    }

    const gen = runEffector(effector)
    const { promise, resolve, reject } = withResolvers<Return>()

    const process = (result: IteratorResult<Async | AnyOpt | Final, Return>): MaybePromise<Return> => {
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
                throw new Error(`[Koka.runAsync]Unexpected effect: ${JSON.stringify(effect, null, 2)}`)
            }
        }

        return result.value as MaybePromise<Return>
    }

    const abortController = options?.abortSignal ? new AbortController() : undefined

    options?.abortSignal?.addEventListener(
        'abort',
        () => {
            reject(new Error('[Koka.runAsync]Operation aborted'))
        },
        {
            once: true,
            signal: abortController?.signal,
        },
    )

    try {
        const value = process(gen.next())
        if (value instanceof Promise) {
            value.then(resolve, reject)
        } else {
            resolve(value)
        }
    } catch (err) {
        reject(err)
    }

    try {
        return await promise
    } catch (error) {
        const finalEffector = extractFinalEffector(gen)
        if (finalEffector) {
            await runAsync(finalEffector as any)
        }
        throw error
    } finally {
        abortController?.abort()
    }
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
