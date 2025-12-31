// =============================================================================
// PART 1: PRIMITIVES (Result & Accessor)
// =============================================================================

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const Ok = <T>(value: T): Result<T> => ({ ok: true, value })
const Err = (error: string): Result<any> => ({ ok: false, error })

type Getter<Local, Root> = (root: Root) => Result<Local>
type Setter<Local, Root> = (value: Local, root: Root) => Result<Root>

type RawAccessor<Local, Root = any> = {
    get: Getter<Local, Root>
    set: Setter<Local, Root>
}

class Accessor<Local, Root = any> {
    readonly get: Getter<Local, Root>
    readonly set: Setter<Local, Root>

    constructor(get: Getter<Local, Root>, set: Setter<Local, Root>) {
        this.get = get
        this.set = set
    }

    static id<State>(): Accessor<State, State> {
        return new Accessor(Ok, (newValue, _oldValue) => Ok(newValue))
    }

    map<Next>(get: Getter<Next, Local>, set: Setter<Next, Local>): Accessor<Next, Root> {
        return new Accessor(
            (root) => {
                const localResult = this.get(root)
                return localResult.ok ? get(localResult.value) : localResult
            },
            (nextValue, root) => {
                const localResult = this.get(root)
                if (!localResult.ok) return localResult
                const newLocalResult = set(nextValue, localResult.value)
                return newLocalResult.ok ? this.set(newLocalResult.value, root) : newLocalResult
            },
        )
    }

    compose<Next>(next: Accessor<Next, Local>): Accessor<Next, Root> {
        return this.map(next.get, next.set)
    }

    field<Key extends keyof Local>(key: Key): Accessor<Local[Key], Root> {
        return this.map(
            (local) => Ok(local[key]),
            (newValue, local) => Ok({ ...local, [key]: newValue }),
        )
    }

    index(targetIndex: number): Accessor<Local extends Array<infer Item> ? Item : never, Root> {
        return this.map(
            (local) => {
                const array = local as any[]
                return targetIndex >= 0 && targetIndex < array.length
                    ? Ok(array[targetIndex])
                    : Err(`Index[${targetIndex}] out of bounds`)
            },
            (newValue, local) => {
                const array = [...(local as any[])]
                if (targetIndex >= 0 && targetIndex < array.length) {
                    array[targetIndex] = newValue
                    return Ok(array as any)
                }
                return Err(`Index[${targetIndex}] out of bounds`)
            },
        )
    }

    match<Matched extends Local>(predicate: (local: Local) => local is Matched): Accessor<Matched, Root> {
        return this.map(
            (local) => (predicate(local) ? Ok(local) : Err('Match predicate failed')),
            (newValue, _local) => Ok(newValue as Local),
        )
    }

    find<Item = Local extends Array<infer ArrayItem> ? ArrayItem : never>(
        predicate: (item: Item, index: number) => boolean,
    ): Accessor<Item, Root> {
        return this.map(
            (local) => {
                const array = local as any as Item[]
                const foundIndex = array.findIndex(predicate)
                return foundIndex !== -1 ? Ok(array[foundIndex]) : Err('Item not found')
            },
            (newValue, local) => {
                const array = [...(local as any as any[])]
                const foundIndex = array.findIndex(predicate)
                if (foundIndex !== -1) {
                    array[foundIndex] = newValue
                    return Ok(array as any)
                }
                return Err('Item not found on set')
            },
        )
    }
}

// =============================================================================
// PART 2: STREAM (Observable-like Abstraction)
// =============================================================================

type Observer<T> = {
    next: (value: T) => void
    error?: (err: any) => void
    complete?: () => void
}

type Subscription = {
    unsubscribe: () => void
}

type StreamSubscriber<T> = (observer: Observer<T>) => Subscription | (() => void) | void

class Stream<T> {
    private _subscribe: StreamSubscriber<T>

    constructor(subscribe: StreamSubscriber<T>) {
        this._subscribe = subscribe
    }

    subscribe(observerOrNext: Observer<T> | ((value: T) => void)): Subscription {
        const observer: Observer<T> = typeof observerOrNext === 'function' ? { next: observerOrNext } : observerOrNext

        const result = this._subscribe(observer)

        if (!result) {
            return { unsubscribe: () => {} }
        }
        if (typeof result === 'function') {
            return { unsubscribe: result }
        }
        return result
    }

    // --- Static Constructors ---

    static of<T>(...values: T[]): Stream<T> {
        return new Stream((observer) => {
            for (const value of values) {
                observer.next(value)
            }
            observer.complete?.()
        })
    }

    static from<T>(iterable: Iterable<T>): Stream<T> {
        return new Stream((observer) => {
            for (const value of iterable) {
                observer.next(value)
            }
            observer.complete?.()
        })
    }

    static fromPromise<T>(promise: Promise<T>): Stream<T> {
        return new Stream((observer) => {
            let cancelled = false
            promise
                .then((value) => {
                    if (!cancelled) {
                        observer.next(value)
                        observer.complete?.()
                    }
                })
                .catch((err) => {
                    if (!cancelled) {
                        observer.error?.(err)
                    }
                })
            return () => {
                cancelled = true
            }
        })
    }

    static interval(ms: number): Stream<number> {
        return new Stream((observer) => {
            let count = 0
            const id = setInterval(() => observer.next(count++), ms)
            return () => clearInterval(id)
        })
    }

