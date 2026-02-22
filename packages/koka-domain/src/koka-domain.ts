import * as Accessor from 'koka-accessor'
import { shallowEqual } from './shallowEqual'

// ---------------------------------------------------------------------------
// Re-export shallowEqual
// ---------------------------------------------------------------------------
export { shallowEqual }

// ---------------------------------------------------------------------------
// Serializable & Result
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Domain path (structural description of domain tree)
// ---------------------------------------------------------------------------

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

export type DomainFilterPath = {
    type: 'filter'
    key: string
    value: SerializablePrimitives
    prev: DomainPath
}

export type DomainMapPath = {
    type: 'map'
    key: string
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
    | DomainFilterPath
    | DomainMapPath

// ---------------------------------------------------------------------------
// SetStateInput
// ---------------------------------------------------------------------------

export type SetStateInput<S> = S | Accessor.Updater<S> | ((state: S) => S)

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type EventRequest = GenGetRequest | GenGetResultRequest | GenSetRequest | GenEmitRequest

export interface Event<Name extends string, T> {
    type: 'event'
    name: Name
    payload: T
}

export type AnyEvent = Event<string, any>

type EventCtor<Name extends string, T> = new (...args: any[]) => Event<Name, T>

export type AnyEventCtor = EventCtor<string, any>

export type EventValue<E extends AnyEvent> = E['payload']

/** Event handler: generator method taking event payload, yielding GenRequest. */
export type EventHandler<E extends AnyEventCtor> = (
    event: EventValue<InstanceType<E>>,
) => Generator<EventRequest, void, unknown>

// ---------------------------------------------------------------------------
// Store options (interface to break circular ref; Store class defined later)
// ---------------------------------------------------------------------------

export interface IStore<Root> {
    getState(): Root
    state: Root
}

export type StorePlugin<Root, S extends IStore<Root> = IStore<Root>> = (store: S) => (() => void) | void

export type StoreOptions<Root> = {
    state: Root
    plugins?: StorePlugin<Root, IStore<Root>>[]
}

// InferStoreState, InferDomainState, InferDomainRoot, ObjectShape, StoreCtor exported after Store/Domain

// ---------------------------------------------------------------------------
// Decorator context (for @query, @command, @event, @effect)
// ---------------------------------------------------------------------------

export type KokaClassMethodDecoratorContext<
    This = unknown,
    Value extends (this: This, ...args: any) => any = (this: This, ...args: any) => any,
> = ClassMethodDecoratorContext<This, Value> & {
    name: string
    static: false
}

// ---------------------------------------------------------------------------
// getKeyFromPath / getDomainCtorKey / getDomainCacheKey (before Domain)
// ---------------------------------------------------------------------------

const getKeyFromPathCache = new WeakMap<DomainPath, string>()

export function getKeyFromPath(path: DomainPath): string {
    const cached = getKeyFromPathCache.get(path)
    if (cached) {
        return cached
    }
    let result: string
    if (path.type === 'root') {
        result = 'root'
    } else if (path.type === 'select') {
        result = getKeyFromPath(path.prev) + '.' + path.key
    } else if (path.type === 'match') {
        result = getKeyFromPath(path.prev) + '.' + `match(${path.key}=${path.value})`
    } else if (path.type === 'find') {
        result = getKeyFromPath(path.prev) + '.' + `find(${path.key}=${path.value})`
    } else if (path.type === 'filter') {
        result = getKeyFromPath(path.prev) + '.' + `filter(${path.key}=${path.value})`
    } else if (path.type === 'map') {
        result = getKeyFromPath(path.prev) + '.' + `map(${path.key})`
    } else if (path.type === 'object') {
        result = `object(${Object.entries(path.shape)
            .map(([pathKey, subPath]) => `${pathKey}:${getKeyFromPath(subPath)}`)
            .join(', ')})`
    } else if (path.type === 'union') {
        result = `union(${path.variants.map((variant) => getKeyFromPath(variant)).join(' | ')})`
    } else if (path.type === 'optional') {
        result = `optional(${getKeyFromPath(path.inner)})`
    } else {
        path satisfies never
        throw new Error('[koka-domain] getKeyFromPath: invalid path type')
    }
    getKeyFromPathCache.set(path, result)
    return result
}

const domainCtorIdMap = new WeakMap<object, number>()
let domainCtorUid = 0

export function getDomainCtorKey(DomainCtor: new (...args: any[]) => any): string {
    let id = domainCtorIdMap.get(DomainCtor)
    if (id === undefined) {
        id = domainCtorUid++
        domainCtorIdMap.set(DomainCtor, id)
    }
    return `${(DomainCtor as Function).name ?? 'Anonymous'}:${id}`
}

export function getDomainCacheKey(Ctor: new (...args: any[]) => any, path: DomainPath): string {
    return getDomainCtorKey(Ctor) + ':' + getKeyFromPath(path)
}

// ---------------------------------------------------------------------------
// Domain class & related types
// ---------------------------------------------------------------------------

/** Single parent (derived) or multiple parents (composited). Root has no parent. */
export type ParentDomains<Root> = Domain<any, Root> | Set<Domain<any, Root>>

export type AnyDomain = Domain<any, any>

export type DomainCtor<StateType, Root, This extends Domain<StateType, Root> = Domain<StateType, Root>> = new (
    store: Store<Root>,
    accessor: Accessor.Accessor<StateType, Root>,
    path: DomainPath,
    parentDomain?: ParentDomains<Root>,
) => This

export type AnyDomainCtor = DomainCtor<any, any>

// ---------------------------------------------------------------------------
// Generator request shapes (depend on AnyDomain)
// ---------------------------------------------------------------------------

export type GenGetRequest = { type: 'get'; domain: AnyDomain }
export type GenGetResultRequest = { type: 'getResult'; domain: AnyDomain }
export type GenSetRequest = { type: 'set'; domain: AnyDomain; setStateInput: SetStateInput<unknown> }
export type GenEmitRequest = { type: 'emit'; event: AnyEvent }
/** Only valid inside @effect; suspends until promise resolves (gen.next(value)) or rejects (gen.throw(reason)). */
export type GenWaitRequest = { type: 'wait'; promise: Promise<unknown> }

/** Run multiple generators in parallel; wait requests are collected and Promise.all'd each frame. */
export type GenAllRequest = { type: 'all'; generators: Generator<GenRequest, unknown, unknown>[] }

/** Only valid inside @command; yields current run's CommandContext (created lazily). Use: yield* command.context() */
export type GenGetCommandContextRequest = { type: 'getCommandContext' }

export type GenRequest =
    | GenGetRequest
    | GenGetResultRequest
    | GenSetRequest
    | GenEmitRequest
    | GenWaitRequest
    | GenAllRequest
    | GenGetCommandContextRequest

export type QueryRequest = GenGetRequest | GenGetResultRequest

export type CommandRequest =
    | GenGetRequest
    | GenGetResultRequest
    | GenSetRequest
    | GenEmitRequest
    | GenWaitRequest
    | GenAllRequest
    | GenGetCommandContextRequest

export type EffectRequest =
    | GenGetRequest
    | GenGetResultRequest
    | GenSetRequest
    | GenEmitRequest
    | GenWaitRequest
    | GenAllRequest

export type Query<Args extends Serializable[], Return> = ((
    ...args: Args
) => Generator<QueryRequest, Return, unknown>) & {
    domain: AnyDomain
    methodName: string
}

export type AnyQuery = Query<any, any>

export type QueryRun<Return = unknown> = Generator<QueryRequest, Return, unknown>

export type AnyQueryRun = QueryRun<any>

export type Command<Args extends Serializable[], Return> = ((
    ...args: Args
) => Generator<CommandRequest, Return, unknown>) & {
    domain: AnyDomain
    methodName: string
}

export type AnyCommand = Command<any, any>

export type EffectContext = {
    abortSignal: AbortSignal
    abortController: AbortController
}

/**
 * Context for a single command run. Provides time-dimension access:
 * - **Sequence**: `yield* waitFor(ctx.previous?.return)` — wait for previous run to finish.
 * - **Switch**: `ctx.previous?.abortController.abort()` — cancel previous run.
 */
export type CommandContext<Args extends Serializable[] = Serializable[], T = unknown> = {
    /** Arguments passed to this command invocation. */
    args: Args
    /** Resolves when this run completes (sync or async). Use for sequence: waitFor(ctx.previous?.return). */
    return: Promise<T>
    /** Abort this run, or previous: ctx.previous?.abortController.abort() for switch semantics. */
    abortController: AbortController
    /** Context of the previous invocation (same domain+method). Undefined on first run. */
    previous?: CommandContext<Serializable[], unknown>
}

/** Helper namespace for command context types and semantics. */
export const commandContext = {
    /**
     * Type helper for CommandContext when using yield* command.context().
     * Example: const ctx = yield* command.context() as commandContext.Ctx<[string], string>
     */
    Ctx: undefined as unknown as new <Args extends Serializable[] = Serializable[], T = unknown>() => CommandContext<
        Args,
        T
    >,
}

/** Internal: used by Store to resolve/reject ctx.return. */
const COMMAND_CONTEXT_SETTLE = Symbol.for('koka-domain.commandContext.settle')
export type CommandContextSettle = {
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
}
export type CommandContextWithSettle = CommandContext & { [COMMAND_CONTEXT_SETTLE]: CommandContextSettle }

/** Effect 方法签名：由 @effect 装饰的方法 */
export type EffectMethod<
    This,
    Args extends [] | [ctx: EffectContext],
    Request extends EffectRequest = EffectRequest,
> = {
    (this: This, ...args: Args): Generator<Request, void, unknown>
}

export type AnyEffectMethod = EffectMethod<any, any, any>

export class Domain<StateType, Root> {
    readonly store: Store<Root>
    readonly accessor: Accessor.Accessor<StateType, Root>
    readonly path: DomainPath
    readonly key: string
    readonly parentDomain?: ParentDomains<Root>

    constructor(
        store: Store<Root>,
        accessor: Accessor.Accessor<StateType, Root>,
        path: DomainPath,
        parentDomain?: ParentDomains<Root>,
    ) {
        this.store = store
        this.accessor = accessor
        this.path = path
        this.parentDomain = parentDomain
        this.key = getDomainCacheKey(this.constructor as typeof Domain<StateType, Root>, this.path)
    }

    private localDomainCache = new Map<string, Domain<any, Root>>()

    getDomainFromCache<S>(Ctor: DomainCtor<S, Root>, path: DomainPath): Domain<S, Root> | undefined {
        const key = getDomainCacheKey(Ctor as typeof Domain<any, Root>, path)
        const local = this.localDomainCache.get(key) as Domain<S, Root> | undefined
        if (local !== undefined) {
            return local
        }
        return this.store.getDomainFromCache(Ctor, path)
    }

    setDomainInCache<S>(domain: Domain<S, Root>, path: DomainPath): boolean {
        const key = getDomainCacheKey((domain as Domain<S, Root>).constructor as typeof Domain<any, Root>, path)

        const success = this.store.setDomainInCache(domain, path)

        if (success) {
            this.localDomainCache.set(key, domain)
        }

        return success
    }

    getCachedDerivedDomains(): Domain<any, Root>[] {
        return Array.from(this.localDomainCache.values())
    }

    removeDerivedFromCache(key: string): void {
        this.localDomainCache.delete(key)
    }

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

        domain = new Domain(this.store, this.accessor.match(predicate), path, this)

        this.setDomainInCache(domain, path)

        return domain
    }

    find<Key extends keyof Accessor.ArrayItem<StateType> & string>(
        key: Key,
        value: Accessor.ArrayItem<StateType>[Key] & SerializablePrimitives,
    ): Domain<Accessor.ArrayItem<StateType>, Root> {
        type Item = Accessor.ArrayItem<StateType>

        const path: DomainFindPath = {
            type: 'find',
            key,
            value,
            prev: this.path,
        }

        let domain = this.getDomainFromCache(Domain, path) as Domain<Item, Root> | undefined

        if (domain) {
            return domain as any
        }

        const predicate = (item: Item): boolean => (item as Record<string, unknown>)[key] === value

        domain = new Domain(this.store, this.accessor.find(predicate), path, this)

        this.setDomainInCache(domain, path)

        return domain
    }

    filter<Key extends keyof Accessor.ArrayItem<StateType> & string, Value extends SerializablePrimitives>(
        key: Key,
        value: Value,
    ): Domain<Accessor.ArrayItem<StateType>[], Root> {
        type Item = Accessor.ArrayItem<StateType>
        const path: DomainFilterPath = {
            type: 'filter',
            key,
            value,
            prev: this.path,
        }

        let domain = this.getDomainFromCache(Domain, path) as Domain<Item[], Root> | undefined

        if (domain) {
            return domain as any
        }

        const predicate = (item: Item): boolean => (item as Record<string, unknown>)[key] === value

        domain = new Domain(this.store, this.accessor.filter(predicate), path, this)

        this.setDomainInCache(domain, path)

        return domain
    }

    map<Key extends keyof Accessor.ArrayItem<StateType> & string>(
        key: Key,
    ): Domain<Accessor.ArrayItem<StateType>[Key][], Root> {
        type Item = Accessor.ArrayItem<StateType>
        const path: DomainMapPath = {
            type: 'map',
            key,
            prev: this.path,
        }

        let domain = this.getDomainFromCache(Domain, path) as Domain<Item[Key][], Root> | undefined

        if (domain) {
            return domain as any
        }

        const itemAccessor = Accessor.root<Item>().prop(key)

        domain = new Domain(this.store, this.accessor.map(itemAccessor), path, this)

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

        domain = new Domain(this.store, accessor, path, this)

        this.setDomainInCache(domain, path)

        return domain
    }

    use<Used extends Domain<StateType, Root>>(Ctor: DomainCtor<StateType, Root, Used>): Used {
        let domain = this.getDomainFromCache(Ctor, this.path) as Used | undefined

        if (domain) {
            return domain as Used
        }

        domain = new Ctor(this.store, this.accessor, this.path, this)

        this.setDomainInCache(domain, this.path)

        return domain
    }

    static getParentDomains(domain: AnyDomain): AnyDomain[] {
        const parentDomain = domain.parentDomain
        if (parentDomain === undefined) {
            return []
        }
        if (parentDomain instanceof Domain) {
            return [parentDomain]
        }
        return Array.from(parentDomain)
    }

    static getAncestorDomains(domain: AnyDomain): AnyDomain[] {
        const ancestorSet = new Set<AnyDomain>()
        const queue: AnyDomain[] = [domain]
        while (queue.length > 0) {
            const current = queue.shift()!
            if (ancestorSet.has(current)) {
                continue
            }
            ancestorSet.add(current)
            for (const parent of Domain.getParentDomains(current)) {
                queue.push(parent)
            }
        }
        const depths = new Map<string, number>()
        for (const ancestor of ancestorSet) {
            const parents = Domain.getParentDomains(ancestor)
            depths.set(ancestor.key, parents.length === 0 ? 0 : -1)
        }
        for (let changed = true; changed; ) {
            changed = false
            for (const ancestor of ancestorSet) {
                if (depths.get(ancestor.key)! >= 0) {
                    continue
                }
                const parents = Domain.getParentDomains(ancestor)
                const maxParentDepth = Math.max(...parents.map((parent: AnyDomain) => depths.get(parent.key) ?? -1))
                if (maxParentDepth >= 0) {
                    depths.set(ancestor.key, 1 + maxParentDepth)
                    changed = true
                }
            }
        }
        return Array.from(ancestorSet).sort((domainA, domainB) => depths.get(domainA.key)! - depths.get(domainB.key)!)
    }
}

