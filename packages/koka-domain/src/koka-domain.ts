import * as Accessor from 'koka-accessor'
import { shallowEqual } from './shallowEqual'

export { shallowEqual }

export type SerializablePrimitives = void | undefined | number | string | boolean | null

export type ReadonlySerializableArray = readonly Serializable[]
export type SerializableArray = Serializable[] | ReadonlySerializableArray

export type SerializableObject = { [key: string]: Serializable }

export type Serializable = SerializablePrimitives | SerializableArray | SerializableObject

export type ToType<T> = T extends object | unknown[]
    ? {
          [key in keyof T]: ToType<T[key]>
      }
    : T

export type Result<T> = Accessor.AccessorResult<T>

export function shallowEqualResult<T>(a: Result<T>, b: Result<T>): boolean {
    if (a === b) {
        return true
    }

    if (a.type === 'ok' && b.type === 'ok') {
        return shallowEqual(a.value, b.value)
    }

    if (a.type === 'err' && b.type === 'err') {
        return shallowEqual(a.error, b.error)
    }

    return false
}

export type StorePlugin<Root, S extends Store<Root> = Store<Root>> = (store: S) => (() => void) | void

export type StoreOptions<Root> = {
    state: Root
    plugins?: StorePlugin<Root, Store<Root>>[]
}

export type AnyStore = Store<any>

export type InferStoreState<S> = S extends Store<infer State> ? State : never

export type DomainSelectPath = {
    type: 'select'
    key: string | number
    prev: DomainPath
}

export type DomainMatchPath = {
    type: 'match'
    key: string
    value: SerializablePrimitives
    prev: DomainPath
}

export type DomainFindPath = {
    type: 'find'
    key: string
    value: SerializablePrimitives
    prev: DomainPath
}

export type DomainObjectPath = {
    type: 'object'
    shape: Record<string, DomainPath>
}

export type DomainUnionPath = {
    type: 'union'
    variants: DomainPath[]
}

export type DomainOptionalPath = {
    type: 'optional'
    inner: DomainPath
}

export type DomainRootPath = {
    type: 'root'
}

export type DomainPath =
    | DomainRootPath
    | DomainObjectPath
    | DomainUnionPath
    | DomainOptionalPath
    | DomainSelectPath
    | DomainMatchPath
    | DomainFindPath

export type InferDomainState<S> = S extends Domain<infer StateType, any> ? StateType : never
export type InferDomainRoot<S> = S extends Domain<any, infer Root> ? Root : never

export class Domain<StateType, Root> {
    readonly store: Store<Root>
    readonly accessor: Accessor.Accessor<StateType, Root>
    readonly path: DomainPath
    readonly key: string
    constructor(store: Store<Root>, accessor: Accessor.Accessor<StateType, Root>, path: DomainPath) {
        this.store = store
        this.accessor = accessor
        this.path = path
        this.key = getDomainCacheKey(this.constructor as typeof Domain<StateType, Root>, this.path)
    }

    private localDomainCache = new Map<string, Domain<any, Root>>()

    getDomainFromCache<StateType>(
        Ctor: typeof Domain<any, Root>,
        path: DomainPath,
    ): Domain<StateType, Root> | undefined {
        const domain = this.store.getDomainFromCache(Ctor, path) as Domain<StateType, Root> | undefined

        return domain
    }

    setDomainInCache<StateType>(domain: Domain<StateType, Root>, path: DomainPath): boolean {
        const key = getDomainCacheKey(domain.constructor as typeof Domain<StateType, Root>, path)

        const success = this.store.setDomainInCache(domain, path)

        if (success) {
            this.localDomainCache.set(key, domain)
        }

        return success
    }

    /** Narrow state by key === value (e.g. discriminant). Serializable. */
    match<Key extends keyof StateType & string, Value extends SerializablePrimitives>(
        key: Key,
        value: Value,
    ): Domain<StateType & { [Key in keyof StateType]: Value }, Root> {
        type Matched = StateType & { [Key in keyof StateType]: Value }
        const path: DomainMatchPath = {
            type: 'match',
            key,
            value,
            prev: this.path,
        }

        let domain = this.getDomainFromCache(Domain, path) as Domain<Matched, Root> | undefined

        if (domain) {
            return domain as any
        }

        const predicate = (s: StateType): s is Matched => (s as Record<string, unknown>)[key] === value

        domain = new Domain(this.store, this.accessor.match(predicate), path)

        this.setDomainInCache(domain, path)

        return domain
    }

