export type Err<Name extends string, T> = {
    type: 'err';
    name: Name;
    error: T;
};
export type AnyErr = Err<string, any>;
export declare const ctxSymbol: unique symbol;
export type CtxSymbol = typeof ctxSymbol;
export type Ctx<Name extends string, T> = {
    type: 'ctx';
    name: Name;
    context: CtxSymbol | T;
};
export type AnyCtx = Ctx<string, any>;
export type Async = {
    type: 'async';
    name?: undefined;
    value: Promise<unknown>;
};
export type EffType<T> = Err<string, T> | Ctx<string, T> | Async;
export type AnyEff = EffType<any>;
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type ToHandler<Effect> = Effect extends Err<infer Name, infer U> ? Record<Name, (error: U) => unknown> : Effect extends Ctx<infer Name, infer U> ? Record<Name, U> : never;
export type EffectHandlers<Effect> = UnionToIntersection<ToHandler<Effect>>;
type ExtractErrorHandlerReturn<Handlers, Eff extends AnyEff> = Eff extends Err<infer Name, infer U> ? Name extends keyof Handlers ? Handlers[Name] extends (error: U) => infer R ? R : never : never : never;
export type ExtractErr<T> = T extends AnyErr ? T : never;
export type ExcludeErr<T> = T extends AnyErr ? never : T;
export type Ok<T> = {
    type: 'ok';
    value: T;
};
export type AnyOk = Ok<any>;
export type Result<T, E> = Ok<T> | (E extends AnyErr ? E : never);
export type AnyResult = Result<any, AnyErr>;
export declare const Result: {
    ok: <T>(value: T) => Ok<T>;
    err: <Name extends string, T>(name: Name, error: T) => Err<Name, T>;
};
type InferOkValue<T> = T extends Ok<infer U> ? U : never;
type MaybeGenerator<T, R> = Generator<T, R> | (() => Generator<T, R>);
type ExtractEff<Effects> = Effects extends [] ? never : Effects extends [infer First, ...infer Rest] ? First extends MaybeFunction<Generator<infer E, any>> ? E | ExtractEff<Rest> : never : never;
type ExtractReturn<Effects> = Effects extends [] ? [] : Effects extends [infer First, ...infer Rest] ? First extends MaybeFunction<Generator<any, infer R>> ? [R, ...ExtractReturn<Rest>] : never : never;
export type MaybePromise<T> = T extends Promise<any> ? T : T | Promise<T>;
export type MaybeFunction<T> = T | (() => T);
declare function Ctx<const Name extends string>(name: Name): {
    new <T>(): {
        type: "ctx";
        name: Name;
        context: CtxSymbol | T;
    };
};
declare function Err<const Name extends string>(name: Name): {
    new <E = void>(error: E): {
        type: "err";
        name: Name;
        error: E;
    };
};
export declare class Eff {
    static err: <const Name extends string>(name: Name) => {
        throw<E = void>(...args: E extends void ? [] : [E]): Generator<Err<Name, E>, never>;
    };
    static Err: typeof Err;
    static throw<E extends AnyErr>(err: E): Generator<E, never>;
    static ctx: <const Name extends string>(name: Name) => {
        get<T>(): Generator<Ctx<Name, T>, T>;
    };
    static Ctx: typeof Ctx;
    static get<C extends AnyCtx>(ctx: C): Generator<C, Exclude<C['context'], CtxSymbol>>;
    static all<const Effects extends MaybeGenerator<AnyEff, unknown>[]>(effects: Effects): Generator<ExtractEff<Effects>, ExtractReturn<Effects>>;
    static try: <Yield extends AnyEff, Return>(input: MaybeFunction<Generator<Yield, Return>>) => {
        catch<Handlers extends Partial<EffectHandlers<Yield>>>(handlers: Handlers): Generator<Exclude<Yield, {
            name: keyof Handlers;
        }>, Return | ExtractErrorHandlerReturn<Handlers, Yield>>;
    };
    static run<Return>(input: MaybeFunction<Generator<never, Return>>): Return;
    static run<Return>(input: MaybeFunction<Generator<Async, Return>>): MaybePromise<Return>;
    static runSync<Return>(effect: MaybeFunction<Generator<never, Return>>): Return;
    static runAsync<Return>(input: MaybeFunction<Generator<Async, Return>>): MaybePromise<Return>;
    static runResult<Yield, Return>(input: MaybeFunction<Generator<Yield, Return>>): Async extends Yield ? MaybePromise<Ok<Return> | ExtractErr<Yield>> : Ok<Return> | ExtractErr<Yield>;
    static await<T>(value: T | Promise<T>): Generator<Async, T>;
    static result<Yield extends AnyEff, Return>(gen: Generator<Yield, Return>): Generator<ExcludeErr<Yield>, Ok<Return> | ExtractErr<Yield>>;
    /**
     * convert a generator to a generator that returns a value
     * move the err from return to throw
     */
    static ok<Yield, Return extends AnyOk | AnyErr>(gen: Generator<Yield, Return>): Generator<Yield | ExtractErr<Return>, InferOkValue<Return>>;
}
export declare const isGenerator: <T = unknown, TReturn = any, TNext = any>(value: unknown) => value is Generator<T, TReturn, TNext>;
export {};
