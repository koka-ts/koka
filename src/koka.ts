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

export type Msg<Name extends string, T> = {
    type: 'msg'
    name: Name
    message: T | EffSymbol
}

export type AnyMsg = Msg<string, any>

export interface SendMsg<Name extends string, T> extends Msg<Name, T> {
    message: T
}

export interface WaitMsg<Name extends string, T> extends Msg<Name, T> {
    message: EffSymbol
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

abstract class AbstractMsg<T> {
    static field: string = ''
    type = 'msg' as const
    abstract name: string
    message: T | EffSymbol
    constructor(...args: T extends undefined | void ? [] : [T]) {
        this.message = args[0] as T | EffSymbol
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
    message: EffSymbol
}

export type CtxValue<C extends AnyCtx> = C['optional'] extends true
    ? Exclude<C['context'], EffSymbol> | undefined
    : Exclude<C['context'], EffSymbol>

export type MsgValue<M extends AnyMsg> = M extends Msg<string, infer T> ? T : never

const cleanUpGen = <Yield, Return, Next>(gen: Generator<Yield, Return, Next>) => {
    const result = (gen as Generator<Yield, Return | undefined, Next>).return(undefined)

    if (!result.done) {
        throw new Error(`You can not use yield in the finally block of a generator`)
    }
}

const withResolvers: <T>() => PromiseWithResolvers<T> =
    Promise.withResolvers?.bind(Promise) ??
    (<T>() => {
        let resolve: (value: T) => void
        let reject: (reason?: any) => void

        const promise = new Promise<T>((res, rej) => {
            resolve = res
            reject = rej
        })

        // @ts-ignore as expected
        return { promise, resolve, reject }
    })

export type StreamResult<T> = {
    index: number
    value: T
}

export type StreamResults<TaskReturn> = AsyncGenerator<StreamResult<TaskReturn>, void, void>

export type StreamHandler<TaskReturn, HandlerReturn> = (results: StreamResults<TaskReturn>) => Promise<HandlerReturn>

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

export function* send<T extends SendMsg<string, unknown>>(message: T): Generator<T, void> {
    yield message
}

type ExtractMsgMessage<T> = T extends Msg<string, infer U> ? U : never

export function* wait<MsgCtor extends typeof AbstractMsg<unknown>>(
    msg: MsgCtor,
): Generator<Wait<InstanceType<MsgCtor>>, ExtractMsgMessage<InstanceType<MsgCtor>>> {
    const message = yield {
        type: 'msg',
        name: msg.field,
        message: EffSymbol,
    } as Wait<InstanceType<MsgCtor>>

    return message as ExtractMsgMessage<InstanceType<MsgCtor>>
}

export function* communicate<const T extends {}>(
    inputs: T,
): Generator<Exclude<ExtractYield<T>, { type: 'msg' }>, ExtractReturn<T>> {
    const gens = {} as Record<string, Generator<AnyEff, unknown>>
    const results = {} as Record<string, unknown>

    for (const [key, value] of Object.entries(inputs)) {
        if (typeof value === 'function') {
            gens[key] = value()
        } else if (isGenerator(value)) {
            gens[key] = value as Generator<AnyEff, unknown>
        } else {
            gens[key] = of(value)
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
                if (effect.message !== EffSymbol) {
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

        return results as ExtractReturn<T>
    } finally {
        for (const gen of Object.values(gens)) {
            cleanUpGen(gen)
        }
    }
}

export type StreamOptions = {
    maxConcurrency?: number
}

export type TaskProducer<Yield extends AnyEff, TaskReturn> = (index: number) => Task<Yield, TaskReturn> | undefined

export type TaskInputs<Yield extends AnyEff, TaskReturn> =
    | TaskProducer<Yield, TaskReturn>
    | Array<Task<Yield, TaskReturn>>

export function* stream<Yield extends AnyEff, TaskReturn, HandlerReturn>(
    inputs: TaskInputs<Yield, TaskReturn>,
    handler: StreamHandler<TaskReturn, HandlerReturn>,
    options?: StreamOptions,
): Generator<Async | Yield, HandlerReturn> {
    const config = {
        maxConcurrency: Number.POSITIVE_INFINITY,
        ...options,
    }

    if (config.maxConcurrency < 1) {
        throw new Error(`maxConcurrency must be greater than 0`)
    }

    const producer: TaskProducer<Yield, TaskReturn> = typeof inputs === 'function' ? inputs : (index) => inputs[index]

    type ProcessingItem = {
        type: 'initial'
        gen: Generator<Yield, TaskReturn>
        index: number
    }

    type ProcessedItem = {
        type: 'completed'
        index: number
        gen: Generator<Yield, TaskReturn>
        value: TaskReturn
    }

    type ProcessItem = ProcessingItem | ProcessedItem

    type ProcessOk = {
        type: 'ok'
        item: ProcessItem
        value: unknown
    }

    type ProcessErr = {
        type: 'err'
        item: ProcessItem
        error: unknown
    }

    type ProcessResult = ProcessOk | ProcessErr

    const items = [] as ProcessItem[]

    let count = 0
    let noTask = false
    const getNextTask = () => {
        if (noTask) {
            return undefined
        }

        const task = producer(count++)

        if (!task) {
            noTask = true
            return
        }

        const gen = typeof task === 'function' ? task() : task

        return gen
    }

    while (count < config.maxConcurrency) {
        const gen = getNextTask()

        if (!gen) {
            break
        }

        items.push({
            type: 'initial',
            gen,
            index: items.length,
        })
    }

    let controller = withResolvers<void>()

    const processedItems = [] as ProcessedItem[]

    async function* createAsyncGen(): StreamResults<TaskReturn> {
        let count = 0

        while (count < items.length) {
            await controller.promise
            while (processedItems.length > 0) {
                const item = processedItems.shift()!
                yield {
                    index: item.index,
                    value: item.value,
                }
                count++
            }
        }
    }

    const asyncGen = createAsyncGen()

    const cleanUpAllGen = () => {
        // Clean up any remaining items
        for (const item of items) {
            if (item.type !== 'completed') {
                cleanUpGen(item.gen)
            }
        }
    }

    type HandlerOk = {
        type: 'ok'
        value: HandlerReturn
    }

    type HandlerErr = {
        type: 'err'
        error: unknown
    }

    type HandlerResult = HandlerOk | HandlerErr

    try {
        const promises: Promise<void | HandlerResult>[] = []
        const processResults: ProcessResult[] = []

        const wrapPromise = (promise: Promise<unknown>, item: ProcessItem): Promise<void> => {
            const wrappedPromise: Promise<void> = promise.then(
                (value) => {
                    promises.splice(promises.indexOf(wrappedPromise), 1)
                    processResults.push({
                        type: 'ok',
                        item,
                        value,
                    })
                },
                (error: unknown) => {
                    promises.splice(promises.indexOf(wrappedPromise), 1)
                    processResults.push({
                        type: 'err',
                        item,
                        error,
                    })
                },
            )

            promises.push(wrappedPromise)

            return wrappedPromise
        }

        const processItem = function* (
            item: ProcessItem,
            result: IteratorResult<Yield, TaskReturn>,
        ): Generator<any, void, unknown> {
            while (!result.done) {
                const effect = result.value

                if (effect.type === 'async') {
                    wrapPromise(effect.promise, item)
                    return
                } else {
                    result = item.gen.next(yield effect)
                }
            }

            if (item.type === 'initial') {
                const processedItem: ProcessedItem = {
                    type: 'completed',
                    index: item.index,
                    gen: item.gen,
                    value: result.value,
                }
                items[item.index] = processedItem
                processedItems.push(processedItem)

                const gen = getNextTask()

                if (!gen) {
                    return
                }

                const newItem: ProcessItem = {
                    type: 'initial',
                    gen,
                    index: items.length,
                }

                items.push(newItem)

                yield* processItem(newItem, newItem.gen.next())
            } else if (item.type === 'completed') {
                throw new Error(
                    `Unexpected completion of item that was already completed: ${JSON.stringify(item, null, 2)}`,
                )
            } else {
                item satisfies never
                throw new Error(`Unexpected item type: ${JSON.stringify(item, null, 2)}`)
            }
        }

        let handlerResult: HandlerResult | undefined

        const handlerPromise = handler(asyncGen).then(
            (value) => {
                handlerResult = {
                    type: 'ok',
                    value,
                }
                return handlerResult
            },
            (error) => {
                handlerResult = {
                    type: 'err',
                    error,
                }
                return handlerResult
            },
        )

        promises.push(handlerPromise)

        for (const item of items) {
            yield* processItem(item, item.gen.next())
        }

        while (promises.length > 0) {
            if (handlerResult) {
                break
            }

            if (promises.length !== 1) {
                const result = yield* awaitEffect(Promise.race(promises))

                if (result) {
                    break
                }
            }

            while (processResults.length > 0) {
                const processResult = processResults.shift()!
                const item = processResult.item

                let result: IteratorResult<Yield, TaskReturn>

                if (processResult.type === 'ok') {
                    result = item.gen.next(processResult.value)
                } else {
                    result = item.gen.throw(processResult.error)
                }

                yield* processItem(item, result)
            }

            if (processedItems.length > 0) {
                // Resolve the controller to allow the async generator to yield
                const previousController = controller
                controller = withResolvers()
                previousController.resolve()
            }

            if (promises.length === 1) {
                const result = yield* awaitEffect(promises[0])

                if (result) {
                    break
                }
            }
        }

        if (!handlerResult) {
            throw new Error(`Handler did not resolve or reject`)
        }

        if (handlerResult.type === 'err') {
            throw handlerResult.error
        } else {
            return handlerResult.value
        }
    } finally {
        cleanUpAllGen()
    }
}

export function* combine<const T extends unknown[] | readonly unknown[] | {}>(
    inputs: T,
): Generator<ExtractYield<T> | Async, ExtractReturn<T>> {
    if (Array.isArray(inputs)) {
        return yield* all(inputs as any) as Generator<ExtractYield<T>, ExtractReturn<T>>
    } else {
        const result: Record<string, unknown> = {}
        const gens = [] as Generator<AnyEff>[]
        const keys = [] as string[]

        for (const [key, value] of Object.entries(inputs)) {
            if (typeof value === 'function') {
                gens.push(value())
            } else if (isGenerator(value)) {
                gens.push(value as Generator<AnyEff>)
            } else {
                gens.push(of(value))
            }
            keys.push(key)
        }

        const values = (yield* all(gens) as any) as unknown[]

        for (let i = 0; i < values.length; i++) {
            result[keys[i]] = values[i]
        }

        return result as ExtractReturn<T>
    }
}

export type AllOptions = {
    maxConcurrency?: number
}

export function* all<Yield extends AnyEff, Return>(
    inputs: TaskInputs<Yield, Return>,
    options?: AllOptions,
): Generator<Yield | Async, Return[]> {
    const results = yield* stream(
        inputs,
        async (stream) => {
            const results = [] as Return[]

            for await (const { index, value } of stream) {
                results[index] = value
            }

            return results
        },
        options,
    )

    return results
}

export type RaceOptions = {
    maxConcurrency?: number
}

export function* race<Yield extends AnyEff, Return>(
    inputs: TaskInputs<Yield, Return>,
    options?: RaceOptions,
): Generator<Yield | Async, Return> {
    const result = yield* stream(
        inputs,
        async (stream) => {
            for await (const { value } of stream) {
                return value
            }

            throw new Error(`No results in race`)
        },
        options,
    )

    return result
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
                    } else if (effect.type === 'async') {
                        result = gen.next(yield effect as any)
                    } else if (effect.type === 'msg') {
                        result = gen.next(yield effect as any)
                    } else {
                        effect satisfies never
                        throw new Error(`Unexpected effect: ${JSON.stringify(effect, null, 2)}`)
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

export function runResult<Yield, Return>(
    input: MaybeFunction<Generator<Yield, Return>>,
): Async extends Yield ? MaybePromise<Ok<Return> | ExtractErr<Yield>> : Ok<Return> | ExtractErr<Yield> {
    const gen = typeof input === 'function' ? input() : input

    // @ts-ignore expected
    return run(result(gen))
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

export function* result<Yield extends AnyEff, Return>(
    gen: Generator<Yield, Return>,
): Generator<ExcludeErr<Yield>, Ok<Return> | ExtractErr<Yield>> {
    try {
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
    } finally {
        cleanUpGen(gen)
    }
}

/**
 * convert a generator to a generator that returns a value
 * move the err from return to throw
 */
export function* ok<Yield, Return extends AnyOk | AnyErr>(
    gen: Generator<Yield, Return>,
): Generator<Yield | ExtractErr<Return>, InferOkValue<Return>> {
    const result = yield* gen

    if (result.type === 'ok') {
        return result.value
    } else {
        throw yield result as ExtractErr<Return>
    }
}

export const isGenerator = <T = unknown, TReturn = any, TNext = any>(
    value: unknown,
): value is Generator<T, TReturn, TNext> => {
    return typeof value === 'object' && value !== null && 'next' in value && 'throw' in value
}