// ---------------------------------------------------------------------------
// Storage classes (class-based DomainStorage, QueryStorage, EffectStorage)
// ---------------------------------------------------------------------------

export class DomainStorage {
    readonly domain: AnyDomain
    private _result: Result<any> | undefined
    private _version: number | undefined
    readonly queryStorages = new Map<string, QueryStorage>()
    readonly usedByQueries = new Map<string, QueryStorage>()
    readonly usedByEffects = new Map<string, EffectStorage>()

    constructor(domain: AnyDomain) {
        this.domain = domain
    }

    get result(): Result<any> | undefined {
        return this._result
    }
    set result(v: Result<any> | undefined) {
        this._result = v
    }
    get version(): number | undefined {
        return this._version
    }
    set version(v: number | undefined) {
        this._version = v
    }

    clearResult(): void {
        this._result = undefined
        this._version = undefined
    }

    getResult(): Result<any> {
        const storeVersion = this.domain.store.version
        if (this._result !== undefined && this._version === storeVersion) {
            return this._result as Result<any>
        }
        if (this._result !== undefined && this._version !== storeVersion) {
            this._result = undefined
            this._version = undefined
        }
        this._result = this.domain.store.get(this.domain)
        this._version = storeVersion
        return this._result as Result<any>
    }

    static readonly _cache = new WeakMap<AnyDomain, DomainStorage>()