    /** Find array item by item[key] === value. Value type inferred from Item[K]. Serializable. */
    find<Key extends keyof Accessor.ArrayItem<StateType> & string>(
        key: Key,
        value: Accessor.ArrayItem<StateType>[Key] & SerializablePrimitives,
    ): Domain<Accessor.ArrayItem<StateType> & { [K in keyof Accessor.ArrayItem<StateType>]: typeof value }, Root> {
        type Item = Accessor.ArrayItem<StateType>

        const path: DomainFindPath = {
            type: 'find',
            key,
            value,
            prev: this.path,
        }

        let domain = this.getDomainFromCache(Domain, path) as
            | Domain<Item & { [K in keyof Item]: typeof value }, Root>
            | undefined

        if (domain) {
            return domain as any
        }

        const predicate = (item: Item): boolean => (item as Record<string, unknown>)[key] === value

        domain = new Domain(this.store, this.accessor.find(predicate), path)

        this.setDomainInCache(domain, path)

        return domain
    }

    select<Key extends keyof StateType & (string | number)>(key: Key): Domain<StateType[Key], Root> {
        const path: DomainSelectPath = {
            type: 'select',
            key,
            prev: this.path,
        }

        let domain = this.getDomainFromCache(Domain, path) as Domain<StateType[Key], Root> | undefined

        if (domain) {
            return domain as any
        }

        let accessor: Accessor.Accessor<StateType[Key], Root>
        if (typeof key === 'string') {
            accessor = this.accessor.prop(key) as typeof accessor
        } else if (typeof key === 'number') {
            accessor = this.accessor.index(key) as typeof accessor
        } else {
            throw new Error('[koka-domain] Domain.select: invalid key type')
        }

        domain = new Domain(this.store, accessor, path)

        this.setDomainInCache(domain, path)

        return domain
    }

    use<D extends Domain<any, Root>>(Ctor: new (...args: ConstructorParameters<typeof Domain<any, Root>>) => D): D {
        let domain = this.getDomainFromCache(Ctor as unknown as typeof Domain<any, Root>, this.path) as D | undefined

        if (domain) {
            return domain as any
        }

        domain = new Ctor(this.store, this.accessor, this.path)

        this.setDomainInCache(domain, this.path)

        return domain
    }
}

export type ObjectShape<Root, Shape extends Record<string, Domain<any, Root>>> = {
    [K in keyof Shape]: Shape[K] extends Domain<infer State, Root> ? State : never
}

export function object<Root, Shape extends Record<string, Domain<any, Root>>>(
    shape: Shape,
): Domain<ObjectShape<Root, Shape>, Root> {
    const path: DomainObjectPath = {
        type: 'object',
        shape: Object.fromEntries(Object.entries(shape).map(([key, domain]) => [key, domain.path])) as Record<
            string,
            DomainPath
        >,
    }

    const accessors = {} as Record<string, Accessor.Accessor<any, Root>>
    let store: Store<Root> | undefined

    for (const [key, domain] of Object.entries(shape)) {
        accessors[key] = domain.accessor

        if (!store) {
            store = domain.store
        } else if (store !== domain.store) {
            throw new Error('[koka-domain] object: all domains must belong to the same store')
        }
    }

    if (!store) {
        throw new Error('[koka-domain] object: no store found')
    }

    let domain = store.getDomainFromCache(Domain, path) as Domain<ObjectShape<Root, Shape>, Root> | undefined

    if (domain) {
        return domain as any
    }

    const accessor = Accessor.object(accessors) as Accessor.Accessor<ObjectShape<Root, Shape>, Root>

    domain = new Domain(store, accessor, path)

    store.setDomainInCache(domain, path)

    return domain
}