    static merge<T>(...streams: Stream<T>[]): Stream<T> {
        return new Stream((observer) => {
            let completedCount = 0
            const subscriptions: Subscription[] = []

            for (const stream of streams) {
                const subscription = stream.subscribe({
                    next: (value) => observer.next(value),
                    error: (error) => observer.error?.(error),
                    complete: () => {
                        completedCount++
                        if (completedCount === streams.length) {
                            observer.complete?.()
                        }
                    },
                })
                subscriptions.push(subscription)
            }

            return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
        })
    }

    static combine<T extends any[]>(...streams: { [K in keyof T]: Stream<T[K]> }): Stream<T> {
        return new Stream((observer) => {
            const latestValues: any[] = new Array(streams.length)
            const hasEmittedValue: boolean[] = new Array(streams.length).fill(false)
            let completedCount = 0
            const subscriptions: Subscription[] = []

            streams.forEach((stream, streamIndex) => {
                const subscription = stream.subscribe({
                    next: (value) => {
                        latestValues[streamIndex] = value
                        hasEmittedValue[streamIndex] = true
                        if (hasEmittedValue.every(Boolean)) {
                            observer.next([...latestValues] as T)
                        }
                    },
                    error: (error) => observer.error?.(error),
                    complete: () => {
                        completedCount++
                        if (completedCount === streams.length) {
                            observer.complete?.()
                        }
                    },
                })
                subscriptions.push(subscription)
            })

            return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
        })
    }

    static combineLatest<T extends any[]>(...streams: { [K in keyof T]: Stream<T[K]> }): Stream<T> {
        return Stream.combine<T>(...(streams as any))
    }

    static empty<T = never>(): Stream<T> {
        return new Stream((observer) => {
            observer.complete?.()
        })
    }

    static never<T = never>(): Stream<T> {
        return new Stream(() => {})
    }

    // --- Operators ---

    map<Result>(mapper: (value: T) => Result): Stream<Result> {
        return new Stream((observer) => {
            return this.subscribe({
                next: (value) => observer.next(mapper(value)),
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })
        })
    }

    filter(predicate: (value: T) => boolean): Stream<T> {
        return new Stream((observer) => {
            return this.subscribe({
                next: (value) => {
                    if (predicate(value)) observer.next(value)
                },
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })
        })
    }

    take(count: number): Stream<T> {
        return new Stream((observer) => {
            let taken = 0
            const subscription = this.subscribe({
                next: (value) => {
                    if (taken < count) {
                        taken++
                        observer.next(value)
                        if (taken >= count) {
                            observer.complete?.()
                            subscription.unsubscribe()
                        }
                    }
                },
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })
            return subscription
        })
    }

    takeUntil(notifier: Stream<any>): Stream<T> {
        return new Stream((observer) => {
            const sourceSubscription = this.subscribe({
                next: (value) => observer.next(value),
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })

            const notifierSubscription = notifier.subscribe({
                next: () => {
                    observer.complete?.()
                    sourceSubscription.unsubscribe()
                    notifierSubscription.unsubscribe()
                },
            })

            return () => {
                sourceSubscription.unsubscribe()
                notifierSubscription.unsubscribe()
            }
        })
    }

    takeWhile(predicate: (value: T) => boolean): Stream<T> {
        return new Stream((observer) => {
            const subscription = this.subscribe({
                next: (value) => {
                    if (predicate(value)) {
                        observer.next(value)
                    } else {
                        observer.complete?.()
                        subscription.unsubscribe()
                    }
                },
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })
            return subscription
        })
    }

    skip(count: number): Stream<T> {
        return new Stream((observer) => {
            let skippedCount = 0
            return this.subscribe({
                next: (value) => {
                    if (skippedCount >= count) {
                        observer.next(value)
                    } else {
                        skippedCount++
                    }
                },
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })
        })
    }

    distinct(comparator?: (prev: T, curr: T) => boolean): Stream<T> {
        return new Stream((observer) => {
            let hasPreviousValue = false
            let previousValue: T
            const compareValues = comparator ?? ((prev, curr) => prev === curr)

            return this.subscribe({
                next: (value) => {
                    if (!hasPreviousValue || !compareValues(previousValue, value)) {
                        hasPreviousValue = true
                        previousValue = value
                        observer.next(value)
                    }
                },
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })
        })
    }

    switchMap<Result>(mapper: (value: T) => Stream<Result>): Stream<Result> {
        return new Stream((observer) => {
            let innerSubscription: Subscription | null = null
            let outerCompleted = false
            let innerCompleted = false

            const checkComplete = () => {
                if (outerCompleted && innerCompleted) {
                    observer.complete?.()
                }
            }

            const outerSubscription = this.subscribe({
                next: (value) => {
                    innerSubscription?.unsubscribe()
                    innerCompleted = false
                    const innerStream = mapper(value)
                    innerSubscription = innerStream.subscribe({
                        next: (innerValue) => observer.next(innerValue),
                        error: (error) => observer.error?.(error),
                        complete: () => {
                            innerCompleted = true
                            checkComplete()
                        },
                    })
                },
                error: (error) => observer.error?.(error),
                complete: () => {
                    outerCompleted = true
                    checkComplete()
                },
            })

            return () => {
                outerSubscription.unsubscribe()
                innerSubscription?.unsubscribe()
            }
        })
    }

