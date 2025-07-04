export type Err<Name extends string, T> = {
    type: 'err'
    name: Name
    error: T
}
export type AnyErr = Err<string, any>
export declare const EffSymbol: unique symbol
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
export type Msg<Name extends string, T> = {
    type: 'msg'
    name: Name
    message?: T
}
export type AnyMsg = Msg<string, any>
export interface SendMsg<Name extends string, T> extends Msg<Name, T> {
    message: T
}
export interface WaitMsg<Name extends string, T> extends Msg<Name, T> {
    message?: undefined
}
export type EffType<T> = Err<string, T> | Ctx<string, T> | Opt<string, T> | Async | Msg<string, T>
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
export declare const Result: {
    ok: <T>(value: T) => Ok<T>
    err: <Name extends string, T>(name: Name, error: T) => Err<Name, T>
}
export type InferOkValue<T> = T extends Ok<infer U> ? U : never
export type Task<Yield extends AnyEff, Return> = Generator<Yield, Return> | (() => Generator<Yield, Return>)
type ExtractYieldFromObject<Gens extends object> = {
    [K in keyof Gens]: Gens[K] extends Task<infer E, any> ? E : never
}[keyof Gens]
type ExtractYieldFromTuple<Gens> = Gens extends []
    ? never
    : Gens extends [infer Head, ...infer Tail]
    ? Head extends Task<infer Yield, any>
        ? Yield | ExtractYieldFromTuple<Tail>
        : never
    : never
type ExtractYield<Gens> = Gens extends unknown[]
    ? ExtractYieldFromTuple<Gens>
    : Gens extends object
    ? ExtractYieldFromObject<Gens>
    : never
type ExtractReturnFromTuple<Gens> = Gens extends []
    ? []
    : Gens extends [infer Head, ...infer Tail]
    ? Head extends Task<any, infer R>
        ? [R, ...ExtractReturnFromTuple<Tail>]
        : [Head, ...ExtractReturnFromTuple<Tail>]
    : never
type ExtractReturnFromObject<Gens extends object> = {
    [K in keyof Gens]: Gens[K] extends Task<any, infer R> ? R : Gens[K]
}
type ExtractReturn<Gens> = Gens extends unknown[]
    ? ExtractReturnFromTuple<Gens>
    : Gens extends object
    ? {
          [key in keyof ExtractReturnFromObject<Gens>]: ExtractReturnFromObject<Gens>[key]
      }
    : never
export type MaybePromise<T> = T extends Promise<any> ? T : T | Promise<T>
export type MaybeFunction<T> = T | (() => T)
declare function Ctx<const Name extends string>(
    name: Name,
): {
    new <T>(): {
        type: 'ctx'
        name: Name
        context: EffSymbol | T
        optional?: true
    }
    field: Name
}
declare function Err<const Name extends string>(
    name: Name,
): {
    new <E = void>(error: E): {
        type: 'err'
        name: Name
        error: E
    }
    field: Name
}
declare function Opt<const Name extends string>(
    name: Name,
): {
    new <T>(): {
        optional: true
        context: EffSymbol | T
        type: 'ctx'
        name: Name
    }
    field: Name
}
declare abstract class AbstractMsg<T> {
    static field: string
    type: 'msg'
    abstract name: string
    message: T
    constructor(message: T)
}
declare function Msg<const Name extends string>(
    name: Name,
): {
    new <T>(message: T): {
        name: Name
        type: 'msg'
        message: T
    }
    field: Name
}
interface Wait<T extends AbstractMsg<any>> {
    type: 'msg'
    name: T['name']
    message?: undefined
}
export type CtxValue<C extends AnyCtx> = C['optional'] extends true
    ? Exclude<C['context'], EffSymbol> | undefined
    : Exclude<C['context'], EffSymbol>
