import * as Eff from './koka'

export type Msg<Name extends string, T> = {
    type: 'msg'
    name: Name
    message: T | Eff.EffSymbol
}

export type AnyMsg = Msg<string, any>

export type AnyEff = Eff.AnyEff | Msg<string, any>

export interface SendMsg<Name extends string, T> extends Msg<Name, T> {
    message: T
}

export interface WaitMsg<Name extends string, T> extends Msg<Name, T> {
    message: Eff.EffSymbol
}

export abstract class AbstractMsg<T> {
    static field: string = ''
    type = 'msg' as const
    abstract name: string
    message: T | Eff.EffSymbol
    constructor(...args: T extends undefined | void ? [] : [T]) {
        this.message = args[0] as T | Eff.EffSymbol
    }
}

export function Msg<const Name extends string>(name: Name) {
    return class Eff<T> extends AbstractMsg<T> {
        static field: Name = name
        name = name
    }
}

export interface Wait<T extends AbstractMsg<any>> {
    type: 'msg'
    name: T['name']
    message: Eff.EffSymbol
}

export type MsgValue<M extends AnyMsg> = M extends Msg<string, infer T> ? T : never

type ExtractMsgMessage<T> = T extends Msg<string, infer U> ? U : never

export function* send<T extends SendMsg<string, unknown>>(message: T): Generator<T, void> {
    yield message
}

export function* wait<MsgCtor extends typeof AbstractMsg<unknown>>(
    msg: MsgCtor,
): Generator<Wait<InstanceType<MsgCtor>>, ExtractMsgMessage<InstanceType<MsgCtor>>> {
    const message = yield {
        type: 'msg',
        name: msg.field,
        message: Eff.EffSymbol,
    } as Wait<InstanceType<MsgCtor>>

    return message as ExtractMsgMessage<InstanceType<MsgCtor>>
}

export function* communicate<const T extends {}>(
    inputs: T,
): Generator<Exclude<Eff.ExtractYield<T>, { type: 'msg' }>, Eff.ExtractReturn<T>> {
    const gens = {} as Record<string, Generator<AnyEff, unknown>>
    const results = {} as Record<string, unknown>

    for (const [key, value] of Object.entries(inputs)) {
        if (typeof value === 'function') {
            gens[key] = value()
        } else if (Eff.isGenerator(value)) {
            gens[key] = value as Generator<AnyEff, unknown>
        } else {
            gens[key] = Eff.of(value)
        }
    }

    type SendStorageValue = {
        type: 'send'
        name: string
        key: string
        gen: Generator<AnyEff, unknown>
        message: unknown
    }

    type WaitStorageValue = {
        type: 'wait'
        name: string
        key: string
        gen: Generator<AnyEff, unknown>
    }

    const sendStorage = {} as Record<string, SendStorageValue>
    const waitStorage = {} as Record<string, WaitStorageValue>

    const queue = [] as (SendStorageValue | WaitStorageValue)[]

    const process = function* (
        key: string,
        gen: Generator<AnyEff, unknown>,
        result: IteratorResult<AnyEff, unknown>,
    ): Generator<AnyEff, void> {
        while (!result.done) {
            const effect = result.value

            if (effect.type === 'msg') {
                // Send a message
                if (effect.message !== Eff.EffSymbol) {
                    if (effect.name in waitStorage) {
                        const waitItem = waitStorage[effect.name]
                        delete waitStorage[effect.name]
                        queue.splice(queue.indexOf(waitItem), 1)
                        yield* process(waitItem.key, waitItem.gen, waitItem.gen.next(effect.message))
                        result = gen.next()
                    } else {
                        sendStorage[effect.name] = {
                            type: 'send',
                            name: effect.name,
                            key,
                            gen,
                            message: effect.message,
                        }
                        queue.push(sendStorage[effect.name])
                        return
                    }
                } else {
                    // Receive a message
                    if (effect.name in sendStorage) {
                        const sendedItem = sendStorage[effect.name]
                        delete sendStorage[effect.name]
                        queue.splice(queue.indexOf(sendedItem), 1)
                        yield* process(key, gen, gen.next(sendedItem.message))
                        yield* process(sendedItem.key, sendedItem.gen, sendedItem.gen.next())
                        return
                    } else {
                        waitStorage[effect.name] = {
                            type: 'wait',
                            name: effect.name,
                            key,
                            gen,
                        }
                        queue.push(waitStorage[effect.name])
                    }
                    return
                }
            } else {
                result = gen.next(yield effect)
            }
        }

        results[key] = result.value
    }

    try {
        for (const [key, gen] of Object.entries(gens)) {
            yield* process(key, gen, gen.next()) as any
        }

        while (queue.length > 0) {
            const item = queue.shift()!

            if (item.type === 'send') {
                yield* process(
                    item.key,
                    item.gen,
                    item.gen.throw(new Error(`Message '${item.name}' sent by '${item.key}' was not received`)),
                ) as any
            } else {
                yield* process(
                    item.key,
                    item.gen,
                    item.gen.throw(new Error(`Message '${item.name}' waited by '${item.key}' was not sent`)),
                ) as any
            }
        }

        if (Object.keys(results).length !== Object.keys(gens).length) {
            throw new Error(`Some messages were not processed: ${JSON.stringify(Object.keys(gens))}`)
        }

        return results as Eff.ExtractReturn<T>
    } finally {
        for (const gen of Object.values(gens)) {
            Eff.cleanUpGen(gen)
        }
    }
}