    flatMap<Result>(mapper: (value: T) => Stream<Result>): Stream<Result> {
        return new Stream((observer) => {
            const innerSubscriptions: Subscription[] = []
            let outerCompleted = false
            let activeInnerCount = 0

            const checkComplete = () => {
                if (outerCompleted && activeInnerCount === 0) {
                    observer.complete?.()
                }
            }

            const outerSubscription = this.subscribe({
                next: (value) => {
                    activeInnerCount++
                    const innerStream = mapper(value)
                    const innerSubscription = innerStream.subscribe({
                        next: (innerValue) => observer.next(innerValue),
                        error: (error) => observer.error?.(error),
                        complete: () => {
                            activeInnerCount--
                            checkComplete()
                        },
                    })
                    innerSubscriptions.push(innerSubscription)
                },
                error: (error) => observer.error?.(error),
                complete: () => {
                    outerCompleted = true
                    checkComplete()
                },
            })

            return () => {
                outerSubscription.unsubscribe()
                innerSubscriptions.forEach((subscription) => subscription.unsubscribe())
            }
        })
    }

    debounce(delayMs: number): Stream<T> {
        return new Stream((observer) => {
            let timeoutId: ReturnType<typeof setTimeout> | null = null

            const subscription = this.subscribe({
                next: (value) => {
                    if (timeoutId) clearTimeout(timeoutId)
                    timeoutId = setTimeout(() => observer.next(value), delayMs)
                },
                error: (error) => observer.error?.(error),
                complete: () => {
                    if (timeoutId) clearTimeout(timeoutId)
                    observer.complete?.()
                },
            })

            return () => {
                if (timeoutId) clearTimeout(timeoutId)
                subscription.unsubscribe()
            }
        })
    }

    throttle(intervalMs: number): Stream<T> {
        return new Stream((observer) => {
            let lastEmitTime = 0

            return this.subscribe({
                next: (value) => {
                    const now = Date.now()
                    if (now - lastEmitTime >= intervalMs) {
                        lastEmitTime = now
                        observer.next(value)
                    }
                },
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })
        })
    }

    scan<Accumulator>(
        reducer: (accumulator: Accumulator, value: T) => Accumulator,
        initialValue: Accumulator,
    ): Stream<Accumulator> {
        return new Stream((observer) => {
            let accumulator = initialValue
            return this.subscribe({
                next: (value) => {
                    accumulator = reducer(accumulator, value)
                    observer.next(accumulator)
                },
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })
        })
    }

    startWith(...initialValues: T[]): Stream<T> {
        return new Stream((observer) => {
            for (const value of initialValues) {
                observer.next(value)
            }
            return this.subscribe(observer)
        })
    }

    tap(sideEffect: (value: T) => void): Stream<T> {
        return new Stream((observer) => {
            return this.subscribe({
                next: (value) => {
                    sideEffect(value)
                    observer.next(value)
                },
                error: (error) => observer.error?.(error),
                complete: () => observer.complete?.(),
            })
        })
    }

    catchError(errorHandler: (error: any) => Stream<T>): Stream<T> {
        return new Stream((observer) => {
            return this.subscribe({
                next: (value) => observer.next(value),
                error: (error) => {
                    const recoveryStream = errorHandler(error)
                    recoveryStream.subscribe(observer)
                },
                complete: () => observer.complete?.(),
            })
        })
    }

    finalize(cleanupFn: () => void): Stream<T> {
        return new Stream((observer) => {
            const subscription = this.subscribe({
                next: (value) => observer.next(value),
                error: (error) => {
                    cleanupFn()
                    observer.error?.(error)
                },
                complete: () => {
                    cleanupFn()
                    observer.complete?.()
                },
            })

            return () => {
                cleanupFn()
                subscription.unsubscribe()
            }
        })
    }

    share(): Stream<T> {
        const sharedObservers: Observer<T>[] = []
        let sharedSubscription: Subscription | null = null
        let hasCompleted = false

        return new Stream((observer) => {
            if (hasCompleted) {
                observer.complete?.()
                return
            }

            sharedObservers.push(observer)

            if (sharedObservers.length === 1) {
                sharedSubscription = this.subscribe({
                    next: (value) => sharedObservers.forEach((obs) => obs.next(value)),
                    error: (error) => sharedObservers.forEach((obs) => obs.error?.(error)),
                    complete: () => {
                        hasCompleted = true
                        sharedObservers.forEach((obs) => obs.complete?.())
                    },
                })
            }

            return () => {
                const index = sharedObservers.indexOf(observer)
                if (index !== -1) sharedObservers.splice(index, 1)
                if (sharedObservers.length === 0 && sharedSubscription) {
                    sharedSubscription.unsubscribe()
                    sharedSubscription = null
                }
            }
        })
    }

    toPromise(): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            let lastValue: T | undefined
            this.subscribe({
                next: (value) => {
                    lastValue = value
                },
                error: reject,
                complete: () => resolve(lastValue),
            })
        })
    }
}

// Subject: Both Observable and Observer
class Subject<T> extends Stream<T> {
    private observers: Set<Observer<T>> = new Set()
    private hasCompleted = false
    private errorValue: any = null

    constructor() {
        super((observer) => {
            if (this.hasCompleted) {
                observer.complete?.()
                return
            }
            if (this.errorValue !== null) {
                observer.error?.(this.errorValue)
                return
            }
            this.observers.add(observer)
            return () => this.observers.delete(observer)
        })
    }

    next(value: T): void {
        if (this.hasCompleted) return
        this.observers.forEach((observer) => observer.next(value))
    }

    error(errorValue: any): void {
        if (this.hasCompleted) return
        this.errorValue = errorValue
        this.observers.forEach((observer) => observer.error?.(errorValue))
    }