    static getOrCreate(domain: AnyDomain): DomainStorage {
        let storage = DomainStorage._cache.get(domain)
        if (!storage) {
            storage = new DomainStorage(domain)
            DomainStorage._cache.set(domain, storage)
        }
        return storage
    }

    static getDomainResult<State, Root = any>(domain: Domain<State, Root>): Result<State> {
        return DomainStorage.getOrCreate(domain).getResult() as Result<State>
    }
}

/** Discriminant for QueryStorage vs EffectStorage. */
export const StorageKind = { Query: 'query', Effect: 'effect' } as const
export type StorageKind = (typeof StorageKind)[keyof typeof StorageKind]

export class QueryStorage {
    readonly _storageKind = StorageKind.Query
    readonly query: AnyQuery
    readonly key: string
    readonly args: Serializable[]
    readonly domainDeps = new Map<string, DomainStorage>()
    readonly queryDeps = new Map<string, QueryStorage>()
    readonly usedByDomains = new Map<string, DomainStorage>()
    readonly usedByQueries = new Map<string, QueryStorage>()
    readonly usedByEffects = new Map<string, EffectStorage>()
    readonly subscribers = new Set<(value: unknown) => unknown>()
    private _result: Result<any> | undefined
    private _version: number | undefined

    constructor(query: AnyQuery, key: string, args: Serializable[], domain: AnyDomain, domainStorage: DomainStorage) {
        this.query = query
        this.key = key
        this.args = args
        this.usedByDomains.set(domain.key, domainStorage)
    }

    get result(): Result<any> | undefined {
        return this._result
    }
    set result(v: Result<any> | undefined) {
        this._result = v
    }
    get version(): number | undefined {
        return this._version
    }
    set version(v: number | undefined) {
        this._version = v
    }

    static getOrCreate(domain: AnyDomain, query: AnyQuery, args: Serializable[], explicitKey?: string): QueryStorage {
        const domainStorage = DomainStorage.getOrCreate(domain)
        const queryKey = explicitKey ?? `${query.methodName}(${JSON.stringify(args)})`
        let queryStorage = domainStorage.queryStorages.get(queryKey)
        if (!queryStorage) {
            queryStorage = new QueryStorage(query, queryKey, args, domain, domainStorage)
            domainStorage.queryStorages.set(queryKey, queryStorage)
        }
        return queryStorage
    }

    static isQueryStorage(x: QueryStorage | EffectStorage): x is QueryStorage {
        return x._storageKind === StorageKind.Query
    }
}

export class EffectStorage {
    readonly _storageKind = StorageKind.Effect
    readonly domain: AnyDomain
    readonly key: string
    readonly domainDeps = new Map<string, DomainStorage>()
    readonly queryDeps = new Map<string, QueryStorage>()
    private _abortController: AbortController | null = null
    readonly methods: AnyEffectMethod[]

    constructor(domain: AnyDomain, key: string, methods: AnyEffectMethod[]) {
        this.domain = domain
        this.key = key
        this.methods = methods
    }

    get abortController(): AbortController | null {
        return this._abortController
    }
    set abortController(c: AbortController | null) {
        this._abortController = c
    }

    abort(): void {
        if (this._abortController) {
            this._abortController.abort()
        }
    }

    removeFromUsedBy(): void {
        for (const domainStorage of this.domainDeps.values()) {
            domainStorage.usedByEffects.delete(this.key)
        }
        for (const queryStorage of this.queryDeps.values()) {
            queryStorage.usedByEffects.delete(this.key)
        }
    }

    clearDeps(): void {
        this.domainDeps.clear()
        this.queryDeps.clear()
    }
}

type QueryOrEffectStorage = QueryStorage | EffectStorage

function topologicalSortDirty(storages: Set<QueryOrEffectStorage>): QueryOrEffectStorage[] {
    const result: QueryOrEffectStorage[] = []
    const visited = new Set<QueryOrEffectStorage>()
    const visiting = new Set<QueryOrEffectStorage>()

    function getDeps(node: QueryOrEffectStorage): QueryOrEffectStorage[] {
        const deps: QueryOrEffectStorage[] = []
        for (const dep of node.queryDeps.values()) {
            if (storages.has(dep)) {
                deps.push(dep)
            }
        }
        return deps
    }

    function visit(node: QueryOrEffectStorage): void {
        if (visited.has(node)) {
            return
        }
        if (visiting.has(node)) {
            return
        }
        visiting.add(node)
        for (const dep of getDeps(node)) {
            visit(dep)
        }
        visiting.delete(node)
        visited.add(node)
        result.push(node)
    }

    for (const node of storages) {
        visit(node)
    }
    return result
}

// ---------------------------------------------------------------------------
// AnyStore & store/domain inference types (after Store/Domain class)
// ---------------------------------------------------------------------------

export type AnyStore = Store<any>

export type InferStoreState<S> = S extends Store<infer State> ? State : never
export type InferDomainState<S> = S extends Domain<infer StateType, any> ? StateType : never
export type InferDomainRoot<S> = S extends Domain<any, infer Root> ? Root : never

export type ObjectShape<Root, Shape extends Record<string, Domain<any, Root>>> = {
    [K in keyof Shape]: Shape[K] extends Domain<infer State, Root> ? State : never
}

export type StoreCtor<S extends AnyStore = AnyStore> =
    | (abstract new <Root>(options: StoreOptions<Root>) => S)
    | (new <Root>(options: StoreOptions<Root>) => S)

// ---------------------------------------------------------------------------
// shallowEqualResult
// ---------------------------------------------------------------------------

export function shallowEqualResult<T>(resultA: Result<T>, resultB: Result<T>): boolean {
    if (resultA === resultB) {
        return true
    }

    if (resultA.type === 'ok' && resultB.type === 'ok') {
        return shallowEqual(resultA.value, resultB.value)
    }

    if (resultA.type === 'err' && resultB.type === 'err') {
        return shallowEqual(resultA.error, resultB.error)
    }

    return false
}

// ---------------------------------------------------------------------------
// object / union / optional
// ---------------------------------------------------------------------------

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

    domain = new Domain(store, accessor, path, new Set(Object.values(shape)))

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

    domain = new Domain(store, accessor, path, new Set(variants))

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

    domain = new Domain(inner.store, accessor, path, inner)

    inner.store.setDomainInCache(domain, path)

    return domain
}

// ---------------------------------------------------------------------------
// Generator run metadata (WeakMap<gen, metadata> for query/command/event)
// ---------------------------------------------------------------------------

export type GenRunMeta = {
    domain: AnyDomain
    methodName: string
    args: Serializable[]
    /** Query only: args -> cacheKey for incremental computation, set in @query decorator */
    cacheKey?: string
    /** Set when using @commandWithContext: context for this run (sequence/switch semantics). */
    commandContext?: CommandContextWithSettle
}

const genToMeta = new WeakMap<Generator<GenRequest, unknown, unknown>, GenRunMeta>()

export function getGenRunMeta(gen: Generator<GenRequest, unknown, unknown>): GenRunMeta | undefined {
    return genToMeta.get(gen)
}

function registerGen(gen: Generator<GenRequest, unknown, unknown>, meta: GenRunMeta): void {
    genToMeta.set(gen, meta)
}

type FiberState<Root> = {
    gen: Generator<GenRequest, unknown, unknown>
    stack: Array<{ gen: Generator<GenRequest, unknown, unknown>; sendValue: unknown }>
    sendValue: unknown
}

