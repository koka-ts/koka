import * as Async from './async.ts'
import * as Gen from './gen.ts'
import * as Koka from './koka.ts'
import { withResolvers } from './util.ts'

export type TaskProducer<TaskReturn, TaskYield extends Koka.AnyEff = never> = (
    index: number,
) => Koka.Effector<TaskYield, TaskReturn> | undefined

export type TaskSource<TaskReturn, TaskYield extends Koka.AnyEff = never> =
    | TaskProducer<TaskReturn, TaskYield>
    | Iterable<Koka.Effector<TaskYield, TaskReturn>>

export type TaskResultOk<TaskReturn> = {
    type: 'task-ok'
    index: number
    value: TaskReturn
}

export type TaskResultErr = {
    type: 'task-err'
    index: number
    error: unknown
}

export type TaskResult<TaskReturn> = TaskResultOk<TaskReturn> | TaskResultErr

export type TaskWaitNext<TaskReturn> = {
    type: 'task-wait-next'
    expect?: TaskResultOk<TaskReturn>
}

export type TaskWaitResult<TaskReturn> = {
    type: 'task-wait-result'
    expect?: TaskResult<TaskReturn>
}

export type TaskWait<TaskReturn> = TaskWaitNext<TaskReturn> | TaskWaitResult<TaskReturn>

export const TaskEnd = Symbol('TaskEnd')

export type TaskResultStream<TaskReturn> = {
    next: () => Generator<TaskWaitNext<TaskReturn>, TaskResultOk<TaskReturn> | typeof TaskEnd>
    result: () => Generator<TaskWaitResult<TaskReturn>, TaskResult<TaskReturn> | typeof TaskEnd>
}

export type StreamReducerEff<TaskReturn> = Koka.AnyEff | TaskWait<TaskReturn>

export type TaskStreamReducer<TaskReturn, ReducerReturn, ReducerYield extends StreamReducerEff<TaskReturn> = never> = (
    stream: TaskResultStream<TaskReturn>,
) => Generator<ReducerYield, ReducerReturn>

function iteratorToProducer<TaskReturn, TaskYield extends Koka.AnyEff = never>(
    inputs: Iterable<Koka.Effector<TaskYield, TaskReturn>>,
): TaskProducer<TaskReturn, TaskYield> {
    const iterator = inputs[Symbol.iterator]()
    return () => {
        const result = iterator.next()
        if (result.done) {
            return
        }
        return result.value
    }
}