export function union<Root, Variants extends Domain<any, Root>[]>(
    ...variants: Variants
): Domain<InferDomainState<Variants[number]>, Root> {
    const path: DomainUnionPath = {
        type: 'union',
        variants: variants.map((variant) => variant.path),
    }

    const accessors = [] as Accessor.Accessor<any, Root>[]
    let store: Store<Root> | undefined

    for (const variant of variants) {
        accessors.push(variant.accessor)

        if (!store) {
            store = variant.store
        } else if (store !== variant.store) {
            throw new Error('[koka-domain] union: all domains must belong to the same store')
        }
    }

    if (!store) {
        throw new Error('[koka-domain] union: no store found')
    }

    let domain = store.getDomainFromCache(Domain, path) as Domain<InferDomainState<Variants[number]>, Root> | undefined

    if (domain) {
        return domain as any
    }

    const accessor = Accessor.union(accessors) as Accessor.Accessor<InferDomainState<Variants[number]>, Root>

    domain = new Domain(store, accessor, path)

    store.setDomainInCache(domain, path)

    return domain
}

export function optional<Root, Inner extends Domain<any, Root>>(
    inner: Inner,
): Domain<InferDomainState<Inner> | undefined, Root> {
    const path: DomainOptionalPath = {
        type: 'optional',
        inner: inner.path,
    }

    let domain = inner.store.getDomainFromCache(Domain, path) as
        | Domain<InferDomainState<Inner> | undefined, Root>
        | undefined

    if (domain) {
        return domain as any
    }

    const accessor = Accessor.optional(inner.accessor) as Accessor.Accessor<InferDomainState<Inner> | undefined, Root>

    domain = new Domain(inner.store, accessor, path)

    inner.store.setDomainInCache(domain, path)

    return domain
}

export type PureDomain<StateType, Root> = {
    store: Store<Root>
    accessor: Accessor.Accessor<StateType, Root>
    path: DomainPath
    parent?: PureDomain<any, Root>
    key: string
}

const getKeyFromPathCache = new WeakMap<DomainPath, string>()

export function getKeyFromPath(path: DomainPath): string {
    const cached = getKeyFromPathCache.get(path)
    if (cached) return cached
    const result = getKeyFromPathImpl(path)
    getKeyFromPathCache.set(path, result)
    return result
}

function getKeyFromPathImpl(path: DomainPath): string {
    if (path.type === 'root') {
        return 'root'
    }

    if (path.type === 'select') {
        const prevKey = getKeyFromPath(path.prev)
        return prevKey + '.' + path.key
    }

    if (path.type === 'match') {
        const prevKey = getKeyFromPath(path.prev)
        return prevKey + '.' + `match(${path.key}=${path.value})`
    }
    if (path.type === 'find') {
        const prevKey = getKeyFromPath(path.prev)
        return prevKey + '.' + `find(${path.key}=${path.value})`
    }

    if (path.type === 'object') {
        let args = ''

        for (const [key, subPath] of Object.entries(path.shape)) {
            args += `${key}:${getKeyFromPath(subPath)}, `
        }

        return `object(${args})`
    }
    if (path.type === 'union') {
        let args = ''

        for (const variant of path.variants) {
            args += `${getKeyFromPath(variant)} | `
        }

        return `union(${args})`
    }

    if (path.type === 'optional') {
        return `optional(${getKeyFromPath(path.inner)})`
    }

    path satisfies never

    throw new Error('[koka-domain] getKeyFromPath: invalid path type')
}

export type AnyDomain = Domain<any, any>

let domainCtorUid = 0

export function getDomainCtorKey(DomainCtor: new (...args: any[]) => AnyDomain): string {
    return `${(DomainCtor as Function).name ?? 'Anonymous'}:${domainCtorUid++}`
}

export function getDomainCacheKey<StateType, Root>(Ctor: typeof Domain<StateType, Root>, path: DomainPath): string {
    return getDomainCtorKey(Ctor) + ':' + getKeyFromPath(path)
}

export class Store<Root> {
    state: Root
    domain: Domain<Root, Root>

    plugins: StorePlugin<Root, this>[] = []
    private pluginCleanup: (() => void)[] = []

    constructor(options: StoreOptions<Root>) {
        this.state = options.state
        this.domain = new Domain<Root, Root>(this, Accessor.root<Root>(), { type: 'root' })

        this.plugins = [...this.plugins, ...(options.plugins ?? [])]

        for (const plugin of this.plugins) {
            this.addPlugin(plugin)
        }
    }

    addPlugin(plugin: StorePlugin<Root, this>) {
        const cleanup = plugin(this)
        if (cleanup) {
            this.pluginCleanup.push(cleanup)
            return () => {
                const index = this.pluginCleanup.indexOf(cleanup)
                if (index !== -1) {
                    const cleanup = this.pluginCleanup[index]
                    this.pluginCleanup.splice(index, 1)
                    cleanup()
                }
            }
        }
        return () => {}
    }