function runFiberUntilWaitOrDone<Root>(
    store: Store<Root>,
    fiber: FiberState<Root>,
): { done: unknown } | { wait: Promise<unknown>; state: FiberState<Root> } {
    let current = fiber.gen
    let sendValue = fiber.sendValue
    const stack = [...fiber.stack]

    for (;;) {
        const step = current.next(sendValue)
        if (step.done) {
            const returnValue = step.value
            if (stack.length === 0) {
                const meta = genToMeta.get(current)
                meta?.commandContext?.[COMMAND_CONTEXT_SETTLE]?.resolve(returnValue)
                return { done: returnValue }
            }
            const prev = stack.pop()!
            current = prev.gen
            sendValue = returnValue
            continue
        }
        const yielded = step.value
        if (
            yielded &&
            typeof (yielded as unknown as Generator).next === 'function' &&
            genToMeta.has(yielded as unknown as Generator<GenRequest, unknown, unknown>)
        ) {
            const subGen = yielded as unknown as Generator<GenRequest, unknown, unknown>
            stack.push({ gen: current, sendValue })
            current = subGen
            sendValue = undefined
            continue
        }
        const req = yielded as GenRequest
        if (req.type === 'get') {
            const result = DomainStorage.getDomainResult(req.domain)
            if (result.type === 'err') return { done: undefined }
            sendValue = result.value
            continue
        }
        if (req.type === 'getResult') {
            sendValue = DomainStorage.getDomainResult(req.domain)
            continue
        }
        if (req.type === 'set') {
            const res = store.set(req.domain as Domain<unknown, Root>, req.setStateInput as SetStateInput<unknown>)
            if (res !== null && typeof res === 'object' && (res as Result<unknown>).type === 'err')
                return { done: undefined }
            sendValue = res
            continue
        }
        if (req.type === 'emit') {
            store.emitEvent(req.event)
            sendValue = undefined
            continue
        }
        if (req.type === 'wait') {
            fiber.gen = current
            fiber.stack = stack
            fiber.sendValue = sendValue
            return { wait: req.promise, state: fiber }
        }
        if (req.type === 'all') {
            throw new Error('[koka-domain] all() cannot be nested inside all()')
        }
        if (req.type === 'getCommandContext') {
            const meta = genToMeta.get(current)
            if (!meta) {
                throw new Error('[koka-domain] getCommandContext only valid inside a command run')
            }
            if (!meta.commandContext) {
                meta.commandContext = store.createCommandContext(meta.domain, meta.methodName, meta.args)
            }
            sendValue = meta.commandContext
            continue
        }
        req as never satisfies never
        throw new Error('[koka-domain] runFiberUntilWaitOrDone: unknown request')
    }
}

function runAllParallel<Root>(
    store: Store<Root>,
    generators: Generator<GenRequest, unknown, unknown>[],
): Promise<unknown[]> {
    const fibers: (FiberState<Root> | null)[] = generators.map((gen) => ({ gen, stack: [], sendValue: undefined }))
    const results: unknown[] = new Array(generators.length)

    function step(): Promise<unknown[]> {
        const waits: { fiber: FiberState<Root>; promise: Promise<unknown> }[] = []
        for (let i = 0; i < fibers.length; i++) {
            const fiber = fibers[i]
            if (fiber === null) continue
            const r = runFiberUntilWaitOrDone(store, fiber)
            if ('done' in r) {
                results[i] = r.done
                fibers[i] = null
            } else {
                waits.push({ fiber: r.state, promise: r.wait })
            }
        }
        if (waits.length > 0) {
            return Promise.all(waits.map((w) => w.promise)).then((values) => {
                waits.forEach((w, idx) => {
                    w.fiber.sendValue = values[idx]
                })
                return step()
            })
        }
        return Promise.resolve(results)
    }
    return step()
}

type RunGeneratorCallbacks = {
    onComplete?: (value: unknown) => void
    onError?: (reason: unknown) => void
    /** When set, getCommandContext request will create context for this meta and return it; onComplete/onError settle meta.commandContext. */
    commandMeta?: GenRunMeta
}

function runGenerator<Root>(
    store: Store<Root>,
    gen: Generator<GenRequest, unknown, unknown>,
    queryStorage: QueryStorage | null,
    effectStorage: EffectStorage | null = null,
    callbacks?: RunGeneratorCallbacks,
): unknown {
    let sendValue: unknown = undefined
    let current: Generator<GenRequest, unknown, unknown> = gen
    let currentQueryStorage: QueryStorage | null = queryStorage
    let currentEffectStorage: EffectStorage | null = effectStorage
    const stack: Array<{
        gen: Generator<GenRequest, unknown, unknown>
        queryStorage: QueryStorage | null
        effectStorage: EffectStorage | null
    }> = []
    const { onComplete, onError, commandMeta } = callbacks ?? {}

    for (;;) {
        const step = current.next(sendValue)
        if (step.done) {
            const returnValue = step.value
            if (stack.length === 0) {
                if (currentQueryStorage) {
                    currentQueryStorage.result = Accessor.ok(returnValue) as Result<any>
                    currentQueryStorage.version = store.version
                }
                onComplete?.(returnValue)
                return returnValue
            }
            const prev = stack.pop()!
            current = prev.gen
            currentQueryStorage = prev.queryStorage
            currentEffectStorage = prev.effectStorage
            sendValue = returnValue
            continue
        }
        const yielded = step.value
        if (
            yielded &&
            typeof (yielded as unknown as Generator).next === 'function' &&
            genToMeta.has(yielded as unknown as Generator<GenRequest, unknown, unknown>)
        ) {
            const subGen = yielded as unknown as Generator<GenRequest, unknown, unknown>
            const meta = genToMeta.get(subGen)!
            const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery | undefined
            let subStorage: QueryStorage | null = null
            if (queryRef) {
                subStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)
                if (currentQueryStorage) {
                    currentQueryStorage.queryDeps.set(subStorage.key, subStorage)
                    subStorage.usedByQueries.set(currentQueryStorage.key, currentQueryStorage)
                }
                if (currentEffectStorage) {
                    currentEffectStorage.queryDeps.set(subStorage.key, subStorage)
                    subStorage.usedByEffects.set(currentEffectStorage.key, currentEffectStorage)
                }
                if (
                    subStorage.result !== undefined &&
                    subStorage.version === store.version &&
                    subStorage.result.type === 'ok'
                ) {
                    sendValue = subStorage.result.value
                    continue
                }
            }
            stack.push({ gen: current, queryStorage: currentQueryStorage, effectStorage: currentEffectStorage })
            current = subGen
            currentQueryStorage = subStorage
            sendValue = undefined
            continue
        }
        const req = yielded as GenRequest
        if (req.type === 'get') {
            const domainStorage = DomainStorage.getOrCreate(req.domain)
            if (currentQueryStorage) {
                currentQueryStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
                domainStorage.usedByQueries.set(currentQueryStorage.key, currentQueryStorage)
            }
            if (currentEffectStorage) {
                currentEffectStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
                domainStorage.usedByEffects.set(currentEffectStorage.key, currentEffectStorage)
            }
            const result = DomainStorage.getDomainResult(req.domain)
            if (result.type === 'err') {
                if (currentEffectStorage) return
                throw result.error
            }
            sendValue = result.value
        } else if (req.type === 'getResult') {
            const domainStorage = DomainStorage.getOrCreate(req.domain)
            if (currentQueryStorage) {
                currentQueryStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
                domainStorage.usedByQueries.set(currentQueryStorage.key, currentQueryStorage)
            }
            if (currentEffectStorage) {
                currentEffectStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
                domainStorage.usedByEffects.set(currentEffectStorage.key, currentEffectStorage)
            }
            sendValue = DomainStorage.getDomainResult(req.domain)
        } else if (req.type === 'set') {
            sendValue = store.set(req.domain as Domain<unknown, Root>, req.setStateInput as SetStateInput<unknown>)
            if (
                currentEffectStorage &&
                sendValue !== null &&
                typeof sendValue === 'object' &&
                (sendValue as Result<unknown>).type === 'err'
            ) {
                return
            }
        } else if (req.type === 'emit') {
            store.emitEvent(req.event)
            sendValue = undefined
        } else if (req.type === 'wait') {
            req.promise.then(
                (value) => {
                    runGeneratorStep(
                        store,
                        current,
                        value,
                        stack,
                        currentQueryStorage,
                        currentEffectStorage,
                        undefined,
                        callbacks,
                    )
                },
                (reason) => {
                    runGeneratorStep(
                        store,
                        current,
                        undefined,
                        stack,
                        currentQueryStorage,
                        currentEffectStorage,
                        reason,
                        callbacks,
                    )
                },
            )
            return
        } else if (req.type === 'all') {
            runAllParallel(store, req.generators).then((results) => {
                runGeneratorStep(
                    store,
                    current,
                    results,
                    stack,
                    currentQueryStorage,
                    currentEffectStorage,
                    undefined,
                    callbacks,
                )
            })
            return
        } else if (req.type === 'getCommandContext') {
            if (!commandMeta) {
                throw new Error('[koka-domain] getCommandContext only valid inside a command run')
            }
            if (!commandMeta.commandContext) {
                commandMeta.commandContext = store.createCommandContext(
                    commandMeta.domain,
                    commandMeta.methodName,
                    commandMeta.args,
                )
            }
            sendValue = commandMeta.commandContext
            continue
        } else {
            req as never satisfies never
            throw new Error('[koka-domain] runGenerator: unknown request')
        }
    }
}

