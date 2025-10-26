import type { Async, MaybePromise } from './async.ts'
import type { Ctx } from './ctx.ts'
import type { Err } from './err.ts'
import type { AnyOpt, Opt } from './opt.ts'
import { withResolvers } from './util.ts'

export * from './constant.ts'

type FinalEffector = Effector<AnyEff, void>

export type Final = {
    type: 'final',
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

export type Effector<Yield, Return> = Generator<Yield, Return> | (() => Generator<Yield, Return>)

export type HandledEffector<Yield extends AnyEff, Return, Handlers extends Partial<EffectHandlers<Yield>>> =
    Generator<Exclude<Yield, { name: keyof Handlers }>, Return | ExtractErrorHandlerReturn<Handlers, Yield>>

export type FinalEffHandler<Yield, Return> = <Eff extends AnyEff = never>(effector: FinalEffector) => Generator<Yield | Eff | Final, Return>

function tryEffect<Yield extends AnyEff, Return>(input: Effector<Yield, Return>) {
    const handleEffect = function <Handlers extends Partial<EffectHandlers<Yield>>>(
        handlers: Handlers,
    ): Generator<Exclude<Yield, { name: keyof Handlers }>, Return | ExtractErrorHandlerReturn<Handlers, Yield>> & {
        finally: FinalEffHandler<Exclude<Yield, { name: keyof Handlers }>, Return | ExtractErrorHandlerReturn<Handlers, Yield>>
    } {
        type NewYield = Exclude<Yield, { name: keyof Handlers }>
        type NewReturn = Return | ExtractErrorHandlerReturn<Handlers, Yield>

        function* createHandledGen(): HandledEffector<Yield, Return, Handlers> {
            const gen = typeof input === 'function' ? input() : input
            let result = gen.next()

            while (!result.done) {
                const effect = result.value

                if (effect.type === 'err') {
                    const errorHandler = handlers[effect.name as keyof Handlers]

                    if (typeof errorHandler === 'function') {
                        const finalEffector = extractFinalEffector(gen)
                        if (finalEffector) {
                            const finalEffectorGen = typeof finalEffector === 'function' ? finalEffector() : finalEffector
                            /**
                             * If there is an error handler, we need to first run the final effectors before calling the error handler
                             * This ensures that any cleanup or finalization logic is executed, because the err effect will not be resumed
                             */
                            yield* finalEffectorGen as any
                        }

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
        }

        function* createFinalGen(): Generator<NewYield | Final, NewReturn> {
            let gen = createHandledGen()
            let status: 'return' | undefined
            try {
                let result = gen.next()

                while (!result.done) {
                    const effect = result.value
                    result = gen.next(yield effect as any)
                }

                status = 'return'
                return result.value
            } catch (error) {
                let result = gen.throw(error)

                while (!result.done) {
                    const effect = result.value
                    result = gen.next(yield effect as any)
                }

                status = 'return'
                return result.value
            } finally {
                console.log('createFinalGen finally block, status:', status)
                if (status === undefined) {
                    const finalEffector = extractFinalEffector(gen)
                    console.log('createFinalGen extracted finalEffector:', finalEffector)
                    if (finalEffector) {
                        /**
                         * If the generator is being finalized without a known status (i.e., not from return or throw, but aborted),
                         * we need to handle the final effect with the same handlers to ensure effects in the finally blocks of sub-generators are also handled.
                         */
                        yield {
                            type: 'final',
                            effector: tryEffect(finalEffector).handle(handlers as any) as any,
                        }
                    }
                }
            }
        }

        const gen = createFinalGen() as HandledEffector<Yield, Return, Handlers> & {
            finally: FinalEffHandler<NewYield, NewReturn>
        }

        gen.finally = function (effector) {
            return tryEffect(gen).finally(effector)
        }

        return gen
    }

    const handleFinalEffect = (function* (finalEffector) {
        const gen = typeof input === 'function' ? input() : input
        let status: 'return' | undefined
        try {
            let result = gen.next()

            while (!result.done) {
                const effect = result.value
                result = gen.next(yield effect as any)
            }

            status = 'return'

            return result.value
        } catch (error) {

            let result = gen.throw(error)

            while (!result.done) {
                const effect = result.value
                result = gen.next(yield effect as any)
            }

            status = 'return'
            return result.value
        } finally {
            console.log('handleFinalEffect finally block, status:', status)
            if (status !== undefined) {
                const finalGen = typeof finalEffector === 'function' ? finalEffector() : finalEffector
                yield* finalGen
            } else {
                const childFinalEffector = extractFinalEffector(gen)

                if (childFinalEffector) {
                    yield {
                        type: 'final',
                        effector: mergeFinalEffectors(childFinalEffector, finalEffector),
                    }
                }
            }
        }
    }) as FinalEffHandler<Yield, Return>

    return {
        handle: handleEffect,
        finally: handleFinalEffect,
    }
}

export { tryEffect as try }

const extractFinalEffector = function (gen: Generator<AnyEff, any>) {
    let finalEffector: FinalEffector | undefined
    let result = (gen as any).return(undefined)

    console.log('extractFinalEffector initial result:', result)

    while (!result.done) {
        const effect = result.value
        console.log('extractFinalEffector effect:', effect)
        if (effect?.type === 'final') {
            if (finalEffector) {
                throw new Error(`Multiple 'final' effects yielded. Only one 'final' effect is allowed.`)
            }
            finalEffector = effect.effector
        } else {
            throw new Error(`Unsupported yield value in 'finally block': ${JSON.stringify(effect, null, 2)}`)
        }

        result = (gen as any).return(undefined)
    }

    return finalEffector
}

const mergeFinalEffectors = function* (childFinalEffector: FinalEffector, parentFinalEffector: FinalEffector): Generator<AnyEff, void> {
    const childFinalGen = typeof childFinalEffector === 'function' ? childFinalEffector() : childFinalEffector
    yield* childFinalGen

    const parentFinalGen = typeof parentFinalEffector === 'function' ? parentFinalEffector() : parentFinalEffector
    yield* parentFinalGen
}

export function runSync<E extends AnyOpt | Final, Return>(input: Effector<E, Return>): Return {
    const gen = typeof input === 'function' ? input() : input
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

export async function runAsync<E extends Async | AnyOpt | Final, Return>(input: Effector<E, Return>, options?: RunAsyncOptions): Promise<Return> {
    const gen = typeof input === 'function' ? input() : input
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

    options?.abortSignal?.addEventListener('abort', () => {
        reject(new Error('[Koka.runAsync]Operation aborted'))
    }, {
        once: true,
        signal: abortController?.signal,
    })

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