    getState() {
        return this.state
    }

    setState(state: Root): void {
        this.state = state
        this.dirty = true
        this.version += 1
        const currentVersion = this.version
        this.promise = Promise.resolve().then(() => {
            if (currentVersion === this.version) this.publish()
        })
    }

    get<S>(domain: Domain<S, Root>): Result<S> {
        return Accessor.get(this.state, domain.accessor)
    }

    set<S>(domain: Domain<S, Root>, setStateInput: SetStateInput<S>): Result<Root> {
        const result = Accessor.set(this.state, domain.accessor, setStateInput)
        if (result.type === 'err') {
            return result
        }
        this.setState(result.value)
        return result
    }

    /** Subscribe to state changes at a State reference. */
    subscribeDomain<S>(domain: Domain<S, Root>, subscriber: (state: S) => unknown): () => void {
        let previous: Result<S> | undefined
        return this.subscribeState(() => {
            const current = this.get(domain)
            if (previous !== undefined && shallowEqualResult(previous, current)) {
                return
            }
            previous = current
            if (current.type === 'ok') {
                subscriber(current.value)
            }
        })
    }

    private dirty = false
    version = 0
    promise = Promise.resolve()

    private listeners: ((state: Root) => unknown)[] = []

    subscribeState(listener: (state: Root) => unknown): () => void {
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
        this.dirty = false

        const affectedDomainStorages = this.getAffectedDomainStoragesFromDiff()

        if (affectedDomainStorages.size > 0) {
            this.propagateFromAffectedDomainStorages(affectedDomainStorages)
        }

        for (const listener of this.listeners) {
            listener(this.state)
        }
    }

    /** Top-down from store.domain: compare each domain’s cached result (last read) vs current state; prune when unchanged. */
    private getAffectedDomainStoragesFromDiff(): Set<DomainStorage> {
        const affected = new Set<DomainStorage>()
        const rootDs = this.getRootDomainStorage()

        const visit = (ds: DomainStorage) => {
            const cached = ds.result
            const current = Accessor.get(this.state, ds.domain.accessor)
            if (cached !== undefined && shallowEqualResult(cached, current)) return
            if (cached !== undefined) {
                affected.add(ds)
                ds.result = undefined
            }
            for (const c of ds.children) visit(c)
        }
        visit(rootDs)
        return affected
    }

    /**
     * Affected domain storages (from top-down diff with prune) → dependent query closure → topological sort → single pass.
     */
    private propagateFromAffectedDomainStorages(affectedDomainStorages: Set<DomainStorage>): void {
        const directDirty = new Set<QueryStorage>()
        for (const ds of affectedDomainStorages) {
            for (const qs of ds.usedBy.values()) {
                directDirty.add(qs)
            }
        }

        const allDirty = new Set<QueryStorage>(directDirty)
        const collectUsedBy = (q: QueryStorage) => {
            for (const u of q.usedBy.values()) {
                if (!allDirty.has(u)) {
                    allDirty.add(u)
                    collectUsedBy(u)
                }
            }
        }
        for (const qs of directDirty) {
            collectUsedBy(qs)
        }

        const sorted = topologicalSortQueryStorages(allDirty)
        const changed = new Set<QueryStorage>()
        const toNotify = new Set<QueryStorage>()

        const checkUpstreamChange = (qs: QueryStorage) => {
            for (const dep of qs.queryDeps.values()) {
                if (changed.has(dep)) return true
            }
            return false
        }

        for (const qs of sorted) {
            const hasUpstreamChange = directDirty.has(qs) || checkUpstreamChange(qs)
            if (!hasUpstreamChange) continue

            const oldReturn = qs.current?.return
            qs.current = undefined
            this.runQuery(qs.query, ...qs.args)
            const newReturn = qs.current!.return
            if (!shallowEqual(oldReturn, newReturn)) {
                changed.add(qs)
                toNotify.add(qs)
            }
        }

        for (const qs of toNotify) {
            const value = qs.current!.return
            for (const sub of qs.subscribers) {
                sub(value)
            }
        }
    }

    abortController = new AbortController()

    destroy(): void {
        this.abortController.abort()
        this.listeners = []

        for (const cleanup of this.pluginCleanup) {
            cleanup()
        }

        this.pluginCleanup = []
        this.domainCache.clear()
    }