const createTaskProvider = <TaskReturn, TaskYield extends Koka.AnyEff = never>(
    inputs: TaskSource<TaskReturn, TaskYield>,
) => {
    const producer: TaskProducer<TaskReturn, TaskYield> =
        typeof inputs === 'function' ? inputs : iteratorToProducer(inputs)

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
    ReducerReturn,
    TaskYield extends Koka.AnyEff = never,
    ReducerYield extends StreamReducerEff<TaskReturn> = never,
>(
    inputs: TaskSource<TaskReturn, TaskYield>,
    reducer: TaskStreamReducer<TaskReturn, ReducerReturn, TaskYield>,
): Generator<ReducerYield | TaskYield | Async.Async | Koka.Final, ReducerReturn> {
    return yield* concurrent(inputs, reducer, {
        maxConcurrency: 1,
    })
}

export function* parallel<
    TaskReturn,
    ReducerReturn,
    TaskYield extends Koka.AnyEff = never,
    ReducerYield extends StreamReducerEff<TaskReturn> = never,
>(
    inputs: TaskSource<TaskReturn, TaskYield>,
    handler: TaskStreamReducer<TaskReturn, ReducerReturn, TaskYield>,
): Generator<ReducerYield | TaskYield | Async.Async | Koka.Final, ReducerReturn> {
    return yield* concurrent(inputs, handler, {
        maxConcurrency: Number.POSITIVE_INFINITY,
    })
}

const errorTaskIndexWeakMap = new WeakMap<Error, number>()

/**
 * Get the task index from an error thrown by a concurrent task.
 * Returns undefined if the error is not an Error instance or was not thrown by a task.
 */
export function getTaskIndexFromError(error: unknown) {
    if (error instanceof Error) {
        return errorTaskIndexWeakMap.get(error)
    }
}

export function* drain<Yield extends Koka.AnyEff, Return>(inputs: TaskSource<Return, Yield>) {
    yield* concurrent(inputs, function* (stream) {
        while (true) {
            const result = yield* stream.result()
            if (result === TaskEnd) {
                break
            }
        }
    })
}

type TaskResultLinkList<TaskReturn> = {
    value: TaskResult<TaskReturn>
    next: TaskResultLinkList<TaskReturn> | undefined
}

class TaskResultLinkListManager<TaskReturn> {
    private tail: TaskResultLinkList<TaskReturn> | undefined = undefined
    private head: TaskResultLinkList<TaskReturn> | undefined = undefined

    add(value: TaskResult<TaskReturn>) {
        const link: TaskResultLinkList<TaskReturn> = {
            value,
            next: undefined,
        }

        if (this.tail) {
            this.tail.next = link
            this.tail = link
        } else {
            // Queue was empty
            this.head = link
            this.tail = link
        }
    }

    next(): TaskResult<TaskReturn> | undefined {
        if (!this.head) {
            return undefined
        }

        const result = this.head.value
        this.head = this.head.next

        // If head becomes empty, tail must also be cleared to prevent stale reference
        // and correctly handle the next 'add' logic
        if (!this.head) {
            this.tail = undefined
        }

        return result
    }
}

export type ConcurrentOptions = {
    maxConcurrency?: number
}

export function* concurrent<
    TaskReturn,
    ReducerReturn,
    TaskYield extends Koka.AnyEff = never,
    ReducerYield extends StreamReducerEff<TaskReturn> = never,
>(
    inputs: TaskSource<TaskReturn, TaskYield>,
    reducer: TaskStreamReducer<TaskReturn, ReducerReturn, ReducerYield>,
    options?: ConcurrentOptions,
): Generator<Async.Async | TaskYield | Exclude<ReducerYield, TaskWait<TaskReturn>> | Koka.Final, ReducerReturn> {
    const config = {
        maxConcurrency: Number.POSITIVE_INFINITY,
        ...options,
    }

    if (config.maxConcurrency < 1) {
        throw new Error(`maxConcurrency must be greater than 0`)
    }

    const activeTasksMap = new Map<number, Generator<TaskYield, TaskReturn>>()

    let signalResolvers: PromiseWithResolvers<void> | undefined
    let hasNotified = false
    function notifyScheduler() {
        if (hasNotified) {
            return
        }
        hasNotified = true
        signalResolvers?.resolve()
    }

    const taskProvider = createTaskProvider(inputs)

    function* cleanUpAllGen(): Generator<TaskYield | Koka.Final | Async.Async, void> {
        if (activeTasksMap.size === 0) {
            return
        }

        const cleanUpTasks = [] as Generator<TaskYield | Koka.Final, void>[]

        for (const gen of activeTasksMap.values()) {
            cleanUpTasks.push(Koka.cleanUpGen(gen))
        }

        yield* drain(cleanUpTasks)
    }

    let isEnded = false

    const stream: TaskResultStream<TaskReturn> = {
        *next() {
            if (isEnded) {
                return TaskEnd
            }

            const result: TaskResultOk<TaskReturn> = yield {
                type: 'task-wait-next',
            } satisfies TaskWaitNext<TaskReturn>

            return result
        },
        *result() {
            if (isEnded) {
                return TaskEnd
            }

            const result: TaskResult<TaskReturn> = yield {
                type: 'task-wait-result',
            } satisfies TaskWaitResult<TaskReturn>

            return result
        },
    }

    let jobQueue: (() => ReturnType<typeof processTask>)[] = []

    let asyncCount = 0

    function handleAsyncEffect(index: number, gen: Generator<TaskYield, TaskReturn>, promise: Promise<unknown>) {
        asyncCount++
        promise.then(
            (value) => {
                asyncCount--
                jobQueue.push(() => processTask(index, gen, gen.next(value)))
                notifyScheduler()
            },
            (error: unknown) => {
                asyncCount--
                jobQueue.push(() => processTask(index, gen, gen.throw(error)))
                notifyScheduler()
            },
        )
    }

    const taskResultManager = new TaskResultLinkListManager<TaskReturn>()

    function* processTask(
        index: number,
        gen: Generator<TaskYield, TaskReturn>,
        result: IteratorResult<TaskYield, TaskReturn>,
    ): Generator<TaskYield, void> {
        try {
            while (!result.done) {
                const effect = result.value
                if (effect.type === 'async') {
                    handleAsyncEffect(index, gen, effect.promise)
                    return
                } else {
                    result = gen.next(yield effect)
                }
            }
        } catch (error) {
            activeTasksMap.delete(index)
            taskResultManager.add({
                type: 'task-err',
                index,
                error,
            })
            return
        }

        result.done satisfies true
        activeTasksMap.delete(index)
        taskResultManager.add({
            type: 'task-ok',
            index,
            value: result.value as TaskReturn,
        })
    }

    let taskIndexCounter = 0

    function* process(): Generator<
        Async.Async | TaskYield | Exclude<ReducerYield, TaskWait<TaskReturn>> | Koka.Final,
        ReducerReturn
    > {
        const reducerGen = reducer(stream)
        let result = reducerGen.next()

        mainLoop: while (!result.done) {
            const effect = result.value

            if (effect.type !== 'task-wait-next' && effect.type !== 'task-wait-result') {
                result = reducerGen.next(yield effect as Exclude<ReducerYield, TaskWait<TaskReturn>>)
                continue
            }

            if (isEnded) {
                throw new Error(
                    `Unexpected calling stream.${
                        effect.type === 'task-wait-next' ? 'next' : 'result'
                    }() when stream is ended`,
                )
            }

            if (jobQueue.length > 0) {
                const currentJobQueue = jobQueue
                jobQueue = []

                for (const job of currentJobQueue) {
                    yield* job()
                }
            }

            while (true) {
                const taskResult = taskResultManager.next()

                if (!taskResult) {
                    break
                }

                if (effect.type === 'task-wait-next') {
                    if (taskResult.type === 'task-ok') {
                        result = reducerGen.next(taskResult)
                    } else {
                        if (taskResult.error instanceof Error) {
                            errorTaskIndexWeakMap.set(taskResult.error, taskResult.index)
                            result = reducerGen.throw(taskResult.error)
                        } else {
                            // Wrap non-Error values
                            const wrappedError = new Error(JSON.stringify(taskResult.error, null, 2), {
                                cause: taskResult.error,
                            })

                            errorTaskIndexWeakMap.set(wrappedError, taskResult.index)
                            result = reducerGen.throw(wrappedError)
                        }
                    }
                } else {
                    effect.type satisfies 'task-wait-result'
                    result = reducerGen.next(taskResult)
                }

                if (result.done) {
                    return result.value
                }

                if (result.value.type !== 'task-wait-next' && result.value.type !== 'task-wait-result') {
                    continue mainLoop
                }
            }

            while (activeTasksMap.size < config.maxConcurrency) {
                const gen = taskProvider.next()
                if (!gen) {
                    break
                }

                const index = taskIndexCounter++
                activeTasksMap.set(index, gen)

                yield* processTask(index, gen, gen.next())
            }

            if (activeTasksMap.size === 0) {
                isEnded = true
                result = reducerGen.next(TaskEnd)
                continue
            }

            if (hasNotified) {
                hasNotified = false
            } else {
                if (asyncCount === 0) {
                    throw new Error(`Unexpected status: no async tasks and no tasks in queue`)
                }
                signalResolvers = withResolvers()
                yield* Async.await(signalResolvers.promise)
                signalResolvers = undefined
            }
        }

        return result.value
    }

    return yield* Koka.try(process).finally(cleanUpAllGen)
}

export interface TupleOptions extends ConcurrentOptions {}

export function* tuple<T extends unknown[] | readonly unknown[]>(
    inputs: T,
    options?: TupleOptions,
): Generator<Koka.ExtractEff<T> | Async.Async, Koka.ExtractReturn<T>> {
    return yield* all(inputs as Koka.AnyEffector[], options) as Generator<Koka.ExtractEff<T>, Koka.ExtractReturn<T>>
}

export interface ObjectOptions extends ConcurrentOptions {}

export function* object<T extends Record<string, unknown>>(
    inputs: T,
    options?: ObjectOptions,
): Generator<Koka.ExtractEff<T> | Async.Async, Koka.ExtractReturn<T>> {
    const result: Record<string, unknown> = {}
    const gens = [] as Generator<Koka.AnyEff>[]
    const keys = [] as string[]

    for (const [key, value] of Object.entries(inputs)) {
        if (typeof value === 'function') {
            const gen = value()
            if (Gen.isGen(gen)) {
                gens.push(gen as Generator<Koka.AnyEff>)
            } else {
                gens.push(Gen.of(gen))
            }
        } else if (Gen.isGen(value)) {
            gens.push(value as Generator<Koka.AnyEff>)
        } else {
            gens.push(Gen.of(value))
        }
        keys.push(key)
    }

    const values = (yield* all(gens, options) as any) as unknown[]

    for (let i = 0; i < values.length; i++) {
        result[keys[i]] = values[i]
    }

    return result as Koka.ExtractReturn<T>
}

export interface AllOptions extends ConcurrentOptions {}

export function* all<Return, Yield extends Koka.AnyEff = never>(
    inputs: TaskSource<Return, Yield>,
    options?: AllOptions,
): Generator<Async.Async | Koka.Final | Yield, Return[]> {
    function* toArray(stream: TaskResultStream<Return>) {
        const results = [] as Return[]

        while (true) {
            const result = yield* stream.next()

            if (result === TaskEnd) {
                break
            }

            results[result.index] = result.value
        }

        return results
    }

    const results = yield* concurrent(inputs, toArray, options)

    return results
}

export interface AllSettledOptions extends ConcurrentOptions {}

export function* allSettled<Return, Yield extends Koka.AnyEff = never>(
    inputs: TaskSource<Return, Yield>,
    options?: AllSettledOptions,
): Generator<Async.Async | Koka.Final | Yield, TaskResult<Return>[]> {
    function* toSettledArray(stream: TaskResultStream<Return>) {
        const results = [] as TaskResult<Return>[]

        while (true) {
            const result = yield* stream.result()

            if (result === TaskEnd) {
                break
            }

            results[result.index] = result
        }

        return results
    }

    const results = yield* concurrent(inputs, toSettledArray, options)

    return results
}

export interface RaceOptions extends ConcurrentOptions {}

export function* race<Return, Yield extends Koka.AnyEff = never>(
    inputs: TaskSource<Return, Yield>,
    options?: RaceOptions,
): Generator<Async.Async | Koka.Final | Yield, Return> {
    function* getFastestValue(stream: TaskResultStream<Return>) {
        const result = yield* stream.next()

        if (result === TaskEnd) {
            throw new Error(`No results in race`)
        }

        return result.value
    }

    return yield* concurrent(inputs, getFastestValue, options)
}

export interface RaceResultOptions extends ConcurrentOptions {}

export function* raceResult<Return, Yield extends Koka.AnyEff = never>(
    inputs: TaskSource<Return, Yield>,
    options?: RaceResultOptions,
): Generator<Async.Async | Koka.Final | Yield, TaskResult<Return>> {
    function* getFastestResult(stream: TaskResultStream<Return>) {
        const result = yield* stream.result()

        if (result === TaskEnd) {
            throw new Error(`No results in race`)
        }

        return result
    }

    return yield* concurrent(inputs, getFastestResult, options)
}

export type DelayOptions = {
    signal?: AbortSignal
}

export function* delay(ms: number, options: DelayOptions = {}) {
    const { promise, resolve, reject } = Promise.withResolvers<void>()
    const controller = new AbortController()
    const id = setTimeout(resolve, ms)

    // Check if already aborted before adding listener
    if (options.signal?.aborted) {
        clearTimeout(id)
        throw new Error('Delay aborted')
    }

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
