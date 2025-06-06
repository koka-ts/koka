export type Err<Name extends string, T> = {
    type: 'err'
    name: Name
    error: T
}

export type AnyErr = Err<string, any>

export type Ctx<Name extends string, T> = {
    type: 'ctx'
    name: Name
    context?: T
}

export type AnyCtx = Ctx<string, any>

export type Async = {
    type: 'async'
    name?: undefined
    value: Promise<unknown>
}

export type EffType<T> = Err<string, T> | Ctx<string, T> | Async

export type AnyEff = EffType<any>

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type ToHandler<Effect> = Effect extends Err<infer Name, infer U>
    ? Record<Name, (error: U) => unknown>
    : Effect extends Ctx<infer Name, infer U>
    ? Record<Name, U>
    : never

export type EffectHandlers<Effect> = UnionToIntersection<ToHandler<Effect>>

type AnyFn = (...args: any[]) => any

type ExtractFunctions<Handlers> = {
    [key in keyof Handlers]: Handlers[key] extends AnyFn ? Handlers[key] : never
}[keyof Handlers]

const isAsyncEff = (input: unknown): input is Async => {
    return (input as any)?.type === 'async'
}

const isCtxEff = (input: unknown): input is AnyCtx => {
    return (input as any)?.type === 'ctx'
}

const isErrEff = (input: unknown): input is AnyErr => {
    return (input as any)?.type === 'err'
}

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

export type MaybePromise<T> = T extends Promise<any> ? T : T | Promise<T>

export type MaybeFunction<T> = T | (() => T)

type AllEff<T extends unknown[], Yield = never, Return extends unknown[] = []> = T extends []
    ? Generator<Yield, Return, unknown>
    : T extends [infer R extends Generator<infer Y, infer R, unknown>, ...infer Rest]
    ? AllEff<Rest, Yield | Y, [...Return, R]>
    : never

export const Eff = {
    err: <Name extends string>(name: Name) => {
        return {
            *throw<E = void>(...args: void extends E ? [] : [E]): Generator<Err<Name, E>, never, unknown> {
                yield {
                    type: 'err',
                    name,
                    error: args[0] as E,
                }
                throw new Error(`Unexpected resumption of error effect [${name}]`)
            },
        }
    },
    ctx: <Name extends string>(name: Name) => {
        return {
            *get<T>(): Generator<Ctx<Name, T>, T, unknown> {
                const context = yield {
                    type: 'ctx',
                    name,
                }

                return context as T
            },
        }
    },
    try: <Yield, Return>(input: MaybeFunction<Generator<Yield, Return, unknown>>) => {
        return {
            *catch<Handlers extends Partial<EffectHandlers<Yield>>>(
                handlers: Handlers,
            ): Generator<
                Exclude<Yield, { name: keyof Handlers }>,
                Return | ReturnType<ExtractFunctions<Handlers>>,
                unknown
            > {
                const gen = typeof input === 'function' ? input() : input
                let result = gen.next()

                while (!result.done) {
                    const effect = result.value

                    if (isErrEff(effect)) {
                        const errorHandler = handlers[effect.name as keyof Handlers]

                        if (typeof errorHandler === 'function') {
                            return errorHandler(effect.error)
                        } else {
                            result = gen.next(yield effect as any)
                        }
                    } else if (isCtxEff(effect)) {
                        const context = handlers[effect.name as keyof Handlers]

                        if (context !== undefined) {
                            result = gen.next(context)
                        } else {
                            result = gen.next(yield effect as any)
                        }
                    } else {
                        result = gen.next(yield effect as any)
                    }
                }

                return result.value
            },
        }
    },
    run: <Effect extends Async, Return>(
        input: MaybeFunction<Generator<Effect, Return, unknown>>,
    ): Async extends Effect ? MaybePromise<Return> : Return => {
        const process = (result: IteratorResult<Effect, Return>): any => {
            while (!result.done) {
                const effect = result.value

                if (isAsyncEff(effect)) {
                    return effect.value.then((value) => {
                        return process(gen.next(value))
                    })
                } else {
                    effect satisfies never
                    throw new Error(`Unknown effect [${effect}]`)
                }
            }

            return result.value
        }

        const gen = typeof input === 'function' ? input() : input

        return process(gen.next())
    },
    runResult<Yield, Return>(
        input: MaybeFunction<Generator<Yield, Return, unknown>>,
    ): Async extends Yield ? MaybePromise<Ok<Return> | ExtractErr<Yield>> : Ok<Return> | ExtractErr<Yield> {
        const gen = typeof input === 'function' ? input() : input

        // @ts-ignore expected
        return Eff.run(Eff.result(gen))
    },
    *throw<E extends AnyErr>(effect: E): Generator<E, never, unknown> {
        yield effect
        throw new Error(`Unexpected resumption of error effect [${effect.name}]`)
    },
    *await<T>(value: T | Promise<T>): Generator<Async, T, unknown> {
        if (!(value instanceof Promise)) {
            return value
        }

        const result = yield {
            type: 'async',
            value,
        }

        return result as T
    },
    *result<Yield, Return>(
        gen: Generator<Yield, Return, unknown>,
    ): Generator<ExcludeErr<Yield>, Ok<Return> | ExtractErr<Yield>, unknown> {
        let result = gen.next()

        while (!result.done) {
            const effect = result.value

            if (isErrEff(effect)) {
                return effect as ExtractErr<Yield>
            } else {
                result = gen.next(yield effect as any)
            }
        }

        return {
            type: 'ok',
            value: result.value,
        }
    },
    /**
     * convert a generator to a generator that returns a value
     * move the err from return to throw
     */
    *ok<Yield, Return extends AnyOk | AnyErr>(
        gen: Generator<Yield, Return, unknown>,
    ): Generator<Yield | ExtractErr<Return>, InferOkValue<Return>, unknown> {
        const result = yield* gen

        if (result.type === 'ok') {
            return result.value
        } else {
            throw yield result as ExtractErr<Return>
        }
    },
}

export const isGenerator = <T = unknown, TReturn = any, TNext = any>(
    value: unknown,
): value is Generator<T, TReturn, TNext> => {
    return typeof value === 'object' && value !== null && 'next' in value && 'throw' in value
}