    complete(): void {
        if (this.hasCompleted) return
        this.hasCompleted = true
        this.observers.forEach((observer) => observer.complete?.())
    }

    asStream(): Stream<T> {
        return new Stream((observer) => this.subscribe(observer))
    }
}

// BehaviorSubject: Subject with current value
class BehaviorSubject<T> extends Stream<T> {
    private observers: Set<Observer<T>> = new Set()
    private currentValue: T
    private hasCompleted = false

    constructor(initialValue: T) {
        super((observer) => {
            if (this.hasCompleted) {
                observer.complete?.()
                return
            }
            observer.next(this.currentValue)
            this.observers.add(observer)
            return () => this.observers.delete(observer)
        })
        this.currentValue = initialValue
    }

    get value(): T {
        return this.currentValue
    }

    next(value: T): void {
        if (this.hasCompleted) return
        this.currentValue = value
        this.observers.forEach((observer) => observer.next(value))
    }

    complete(): void {
        if (this.hasCompleted) return
        this.hasCompleted = true
        this.observers.forEach((observer) => observer.complete?.())
    }
}

// =============================================================================
// PART 3: STATE LAYER (Store & Domain)
// =============================================================================

class Store<Root> {
    private listeners: Set<(state: Root) => void> = new Set()
    state: Root

    constructor(initialState: Root) {
        this.state = initialState
    }

    subscribe(listener: (state: Root) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    commit(newState: Root): void {
        if (this.state !== newState) {
            this.state = newState
            this.listeners.forEach((listener) => listener(this.state))
        }
    }
}

// Effect management storage
const effectMethodsStorage = new WeakMap<object, Map<string, () => Stream<void>>>()
const effectSubscriptionsStorage = new WeakMap<Domain<any, any, any>, Map<string, Subscription>>()

// Domain lifts Accessor methods and binds them to the Store
// Input type parameter allows Domain subclasses to receive additional configuration
class Domain<Local, Input = void, Root = any> {
    readonly store: Store<Root>
    readonly accessor: Accessor<Local, Root>
    protected readonly input: Input
    private subscriptionCount = 0

    constructor(store: Store<Root>, accessor: Accessor<Local, Root>, input?: Input) {
        this.store = store
        this.accessor = accessor
        this.input = input as Input
    }

    get(): Result<Local> {
        return this.accessor.get(this.store.state)
    }

    set(newValue: Local): void {
        const result = this.accessor.set(newValue, this.store.state)
        if (result.ok) this.store.commit(result.value)
    }

    update(updater: (currentValue: Local) => Local): void {
        const currentResult = this.get()
        if (currentResult.ok) this.set(updater(currentResult.value))
    }

    field<Key extends keyof Local>(key: Key): Domain<Local[Key], void, Root> {
        return new Domain(this.store, this.accessor.field(key))
    }

    index(targetIndex: number): Domain<Local extends Array<infer Item> ? Item : never, void, Root> {
        return new Domain(this.store, this.accessor.index(targetIndex))
    }

    match<Matched extends Local>(predicate: (local: Local) => local is Matched): Domain<Matched, void, Root> {
        return new Domain(this.store, this.accessor.match(predicate))
    }

    find<Item = Local extends Array<infer ArrayItem> ? ArrayItem : never>(
        predicate: (item: Item, index: number) => boolean,
    ): Domain<Item, void, Root> {
        return new Domain(this.store, this.accessor.find(predicate))
    }

    // use: Instantiate a Domain subclass without additional input (Input = void)
    use<D extends Domain<Local, void, Root>>(
        DomainCtor: new (store: Store<Root>, accessor: Accessor<Local, Root>) => D,
    ): D
    // use: Instantiate a Domain subclass with additional input
    use<D extends Domain<Local, I, Root>, I>(
        DomainCtor: new (store: Store<Root>, accessor: Accessor<Local, Root>, input: I) => D,
        input: I,
    ): D
    // Implementation
    use(DomainCtor: any, input?: any): any {
        if (arguments.length >= 2) {
            return new DomainCtor(this.store, this.accessor, input)
        }
        return new DomainCtor(this.store, this.accessor)
    }

    // Stream property: emits state changes, completes on accessor error
    stream = new Stream<Local>((observer) => {
        let lastValue: Local | undefined
        let hasEmitted = false

        // Emit current value immediately if ok
        const currentResult = this.get()
        if (currentResult.ok) {
            lastValue = currentResult.value
            hasEmitted = true
            observer.next(currentResult.value)
        } else {
            // If currently in error state, complete immediately
            observer.complete?.()
            return
        }

        const unsubscribe = this.store.subscribe(() => {
            const result = this.get()
            if (result.ok) {
                // Only emit if value changed
                if (!hasEmitted || lastValue !== result.value) {
                    lastValue = result.value
                    hasEmitted = true
                    observer.next(result.value)
                }
            } else {
                // Accessor returns error - this domain path is no longer valid
                observer.complete?.()
            }
        })

        return unsubscribe
    })

    // Subscribe with effect lifecycle management
    subscribe(onNext: (state: Local) => void, onComplete?: () => void): () => void {
        this.subscriptionCount++

        // First subscription: start effects
        if (this.subscriptionCount === 1) {
            this.startEffects()
        }

        // Subscribe to stream
        const subscription = this.stream.subscribe({
            next: onNext,
            complete: onComplete,
        })

        return () => {
            subscription.unsubscribe()
            this.subscriptionCount--

            // Last unsubscribe: stop effects
            if (this.subscriptionCount === 0) {
                this.stopEffects()
            }
        }
    }