    private domainCache = new Map<string, Domain<any, Root>>()

    private eventSubscribers = new Map<AnyEventCtor, EventHandler<AnyEventCtor, Root>[]>()

    subscribeEvent<E extends AnyEventCtor>(event: E, handler: EventHandler<E, Root>): () => void {
        let eventSubscribers = this.eventSubscribers.get(event)
        if (!eventSubscribers) {
            eventSubscribers = []
            this.eventSubscribers.set(event, eventSubscribers)
        }
        eventSubscribers.push(handler)
        return () => {
            const index = eventSubscribers.indexOf(handler)
            if (index !== -1) {
                eventSubscribers.splice(index, 1)
            }
        }
    }

    runQuery<Args extends Serializable[], Return>(query: Query<Args, Return, Root>, ...args: Args): Return {
        const queryStorage = getOrCreateQueryStorage(query, args)

        if (queryStorage.current) {
            return queryStorage.current.return as Return
        }

        /** Re-record dependencies: disconnect from old upstreams, clear deps; the query run below will re-populate via getResult/query(). */
        for (const domainStorage of queryStorage.domainDeps.values()) {
            domainStorage.usedBy.delete(queryStorage.key)
        }

        for (const queryDepStorage of queryStorage.queryDeps.values()) {
            queryDepStorage.usedBy.delete(queryStorage.key)
        }

        queryStorage.domainDeps.clear()
        queryStorage.queryDeps.clear()

        const queryContext: QueryContext<Root> = {
            get: (domain) => {
                const result = queryContext.getResult(domain)
                if (result.type === 'err') {
                    throw result.error
                }
                return result.value
            },
            getResult: (domain) => {
                const domainStorage = getOrCreateDomainStorage(domain)

                queryStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
                domainStorage.usedBy.set(queryStorage.key, queryStorage)

                return getDomainResult(domain)
            },
            query: (query, ...args) => {
                const targetQueryStorage = getOrCreateQueryStorage(query, args)

                queryStorage.queryDeps.set(targetQueryStorage.key, targetQueryStorage)
                targetQueryStorage.usedBy.set(queryStorage.key, queryStorage)

                if (targetQueryStorage.current) {
                    return targetQueryStorage.current.return as ReturnType<typeof query>
                }

                return this.runQuery(query, ...args)
            },
        }

        const result = query(queryContext, ...args)

        queryStorage.current = {
            version: this.version,
            return: result,
        }

        return result
    }

    subscribeQuery<Args extends Serializable[], Return>(
        query: Query<Args, Return, Root>,
        ...args: Args
    ): (subscriber: (value: Return) => unknown) => () => void {
        const queryStorage = getOrCreateQueryStorage(query, args)

        return (subscriber: (value: Return) => unknown) => {
            queryStorage.subscribers.add(subscriber as (value: unknown) => unknown)

            return () => {
                queryStorage.subscribers.delete(subscriber as (value: unknown) => unknown)
            }
        }
    }

    runCommand<Args extends Serializable[], Return>(command: Command<Args, Return, Root>, ...args: Args): Return {
        const commandContext: CommandContext<Root> = {
            get: (domain) => {
                const result = commandContext.getResult(domain)
                if (result.type === 'err') {
                    throw result.error
                }
                return result.value
            },
            getResult: (domain) => this.get(domain),
            set: (domain, setStateInput) => this.set(domain, setStateInput),
            query: (query, ...queryArgs) => this.runQuery(query, ...queryArgs),
            emit: (event) => this.emitEvent(event),
        }
        return command(commandContext, ...args)
    }

    emitEvent<E extends AnyEvent>(event: E): void {
        const eventSubscribers = this.eventSubscribers.get(event.constructor as AnyEventCtor)
        if (!eventSubscribers) {
            return
        }

        const eventContext: EventContext<Root> = {
            get: (domain) => {
                const result = eventContext.getResult(domain)
                if (result.type === 'err') {
                    throw result.error
                }
                return result.value
            },
            getResult: (domain) => {
                return this.get(domain)
            },
            set: (domain, setStateInput) => {
                return this.set(domain, setStateInput)
            },
            emit: (event) => {
                this.emitEvent(event)
            },
        }

        for (const handler of eventSubscribers) {
            handler(eventContext, event)
        }
    }

