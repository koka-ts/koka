import * as Async from './async.ts'
import * as Gen from './gen.ts'
import * as Koka from './koka.ts'
import { withResolvers } from './util.ts'

type StreamOptions<T> = {
    onDone?: () => void
}

function createStream<T>(options?: StreamOptions<T>) {
    const ctrl = {
        next: withResolvers<'next'>(),
        done: withResolvers<'done'>(),
    }

    const values = [] as T[]

    const next = (value: T) => {
        values.push(value)
        // Resolve the controller to allow the async generator to yield
        const previousNext = ctrl.next
        ctrl.next = withResolvers()
        previousNext.resolve('next')
    }

    const done = () => {
        ctrl.done.resolve('done')
    }

    async function* createAsyncGen() {
        try {
            while (true) {
                const status = await Promise.race([ctrl.next.promise, ctrl.done.promise])

                while (values.length > 0) {
                    const value = values.shift()!
                    yield value
                }

                if (status === 'done') {
                    return
                }
            }
        } finally {
            /**
             * ensure onDone is called even if the stream is aborted
             * whether the async generator is aborted via early return/throw/break in for-await-of loop
             * or via ctrl.done.resolve('done')
             */
            options?.onDone?.()
        }
    }

    const gen = createAsyncGen()

    return {
        next,
        done,
        gen,
    }
}

export type TaskProducer<Yield, TaskReturn> = (index: number) => Koka.Effector<Yield, TaskReturn> | undefined

export type TaskSource<Yield, TaskReturn> = TaskProducer<Yield, TaskReturn> | Array<Koka.Effector<Yield, TaskReturn>>

export type TaskResult<TaskReturn> = {
    index: number
    value: TaskReturn
}

export type TaskResultStream<TaskReturn> = AsyncIterableIterator<TaskResult<TaskReturn>, void, void>

export type TaskResultsHandler<TaskReturn, HandlerReturn, TaskYield extends Koka.AnyEff> = (
    stream: TaskResultStream<TaskReturn>,
) => Promise<HandlerReturn>

const createTaskConsumer = <TaskReturn, Yield extends Koka.AnyEff = never>(inputs: TaskSource<Yield, TaskReturn>) => {
    const producer: TaskProducer<Yield, TaskReturn> = typeof inputs === 'function' ? inputs : (index) => inputs[index]

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

        const gen = Koka.readEffector(task)

        return gen
    }

    return {
        next: getNextTask,
    }
}

export function* series<
    TaskReturn,
    HandlerReturn,
    TaskYield extends Koka.AnyEff = never,
    Yield extends Koka.AnyEff = never,
>(
    inputs: TaskSource<Yield, TaskReturn>,
    handler: TaskResultsHandler<TaskReturn, HandlerReturn, TaskYield>,
): Generator<Yield | TaskYield | Async.Async | Koka.Final, HandlerReturn> {
    return yield* concurrent(inputs, handler, {
        maxConcurrency: 1,
    })
}

export function* parallel<
    TaskReturn,
    HandlerReturn,
    TaskYield extends Koka.AnyEff = never,
    Yield extends Koka.AnyEff = never,
>(
    inputs: TaskSource<Yield, TaskReturn>,
    handler: TaskResultsHandler<TaskReturn, HandlerReturn, TaskYield>,
): Generator<Yield | TaskYield | Async.Async | Koka.Final, HandlerReturn> {
    return yield* concurrent(inputs, handler, {
        maxConcurrency: Number.POSITIVE_INFINITY,
    })
}

export type ConcurrentOptions = {
    maxConcurrency?: number
}

export function* concurrent<
    TaskReturn,
    HandlerReturn,
    TaskYield extends Koka.AnyEff = never,
    Yield extends Koka.AnyEff = never,