function runGeneratorStep<Root>(
    store: Store<Root>,
    current: Generator<GenRequest, unknown, unknown>,
    sendValue: unknown,
    stack: Array<{
        gen: Generator<GenRequest, unknown, unknown>
        queryStorage: QueryStorage | null
        effectStorage: EffectStorage | null
    }>,
    currentQueryStorage: QueryStorage | null,
    currentEffectStorage: EffectStorage | null,
    throwReason?: unknown,
    callbacks?: RunGeneratorCallbacks,
): void {
    const { onComplete, onError } = callbacks ?? {}
    let step: IteratorResult<GenRequest, unknown>
    if (throwReason !== undefined) {
        try {
            step = current.throw(throwReason)
        } catch (e) {
            if (stack.length === 0) {
                onError?.(e)
                throw e
            }
            const prev = stack.pop()!
            runGeneratorStep(store, prev.gen, e, stack, prev.queryStorage, prev.effectStorage, e, callbacks)
            return
        }
    } else {
        step = current.next(sendValue)
    }
    if (step.done) {
        const returnValue = step.value
        if (stack.length === 0) {
            if (currentQueryStorage) {
                currentQueryStorage.result = Accessor.ok(returnValue) as Result<any>
                currentQueryStorage.version = store.version
            }
            onComplete?.(returnValue)
            return
        }
        const prev = stack.pop()!
        runGeneratorStep(
            store,
            prev.gen,
            returnValue,
            stack,
            prev.queryStorage,
            prev.effectStorage,
            undefined,
            callbacks,
        )
        return
    }
    const yielded = step.value
    if (
        yielded &&
        typeof (yielded as unknown as Generator).next === 'function' &&
        genToMeta.has(yielded as unknown as Generator<GenRequest, unknown, unknown>)
    ) {
        const subGen = yielded as unknown as Generator<GenRequest, unknown, unknown>
        const meta = genToMeta.get(subGen)!
        const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery | undefined
        let subStorage: QueryStorage | null = null
        if (queryRef) {
            subStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)
            if (currentQueryStorage) {
                currentQueryStorage.queryDeps.set(subStorage.key, subStorage)
                subStorage.usedByQueries.set(currentQueryStorage.key, currentQueryStorage)
            }
            if (currentEffectStorage) {
                currentEffectStorage.queryDeps.set(subStorage.key, subStorage)
                subStorage.usedByEffects.set(currentEffectStorage.key, currentEffectStorage)
            }
            if (
                subStorage.result !== undefined &&
                subStorage.version === store.version &&
                subStorage.result.type === 'ok'
            ) {
                runGeneratorStep(
                    store,
                    current,
                    subStorage.result.value,
                    stack,
                    currentQueryStorage,
                    currentEffectStorage,
                )
                return
            }
        }
        stack.push({ gen: current, queryStorage: currentQueryStorage, effectStorage: currentEffectStorage })
        runGeneratorStep(store, subGen, undefined, stack, subStorage, currentEffectStorage, undefined, callbacks)
        return
    }
    const req = yielded as GenRequest
    if (req.type === 'get') {
        const domainStorage = DomainStorage.getOrCreate(req.domain)
        if (currentQueryStorage) {
            currentQueryStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
            domainStorage.usedByQueries.set(currentQueryStorage.key, currentQueryStorage)
        }
        if (currentEffectStorage) {
            currentEffectStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
            domainStorage.usedByEffects.set(currentEffectStorage.key, currentEffectStorage)
        }
        const result = DomainStorage.getDomainResult(req.domain)
        if (result.type === 'err') {
            if (currentEffectStorage) return
            throw result.error
        }
        runGeneratorStep(
            store,
            current,
            result.value,
            stack,
            currentQueryStorage,
            currentEffectStorage,
            undefined,
            callbacks,
        )
        return
    }
    if (req.type === 'getResult') {
        const domainStorage = DomainStorage.getOrCreate(req.domain)
        if (currentQueryStorage) {
            currentQueryStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
            domainStorage.usedByQueries.set(currentQueryStorage.key, currentQueryStorage)
        }
        if (currentEffectStorage) {
            currentEffectStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
            domainStorage.usedByEffects.set(currentEffectStorage.key, currentEffectStorage)
        }
        const res = DomainStorage.getDomainResult(req.domain)
        if (res !== null && typeof res === 'object' && (res as Result<unknown>).type === 'err') {
            if (currentEffectStorage) return
        }
        runGeneratorStep(store, current, res, stack, currentQueryStorage, currentEffectStorage, undefined, callbacks)
        return
    }
    if (req.type === 'set') {
        const newSendValue = store.set(req.domain as Domain<unknown, Root>, req.setStateInput as SetStateInput<unknown>)
        if (
            currentEffectStorage &&
            newSendValue !== null &&
            typeof newSendValue === 'object' &&
            (newSendValue as Result<unknown>).type === 'err'
        ) {
            return
        }
        runGeneratorStep(
            store,
            current,
            newSendValue,
            stack,
            currentQueryStorage,
            currentEffectStorage,
            undefined,
            callbacks,
        )
        return
    }
    if (req.type === 'emit') {
        store.emitEvent(req.event)
        runGeneratorStep(
            store,
            current,
            undefined,
            stack,
            currentQueryStorage,
            currentEffectStorage,
            undefined,
            callbacks,
        )
        return
    }
    if (req.type === 'wait') {
        req.promise.then(
            (value) => {
                runGeneratorStep(
                    store,
                    current,
                    value,
                    stack,
                    currentQueryStorage,
                    currentEffectStorage,
                    undefined,
                    callbacks,
                )
            },
            (reason) => {
                runGeneratorStep(
                    store,
                    current,
                    undefined,
                    stack,
                    currentQueryStorage,
                    currentEffectStorage,
                    reason,
                    callbacks,
                )
            },
        )
        return
    }
    if (req.type === 'all') {
        runAllParallel(store, req.generators).then((results) => {
            runGeneratorStep(
                store,
                current,
                results,
                stack,
                currentQueryStorage,
                currentEffectStorage,
                undefined,
                callbacks,
            )
        })
        return
    }
    if (req.type === 'getCommandContext') {
        const { commandMeta } = callbacks ?? {}
        if (!commandMeta) {
            throw new Error('[koka-domain] getCommandContext only valid inside a command run')
        }
        if (!commandMeta.commandContext) {
            commandMeta.commandContext = store.createCommandContext(
                commandMeta.domain,
                commandMeta.methodName,
                commandMeta.args,
            )
        }
        runGeneratorStep(
            store,
            current,
            commandMeta.commandContext,
            stack,
            currentQueryStorage,
            currentEffectStorage,
            undefined,
            callbacks,
        )
        return
    }
    req as never satisfies never
    throw new Error('[koka-domain] runGenerator: unknown request')
}

// ---------------------------------------------------------------------------
// Generator helpers (yield request shape, return with as-cast)
// ---------------------------------------------------------------------------

export function* get<State, Root = any>(domain: Domain<State, Root>): Generator<GenGetRequest, State, unknown> {
    const state = yield { type: 'get', domain: domain as AnyDomain }
    return state as State
}

