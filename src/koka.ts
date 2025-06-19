export type Err<Name extends string, T> = {
    type: 'err'
    name: Name
    error: T
}

export type AnyErr = Err<string, any>

export const EffSymbol = Symbol('ctx')

export type EffSymbol = typeof EffSymbol

export type Ctx<Name extends string, T> = {
    type: 'ctx'
    name: Name
    context: EffSymbol | T
    optional?: true
}

export type Opt<Name extends string, T> = Ctx<Name, T> & {
    optional: true
}

export type AnyCtx = Ctx<string, any>

export type Async = {
    type: 'async'
    name?: undefined
    promise: Promise<unknown>
}

export type AnyOpt = Opt<string, any>

export type EffType<T> = Err<string, T> | Ctx<string, T> | Opt<string, T> | Async

export type AnyEff = EffType<any>

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type ToHandler<Effect> = Effect extends Err<infer Name, infer U>
    ? Record<Name, (error: U) => unknown>
    : Effect extends Ctx<infer Name, infer U>
    ? Record<Name, U>
    : never

export type EffectHandlers<Effect> = UnionToIntersection<ToHandler<Effect>>

type ExtractErrorHandlerReturn<Handlers, Eff extends AnyEff> = Eff extends Err<infer Name, infer U>
    ? Name extends keyof Handlers
        ? Handlers[Name] extends (error: U) => infer R
            ? R
            : never
        : never
    : never

export type ExtractErr<T> = T extends AnyErr ? T : never

export type ExcludeErr<T> = T extends AnyErr ? never : T

export type Ok<T> = {
    type: 'ok'
    value: T
}

export type AnyOk = Ok<any>

export type Result<T, E> = Ok<T> | (E extends AnyErr ? E : never)

export type AnyResult = Result<any, AnyErr>

export const Result = {
    ok: <T>(value: T): Ok<T> => {
        return {
            type: 'ok',
            value,
        }
    },
    err: <Name extends string, T>(name: Name, error: T): Err<Name, T> => {
        return {
            type: 'err',
            name,
            error,
        }
    },
}

type InferOkValue<T> = T extends Ok<infer U> ? U : never

type MaybeGenerator<T, R> = Generator<T, R> | (() => Generator<T, R>)

type ExtractEff<Effects> = Effects extends []
    ? never
    : Effects extends [infer First, ...infer Rest]
    ? First extends MaybeFunction<Generator<infer E, any>>
        ? E | ExtractEff<Rest>
        : never
    : never

type ExtractReturn<Effects> = Effects extends []
    ? []
    : Effects extends [infer First, ...infer Rest]
    ? First extends MaybeFunction<Generator<any, infer R>>
        ? [R, ...ExtractReturn<Rest>]
        : never
    : never

export type MaybePromise<T> = T extends Promise<any> ? T : T | Promise<T>

export type MaybeFunction<T> = T | (() => T)

function Ctx<const Name extends string>(name: Name) {
    return class Eff<T> {
        type = 'ctx' as const
        name = name
        context = EffSymbol as EffSymbol | T
        optional?: true
    }
}

function Err<const Name extends string>(name: Name) {
    return class Eff<E = void> {
        type = 'err' as const
        name = name
        error: E
        constructor(error: E) {
            this.error = error
        }
    }
}

function Opt<const Name extends string>(name: Name) {
    return class Eff<T> extends Ctx(name)<T> {
        optional = true as const
    }
}

export type CtxValue<C extends AnyCtx> = C['optional'] extends true
    ? Exclude<C['context'], EffSymbol> | undefined
    : Exclude<C['context'], EffSymbol>

export class Eff {
    static err = <const Name extends string>(name: Name) => {
        return {
            *throw<E = void>(...args: E extends void ? [] : [E]): Generator<Err<Name, E>, never> {
                yield {
                    type: 'err',
                    name,
                    error: args[0] as E,
                }
                /* istanbul ignore next */
                throw new Error(`Unexpected resumption of error effect [${name}]`)
            },
        }
    }

    static Err = Err

    static *throw<E extends AnyErr>(err: E): Generator<E, never> {
        yield err
        /* istanbul ignore next */
        throw new Error(`Unexpected resumption of error effect [${err.name}]`)
    }

    static ctx = <const Name extends string>(name: Name) => {
        return {
            *get<T>(): Generator<Ctx<Name, T>, T> {
                const context = yield {
                    type: 'ctx',
                    name,
                    context: EffSymbol,
                }

                return context as T
            },
            *opt<T>(): Generator<Opt<Name, T>, T | undefined> {
                const context = yield {
                    type: 'ctx',
                    name,
                    context: EffSymbol,
                    optional: true,
                }

                return context as T | undefined
            },
        }
    }

    static Ctx = Ctx
    static Opt = Opt

    static *get<C extends AnyCtx>(ctx: C | (new () => C)): Generator<C, CtxValue<C>> {
        const context = yield typeof ctx === 'function' ? new ctx() : ctx

        return context as CtxValue<C>
    }