    getDomainFromCache<StateType>(
        Ctor: typeof Domain<any, Root>,
        path: DomainPath,
    ): Domain<StateType, Root> | undefined {
        const key = getDomainCacheKey(Ctor, path)
        const domain = this.domainCache.get(key)

        return domain
    }

    setDomainInCache<StateType>(domain: Domain<StateType, Root>, path: DomainPath): boolean {
        const result = domain.accessor.get(this.getState())

        if (result.type === 'err') {
            return false
        }

        const key = getDomainCacheKey(domain.constructor as typeof Domain<StateType, Root>, path)
        this.domainCache.set(key, domain)

        return true
    }

    removeDomainFromCache<StateType>(domain: Domain<StateType, Root>, path: DomainPath): boolean {
        const key = getDomainCacheKey(domain.constructor as typeof Domain<StateType, Root>, path)
        return this.domainCache.delete(key)
    }

    /** Resolve a domain by path (any Ctor) for building the domain tree. */
    getDomainByPath(path: DomainPath): Domain<any, Root> | undefined {
        if (path.type === 'root') return this.domain
        const pathKey = getKeyFromPath(path)
        for (const domain of this.domainCache.values()) {
            if (getKeyFromPath(domain.path) === pathKey) return domain
        }
        return undefined
    }

    /** Root domain storage for top-down diff; created on demand. */
    getRootDomainStorage(): DomainStorage {
        return getOrCreateDomainStorage(this.domain)
    }
}

export type EventContext<Root = any> = {
    get: <State>(domain: Domain<State, Root>) => State
    getResult: <State>(domain: Domain<State, Root>) => Result<State>
    set: <State>(domain: Domain<State, Root>, setStateInput: SetStateInput<State>) => Result<Root>
    emit: <E extends AnyEvent>(event: E) => void
}

export type EventInput<E extends AnyEvent, D extends AnyDomain> = {
    domain: D
    event: E
}

export interface Event<Name extends string, T> {
    type: 'event'
    name: Name
    payload: T
}

export type AnyEvent = Event<string, any>

export function Event<const Name extends string>(name: Name) {
    return class EventClass<T = void> implements Event<Name, T> {
        type = 'event' as const
        name = name
        payload: T
        constructor(payload: T) {
            this.payload = payload
        }
    }
}

type EventCtor<Name extends string, T> = new (...args: any[]) => Event<Name, T>

type AnyEventCtor = EventCtor<string, any>

export type EventValue<E extends AnyEvent> = E['payload']

export type EventHandler<E extends AnyEventCtor, Root = any> = (
    context: EventContext<Root>,
    event: EventValue<InstanceType<E>>,
) => void

const eventHandlersStorages = new WeakMap<AnyDomain, Map<AnyEventCtor, Array<EventHandler<AnyEventCtor>>>>()

export function event<ES extends AnyEventCtor[]>(...Events: ES) {
    return function <This extends AnyDomain, Return, Root = any>(
        target: (this: This, event: InstanceType<ES[number]>, context: EventContext<Root>) => unknown,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        context.addInitializer(function () {
            if (!(this instanceof Domain)) {
                throw new Error('Event must be used on a Domain class')
            }

            let eventHandlersStorage = eventHandlersStorages.get(this)

            if (!eventHandlersStorage) {
                eventHandlersStorage = new Map()
                eventHandlersStorages.set(this, eventHandlersStorage)
            }

            for (const EventCtor of Events) {
                let eventHandlers = eventHandlersStorage.get(EventCtor)

                if (!eventHandlers) {
                    eventHandlers = []
                    eventHandlersStorage.set(EventCtor, eventHandlers)
                }

                eventHandlers.push(target as EventHandler<typeof EventCtor, Root>)
            }
        })

        return target
    }
}

export type SetStateInput<S> = S | Accessor.Updater<S> | ((state: S) => S)

export type StoreCtor<S extends AnyStore = AnyStore> =
    | (abstract new <Root>(options: StoreOptions<Root>) => S)
    | (new <Root>(options: StoreOptions<Root>) => S)

type KokaClassMethodDecoratorContext<
    This = unknown,
    Value extends (this: This, ...args: any) => any = (this: This, ...args: any) => any,
> = ClassMethodDecoratorContext<This, Value> & {
    /**
     * The name of the method should be a string.
     */
    name: string
    /**
     * The static property should be false, which means that the method is an instance method.
     */
    static: false
}