export function* getResult<State, Root = any>(
    domain: Domain<State, Root>,
): Generator<GenGetResultRequest, Result<State>, unknown> {
    const result = yield { type: 'getResult', domain: domain as AnyDomain }
    return result as Result<State>
}

export function* set<State, Root = any>(
    domain: Domain<State, Root>,
    setStateInput: SetStateInput<State>,
): Generator<GenSetRequest, Result<Root>, unknown> {
    const result = yield { type: 'set', domain: domain as AnyDomain, setStateInput }
    return result as Result<Root>
}

export function* emit<E extends AnyEvent>(event: E): Generator<GenEmitRequest, void, unknown> {
    yield { type: 'emit', event }
}

/**
 * Suspend effect execution until the given promise resolves or rejects. Only use inside @effect.
 * Resolves: returns the resolved value (runner calls gen.next(value)). Rejects: runner calls gen.throw(reason), so try/catch works.
 */
export function* waitFor<T extends Promise<any> | undefined>(
    promise: T,
): Generator<GenWaitRequest, Awaited<T>, unknown> {
    if (promise == undefined) {
        return undefined as Awaited<T>
    }

    if (promise instanceof Promise) {
        const value = yield { type: 'wait', promise }
        return value as Awaited<T>
    }

    return promise as Awaited<T>
}

/**
 * Run multiple command/effect generators in parallel. Wait requests are collected each "frame"
 * and Promise.all'd before resuming all fibers, so e.g. multiple removeTodo() animations
 * advance in lockstep. Returns array of return values.
 */
export function* all<T>(generators: Generator<GenRequest, T, unknown>[]): Generator<GenAllRequest, T[], unknown> {
    const results = yield { type: 'all', generators: generators as Generator<GenRequest, unknown, unknown>[] }
    return results as T[]
}

const effectMethodsStorage = new WeakMap<new (...args: any[]) => any, Map<string, AnyEffectMethod>>()

const getEffectfulMethods = (domain: AnyDomain): Map<string, AnyEffectMethod> | undefined => {
    return effectMethodsStorage.get(domain.constructor as new (...args: any[]) => any)
}

// ---------------------------------------------------------------------------
// Store class
// ---------------------------------------------------------------------------

/** Key for last command context (domain.key + methodName). */
function commandContextKey(domain: AnyDomain, methodName: string): string {
    return `${domain.key}:${methodName}`
}

export class Store<Root> implements IStore<Root> {
    state: Root
    domain: Domain<Root, Root>

    plugins: StorePlugin<Root>[] = []
    private pluginCleanup: (() => void)[] = []
    /** Last command context per domain+method for previous / sequence / switch. */
    private lastCommandContextByKey = new Map<string, CommandContextWithSettle>()

    constructor(options: StoreOptions<Root>) {
        this.state = options.state
        this.domain = new Domain<Root, Root>(this, Accessor.root<Root>(), { type: 'root' })
        this.setDomainInCache(this.domain, { type: 'root' })

        this.plugins = [...this.plugins, ...(options.plugins ?? [])] as StorePlugin<Root>[]

        for (const plugin of this.plugins) {
            this.addPlugin(plugin)
        }
    }