>(
    inputs: TaskSource<Yield, TaskReturn>,
    handler: TaskResultsHandler<TaskReturn, HandlerReturn, TaskYield>,
    options?: ConcurrentOptions,
): Generator<Async.Async | Yield | TaskYield | Koka.Final, HandlerReturn> {
    const config = {
        maxConcurrency: Number.POSITIVE_INFINITY,
        ...options,
    }

    if (config.maxConcurrency < 1) {
        throw new Error(`maxConcurrency must be greater than 0`)
    }

    type ProcessingItem = {
        type: 'initial'
        gen: Generator<Yield, TaskReturn>
        index: number
    }

    type ProcessedItem = {
        type: 'completed'
        index: number
        gen: Generator<Yield, TaskReturn>
    }

    type ProcessItem = ProcessingItem | ProcessedItem

    const items = [] as ProcessItem[]

    const consumer = createTaskConsumer(inputs)

    while (items.length < config.maxConcurrency) {
        const gen = consumer.next()

        if (!gen) {
            break
        }

        items.push({
            type: 'initial',
            gen,
            index: items.length,
        })
    }

    let isCleaningUp = false
    const cleanUpAllGen = function* (): Generator<Yield | Koka.Final | Async.Async, void> {
        if (isCleaningUp) {
            return
        }

        isCleaningUp = true

        const cleanups = [] as Generator<Yield | Koka.Final | Async.Async, void>[]
        // Clean up any remaining items
        for (const item of items) {
            if (item.type !== 'completed') {
                const result: IteratorResult<Yield, TaskReturn> = (item.gen as any).return(undefined)
                if (!result.done) {
                    cleanups.push(Koka.cleanUpGen(item.gen, result))
                }
            }
        }

        if (cleanups.length === 0) {
            return
        }

        if (cleanups.length === 1) {
            yield* cleanups[0]
            return
        }

        for (const cleanup of cleanups) {
            yield* cleanup
        }
    }

    const promiseMap: Map<ProcessItem, Promise<void>> = new Map()
    const pendingItemProcessingList: Generator<Yield, void>[] = []

    let isStreamDone = false
    const stream = createStream<TaskResult<TaskReturn>>({
        onDone: () => {
            isStreamDone = true
        },
    })

    const resultPromise = handler(stream.gen)

    let isResultSettled = false

    resultPromise.then(
        () => {
            isResultSettled = true
        },
        () => {
            isResultSettled = true
        },
    )

    const addPromise = (promise: Promise<unknown>, item: ProcessItem) => {
        const newPromise = promise.then(
            (value) => {
                promiseMap.delete(item)

                if (isCleaningUp || isStreamDone || isResultSettled) {
                    return
                }

                const result = item.gen.next(value)
                pendingItemProcessingList.push(processItem(item, result))
            },
            (error: unknown) => {
                promiseMap.delete(item)

                if (isCleaningUp || isStreamDone || isResultSettled) {
                    return
                }

                const result = item.gen.throw(error)
                pendingItemProcessingList.push(processItem(item, result))
            },
        )

        promiseMap.set(item, newPromise)

        return newPromise
    }

    const processItem = function* (
        item: ProcessItem,
        result: IteratorResult<Yield, TaskReturn>,
    ): Generator<any, void, any> {
        while (!result.done) {
            const effect = result.value

            if (effect.type === 'async') {
                addPromise(effect.promise, item)
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
            }
            items[item.index] = processedItem

            stream.next({
                index: item.index,
                value: result.value,
            })

            const gen = consumer.next()

            if (!gen) {
                return
            }

            const newItem: ProcessItem = {
                type: 'initial',
                gen,
                index: items.length,
            }

            items.push(newItem)
        } else {
            item.type satisfies 'completed'
            throw new Error(
                `Unexpected completion of item that was already completed: ${JSON.stringify(item, null, 2)}`,
            )
        }
    }

    function* process() {
        let count = 0

        /**
         * why use while-loop instead of for-of loop?
         * because every processItem call can cause a new item to be added to the items array
         * which increases the length of the items array
         * so here we use a while-loop to process the items incrementally
         */
        while (count < items.length) {
            const item = items[count++]
            yield* processItem(item, item.gen.next())
        }

        while (promiseMap.size > 0) {
            yield* Async.await(Promise.race(promiseMap.values()))

            while (pendingItemProcessingList.length > 0) {
                const processingItem = pendingItemProcessingList.shift()!

                yield* processingItem
            }

            /**
             * why repeat the same while-loop here?
             * because processingItem call above can cause a new item to be added to the items array
             * so we need to process the new items incrementally
             */
            while (count < items.length) {
                const item = items[count++]
                yield* processItem(item, item.gen.next())
            }
        }

        stream.done()

        return yield* Async.await(resultPromise)
    }

    return yield* Koka.try(process).finally(cleanUpAllGen)
}

export function* tuple<T extends unknown[] | readonly unknown[]>(
    inputs: T,
): Generator<Koka.ExtractEff<T> | Async.Async, Koka.ExtractReturn<T>> {
    return yield* all(inputs as any) as Generator<Koka.ExtractEff<T>, Koka.ExtractReturn<T>>
}

export function* object<T extends Record<string, unknown>>(
    inputs: T,
): Generator<Koka.ExtractEff<T> | Async.Async, Koka.ExtractReturn<T>> {
    const result: Record<string, unknown> = {}
    const gens = [] as Generator<Koka.AnyEff>[]
    const keys = [] as string[]

    for (const [key, value] of Object.entries(inputs)) {
        if (typeof value === 'function') {
            gens.push(value())
        } else if (Gen.isGen(value)) {
            gens.push(value as Generator<Koka.AnyEff>)
        } else {
            gens.push(Gen.of(value))
        }
        keys.push(key)
    }

    const values = (yield* all(gens) as any) as unknown[]

    for (let i = 0; i < values.length; i++) {
        result[keys[i]] = values[i]
    }

    return result as Koka.ExtractReturn<T>
}

export type AllOptions = {
    maxConcurrency?: number
}

export function* all<Return, Yield extends Koka.AnyEff = never>(
    inputs: TaskSource<Yield, Return>,
    options?: AllOptions,
): Generator<Yield | Async.Async | Koka.Final, Return[]> {
    const results = yield* concurrent(
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

export function* race<Return, Yield extends Koka.AnyEff = never>(
    inputs: TaskSource<Yield, Return>,
    options?: RaceOptions,
): Generator<Yield | Async.Async | Koka.Final, Return> {
    const result = yield* concurrent(
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

export type DelayOptions = {
    signal?: AbortSignal
}

export function* delay(ms: number, options: DelayOptions = {}) {
    const { promise, resolve, reject } = Promise.withResolvers<void>()

    const controller = new AbortController()

    const id = setTimeout(resolve, ms)

    options.signal?.addEventListener(
        'abort',
        () => {
            reject(new Error('Delay aborted'))
        },
        {
            once: true,
            signal: controller.signal,
        },
    )

    try {
        yield* Async.await(promise)
    } finally {
        clearTimeout(id)
        controller.abort()
    }
}