    private startEffects(): void {
        const effectMethods = effectMethodsStorage.get(this)
        if (!effectMethods) return

        let effectSubscriptions = effectSubscriptionsStorage.get(this)
        if (!effectSubscriptions) {
            effectSubscriptions = new Map()
            effectSubscriptionsStorage.set(this, effectSubscriptions)
        }

        effectMethods.forEach((effectFn, methodName) => {
            const effectStream = effectFn.call(this)
            const subscription = effectStream.subscribe({
                next: () => {},
                error: (error) => console.error(`Effect ${methodName} error:`, error),
            })
            effectSubscriptions!.set(methodName, subscription)
        })
    }

    private stopEffects(): void {
        const effectSubscriptions = effectSubscriptionsStorage.get(this)
        if (!effectSubscriptions) return

        effectSubscriptions.forEach((subscription) => subscription.unsubscribe())
        effectSubscriptions.clear()
    }
}

// =============================================================================
// PART 4: EFFECT DECORATOR
// =============================================================================

type EffectMethod = () => Stream<void>

// Effect decorator: marks methods as effects that run during domain subscription lifecycle
function effect() {
    return function <This, Value extends EffectMethod>(
        target: Value,
        context: ClassMethodDecoratorContext<This, Value> & {
            static: false
        },
    ): Value {
        const methodName = String(context.name)

        context.addInitializer(function (this: This) {
            let methods = effectMethodsStorage.get(this as object)
            if (!methods) {
                methods = new Map()
                effectMethodsStorage.set(this as object, methods)
            }
            methods.set(methodName, (target as Function).bind(this) as EffectMethod)
        })

        return target
    }
}

// =============================================================================
// PART 5: FRAMEWORK (Component )
// =============================================================================

type ComponentCtorStatic = Omit<typeof Component, 'prototype'>

interface ComponentCtor<Input, Out, Context = any> extends ComponentCtorStatic {
    new (input: Input, context: Context): Component<Input, Out, Context>
}

abstract class Component<Input, Out, Context = any> {
    protected readonly context: Context
    protected readonly input: Input

    constructor(input: Input, context: Context) {
        this.context = context
        this.input = input
    }

    static run<Input, Out, Context>(this: ComponentCtor<Input, Out, Context>, input: Input, context: Context): Out {
        const Ctor = this
        const instance = new Ctor(input, context)
        try {
            return instance.impl()
        } catch (error) {
            return instance.catch(error instanceof Error ? error : new Error(String(error), { cause: error }))
        }
    }

    use<SubInput, SubOut>(Child: ComponentCtor<SubInput, SubOut, Context>, input: SubInput): SubOut {
        return Child.run(input, this.context)
    }

    abstract impl(): Out
    abstract catch(error: Error): Out
}
// =============================================================================
// PART 6: HTML VIEW
// =============================================================================

class EventRegistry {
    private handlers: Map<string, Function> = new Map()
    private counter = 0

    register(fn: Function): string {
        const id = `e${++this.counter}`
        this.handlers.set(id, fn)
        return id
    }

    trigger(id: string, payload?: any): void {
        const fn = this.handlers.get(id)
        if (fn) fn(payload)
        else console.warn(`[Event] Unknown handler: ${id}`)
    }

    reset(): void {
        this.handlers.clear()
        this.counter = 0
    }
}

const eventRegistry = new EventRegistry()

// 3. Setup Global Handlers
const globalHandlers = {
    trigger: (id: string) => eventRegistry.trigger(id),
}

if (typeof globalThis !== 'undefined') (globalThis as any).globalHandlers = globalHandlers

abstract class HtmlView<Input, Context> extends Component<Input, string, Context> {
    protected handler<E = any>(fn: (e: E) => void): string {
        const id = eventRegistry.register(fn)
        return `globalHandlers.trigger('${id}')`
    }

    catch(error: Error): string {
        return `<div style="color:red; border:1px solid red; padding:8px;">
            <strong>Component Error:</strong> ${error.message}
            <pre style="font-size:10px">${JSON.stringify(this.input, null, 2)}</pre>
        </div>`
    }
}

// =============================================================================
// PART 7: USER LAND - TODO APP WITH STREAM & EFFECTS
// =============================================================================

// --- Models ---
type Todo = { id: number; text: string; done: boolean }

// --- Domains (Logic) with Effects ---

// Example: Domain without Input (Input = void)
class TodoDomain extends Domain<Todo> {
    toggle(): void {
        this.update((todo) => ({ ...todo, done: !todo.done }))
    }

    remove(): void {
        console.log('Remove not implemented (needs parent list access)')
    }
}

// Example: Domain WITH Input parameter
// This demonstrates Domain<Local, Input, Root> parameterization
type ValidatorConfig = {
    minLength?: number
    maxLength?: number
    pattern?: RegExp
}

class ValidatedTextDomain extends Domain<string, ValidatorConfig> {
    // Access the input config via this.input
    validate(): Result<string> {
        const result = this.get()
        if (!result.ok) return result

        const text = result.value
        const config = this.input

        if (config.minLength !== undefined && text.length < config.minLength) {
            return Err(`Text must be at least ${config.minLength} characters`)
        }
        if (config.maxLength !== undefined && text.length > config.maxLength) {
            return Err(`Text must be at most ${config.maxLength} characters`)
        }
        if (config.pattern && !config.pattern.test(text)) {
            return Err(`Text does not match required pattern`)
        }
        return Ok(text)
    }