    addPlugin(plugin: StorePlugin<Root>) {
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

    /**
     * Create command context for a run (used by @commandWithContext). Sets ctx.previous from last run.
     * Caller must settle ctx via COMMAND_CONTEXT_SETTLE when the run completes or throws.
     */
    createCommandContext<Args extends Serializable[], T = unknown>(
        domain: AnyDomain,
        methodName: string,
        args: Args,
    ): CommandContextWithSettle & CommandContext<Args, T> {
        const key = commandContextKey(domain, methodName)
        const previous = this.lastCommandContextByKey.get(key) as CommandContext<Serializable[], unknown> | undefined
        let resolve!: (value: unknown) => void
        let reject!: (reason: unknown) => void
        const returnPromise = new Promise<T>((res, rej) => {
            resolve = (v: unknown) => res(v as T)
            reject = rej
        })
        const abortController = new AbortController()
        const ctx = {
            args,
            return: returnPromise,
            abortController,
            previous,
            [COMMAND_CONTEXT_SETTLE]: { resolve, reject },
        } as CommandContextWithSettle & CommandContext<Args, T>
        this.lastCommandContextByKey.set(key, ctx)
        return ctx
    }

    getState() {
        return this.state
    }

    setState(state: Root): void {
        if (shallowEqual(this.state, state)) {
            return
        }
        this.state = state
        this.dirty = true
        this.version += 1
        const currentVersion = this.version
        this.promise = Promise.resolve().then(() => {
            if (currentVersion === this.version) {
                this.publish()
            }
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

    subscribeToDomain<S>(domain: Domain<S, Root>, callback: (result: Result<S>) => unknown): () => void {
        this.refDomainAndAncestors(domain)
        let previous: Result<S> = this.get(domain)
        const unsubscribeState = this.subscribeState(() => {
            const current = this.get(domain)
            if (shallowEqualResult(previous, current)) {
                return
            }
            previous = current
            callback(current)
        })
        return () => {
            unsubscribeState()
            this.unrefDomainAndAncestors(domain)
        }
    }

    subscribeDomain<S>(domain: Domain<S, Root>, subscriber: (state: S) => unknown): () => void {
        return this.subscribeToDomain(domain, (result) => {
            if (result.type === 'ok') {
                subscriber(result.value)
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

    private getAffectedDomainStoragesFromDiff(): Set<DomainStorage> {
        const affected = new Set<DomainStorage>()
        const domains = Array.from(this.domainCache.values())

        for (const domain of domains) {
            const key = getDomainCacheKey(domain.constructor as typeof Domain<any, Root>, domain.path)
            if (!this.domainCache.has(key)) {
                continue
            }

            const domainStorage = DomainStorage.getOrCreate(domain)
            const cached = domainStorage.result
            const current = Accessor.get(this.state, domain.accessor)

            if (cached !== undefined && (cached.type as string) !== (current.type as string)) {
                this.removeDomainAndSubtree(domain)
                continue
            }

            if (cached !== undefined && !shallowEqualResult(cached, current)) {
                affected.add(domainStorage)
                domainStorage.clearResult()
            } else if (
                cached === undefined &&
                domainStorage.usedByQueries.size + domainStorage.usedByEffects.size > 0
            ) {
                // result 已被清空但有 query/effect 依赖，仍需传播以触发重算
                affected.add(domainStorage)
            }
        }

        return affected
    }

    private propagateFromAffectedDomainStorages(affectedDomainStorages: Set<DomainStorage>): void {
        const directDirty = new Set<QueryOrEffectStorage>()
        for (const domainStorage of affectedDomainStorages) {
            for (const dependent of domainStorage.usedByQueries.values()) {
                directDirty.add(dependent)
            }
            for (const dependent of domainStorage.usedByEffects.values()) {
                directDirty.add(dependent)
            }
        }

        const allDirty = new Set<QueryOrEffectStorage>(directDirty)
        const collectUsedBy = (node: QueryOrEffectStorage): void => {
            if (!QueryStorage.isQueryStorage(node)) {
                return
            }
            for (const dependent of node.usedByQueries.values()) {
                if (!allDirty.has(dependent)) {
                    allDirty.add(dependent)
                    collectUsedBy(dependent)
                }
            }
            for (const dependent of node.usedByEffects.values()) {
                if (!allDirty.has(dependent)) {
                    allDirty.add(dependent)
                    collectUsedBy(dependent)
                }
            }
        }
        for (const node of directDirty) {
            collectUsedBy(node)
        }

        const sorted = topologicalSortDirty(allDirty)
        const changed = new Set<QueryStorage>()
        const toNotify = new Set<QueryStorage>()

        const checkUpstreamChange = (queryStorage: QueryStorage): boolean => {
            for (const dep of queryStorage.queryDeps.values()) {
                if (changed.has(dep)) {
                    return true
                }
            }
            return false
        }

        for (const node of sorted) {
            if (QueryStorage.isQueryStorage(node)) {
                const queryStorage = node
                const hasUpstreamChange = directDirty.has(queryStorage) || checkUpstreamChange(queryStorage)
                if (!hasUpstreamChange) {
                    continue
                }

                const oldReturn = queryStorage.result?.type === 'ok' ? queryStorage.result.value : undefined
                queryStorage.result = undefined
                queryStorage.version = undefined
                try {
                    const gen = queryStorage.query.call(queryStorage.query.domain, ...queryStorage.args) as AnyQueryRun
                    this.runQuery(gen)
                } catch (_) {
                    // query 抛错（如 errorQuery 在 filter !== 'done' 时），不加入 toNotify，避免打断 publish
                    continue
                }
                const resultAfter = queryStorage.result as Result<any> | undefined
                const newReturn = resultAfter?.type === 'ok' ? resultAfter.value : undefined
                if (newReturn !== undefined && !shallowEqual(oldReturn, newReturn)) {
                    changed.add(queryStorage)
                    toNotify.add(queryStorage)
                }
            } else {
                this.runEffect(node)
            }
        }

        for (const queryStorage of toNotify) {
            const value = queryStorage.result?.type === 'ok' ? queryStorage.result.value : undefined
            for (const subscriber of queryStorage.subscribers) {
                subscriber(value)
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

        for (const effectStorage of this.effectStorages.values()) {
            effectStorage.abort()
            effectStorage.removeFromUsedBy()
        }
        this.effectStorages.clear()
        this.effectRefCount.clear()
    }

    private domainCache = new Map<string, Domain<any, Root>>()

    private effectRefCount = new Map<string, number>()
    private effectStorages = new Map<string, EffectStorage>()

    private refDomainAndAncestors(domain: AnyDomain): void {
        const ancestors = Domain.getAncestorDomains(domain)
        for (const ancestor of ancestors) {
            const key = ancestor.key
            const prev = this.effectRefCount.get(key) ?? 0
            const next = prev + 1
            this.effectRefCount.set(key, next)
            if (next === 1) {
                this.startEffect(ancestor)
            }
        }
    }

    private unrefDomainAndAncestors(domain: AnyDomain): void {
        const ancestors = Domain.getAncestorDomains(domain)
        for (const ancestor of ancestors) {
            const key = ancestor.key
            const prev = this.effectRefCount.get(key) ?? 0
            const next = Math.max(0, prev - 1)
            if (next === 0) {
                this.effectRefCount.delete(key)
            } else {
                this.effectRefCount.set(key, next)
            }
            if (prev === 1) {
                this.stopEffect(ancestor)
            }
        }
    }

    private startEffect(domain: AnyDomain): void {
        const methods = getEffectfulMethods(domain)?.values()
        if (!methods) {
            return
        }
        const methodsArr = Array.from(methods)
        if (methodsArr.length === 0) {
            return
        }
        const key = 'effect:' + domain.key
        const effectStorage = new EffectStorage(domain, key, methodsArr)
        this.effectStorages.set(domain.key, effectStorage)
        this.runEffect(effectStorage)
    }

    private stopEffect(domain: AnyDomain): void {
        const effectStorage = this.effectStorages.get(domain.key)
        if (!effectStorage) {
            return
        }
        effectStorage.abort()
        effectStorage.removeFromUsedBy()
        this.effectStorages.delete(domain.key)
    }

    private runEffect(effectStorage: EffectStorage): void {
        effectStorage.abort()
        const controller = new AbortController()
        effectStorage.abortController = controller
        effectStorage.removeFromUsedBy()
        effectStorage.clearDeps()
        const effectContext: EffectContext = {
            abortSignal: controller.signal,
            abortController: controller,
        }
        try {
            const domain = effectStorage.domain
            for (const method of effectStorage.methods) {
                runGenerator(this, method.call(domain, effectContext), null, effectStorage)
            }
        } catch (_) {
            // Single effect run failure; avoid breaking publish
        }
    }

    private eventSubscribers = new Map<AnyEventCtor, EventHandler<AnyEventCtor>[]>()

    subscribeEvent<E extends AnyEventCtor>(event: E, handler: EventHandler<E>): () => void {
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

    runQuery<Return = unknown>(gen: QueryRun<Return>): Return {
        const store = this
        const meta = genToMeta.get(gen as Generator<GenRequest, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] runQuery: generator not registered')
        }
        const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery
        const queryStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)

        if (queryStorage.result !== undefined && queryStorage.version === store.version) {
            if (queryStorage.result.type === 'err') {
                throw queryStorage.result.error
            }
            return queryStorage.result.value
        }
        if (queryStorage.result !== undefined) {
            queryStorage.result = undefined
            queryStorage.version = undefined
            for (const domainStorage of queryStorage.domainDeps.values()) {
                domainStorage.clearResult()
            }
        }
        for (const domainStorage of queryStorage.domainDeps.values()) {
            domainStorage.usedByQueries.delete(queryStorage.key)
        }
        for (const queryDepStorage of queryStorage.queryDeps.values()) {
            queryDepStorage.usedByQueries.delete(queryStorage.key)
        }
        queryStorage.domainDeps.clear()
        queryStorage.queryDeps.clear()

        runGenerator(store, gen, queryStorage)
        const res = queryStorage.result as Result<Return> | undefined
        if (res === undefined) {
            return undefined as Return
        }
        if (res.type === 'ok') {
            return res.value as Return
        }
        throw res.error
    }

    getQueryResult<Return = unknown>(gen: QueryRun<Return>): Result<Return> {
        const meta = genToMeta.get(gen as Generator<GenRequest, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] getQueryResult: generator not registered')
        }
        const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery
        const queryStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)
        if (queryStorage.result !== undefined && queryStorage.version === this.version) {
            return queryStorage.result as Result<Return>
        }
        try {
            this.runQuery(gen)
            return queryStorage.result as Result<Return>
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return Accessor.err(message) as Result<Return>
        }
    }

    subscribeQuery<Return = unknown>(gen: QueryRun<Return>): (subscriber: (value: Return) => unknown) => () => void {
        const meta = genToMeta.get(gen as Generator<GenRequest, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] subscribeQuery: generator not registered')
        }
        const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery
        const queryStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)
        const store = this

        return (subscriber: (value: Return) => unknown) => {
            if (queryStorage.subscribers.size === 0) {
                store.refDomainAndAncestors(meta.domain)
                try {
                    store.runQuery(gen)
                } catch (_) {
                    // ignore
                }
            }
            queryStorage.subscribers.add(subscriber as (value: unknown) => unknown)

            return () => {
                queryStorage.subscribers.delete(subscriber as (value: unknown) => unknown)
                if (queryStorage.subscribers.size === 0) {
                    store.unrefDomainAndAncestors(meta.domain)
                }
            }
        }
    }

    runCommand<Return = unknown>(gen: Generator<CommandRequest, Return, unknown>): Return {
        const meta = genToMeta.get(gen as Generator<GenRequest, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] runCommand: generator not registered')
        }
        const callbacks: RunGeneratorCallbacks = {
            commandMeta: meta,
            onComplete(value) {
                meta.commandContext?.[COMMAND_CONTEXT_SETTLE]?.resolve(value)
            },
            onError(reason) {
                meta.commandContext?.[COMMAND_CONTEXT_SETTLE]?.reject(reason)
            },
        }
        try {
            const result = runGenerator(this, gen as Generator<GenRequest, unknown, unknown>, null, null, callbacks)
            return result as Return
        } catch (e) {
            meta.commandContext?.[COMMAND_CONTEXT_SETTLE]?.reject(e)
            throw e
        }
    }

    emitEvent<E extends AnyEvent>(event: E): void {
        const eventSubscribers = this.eventSubscribers.get(event.constructor as AnyEventCtor)
        if (!eventSubscribers) {
            return
        }
        const payload = event.payload
        for (const handler of eventSubscribers) {
            runGenerator(this, handler(payload), null)
        }
    }

    getDomainFromCache<StateType>(Ctor: DomainCtor<any, Root>, path: DomainPath): Domain<StateType, Root> | undefined {
        const key = getDomainCacheKey(Ctor as typeof Domain<any, Root>, path)
        const domain = this.domainCache.get(key)
        return domain
    }

    setDomainInCache<StateType>(domain: Domain<StateType, Root>, path: DomainPath): boolean {
        const key = getDomainCacheKey(domain.constructor as typeof Domain<any, Root>, path)
        this.domainCache.set(key, domain)
        return true
    }

    removeDomainFromCache<StateType>(domain: Domain<StateType, Root>, path: DomainPath): boolean {
        const key = getDomainCacheKey(domain.constructor as typeof Domain<any, Root>, path)
        const deleted = this.domainCache.delete(key)
        if (deleted) {
            for (const parent of Domain.getParentDomains(domain)) {
                parent.removeDerivedFromCache(key)
            }
            DomainStorage.getOrCreate(domain).clearResult()
        }
        return deleted
    }

    removeDomainAndSubtree(domain: Domain<any, Root>): void {
        const path = domain.path
        for (const child of domain.getCachedDerivedDomains()) {
            this.removeDomainAndSubtree(child)
        }
        this.removeDomainFromCache(domain, path)
    }

    getDomainByPath(path: DomainPath): Domain<any, Root> | undefined {
        if (path.type === 'root') {
            return this.domain
        }
        const pathKey = getKeyFromPath(path)
        for (const domain of this.domainCache.values()) {
            if (getKeyFromPath(domain.path) === pathKey) {
                return domain
            }
        }
        return undefined
    }

    getRootDomainStorage(): DomainStorage {
        return DomainStorage.getOrCreate(this.domain)
    }
}

// ---------------------------------------------------------------------------
// Event class factory & event decorator
// ---------------------------------------------------------------------------

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

export function event<ES extends AnyEventCtor[], Request extends EventRequest>(...Events: ES) {
    return function <This>(
        target: (this: This, event: EventValue<InstanceType<ES[number]>>) => Generator<Request, void, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        context.addInitializer(function (this: This) {
            if (!(this instanceof Domain)) {
                throw new Error('Event must be used on a Domain class')
            }
            const store = (this as AnyDomain).store
            const domain = this as AnyDomain
            for (const EventCtor of Events) {
                const handler = (payload: EventValue<InstanceType<typeof EventCtor>>) => {
                    const gen = (
                        target as (
                            this: AnyDomain,
                            event: EventValue<InstanceType<typeof EventCtor>>,
                        ) => Generator<Request, void, unknown>
                    ).call(domain, payload)
                    registerGen(gen as Generator<GenRequest, unknown, unknown>, {
                        domain,
                        methodName: context.name,
                        args: [payload] as Serializable[],
                    })
                    return gen
                }
                store.subscribeEvent(EventCtor, handler as EventHandler<typeof EventCtor>)
            }
        })

        return target
    }
}

export function query() {
    return function <This, Request extends QueryRequest, Return, Args extends Serializable[], Root = any>(
        target: (this: This, ...args: Args) => Generator<Request, Return, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = context.name
        function wrapper(this: any, ...args: Args) {
            const argsSer = args as Serializable[]
            const cacheKey = `${methodName}(${JSON.stringify(argsSer)})`
            const gen = target.call(this, ...args) as Generator<Request, unknown, unknown>
            registerGen(gen as Generator<GenRequest, unknown, unknown>, {
                domain: this as AnyDomain,
                methodName,
                args: argsSer,
                cacheKey,
            })
            return gen
        }
        context.addInitializer(function (this: This) {
            ;(this as any)[methodName] = wrapper.bind(this)
            const bound = (this as any)[methodName]
            bound.domain = this
            bound.methodName = methodName
        })
        return wrapper as typeof target
    }
}

/** Generator helper: yield* command.context() inside a @command to get current run's context (no extra args). */
function* commandContextGenerator(): Generator<GenGetCommandContextRequest, CommandContext, unknown> {
    const ctx = yield { type: 'getCommandContext' }
    return ctx as CommandContext
}

export const command = Object.assign(
    function command() {
        return function <This, Args extends Serializable[], Request extends CommandRequest, Return, Root = any>(
            target: (this: This, ...args: Args) => Generator<Request, Return, unknown>,
            context: KokaClassMethodDecoratorContext<This, typeof target>,
        ): typeof target {
            const methodName = context.name
            function wrapper(this: any, ...args: Args) {
                const gen = target.call(this, ...args) as Generator<Request, unknown, unknown>
                registerGen(gen as Generator<GenRequest, unknown, unknown>, {
                    domain: this as AnyDomain,
                    methodName,
                    args: args as Serializable[],
                })
                return gen
            }
            context.addInitializer(function (this: This) {
                if (!(this instanceof Domain)) {
                    throw new Error('Command must be used on a Domain class')
                }
                ;(this as any)[methodName] = wrapper.bind(this)
                const bound = (this as any)[methodName]
                bound.domain = this
                bound.methodName = methodName
            })
            return wrapper as typeof target
        }
    },
    {
        /** Inside a @command: yield* command.context() for ctx (args, return, abortController, previous). Sequence: waitFor(ctx.previous?.return); Switch: ctx.previous?.abortController.abort(). */
        context: commandContextGenerator,
    },
)

export function effect() {
    return function <This, Args extends [] | [ctx: EffectContext], Request extends EffectRequest>(
        target: EffectMethod<This, Args, Request>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = String(context.name)

        context.addInitializer(function (this: This) {
            const DomainCtor = (this as AnyDomain).constructor as new (...args: any[]) => any

            let methods = effectMethodsStorage.get(DomainCtor)
            if (!methods) {
                methods = new Map()
                effectMethodsStorage.set(DomainCtor, methods)
            }

            methods.set(methodName, target as EffectMethod<This, Args, Request>)
        })

        return target
    }
}

export function getDomainState<State, Root = any>(domain: Domain<State, Root>): State {
    const result = DomainStorage.getDomainResult(domain)
    if (result.type === 'err') {
        throw result.error
    }
    return result.value
}

export function getState<State, Root>(domain: Domain<State, Root>): Result<State> {
    return DomainStorage.getDomainResult(domain)
}

export function setState<State, Root>(domain: Domain<State, Root>, setStateInput: SetStateInput<State>): Result<Root> {
    return domain.store.set(domain, setStateInput)
}

export function subscribeDomainResult<State, Root>(
    domain: Domain<State, Root>,
    listener: (result: Result<State>) => unknown,
): () => void {
    return domain.store.subscribeToDomain(domain, listener)
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

export function subscribeQueryState<Return = unknown>(
    gen: QueryRun<Return>,
    subscriber: (value: Return) => unknown,
): () => void {
    const meta = genToMeta.get(gen)
    if (!meta) {
        throw new Error('[koka-domain] subscribeQueryState: generator not registered')
    }
    return meta.domain.store.subscribeQuery(gen)(subscriber as (value: unknown) => unknown)
}

export function subscribeQueryResult<Return = unknown>(
    gen: QueryRun<Return>,
    subscriber: (result: Result<Return>) => unknown,
): () => void {
    const meta = genToMeta.get(gen)
    if (!meta) {
        throw new Error('[koka-domain] subscribeQueryResult: generator not registered')
    }
    return meta.domain.store.subscribeQuery(gen)(((value: unknown) => {
        subscriber(Accessor.ok(value) as Result<Return>)
    }) as (value: unknown) => unknown)
}

export function getQueryResult<Return = unknown>(gen: QueryRun<Return>): Result<Return> {
    const meta = genToMeta.get(gen)
    if (!meta) {
        throw new Error('[koka-domain] getQueryResult: generator not registered')
    }
    return meta.domain.store.getQueryResult(gen)
}

export function getQueryState<Return = unknown>(gen: QueryRun<Return>): Return {
    const result = getQueryResult(gen)
    if (result.type === 'err') {
        throw result.error
    }
    return result.value
}

/** Run a bound query generator (defensive: throws if generator is not registered). */
export function runQuery<Return = unknown>(gen: QueryRun<Return>): Return {
    const meta = genToMeta.get(gen as Generator<GenRequest, unknown, unknown>)
    if (!meta) {
        throw new Error('[koka-domain] runQuery: generator not registered (bound generator required)')
    }
    return meta.domain.store.runQuery(gen) as Return
}

/** Run a bound command generator (defensive: throws if generator is not registered). */
export function runCommand<Return = unknown>(gen: Generator<CommandRequest, Return, unknown>): Return {
    const meta = genToMeta.get(gen as Generator<GenRequest, unknown, unknown>)
    if (!meta) {
        throw new Error('[koka-domain] runCommand: generator not registered (bound generator required)')
    }
    return meta.domain.store.runCommand(gen) as Return
}
