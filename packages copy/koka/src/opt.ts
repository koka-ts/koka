import { EffSymbol } from './constant.ts'

export type Opt<Name extends string, T> = {
    type: 'opt'
    name: Name
    context: EffSymbol | T
}

export type AnyOpt = Opt<string, any>

export function Opt<const Name extends string>(name: Name) {
    return class Eff<T> implements Opt<Name, T> {
        static field: Name = name
        type = 'opt' as const
        name = name
        context = EffSymbol as EffSymbol | T
    }
}

export type OptValue<O extends AnyOpt> = Exclude<O['context'], EffSymbol> | undefined

export function* get<O extends AnyOpt>(
    opt: O | (new () => O),
): Generator<O, Exclude<O['context'], EffSymbol> | undefined> {
    const optValue = yield typeof opt === 'function' ? new opt() : opt

    return optValue as OptValue<O>
}