export type QueryContext<Root = any> = {
    get: <State>(domain: Domain<State, Root>) => State
    getResult: <State>(domain: Domain<State, Root>) => Result<State>

    query: <Args extends Serializable[], Return>(query: Query<Args, Return, Root>, ...args: Args) => Return
}

export type Query<Args extends Serializable[], Return, Root = any> = {
    (context: QueryContext<Root>, ...args: Args): Return
    domain: AnyDomain
    methodName: string
}

export type AnyQuery = Query<any, any, any>

type DomainStorage = {
    domain: AnyDomain
    result?: Result<any>
    queryStorages: Map<string, QueryStorage>
    usedBy: Map<string, QueryStorage>
    /** Child domain storages in the path tree (select/match/find/optional/object/union). Used for top-down diff with prune. */
    children: Set<DomainStorage>
}

type QueryStorage = {
    query: AnyQuery
    key: string
    args: Serializable[]
    domainDeps: Map<string, DomainStorage>
    queryDeps: Map<string, QueryStorage>
    usedBy: Map<string, QueryStorage>
    subscribers: Set<(value: unknown) => unknown>
    current?: {
        version: number
        return: unknown
    }
}

/** Topological order: dependencies before dependents (so re-run order is safe). */
function topologicalSortQueryStorages(storages: Set<QueryStorage>): QueryStorage[] {
    const result: QueryStorage[] = []
    const visited = new Set<QueryStorage>()
    const visiting = new Set<QueryStorage>()

    function visit(qs: QueryStorage) {
        if (visited.has(qs)) return
        if (visiting.has(qs)) return
        visiting.add(qs)
        for (const dep of qs.queryDeps.values()) {
            if (storages.has(dep)) visit(dep)
        }
        visiting.delete(qs)
        visited.add(qs)
        result.push(qs)
    }

    for (const qs of storages) {
        visit(qs)
    }
    return result
}

const checkQueryStorageDeps = (queryStorage: QueryStorage) => {
    for (const domainStorage of queryStorage.domainDeps.values()) {
        if (!domainStorage.result) {
            return false
        }

        const currentResult = domainStorage.domain.store.get(domainStorage.domain)

        if (!shallowEqualResult(currentResult, domainStorage.result)) {
            return false
        }
    }

    for (const queryDepStorage of queryStorage.queryDeps.values()) {
        const isDirty = checkQueryStorageDeps(queryDepStorage)

        if (!isDirty) {
            return false
        }
    }

    return true
}

/** Parent path(s) in the domain path tree; used to attach this domain storage to parent(s) for top-down traverse. */
function getParentPaths(path: DomainPath): DomainPath[] {
    switch (path.type) {
        case 'root':
            return []
        case 'select':
        case 'match':
        case 'find':
            return [path.prev]
        case 'optional':
            return [path.inner]
        case 'object':
            return Object.values(path.shape)
        case 'union':
            return path.variants
        default:
            path satisfies never
            return []
    }
}

const domainStorages = new WeakMap<AnyDomain, DomainStorage>()

function getOrCreateDomainStorage(domain: AnyDomain): DomainStorage {
    let domainStorage = domainStorages.get(domain)
    if (!domainStorage) {
        domainStorage = {
            domain,
            queryStorages: new Map(),
            usedBy: new Map(),
            children: new Set(),
        }
        domainStorages.set(domain, domainStorage)
        for (const parentPath of getParentPaths(domain.path)) {
            const parentDomain = domain.store.getDomainByPath(parentPath)
            if (parentDomain) {
                getOrCreateDomainStorage(parentDomain).children.add(domainStorage)
            }
        }
    }
    return domainStorage
}

function getOrCreateQueryStorage(query: AnyQuery, args: Serializable[]): QueryStorage {
    const domainStorage = getOrCreateDomainStorage(query.domain)
    const queryKey = `${query.methodName}(${JSON.stringify(args)})`

    let queryStorage = domainStorage.queryStorages.get(queryKey)

    if (!queryStorage) {
        queryStorage = {
            query,
            key: queryKey,
            args,
            domainDeps: new Map(),
            queryDeps: new Map(),
            usedBy: new Map(),
            subscribers: new Set(),
        }

        domainStorage.queryStorages.set(queryKey, queryStorage)
    }

    return queryStorage
}

