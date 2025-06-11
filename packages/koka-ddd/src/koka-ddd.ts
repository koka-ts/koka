import { Ctx, Eff, AnyErr, Async, MaybePromise, Result } from 'koka'
import { Updater, Optic, OpticOptions, OpticErr, getOpticValue } from 'koka-optic'

export * from 'koka-optic'

export class Domain<State, Root> {
    $: Optic<State, Root>

    constructor(options: OpticOptions<State, Root>) {
        this.$ = new Optic<State, Root>(options)
    }
}

export type SetStateInput<S> = S | Updater<S> | ((state: S) => S)

export type GetRoot<Root> = Ctx<'getRoot', () => Root>

export type SetRoot<Root> = Ctx<'setRoot', (Root: Root) => void>

export type RootAccessor<Root> = GetRoot<Root> | SetRoot<Root>

export type StoreOptions<State> = {
    state: State
}

export type MaybeFunction<T> = T | (() => T)

export type DomainQuery<Return, Root, E extends AnyErr = never> = Generator<OpticErr | GetRoot<Root> | E, Return>

export type DomainCommand<Return, Root, E extends AnyErr = never> = Generator<OpticErr | RootAccessor<Root> | E, Return>

export function* get<State, Root>(domainOrOptic: Domain<State, Root> | Optic<State, Root>): DomainQuery<State, Root> {
    const optic = domainOrOptic instanceof Domain ? domainOrOptic.$ : domainOrOptic

    const getRoot = yield* Eff.ctx('getRoot').get<() => Root>()

    const root = getRoot()

    const State = yield* optic.get(root)

    return State
}

export function* set<State, Root>(
    domainOrOptic: Domain<State, Root> | Optic<State, Root>,
    setStateInput: SetStateInput<State>,
): DomainCommand<void, Root> {
    const optic = domainOrOptic instanceof Domain ? domainOrOptic.$ : domainOrOptic

    const updateRoot = optic.set(function* (State) {
        if (typeof setStateInput !== 'function') {
            return setStateInput
        }

        const result = (setStateInput as Updater<State> | ((State: State) => State))(State)

        const value = yield* getOpticValue(result)

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

    constructor(options: StoreOptions<State>) {
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

    get<T>(domainOrOptic: Optic<T, State> | Domain<T, State>): Result<T, OpticErr> {
        const result = this.runQuery(get(domainOrOptic))
        return result
    }

    set<T>(domainOrOptic: Optic<T, State> | Domain<T, State>, input: SetStateInput<T>): Result<void, OpticErr> {
        const result = this.runCommand(set(domainOrOptic, input))
        return result
    }

    runQuery<T, E extends OpticErr | GetRoot<State> | AnyErr | Async>(
        input: MaybeFunction<Generator<E, T>>,
    ): Async extends E ? MaybePromise<Result<T, E>> : Result<T, E> {
        const query = typeof input === 'function' ? input() : input
        const withRoot = Eff.try(query as Generator<GetRoot<State>, T>).catch({
            getRoot: this.getState,
        })

        return Eff.runResult(withRoot) as any
    }

    runCommand<T, E extends OpticErr | RootAccessor<State> | AnyErr | Async>(
        input: MaybeFunction<Generator<E, T>>,
    ): Async extends E ? MaybePromise<Result<T, E>> : Result<T, E> {
        const command = typeof input === 'function' ? input() : input
        const withRoot = Eff.try(command as Generator<RootAccessor<State>, T>).catch({
            setRoot: this.setState,
            getRoot: this.getState,
        })

        try {
            return Eff.runResult(withRoot) as any
        } finally {
            this.publish()
        }
    }
}
