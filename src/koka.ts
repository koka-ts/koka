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

export interface Opt<Name extends string, T> extends Ctx<Name, T> {
    optional: true
}

export type AnyCtx = Ctx<string, any>

export type Async = {
    type: 'async'
    name?: undefined
    promise: Promise<unknown>
}

export type AnyOpt = Opt<string, any>

export type Eff<T> = Err<string, T> | Ctx<string, T> | Opt<string, T> | Async

export type AnyEff = Eff<any>

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

type ToHandler<Effect> = Effect extends Err<infer Name, infer U>
    ? Record<Name, (error: U) => unknown>
    : Effect extends Ctx<infer Name, infer U>
    ? Record<Name, U>
    : never

export type EffectHandlers<Effect> = UnionToIntersection<ToHandler<Effect>>

type ExtractErrorHandlerReturn<Handlers, Eff> = Eff extends Err<infer Name, infer U>
    ? Name extends keyof Handlers
        ? Handlers[Name] extends (error: U) => infer R
            ? R
            : never
        : never
    : never

export type ExtractErr<T> = T extends AnyErr ? T : never

export type ExcludeErr<T> = T extends AnyErr ? never : T

export type Task<Yield, Return> = Generator<Yield, Return> | (() => Generator<Yield, Return>)

export type ExtractYieldFromObject<Gens extends object> = {
    [K in keyof Gens]: Gens[K] extends Task<infer E, any> ? E : never
}[keyof Gens]

export type ExtractYieldFromTuple<Gens> = Gens extends []
    ? never
    : Gens extends [infer Head, ...infer Tail]
    ? Head extends Task<infer Yield, any>
        ? Yield | ExtractYieldFromTuple<Tail>
        : never
    : never

export type ExtractYield<Gens> = Gens extends unknown[]
    ? ExtractYieldFromTuple<Gens>
    : Gens extends object
    ? ExtractYieldFromObject<Gens>
    : never

export type ExtractReturnFromTuple<Gens> = Gens extends []
    ? []
    : Gens extends [infer Head, ...infer Tail]
    ? Head extends Task<any, infer R>
        ? [R, ...ExtractReturnFromTuple<Tail>]
        : [Head, ...ExtractReturnFromTuple<Tail>]
    : never

export type ExtractReturnFromObject<Gens extends object> = {
    [K in keyof Gens]: Gens[K] extends Task<any, infer R> ? R : Gens[K]
}

export type ExtractReturn<Gens> = Gens extends unknown[]
    ? ExtractReturnFromTuple<Gens>
    : Gens extends object
    ? {
          [key in keyof ExtractReturnFromObject<Gens>]: ExtractReturnFromObject<Gens>[key]
      }
    : never

export type MaybePromise<T> = T extends Promise<any> ? T : T | Promise<T>

export type MaybeFunction<T> = T | (() => T)

export function Ctx<const Name extends string>(name: Name) {
    return class Eff<T> {
        static field: Name = name
        type = 'ctx' as const
        name = name
        context = EffSymbol as EffSymbol | T
        optional?: true
    }
}

export function Err<const Name extends string>(name: Name) {
    return class Eff<E = void> {
        static field: Name = name
        type = 'err' as const
        name = name
        error: E
        constructor(error: E) {
            this.error = error
        }
    }
}

export function Opt<const Name extends string>(name: Name) {
    return class Eff<T> extends Ctx(name)<T> {
        optional = true as const
        context = EffSymbol as EffSymbol | T
    }
}

export type CtxValue<C extends AnyCtx> = C['optional'] extends true
    ? Exclude<C['context'], EffSymbol> | undefined
    : Exclude<C['context'], EffSymbol>

function* throwError<E extends AnyErr>(err: E): Generator<E, never> {
    yield err
    /* istanbul ignore next */
    throw new Error(`Unexpected resumption of error effect [${err.name}]`)
}

export { throwError as throw }

export function* of<T>(value: T) {
    return value
}

export function* get<C extends AnyCtx>(ctx: C | (new () => C)): Generator<C, CtxValue<C>> {
    const context = yield typeof ctx === 'function' ? new ctx() : ctx

    return context as CtxValue<C>
}

export const cleanUpGen = <Yield, Return, Next>(gen: Generator<Yield, Return, Next>) => {
    const result = (gen as Generator<Yield, Return | undefined, Next>).return(undefined)

    if (!result.done) {
        throw new Error(`You can not use yield in the finally block of a generator`)
    }
}

function tryEffect<Yield extends AnyEff, Return>(input: Task<Yield, Return>) {
    return {
        *handle<Handlers extends Partial<EffectHandlers<Yield>>>(
            handlers: Handlers,
        ): Task<Exclude<Yield, { name: keyof Handlers }>, Return | ExtractErrorHandlerReturn<Handlers, Yield>> {
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
            } finally {
                cleanUpGen(gen)
            }
        },
    }
}

export { tryEffect as try }

export function run<Return>(input: MaybeFunction<Generator<AnyOpt, Return>>): Return
export function run<Return>(input: MaybeFunction<Generator<Async | AnyOpt, Return>>): MaybePromise<Return>
export function run<Return>(input: MaybeFunction<Generator<Async | AnyOpt, Return>>): MaybePromise<Return> {
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

export function runSync<Return>(effect: MaybeFunction<Generator<AnyOpt, Return>>): Return {
    const result = run(effect)

    if (result instanceof Promise) {
        throw new Error('Expected synchronous effect, but got asynchronous effect')
    }

    return result
}

export function runAsync<Return>(input: MaybeFunction<Generator<Async | AnyOpt, Return>>): Promise<Return> {
    return Promise.resolve(run(input))
}

function* awaitEffect<T>(value: T | Promise<T>): Generator<Async, T> {
    if (!(value instanceof Promise)) {
        return value
    }

    const result = yield {
        type: 'async',
        promise: value,
    }

    return result as T
}

export { awaitEffect as await }

export const isGenerator = <T = unknown, TReturn = any, TNext = any>(
    value: unknown,
): value is Generator<T, TReturn, TNext> => {
    return typeof value === 'object' && value !== null && 'next' in value && 'throw' in value
}