    setValidated(newText: string): boolean {
        const originalGet = this.get
        // Temporarily set to validate
        this.set(newText)
        const validation = this.validate()
        if (!validation.ok) {
            console.warn(`Validation failed: ${validation.error}`)
            return false
        }
        return true
    }
}

class ListDomain extends Domain<Todo[]> {
    add(text: string): void {
        this.update((todos) => [...todos, { id: Date.now(), text, done: false }])
    }

    clear(): void {
        this.update((todos) => todos.filter((todo) => !todo.done))
    }

    todo(id: number) {
        return this.find((todo) => todo.id === id).use(TodoDomain)
    }
}

class LogsDomain extends Domain<string[]> {
    addLog(message: string): void {
        this.update((logs) => [...logs, `[${new Date().toISOString()}] ${message}`])
    }
}

type AppState = { user: string; todos: Todo[]; filter: 'all' | 'active'; logs: string[] }

class AppDomain extends Domain<AppState> {
    // Example: use() without input (Input = void)
    todos$ = this.field('todos').use(ListDomain)
    logs$ = this.field('logs').use(LogsDomain)

    // Example: use() WITH input parameter - demonstrates Domain<Local, Input, Root>
    // The second argument provides configuration to the ValidatedTextDomain
    validatedUser$ = this.field('user').use(ValidatedTextDomain, {
        minLength: 2,
        maxLength: 50,
        pattern: /^[a-zA-Z\s]+$/,
    } as ValidatorConfig)

    toggleFilter(): void {
        this.update((state) => ({ ...state, filter: state.filter === 'all' ? 'active' : 'all' }))
    }

    // Effect: Log todo changes
    @effect()
    logTodoChanges(): Stream<void> {
        return this.todos$.stream.skip(1).map((todoList) => {
            const totalCount = todoList.length
            const completedCount = todoList.filter((todo) => todo.done).length
            this.logs$.addLog(`Todos updated: ${totalCount} total, ${completedCount} done`)
        })
    }

    // Effect: Auto-save simulation
    @effect()
    autoSave(): Stream<void> {
        return this.stream
            .skip(1)
            .debounce(1000)
            .map((appState) => {
                console.log('🔄 Auto-saving state...', appState)
                this.logs$.addLog('State auto-saved')
            })
    }
}

// --- Views ---

// Theme configuration for light/dark modes
const themes = {
    light: {
        bg: '#ffffff',
        containerBg: '#f8f9fa',
        text: '#212529',
        textMuted: '#6c757d',
        border: '#dee2e6',
        accent: '#0d6efd',
        accentHover: '#0b5ed7',
        logsBg: '#f5f5f5',
        buttonBg: '#e9ecef',
        buttonText: '#212529',
        doneTodo: '#adb5bd',
    },
    dark: {
        bg: '#1a1a2e',
        containerBg: '#16213e',
        text: '#eaeaea',
        textMuted: '#a0a0a0',
        border: '#0f3460',
        accent: '#e94560',
        accentHover: '#ff6b6b',
        logsBg: '#0f3460',
        buttonBg: '#0f3460',
        buttonText: '#eaeaea',
        doneTodo: '#6c757d',
    },
}

type ThemeName = keyof typeof themes

type AppContext = {
    theme: ThemeName
    toggleTheme: () => void
}

type TodoItemProps = { domain: TodoDomain }

class TodoItem extends HtmlView<TodoItemProps, AppContext> {
    impl(): string {
        const { domain } = this.input
        const { theme } = this.context
        const colors = themes[theme]

        const result = domain.get()
        if (!result.ok) return `<!-- Error reading todo -->`
        const todo = result.value

        const onClick = this.handler(() => domain.toggle())

        const baseStyle = `
            padding: 8px 12px;
            margin: 4px 0;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            list-style: none;
            background: ${colors.containerBg};
            border: 1px solid ${colors.border};
        `
        const textStyle = todo.done
            ? `text-decoration: line-through; color: ${colors.doneTodo};`
            : `font-weight: 500; color: ${colors.text};`

        return `<li style="${baseStyle} ${textStyle}" onclick="${onClick}">
            ${todo.done ? '✅' : '⬜'} ${todo.text}
        </li>`
    }
}

type TodoListProps = { domain: ListDomain; filter: string }

class TodoList extends HtmlView<TodoListProps, AppContext> {
    impl(): string {
        const { domain, filter } = this.input
        const { theme } = this.context
        const colors = themes[theme]

        const result = domain.get()
        if (!result.ok) return '<div>Loading Error</div>'
        const todos = result.value

        const items = todos
            .filter((todo) => filter === 'all' || !todo.done)
            .map((todo) => this.use(TodoItem, { domain: domain.todo(todo.id) }))
            .join('')

        const onAdd = this.handler(() => domain.add(`Task ${Math.floor(Math.random() * 100)}`))
        const onClear = this.handler(() => domain.clear())

        const buttonStyle = `
            padding: 8px 16px;
            margin-right: 8px;
            border: 1px solid ${colors.border};
            border-radius: 4px;
            background: ${colors.buttonBg};
            color: ${colors.buttonText};
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `

        return `
            <ul style="padding: 0; margin: 16px 0;">${
                items || `<li style="color: ${colors.textMuted}; list-style: none;">No todos to display</li>`
            }</ul>
            <div style="display: flex; gap: 8px;">
                <button style="${buttonStyle}" onclick="${onAdd}">➕ Add Task</button>
                <button style="${buttonStyle}" onclick="${onClear}">🗑️ Clear Done</button>
            </div>
        `
    }
}

type LogsPanelProps = { domain: LogsDomain }

class LogsPanel extends HtmlView<LogsPanelProps, AppContext> {
    impl(): string {
        const { domain } = this.input
        const { theme } = this.context
        const colors = themes[theme]

