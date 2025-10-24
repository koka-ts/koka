import { EffSymbol } from './constant.ts'

export type Ctx<Name extends string, T> = {
    type: 'ctx'
    name: Name
    context: EffSymbol | T
}

export type AnyCtx = Ctx<string, any>

export function Ctx<const Name extends string>(name: Name) {
    return class Eff<T> implements Ctx<Name, T> {
        static field: Name = name
        type = 'ctx' as const
        name = name
        context = EffSymbol as EffSymbol | T
    }
}

export type CtxValue<C extends AnyCtx> = Exclude<C['context'], EffSymbol>

export function* get<C extends AnyCtx>(ctx: C | (new () => C)): Generator<C, CtxValue<C>> {
    const context = yield typeof ctx === 'function' ? new ctx() : ctx

    return context as CtxValue<C>
}