export function query() {
    return function <This extends AnyDomain, Return, Args extends Serializable[], Root = any>(
        target: (this: This, context: QueryContext<Root>, ...args: Args) => unknown,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = context.name

        context.addInitializer(function () {
            // @ts-ignore
            this[methodName] = this[methodName].bind(this)

            // @ts-ignore
            this[methodName].domain = this
            // @ts-ignore
            this[methodName].methodName = methodName
        })

        return target
    }
}

function getDomainResult<State, Root = any>(domain: Domain<State, Root>): Result<State> {
    const domainStorage = getOrCreateDomainStorage(domain)

    if (!domainStorage.result) {
        domainStorage.result = domain.store.get(domain)

        return domainStorage.result
    }

    return domainStorage.result
}

function getDomainState<State, Root = any>(domain: Domain<State, Root>): State {
    const result = getDomainResult(domain)
    if (result.type === 'err') {
        throw result.error
    }
    return result.value
}

export type CommandContext<Root = any> = {
    get: <State>(domain: Domain<State, Root>) => State
    getResult: <State>(domain: Domain<State, Root>) => Result<State>
    set: <State>(domain: Domain<State, Root>, setStateInput: SetStateInput<State>) => Result<Root>
    query: <Args extends Serializable[], Return>(query: Query<Args, Return, Root>, ...args: Args) => Return
    emit: <E extends AnyEvent>(event: E) => void
}

export type Command<Args extends Serializable[], Return, Root = any> = {
    (context: CommandContext<Root>, ...args: Args): Return
    domain: AnyDomain
    methodName: string
}

export type AnyCommand = Command<any, any, any>

export function command() {
    return function <This extends AnyDomain, Args extends Serializable[], Return, Root = any>(
        target: (this: This, context: CommandContext<Root>, ...args: Args) => Return,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = context.name

        context.addInitializer(function () {
            if (!(this instanceof Domain)) {
                throw new Error('Command must be used on a Domain class')
            }

            // @ts-ignore
            this[methodName] = this[methodName].bind(this)
            // @ts-ignore
            this[methodName].domain = this
            // @ts-ignore
            this[methodName].methodName = methodName
        })

        return target
    }
}

type EffectContext = {
    abortSignal: AbortSignal
    abortController: AbortController
}

type EffectMethod = (effectContext: EffectContext) => unknown

const effectMethodsStorage = new WeakMap<new (...args: any[]) => any, Map<string, EffectMethod>>()

const getEffectfulMethods = (domain: AnyDomain): Map<string, EffectMethod> | undefined => {
    let methods = effectMethodsStorage.get(domain.constructor as new (...args: any[]) => any)
    return methods
}

function effect() {
    return function <This, Value extends EffectMethod>(
        target: Value,
        context: ClassMethodDecoratorContext<This, Value> & {
            static: false
        },
    ): Value {
        const methodName = String(context.name)

        context.addInitializer(function (this: This) {
            const DomainCtor = (this as AnyDomain).constructor as new (...args: any[]) => any

            let methods = effectMethodsStorage.get(DomainCtor)
            if (!methods) {
                methods = new Map()
                effectMethodsStorage.set(DomainCtor, methods)
            }

            methods.set(methodName, target as EffectMethod)
        })

        return target
    }
}

/** Get state at domain (capability-passing: use store.get directly or pass context in query/command). */
export function getState<State, Root>(domain: Domain<State, Root>): Result<State> {
    return domain.store.get(domain)
}

/** Set state at domain (capability-passing: use store.set directly or pass context in command). */
export function setState<State, Root>(domain: Domain<State, Root>, setStateInput: SetStateInput<State>): Result<Root> {
    return domain.store.set(domain, setStateInput)
}

export function subscribeDomainResult<State, Root>(
    domain: Domain<State, Root>,
    listener: (result: Result<State>) => unknown,
): () => void {
    let previousResult: Result<State> | undefined

    return domain.store.subscribeState(() => {
        const result = getState(domain)

        if (previousResult !== undefined && shallowEqualResult(result, previousResult)) {
            return
        }

        previousResult = result
        listener(result)
    })
}

export function subscribeDomainState<State, Root>(
    domain: Domain<State, Root>,
    listener: (state: State) => unknown,
): () => void {
    return subscribeDomainResult(domain, (result) => {
        if (result.type === 'err') {
            return
        }
        listener(result.value)
    })
}