        const result = domain.get()
        if (!result.ok) return '<div>Error loading logs</div>'
        const logs = result.value

        const logItems = logs
            .slice(-5)
            .map(
                (logEntry) =>
                    `<li style="font-size: 12px; color: ${colors.textMuted}; padding: 4px 0; border-bottom: 1px solid ${colors.border};">${logEntry}</li>`,
            )
            .join('')

        return `
            <div style="margin-top: 24px; padding: 16px; background: ${
                colors.logsBg
            }; border-radius: 8px; border: 1px solid ${colors.border};">
                <h3 style="margin: 0 0 12px; color: ${
                    colors.text
                }; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">📋 Activity Log</h3>
                <ul style="margin: 0; padding: 0; list-style: none;">${
                    logItems || `<li style="color: ${colors.textMuted};">No activity yet</li>`
                }</ul>
            </div>
        `
    }
}

// UserEditor: Demonstrates Domain<Local, Input, Root> with validation
type UserEditorProps = { domain: ValidatedTextDomain }

class UserEditor extends HtmlView<UserEditorProps, AppContext> {
    impl(): string {
        const { domain } = this.input
        const { theme } = this.context
        const colors = themes[theme]

        const result = domain.get()
        if (!result.ok) return '<div>Error loading user</div>'
        const userName = result.value

        // Validate current value using the Domain's input config
        const validation = domain.validate()
        const isValid = validation.ok
        const errorMessage = !validation.ok ? validation.error : ''

        // Handlers for name change
        const onRandomName = this.handler(() => {
            const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank']
            const randomName = names[Math.floor(Math.random() * names.length)]
            domain.setValidated(randomName)
        })

        const onInvalidName = this.handler(() => {
            // Try to set an invalid name (too short or with numbers)
            domain.set('X') // Will fail minLength validation
        })

        const inputStyle = `
            padding: 8px 12px;
            border: 2px solid ${isValid ? colors.accent : '#dc3545'};
            border-radius: 4px;
            background: ${colors.containerBg};
            color: ${colors.text};
            font-size: 16px;
            width: 200px;
            outline: none;
            transition: border-color 0.2s;
        `

        const buttonStyle = `
            padding: 8px 12px;
            border: 1px solid ${colors.border};
            border-radius: 4px;
            background: ${colors.buttonBg};
            color: ${colors.buttonText};
            cursor: pointer;
            font-size: 12px;
            margin-left: 8px;
        `

