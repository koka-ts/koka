import * as Async from './async.ts'
import * as Gen from './gen.ts'
import * as Koka from './koka.ts'
import { withResolvers } from './util.ts'

type StreamOptions<T> = {
    onDone: () => void
}

function createStream<T>(options: StreamOptions<T>) {
    let ctrl: PromiseWithResolvers<void> = withResolvers()

    let values = [] as T[]
    let isDone = false

    const next = (value: T) => {
        if (isDone) {
            return
        }
        values.push(value)

        ctrl.resolve()
    }

    const done = () => {
        if (isDone) {
            return
        }
        isDone = true
        ctrl.resolve()
    }

    const throwError = (error: unknown) => {
        if (isDone) {
            return
        }
        isDone = true
        ctrl.reject(error)
    }

    async function* createAsyncGen() {
        try {
            while (true) {
                if (isDone) {
                    return
                }

                await ctrl.promise

                ctrl = withResolvers()

                let count = 0

                while (count < values.length) {
                    const value = values[count++]

                    yield value
                }

                values.length = 0
            }
        } finally {
            /**
             * ensure onDone is called even if the stream is aborted
             * whether the async generator is aborted via early return/throw/break in for-await-of loop
             * or via ctrl.done.resolve('done')
             */
            options.onDone()
        }
    }

    const gen = createAsyncGen()

    return {
        next,
        done,
        throw: throwError,
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

    type ActiveItem = {
        gen: Generator<Yield, TaskReturn>
        index: number
    }

    const activeTasks = new Set<ActiveItem>()

    let taskIndexCounter = 0

    let jobQueue: Generator<Yield, void>[] = []

    let signalResolvers: PromiseWithResolvers<void> | undefined
    let hasNotified = false
    function notifyScheduler() {
        if (hasNotified) {
            return
        }
        hasNotified = true
        signalResolvers?.resolve()
    }

    const consumer = createTaskConsumer(inputs)
    let isStreamDone = false
    const stream = createStream<TaskResult<TaskReturn>>({
        onDone: () => {
            isStreamDone = true
            notifyScheduler()
        },
    })

    let isCleaningUp = false
    function* cleanUpAllGen(): Generator<Yield | Koka.Final | Async.Async, void> {
        if (isCleaningUp) return
        isCleaningUp = true
        stream.done()

        for (const item of activeTasks) {
            yield* Koka.cleanUpGen(item.gen)
        }
    }

    const resultPromise = handler(stream.gen)
    let isResultSettled = false

    resultPromise.then(
        () => {
            isResultSettled = true
            notifyScheduler()
        },
        () => {
            isResultSettled = true
            notifyScheduler()
        },
    )

    function handleAsyncEffect(promise: Promise<unknown>, item: ActiveItem) {
        promise
            .then(
                (value) => {
                    if (isCleaningUp || isStreamDone || isResultSettled) {
                        return
                    }

                    const nextStepGen = processItemStep(item, item.gen.next(value))
                    jobQueue.push(nextStepGen)
                },
                (error) => {
                    if (isCleaningUp || isStreamDone || isResultSettled) {
                        return
                    }
                    const nextStepGen = processItemStep(item, item.gen.throw(error))
                    jobQueue.push(nextStepGen)
                },
            )
            .then(notifyScheduler, (error) => {
                notifyScheduler()
                stream.throw(error)
            })
    }

    function* processItemStep(item: ActiveItem, result: IteratorResult<Yield, TaskReturn>): Generator<Yield, void> {
        try {
            while (!result.done) {
                const effect = result.value
                if (effect.type === 'async') {
                    handleAsyncEffect(effect.promise, item)
                    return
                } else {
                    result = item.gen.next(yield effect)
                }
            }
        } catch (error) {
            activeTasks.delete(item)
            stream.throw(error)
            return
        }

        activeTasks.delete(item)
        stream.next({
            index: item.index,
            value: result.value,
        })
    }

    function* process() {
        while (true) {
            if (isResultSettled || isStreamDone) {
                break
            }

            if (jobQueue.length > 0) {
                const currentJobQueue = jobQueue
                jobQueue = []
                for (const job of currentJobQueue) {
                    yield* job
                }
            }

            while (activeTasks.size < config.maxConcurrency) {
                const gen = consumer.next()
                if (!gen) {
                    break
                }

                const newItem: ActiveItem = {
                    gen,
                    index: taskIndexCounter++,
                }
                activeTasks.add(newItem)

                yield* processItemStep(newItem, newItem.gen.next())
            }

            if (activeTasks.size === 0) {
                break
            }

            if (hasNotified) {
                hasNotified = false
            } else {
                signalResolvers = withResolvers()
                yield* Async.await(signalResolvers.promise)
                signalResolvers = undefined
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