    static *all<const Effects extends MaybeGenerator<AnyEff, unknown>[]>(
        effects: Effects,
    ): Generator<ExtractEff<Effects>, ExtractReturn<Effects>> {
        type ProcessingItem = {
            gen: Generator<AnyEff, unknown>
            index: number
        }

        type ProcessedResult = {
            item: ProcessingItem
            result: IteratorResult<AnyEff, unknown>
        }

        const results: unknown[] = []

        const items = effects.map((effect, index): ProcessingItem => {
            const gen = typeof effect === 'function' ? effect() : effect
            return {
                gen,
                index,
            }
        })

        const promises: Promise<void>[] = []

        const wrapPromise = <T>(promise: Promise<T>, item: ProcessingItem): Promise<void> => {
            const wrappedPromise: Promise<void> = promise.then(
                (value) => {
                    promises.splice(promises.indexOf(wrappedPromise), 1)
                    processedResults.push({ item, result: item.gen.next(value) })
                },
                (error) => {
                    promises.splice(promises.indexOf(wrappedPromise), 1)
                    processedResults.push({ item, result: item.gen.throw(error) })
                },
            )

            promises.push(wrappedPromise)

            return wrappedPromise
        }

        function* processItem({ result, item }: ProcessedResult): Generator<any, void, unknown> {
            while (!result.done) {
                const effect = result.value

                if (effect.type === 'async') {
                    wrapPromise(effect.promise, item)
                    return
                } else {
                    result = item.gen.next(yield effect)
                }
            }

            results[item.index] = result.value
        }

        const processedResults: ProcessedResult[] = items.map((item) => {
            return {
                item,
                result: item.gen.next(),
            }
        })

        while (processedResults.length > 0) {
            const processedResult = processedResults.shift()!

            yield* processItem(processedResult)
        }

        while (promises.length > 0) {
            yield* Eff.await(Promise.race(promises)) as any

            while (processedResults.length > 0) {
                const processedResult = processedResults.shift()!

                yield* processItem(processedResult)
            }
        }

        return results as ExtractReturn<Effects>
    }

    static try = <Yield extends AnyEff, Return>(input: MaybeFunction<Generator<Yield, Return>>) => {
        return {
            *catch<Handlers extends Partial<EffectHandlers<Yield>>>(
                handlers: Handlers,
            ): Generator<
                Exclude<Yield, { name: keyof Handlers }>,
                Return | ExtractErrorHandlerReturn<Handlers, Yield>
            > {
                const gen = typeof input === 'function' ? input() : input
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
                        const context = handlers[effect.name as keyof Handlers]

                        if (context !== undefined) {
                            result = gen.next(context)
                        } else {
                            result = gen.next(yield effect as any)
                        }
                    } else if (effect.type === 'async') {
                        result = gen.next(yield effect as any)
                    } else {
                        effect satisfies never
                        throw new Error(`Unexpected effect: ${JSON.stringify(effect, null, 2)}`)
                    }
                }

                return result.value
            },
        }
    }

    static run<Return>(input: MaybeFunction<Generator<AnyOpt, Return>>): Return
    static run<Return>(input: MaybeFunction<Generator<Async | AnyOpt, Return>>): MaybePromise<Return>
    static run<Return>(input: MaybeFunction<Generator<Async | AnyOpt, Return>>): MaybePromise<Return> {
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
                } else if (effect.type === 'ctx') {
                    if (!effect.optional) {
                        throw new Error(
                            `Expected optional ctx, but got non-optional ctx: ${JSON.stringify(effect, null, 2)}`,
                        )
                    }
                    result = gen.next()
                } else {
                    throw new Error(`Expected async effect, but got: ${JSON.stringify(effect, null, 2)}`)
                }
            }

            return result.value as MaybePromise<Return>
        }

        return process(gen.next())
    }

    static runSync<Return>(effect: MaybeFunction<Generator<AnyOpt, Return>>): Return {
        const result = this.run(effect)

        if (result instanceof Promise) {
            throw new Error('Expected synchronous effect, but got asynchronous effect')
        }

        return result
    }

    static runAsync<Return>(input: MaybeFunction<Generator<Async | AnyOpt, Return>>): Promise<Return> {
        return Promise.resolve(this.run(input))
    }

    static runResult<Yield, Return>(
        input: MaybeFunction<Generator<Yield, Return>>,
    ): Async extends Yield ? MaybePromise<Ok<Return> | ExtractErr<Yield>> : Ok<Return> | ExtractErr<Yield> {
        const gen = typeof input === 'function' ? input() : input

        // @ts-ignore expected
        return Eff.run(Eff.result(gen))
    }

    static *await<T>(value: T | Promise<T>): Generator<Async, T> {
        if (!(value instanceof Promise)) {
            return value
        }

        const result = yield {
            type: 'async',
            promise: value,
        }

        return result as T
    }

    static *result<Yield extends AnyEff, Return>(
        gen: Generator<Yield, Return>,
    ): Generator<ExcludeErr<Yield>, Ok<Return> | ExtractErr<Yield>> {
        let result = gen.next()

        while (!result.done) {
            const effect = result.value

            if (effect.type === 'err') {
                return effect as ExtractErr<Yield>
            } else {
                result = gen.next(yield effect as any)
            }
        }

        return {
            type: 'ok',
            value: result.value,
        }
    }
    /**
     * convert a generator to a generator that returns a value
     * move the err from return to throw
     */
    static *ok<Yield, Return extends AnyOk | AnyErr>(
        gen: Generator<Yield, Return>,
    ): Generator<Yield | ExtractErr<Return>, InferOkValue<Return>> {
        const result = yield* gen

        if (result.type === 'ok') {
            return result.value
        } else {
            throw yield result as ExtractErr<Return>
        }
    }
}

export const isGenerator = <T = unknown, TReturn = any, TNext = any>(
    value: unknown,
): value is Generator<T, TReturn, TNext> => {
    return typeof value === 'object' && value !== null && 'next' in value && 'throw' in value
}
