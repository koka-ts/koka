import type { Async, MaybePromise } from './async.ts'
import type { Ctx } from './ctx.ts'
import type { Err } from './err.ts'
import type { AnyOpt, Opt } from './opt.ts'
import { withResolvers } from './util.ts'

export * from './constant.ts'

type FinalEffector = Effector<AnyEff, void>

export type Final = {
    type: 'final'
    status: 'start' | 'end'
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

export function readEffector<Yield, Return>(effector: Effector<Yield, Return>): Generator<Yield, Return> {
    return typeof effector === 'function' ? effector() : effector[Symbol.iterator]()
}

abstract class EffPhase {
    abstract [Symbol.iterator](): Generator<AnyEff, unknown>
}

class TryPhase<Yield extends AnyEff, Return> extends EffPhase {
    effector: Effector<Yield, Return>
    constructor(effector: Effector<Yield, Return>) {
        super()
        this.effector = effector
    }
    [Symbol.iterator]() {
        return readEffector(this.effector)
    }
    handle<Handlers extends Partial<EffectHandlers<Yield>>>(handlers: Handlers) {
        return new HandledPhase(this, handlers)
    }
    finally<FinalYield extends AnyEff = never>(finalEffector: Effector<FinalYield, void>) {
        return new FinalPhase<Yield | FinalYield, Return>(this, finalEffector)
    }
}

type FinalState = {
    errors: Error[]
}

export function getNativeError(error: unknown): Error {
    if (error instanceof Error) {
        return error
    } else {
        return new Error(String(error))
    }
}

export function* cleanUpGen<Yield extends AnyEff, Return>(
    gen: Generator<Yield, Return>,
    result: IteratorResult<Yield | Final, Return> = (gen as any).return(undefined),
): Generator<Yield | Final, void> {
    if (result.done) {
        return
    }

    const finalState: FinalState = yield {
        type: 'final',
        status: 'start',
    }

    try {
        while (!result.done) {
            const effect = result.value
            if (effect.type === 'final') {
                if (effect.status === 'start') {
                    result = gen.next(finalState)
                } else {
                    effect.status satisfies 'end'
                    result = (gen as any).return(undefined)
                }
            } else {
                result = gen.next(yield effect as any)
            }
        }
    } catch (error) {
        finalState.errors.push(getNativeError(error))
    }

    yield {
        type: 'final',
        status: 'end',
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
        const handlers = this.handlers
        const gen = readEffector(this.effector)
        let result = gen.next()

        try {
            while (!result.done) {
                const effect = result.value
                if (effect.type === 'err') {
                    const errorHandler = handlers[effect.name as keyof Handlers]

                    if (typeof errorHandler === 'function') {
                        return errorHandler(effect.error)
                    } else {
                        result = gen.next(yield effect as any)
                    }
                } else if (effect.type === 'ctx' || effect.type === 'opt') {
                    if (effect.name in handlers) {
                        result = gen.next(handlers[effect.name as keyof Handlers])
                    } else {
                        result = gen.next(yield effect as any)
                    }
                } else {
                    result = gen.next(yield effect as any)
                }
            }

            return result.value
        } finally {
            const result = (gen as any).return(undefined)
            if (!result.done) {
                /**
                 * If the generator is not done, we need to clean up the generator
                 * with the preloaded result and the handlers
                 */
                yield* new HandledPhase(cleanUpGen(gen, result), this.handlers)
            }
        }
    }
    [Symbol.iterator]() {
        return this.handleEffects()
    }
    finally<Eff extends AnyEff = never>(finalEffector: Effector<Eff, void>) {
        return new FinalPhase(this, finalEffector)
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
        try {
            return yield* readEffector(this.effector)
        } finally {
            const finalState: FinalState = yield {
                type: 'final',
                status: 'start',
            }

            const finalGen = readEffector(this.finalEffector)
            let result = finalGen.next()
            try {
                while (!result.done) {
                    const effect = result.value
                    if (effect.type === 'final') {
                        result = finalGen.next(finalState)
                    } else {
                        result = finalGen.next(yield effect as any)
                    }
                }
            } catch (error) {
                finalState.errors.push(getNativeError(error))
            } finally {
                try {
                    yield* cleanUpGen(finalGen) as Generator<Final, void>
                } finally {
                    yield {
                        type: 'final',
                        status: 'end',
                    }
                }
            }
        }
    }
}

function tryEffect<Yield extends AnyEff, Return>(effector: Effector<Yield, Return>) {
    return new TryPhase(effector)
}

export { tryEffect as try }

function getAggregateErrorMessage(errors: Error[]): string {
    return errors.map((error) => error.stack ?? error.message).join('\n')
}

function printAggreErrorMessages(errors: Error[]): void {
    const error = new AggregateError(errors, getAggregateErrorMessage(errors))
    console.log(error)
}

export type RunSyncOptions = {
    onCleanupErrors?: (errors: Error[]) => unknown
}

export function runSync<E extends AnyOpt | Final, Return>(
    input: Effector<E, Return>,
    options?: RunSyncOptions,
): Return {
    const gen = readEffector(input)
    let finalState: FinalState = {
        errors: [],
    }
    let finalCount = 0
    const onCleanupErrors = options?.onCleanupErrors ?? printAggreErrorMessages

    let result = gen.next()

    while (!result.done) {
        const effect = result.value

        if (effect.type === 'opt') {
            result = gen.next()
        } else if (effect.type === 'final') {
            if (effect.status === 'start') {
                finalCount++
            } else {
                effect.status satisfies 'end'
                finalCount--
            }

            if (finalCount === 0) {
                if (finalState.errors.length > 0) {
                    onCleanupErrors(finalState.errors)
                    finalState = {
                        errors: [],
                    }
                }
            }
            result = gen.next(finalState)
        } else {
            throw new Error(`[Koka.runSync]Unexpected effect: ${JSON.stringify(effect, null, 2)}`)
        }
    }

    return result.value
}

export type RunAsyncOptions = {
    abortSignal?: AbortSignal
    onCleanupErrors?: (errors: Error[]) => unknown
}

export async function runAsync<E extends Async | AnyOpt | Final, Return>(
    effector: Effector<E, Return>,
    options?: RunAsyncOptions,
): Promise<Return> {
    if (options?.abortSignal?.aborted) {
        throw new Error('[Koka.runAsync]Operation aborted')
    }

    const gen = readEffector(effector)
    const { promise, resolve, reject } = withResolvers<Return>()
    const onCleanupErrors = options?.onCleanupErrors ?? printAggreErrorMessages
    let finalState: FinalState = {
        errors: [],
    }
    let finalCount = 0
    let isAborted = false

    const process = (result: IteratorResult<Async | AnyOpt | Final, Return>): MaybePromise<Return> => {
        while (!result.done) {
            if (isAborted) {
                throw new Error('[Koka.runAsync]Operation aborted')
            }
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
            } else if (effect.type === 'final') {
                if (effect.status === 'start') {
                    finalCount++
                } else {
                    effect.status satisfies 'end'
                    finalCount--
                }

                if (finalCount === 0) {
                    if (finalState.errors.length > 0) {
                        onCleanupErrors(finalState.errors)
                        finalState = {
                            errors: [],
                        }
                    }

                    if (isAborted) {
                        throw new Error('[Koka.runAsync]Operation aborted')
                    }
                }
                result = gen.next(finalState)
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
            isAborted = true
            if (finalCount === 0) {
                reject(new Error('[Koka.runAsync]Operation aborted'))
            }
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
        const value = await promise
        return value
    } catch (error) {
        await runAsync(cleanUpGen(gen), {
            onCleanupErrors,
        })
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
