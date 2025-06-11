export type Err<Name extends string, T> = {
    type: 'err'
    name: Name
    error: T
}

export type AnyErr = Err<string, any>

export const ctxSymbol = Symbol('ctx')

export type CtxSymbol = typeof ctxSymbol

export type Ctx<Name extends string, T> = {
    type: 'ctx'
    name: Name
    [ctxSymbol]?: T
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

export class Eff {
    static err = <Name extends string>(name: Name) => {
        return {
            *throw<E = void>(...args: void extends E ? [] : [E]): Generator<Err<Name, E>, never> {
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
    static ctx = <Name extends string>(name: Name) => {
        return {
            *get<T>(): Generator<Ctx<Name, T>, T> {
                const context = yield {
                    type: 'ctx',
                    name,
                }

                return context as T
            },
        }
    }
    static try = <Yield extends AnyEff, Return>(input: MaybeFunction<Generator<Yield, Return>>) => {
        return {
            *catch<Handlers extends Partial<EffectHandlers<Yield>>>(
                handlers: Handlers,
            ): Generator<Exclude<Yield, { name: keyof Handlers }>, Return | ReturnType<ExtractFunctions<Handlers>>> {
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

                        if (handlers.hasOwnProperty(effect.name)) {
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
    }
    static run<Return>(input: MaybeFunction<Generator<never, Return>>): Return
    static run<Return>(input: MaybeFunction<Generator<Async, Return>>): MaybePromise<Return>
    static run<Return>(input: MaybeFunction<Generator<Async, Return>>): MaybePromise<Return> {
        const process = (result: IteratorResult<Async, Return>): MaybePromise<Return> => {
            if (!result.done) {
                const asyncEff = result.value

                return asyncEff.value.then((value) => {
                    return process(gen.next(value))
                }) as MaybePromise<Return>
            }

            return result.value as MaybePromise<Return>
        }

        const gen = typeof input === 'function' ? input() : input

        return process(gen.next())
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
            value,
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