export type MsgValue<M extends AnyMsg> = M extends Msg<string, infer T> ? T : never
export type StreamResult<T> = {
    index: number
    value: T
}
export type StreamResults<TaskReturn> = AsyncGenerator<StreamResult<TaskReturn>, void, void>
export type StreamHandler<TaskReturn, HandlerReturn> = (results: StreamResults<TaskReturn>) => Promise<HandlerReturn>
export declare class Eff {
    static err: <const Name extends string>(
        name: Name,
    ) => {
        throw<E = void>(...args: E extends void ? [] : [E]): Generator<Err<Name, E>, never>
    }
    static Err: typeof Err
    static throw<E extends AnyErr>(err: E): Generator<E, never>
    static ctx: <const Name extends string>(
        name: Name,
    ) => {
        get<T>(): Generator<Ctx<Name, T>, T>
        opt<T>(): Generator<Opt<Name, T>, T | undefined>
    }
    static Ctx: typeof Ctx
    static Opt: typeof Opt
    static get<C extends AnyCtx>(ctx: C | (new () => C)): Generator<C, CtxValue<C>>
    static msg: <const Name extends string>(
        name: Name,
    ) => {
        send<T>(message: T): Generator<SendMsg<Name, T>, void>
        wait<T>(): Generator<WaitMsg<Name, T>, T>
    }
    static Msg: typeof Msg
    static send<T extends SendMsg<string, unknown>>(message: T): Generator<T, void>
    static wait<MsgCtor extends typeof AbstractMsg<unknown>>(
        msg: MsgCtor,
    ): Generator<Wait<InstanceType<MsgCtor>>, InstanceType<MsgCtor>['message']>
    static communicate<const T extends {}>(
        inputs: T,
    ): Generator<
        Exclude<
            ExtractYield<T>,
            {
                type: 'msg'
            }
        >,
        ExtractReturn<T>
    >
    static of<T>(value: T): Generator<never, T, unknown>
    static stream<Yield extends AnyEff, TaskReturn, HandlerReturn>(
        inputs: Iterable<Task<Yield, TaskReturn>>,
        handler: StreamHandler<TaskReturn, HandlerReturn>,
    ): Generator<Async | Yield, HandlerReturn>
    static combine<const T extends unknown[] | readonly unknown[] | {}>(
        inputs: T,
    ): Generator<ExtractYield<T> | Async, ExtractReturn<T>>
    static all<Yield extends AnyEff, Return>(inputs: Iterable<Task<Yield, Return>>): Generator<Yield | Async, Return[]>
    static race<Yield extends AnyEff, Return>(inputs: Iterable<Task<Yield, Return>>): Generator<Yield | Async, Return>
    static try: <Yield extends AnyEff, Return>(
        input: Task<Yield, Return>,
    ) => {
        handle<Handlers extends Partial<EffectHandlers<Yield>>>(
            handlers: Handlers,
        ): Task<
            Exclude<
                Yield,
                {
                    name: keyof Handlers
                }
            >,
            Return | ExtractErrorHandlerReturn<Handlers, Yield>
        >
    }
    static run<Return>(input: MaybeFunction<Generator<AnyOpt, Return>>): Return
    static run<Return>(input: MaybeFunction<Generator<Async | AnyOpt, Return>>): MaybePromise<Return>
    static runSync<Return>(effect: MaybeFunction<Generator<AnyOpt, Return>>): Return
    static runAsync<Return>(input: MaybeFunction<Generator<Async | AnyOpt, Return>>): Promise<Return>
    static runResult<Yield, Return>(
        input: MaybeFunction<Generator<Yield, Return>>,
    ): Async extends Yield ? MaybePromise<Ok<Return> | ExtractErr<Yield>> : Ok<Return> | ExtractErr<Yield>
    static await<T>(value: T | Promise<T>): Generator<Async, T>
    static result<Yield extends AnyEff, Return>(
        gen: Generator<Yield, Return>,
    ): Generator<ExcludeErr<Yield>, Ok<Return> | ExtractErr<Yield>>
    /**
     * convert a generator to a generator that returns a value
     * move the err from return to throw
     */
    static ok<Yield, Return extends AnyOk | AnyErr>(
        gen: Generator<Yield, Return>,
    ): Generator<Yield | ExtractErr<Return>, InferOkValue<Return>>
}
export declare const isGenerator: <T = unknown, TReturn = any, TNext = any>(
    value: unknown,
) => value is Generator<T, TReturn, TNext>
export {}
