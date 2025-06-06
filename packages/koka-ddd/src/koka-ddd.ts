import { Ctx, Eff, AnyErr, Async, MaybePromise, Result, isGenerator } from 'koka'
import { Updater, Domain, DomainErr, getDomainValue } from 'koka-domain'

export * from 'koka-domain'

export type SetStateInput<S> = S | Updater<S> | ((state: S) => S)

export type GetRoot<Root> = Ctx<'getRoot', () => Root>

export type SetRoot<Root> = Ctx<'setRoot', (Root: Root) => void>

export type RootAccessor<Root> = GetRoot<Root> | SetRoot<Root>

export type KokaStoreOptions<State> = {
    state: State
}

export type MaybeFunction<T> = T | (() => T)

export type DomainQuery<Return, Root, E extends AnyErr = never> = Generator<
    DomainErr | GetRoot<Root> | E,
    Return,
    unknown
>

export type DomainCommand<Return, Root, E extends AnyErr = never> = Generator<
    DomainErr | RootAccessor<Root> | E,
    Return,
    unknown
>

export function* get<State, Root>(domain: Domain<State, Root>): DomainQuery<State, Root> {
    const getRoot = yield* Eff.ctx('getRoot').get<() => Root>()

    const root = getRoot()

    const State = yield* domain.get(root)

    return State
}

export function* set<State, Root>(domain: Domain<State, Root>, input: SetStateInput<State>): DomainCommand<void, Root> {
    const updateRoot = domain.set(function* (State) {
        if (typeof input !== 'function') {
            return input
        }

        const result = (input as Updater<State> | ((State: State) => State))(State)

        const value = yield* getDomainValue(result)

        return value
    })

    const getRoot = yield* Eff.ctx('getRoot').get<() => Root>()

    const root = getRoot()

    const newRoot = yield* updateRoot(root)

    const setRoot = yield* Eff.ctx('setRoot').get<(Root: Root) => void>()

    setRoot(newRoot)
}

export class Store<State> {
    state: State
    constructor(options: KokaStoreOptions<State>) {
        this.state = options.state
    }

    getState = (): State => {
        return this.state
    }

    private dirty = false

    setState = (state: State): void => {
        if (state === this.state) {
            return
        }

        this.state = state
        this.dirty = true

        // Schedule a microtask to publish the state change
        const currentPid = this.pid++
        Promise.resolve().then(() => {
            if (currentPid === this.pid) {
                this.publish()
            }
        })
    }

    pid = 0

    private listeners: ((state: State) => void)[] = []

    subscribe(listener: (state: State) => void): () => void {
        this.listeners.push(listener)

        return () => {
            const index = this.listeners.indexOf(listener)
            if (index !== -1) {
                this.listeners.splice(index, 1)
            }
        }
    }

    publish(): void {
        if (!this.dirty) {
            return
        }
        // Reset dirty flag
        this.dirty = false

        for (const listener of this.listeners) {
            listener(this.state)
        }
    }

    get<T>(domain: Domain<T, State>): Result<T, DomainErr> {
        const result = this.runQuery(get(domain))
        return result
    }

    set<T>(domain: Domain<T, State>, input: SetStateInput<T>): Result<void, DomainErr> {
        const result = this.runCommand(set(domain, input))
        return result
    }

    runQuery<T, E extends DomainErr | GetRoot<State> | AnyErr | Async>(
        input: MaybeFunction<Generator<E, T, unknown>>,
    ): Async extends E ? MaybePromise<Result<T, E>> : Result<T, E> {
        const query = typeof input === 'function' ? input() : input
        const withResult = Eff.result(query)
        const withRoot = Eff.try(withResult as Generator<GetRoot<State>, unknown, unknown>).catch({
            getRoot: this.getState,
        })

        return Eff.run(withRoot) as any
    }

    runCommand<T, E extends DomainErr | RootAccessor<State> | AnyErr | Async>(
        input: MaybeFunction<Generator<E, T, unknown>>,
    ): Async extends E ? MaybePromise<Result<T, E>> : Result<T, E> {
        const command = typeof input === 'function' ? input() : input
        const withResult = Eff.result(command)
        const withRoot = Eff.try(withResult as Generator<RootAccessor<State>, unknown, unknown>).catch({
            setRoot: this.setState,
            getRoot: this.getState,
        })

        try {
            return Eff.run(withRoot) as any
        } finally {
            this.publish()
        }
    }
}
