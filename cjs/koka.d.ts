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
    [ctxSymbol]?: T;
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
type AnyFn = (...args: any[]) => any;
type ExtractFunctions<Handlers> = {
    [key in keyof Handlers]: Handlers[key] extends AnyFn ? Handlers[key] : never;
}[keyof Handlers];
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
export type MaybePromise<T> = T extends Promise<any> ? T : T | Promise<T>;
export type MaybeFunction<T> = T | (() => T);
export declare class Eff {
    static err: <Name extends string>(name: Name) => {
        throw<E = void>(...args: void extends E ? [] : [E]): Generator<Err<Name, E>, never>;
    };
    static ctx: <Name extends string>(name: Name) => {
        get<T>(): Generator<Ctx<Name, T>, T>;
    };
    static try: <Yield extends AnyEff, Return>(input: MaybeFunction<Generator<Yield, Return>>) => {
        catch<Handlers extends Partial<EffectHandlers<Yield>> | {}>(handlers: Handlers): Generator<Exclude<Yield, {
            name: keyof Handlers;
        }>, Return | ReturnType<ExtractFunctions<Handlers>>>;
    };
    static run<Return>(input: MaybeFunction<Generator<never, Return>>): Return;
    static run<Return>(input: MaybeFunction<Generator<Async, Return>>): MaybePromise<Return>;
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
