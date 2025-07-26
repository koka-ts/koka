import * as Eff from './koka'

export const withResolvers: <T>() => PromiseWithResolvers<T> =
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

export type StreamOptions = {
    maxConcurrency?: number
}

export type TaskProducer<Yield, TaskReturn> = (index: number) => Eff.Task<Yield, TaskReturn> | undefined

export type TaskInputs<Yield, TaskReturn> = TaskProducer<Yield, TaskReturn> | Array<Eff.Task<Yield, TaskReturn>>

export function* stream<Yield extends Eff.AnyEff, TaskReturn, HandlerReturn>(
    inputs: TaskInputs<Yield, TaskReturn>,
    handler: StreamHandler<TaskReturn, HandlerReturn>,
    options?: StreamOptions,
): Generator<Eff.Async | Yield, HandlerReturn> {
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
                Eff.cleanUpGen(item.gen)
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
                const result = yield* Eff.await(Promise.race(promises))

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
                const result = yield* Eff.await(promises[0])

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
): Generator<Eff.ExtractYield<T> | Eff.Async, Eff.ExtractReturn<T>> {
    if (Array.isArray(inputs)) {
        return yield* all(inputs as any) as Generator<Eff.ExtractYield<T>, Eff.ExtractReturn<T>>
    } else {
        const result: Record<string, unknown> = {}
        const gens = [] as Generator<Eff.AnyEff>[]
        const keys = [] as string[]

        for (const [key, value] of Object.entries(inputs)) {
            if (typeof value === 'function') {
                gens.push(value())
            } else if (Eff.isGenerator(value)) {
                gens.push(value as Generator<Eff.AnyEff>)
            } else {
                gens.push(Eff.of(value))
            }
            keys.push(key)
        }

        const values = (yield* all(gens) as any) as unknown[]

        for (let i = 0; i < values.length; i++) {
            result[keys[i]] = values[i]
        }

        return result as Eff.ExtractReturn<T>
    }
}

export type AllOptions = {
    maxConcurrency?: number
}

export function* all<Yield extends Eff.AnyEff, Return>(
    inputs: TaskInputs<Yield, Return>,
    options?: AllOptions,
): Generator<Yield | Eff.Async, Return[]> {
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

export function* race<Yield extends Eff.AnyEff, Return>(
    inputs: TaskInputs<Yield, Return>,
    options?: RaceOptions,
): Generator<Yield | Eff.Async, Return> {
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