        return `
            <div style="
                padding: 16px;
                margin-bottom: 20px;
                background: ${colors.containerBg};
                border-radius: 8px;
                border: 1px solid ${colors.border};
            ">
                <h3 style="margin: 0 0 12px; color: ${colors.text}; font-size: 14px;">
                    👤 User Editor <span style="font-size: 11px; color: ${
                        colors.textMuted
                    };">(Domain with Input demo)</span>
                </h3>
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="position: relative;">
                        <input 
                            type="text" 
                            value="${userName}" 
                            readonly
                            style="${inputStyle}"
                        />
                        ${
                            !isValid
                                ? `<div style="
                            position: absolute;
                            top: 100%;
                            left: 0;
                            margin-top: 4px;
                            padding: 4px 8px;
                            background: #dc3545;
                            color: white;
                            font-size: 11px;
                            border-radius: 3px;
                            white-space: nowrap;
                        ">⚠️ ${errorMessage}</div>`
                                : ''
                        }
                    </div>
                    <button style="${buttonStyle}" onclick="${onRandomName}">🎲 Random Valid</button>
                    <button style="${buttonStyle}" onclick="${onInvalidName}">❌ Try Invalid</button>
                </div>
                <div style="margin-top: 12px; font-size: 11px; color: ${colors.textMuted};">
                    <strong>Validation Config (via domain.input):</strong> 
                    minLength=2, maxLength=50, pattern=/^[a-zA-Z\\s]+$/
                </div>
            </div>
        `
    }
}

class App extends HtmlView<AppDomain, AppContext> {
    impl(): string {
        const domain = this.input
        const { theme, toggleTheme } = this.context
        const colors = themes[theme]

        const stateResult = domain.get()
        if (!stateResult.ok) return '<div>App State Error</div>'
        const state = stateResult.value

        const onFilter = this.handler(() => domain.toggleFilter())
        const onToggleTheme = this.handler(() => toggleTheme())

        const buttonStyle = `
            padding: 8px 16px;
            border: 1px solid ${colors.border};
            border-radius: 4px;
            background: ${colors.buttonBg};
            color: ${colors.buttonText};
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `

        const accentButtonStyle = `
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            background: ${colors.accent};
            color: white;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `

        return `
            <div id="app-container" style="
                font-family: 'Segoe UI', system-ui, sans-serif;
                padding: 24px;
                min-height: 100vh;
                background: ${colors.bg};
                color: ${colors.text};
                transition: all 0.3s ease;
            ">
                <div style="max-width: 600px; margin: 0 auto;">
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h1 style="margin: 0; font-size: 28px; color: ${colors.text};">
                            ${theme === 'dark' ? '🌙' : '☀️'} ${state.user}'s Todos
                        </h1>
                        <button style="${accentButtonStyle}" onclick="${onToggleTheme}">
                            ${theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
                        </button>
                </div>

                    <!-- Filter Controls -->
                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 20px;
                        padding: 12px 16px;
                        background: ${colors.containerBg};
                        border-radius: 8px;
                        border: 1px solid ${colors.border};
                    ">
                        <span style="color: ${colors.textMuted};">Filter:</span>
                        <span style="
                            padding: 4px 12px;
                            background: ${colors.accent};
                            color: white;
                            border-radius: 16px;
                            font-size: 12px;
                            font-weight: 600;
                            text-transform: uppercase;
                        ">${state.filter}</span>
                        <button style="${buttonStyle}" onclick="${onFilter}">Toggle Filter</button>
                    </div>

                    <!-- Context Info Banner -->
                    <div style="
                        padding: 12px 16px;
                        margin-bottom: 20px;
                        background: linear-gradient(135deg, ${colors.accent}22, ${colors.accent}11);
                        border-left: 4px solid ${colors.accent};
                        border-radius: 4px;
                        font-size: 13px;
                        color: ${colors.textMuted};
                    ">
                        <strong style="color: ${colors.text};">Context Passing Demo:</strong>
                        Theme "<code style="background: ${
                            colors.buttonBg
                        }; padding: 2px 6px; border-radius: 3px;">${theme}</code>" 
                        is passed through Component context and affects all child components' styling.
                    </div>

                    <!-- User Editor: Demonstrates Domain<Local, Input, Root> -->
                    ${this.use(UserEditor, { domain: domain.validatedUser$ })}

                    <!-- Todo List -->
                ${this.use(TodoList, {
                    domain: domain.todos$,
                    filter: state.filter,
                })}

                    <!-- Logs Panel -->
                    ${this.use(LogsPanel, {
                        domain: domain.logs$,
                    })}
                </div>
            </div>
        `
    }
}

// =============================================================================
// PART 8: STREAM DEMO
// =============================================================================

function streamDemo(): void {
    console.log('\n=== Stream Demo ===\n')

    // Basic Stream operations
    const numbers = Stream.of(1, 2, 3, 4, 5)
    console.log('Stream.of + map + filter:')
    numbers
        .map((num) => num * 2)
        .filter((num) => num > 4)
        .subscribe((num) => console.log(`  Value: ${num}`))

    // Combine streams
    console.log('\nStream.combine:')
    const numberSubject$ = new BehaviorSubject(1)
    const letterSubject$ = new BehaviorSubject('A')
    Stream.combine(numberSubject$, letterSubject$).subscribe(([num, letter]) =>
        console.log(`  Combined: ${num}, ${letter}`),
    )
    numberSubject$.next(2)
    letterSubject$.next('B')

    // switchMap example
    console.log('\nswitchMap:')
    const outerSubject$ = new Subject<number>()
    outerSubject$
        .switchMap((num) => Stream.of(num * 10, num * 100))
        .subscribe((result) => console.log(`  switchMap result: ${result}`))
    outerSubject$.next(1)
    outerSubject$.next(2)

    // takeUntil example
    console.log('\ntakeUntil:')
    const stopSignal$ = new Subject<void>()
    const countingStream$ = Stream.of(1, 2, 3, 4, 5).takeUntil(stopSignal$)
    countingStream$.subscribe({
        next: (count) => console.log(`  Count: ${count}`),
        complete: () => console.log('  Counting stopped'),
    })
}

// =============================================================================
// PART 9: BOOTSTRAP (DOM & Node.js Compat)
// =============================================================================

function bootstrap() {
    // Mutable context state for theme
    let currentTheme: ThemeName = 'light'

    // Create context with theme toggle capability
    const createContext = (): AppContext => ({
        theme: currentTheme,
        toggleTheme: () => {
            currentTheme = currentTheme === 'light' ? 'dark' : 'light'
            console.log(`🎨 Theme switched to: ${currentTheme}`)
            render() // Re-render with new context
        },
    })

    // Setup Store with logs
    const store = new Store<AppState>({
        user: 'Mendler',
        todos: [
            { id: 1, text: 'Learn Architecture', done: true },
            { id: 2, text: 'Implement DOM Render', done: false },
            { id: 3, text: 'Add Context Demo', done: false },
        ],
        filter: 'all',
        logs: [],
    })

    // Construct Root Domain
    const rootDomain = new Domain(store, Accessor.id<AppState>()).use(AppDomain)

    // Subscribe to domain (this starts effects!)
    const unsubscribe = rootDomain.subscribe((state) => {
        console.log('📊 State updated:', state.user, '- Todos:', state.todos.length)
    })

    // Render Logic with DOM Mutation
    const render = () => {
        eventRegistry.reset()
        const context = createContext() // Fresh context with current theme
        const html = App.run(rootDomain, context)

        if (typeof document !== 'undefined') {
            let root = document.getElementById('root')
            if (!root) {
                root = document.createElement('div')
                root.id = 'root'
                document.body.appendChild(root)
            }
            root.innerHTML = html
        } else {
            console.log('\n--- [VIRTUAL DOM] ---')
            console.log(html)
        }
    }

    // Subscribe store for re-rendering
    store.subscribe(() => {
        console.log('⚡ Update Detected, Re-rendering...')
        render()
    })

    // Initial Render
    render()

    return { store, rootDomain, unsubscribe, toggleTheme: () => createContext().toggleTheme() }
}

// --- RUN ---
streamDemo()
bootstrap()
