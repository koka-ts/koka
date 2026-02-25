import * as Accessor from 'koka-accessor'
import * as Koka from 'koka'
import * as Async from 'koka/async'
import * as Ctx from 'koka/ctx'
import { shallowEqual } from './shallowEqual'

export { shallowEqual }

export type SerializablePrimitives = void | undefined | number | string | boolean | null

export type ReadonlySerializableArray = readonly Serializable[]
export type SerializableArray = Serializable[] | ReadonlySerializableArray

export type SerializableObject = { [key: string]: Serializable }

export type Serializable = SerializablePrimitives | SerializableArray | SerializableObject

function stableStringify(obj: unknown, seen = new WeakMap<object, boolean>()): string {
    if (obj === null || typeof obj !== 'object') {
        return String(obj)
    }
    if (typeof (obj as { then?: unknown }).then === 'function') {
        return '[Promise]'
    }
    if (obj instanceof Date) {
        return `Date(${obj.getTime()})`
    }
    if (obj instanceof RegExp) {
        return obj.toString()
    }
    if (seen.has(obj as object)) {
        return '[Circular]'
    }
    seen.set(obj as object, true)
    if (Array.isArray(obj)) {
        const parts = obj.map((item) => stableStringify(item, seen))
        return `[${parts.join(',')}]`
    }
    const sortedKeys = Object.keys(obj as Record<string, unknown>).sort()
    const pairs = sortedKeys.map((key) => {
        const value = (obj as Record<string, unknown>)[key]
        return `${key}:${stableStringify(value, seen)}`
    })
    return `{${pairs.join(',')}}`
}

export type ToType<T> = T extends object | unknown[]
    ? {
          [key in keyof T]: ToType<T[key]>
      }
    : T

export type Result<T> = Accessor.AccessorResult<T>

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

export type SetStateInput<S> = S | Accessor.Updater<S> | ((state: S) => S)

export type EventRequest = Koka.AnyEff | GenGetRequest | GenGetResultRequest | GenSetRequest | GenEmitRequest

export interface Event<Name extends string, T> {
    type: 'event'
    name: Name
    payload: T
}

export type AnyEvent = Event<string, any>

type EventCtor<Name extends string, T> = new (...args: any[]) => Event<Name, T>

export type AnyEventCtor = EventCtor<string, any>

export type EventValue<E extends AnyEvent> = E['payload']

export type EventHandler<E extends AnyEventCtor, Request extends EventRequest = EventRequest> = (
    event: EventValue<InstanceType<E>>,
) => Generator<Request, void, unknown>

export interface IStore<Root> {
    getState(): Root
    state: Root
}

export type StorePlugin<Root, S extends IStore<Root> = IStore<Root>> = (store: S) => (() => void) | void

export type StoreOptions<Root> = {
    state: Root
    plugins?: StorePlugin<Root, IStore<Root>>[]
}

export type KokaClassMethodDecoratorContext<
    This = unknown,
    Value extends (this: This, ...args: any) => any = (this: This, ...args: any) => any,
> = ClassMethodDecoratorContext<This, Value> & {
    name: string
    static: false
}

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
        const entries = Object.entries(path.shape).sort(([a], [b]) => a.localeCompare(b))
        result = `object(${entries.map(([pathKey, subPath]) => `${pathKey}:${getKeyFromPath(subPath)}`).join(', ')})`
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

export type ParentDomains<Root> = Domain<any, Root> | Set<Domain<any, Root>>

export type AnyDomain = Domain<any, any>

export type DomainCtor<StateType, Root, This extends Domain<StateType, Root> = Domain<StateType, Root>> = new (
    store: Store<Root>,
    accessor: Accessor.Accessor<StateType, Root>,
    path: DomainPath,
    parentDomain?: ParentDomains<Root>,
) => This

export type AnyDomainCtor = DomainCtor<any, any>

type GetDomain = <State, Root = any>(domain: Domain<State, Root>) => State

type GetDomainResult = <State, Root = any>(domain: Domain<State, Root>) => Result<State>

type SetDomain = <State, Root = any>(domain: Domain<State, Root>, setStateInput: SetStateInput<State>) => Result<Root>

type EmitEvent = (event: AnyEvent) => void

type GetCommandContext = () => AsyncCommandContext

class GenGetRequest extends Ctx.Ctx('GenGetRequest')<GetDomain> {}

class GenGetResultRequest extends Ctx.Ctx('GenGetResultRequest')<GetDomainResult> {}
class GenSetRequest extends Ctx.Ctx('GenSetRequest')<SetDomain> {}
class GenEmitRequest extends Ctx.Ctx('GenEmitRequest')<EmitEvent> {}
class GenGetCommandContextRequest extends Ctx.Ctx('GenGetCommandContextRequest')<GetCommandContext> {}

export type GenRequest =
    | GenGetRequest
    | GenGetResultRequest
    | GenSetRequest
    | GenEmitRequest
    | GenGetCommandContextRequest

export type QueryRequest = GenGetRequest | GenGetResultRequest

/** Command 可发出的请求与 GenRequest 一致 */
export type CommandRequest = GenRequest

export type EffectRequest = GenGetRequest | GenGetResultRequest | GenSetRequest | GenEmitRequest

export type RunnerMode = 'sync' | 'async'

export type AsyncQueryRequest = QueryRequest | Async.Async
export type AsyncCommandRequest = CommandRequest | Async.Async
export type AsyncEventRequest = EventRequest | Async.Async
export type AsyncEffectRequest = EffectRequest | Async.Async

export type Query<Args extends Serializable[], Return> = ((
    ...args: Args
) => Generator<QueryRequest, Return, unknown>) & {
    domain: AnyDomain
    methodName: string
}

export type AsyncQuery<Args extends Serializable[], Return> = ((
    ...args: Args
) => Generator<AsyncQueryRequest, Return, unknown>) & {
    domain: AnyDomain
    methodName: string
}

export type AnyQuery = Query<any, any>

export type AnyAsyncQuery = AsyncQuery<any, any>

export type QueryRun<Return = unknown> = Generator<QueryRequest, Return, unknown>

export type AnyQueryRun = QueryRun<any>

export type AsyncQueryRun<Return = unknown> = Generator<AsyncQueryRequest, Return, unknown>

export type AnyAsyncQueryRun = AsyncQueryRun<any>

export type Command<Args extends Serializable[], Return> = ((
    ...args: Args
) => Generator<CommandRequest, Return, unknown>) & {
    domain: AnyDomain
    methodName: string
}

export type AnyCommand = Command<any, any>

export type AsyncCommand<Args extends Serializable[], Return> = ((
    ...args: Args
) => Generator<AsyncCommandRequest, Return, unknown>) & {
    domain: AnyDomain
    methodName: string
}

export type AnyAsyncCommand = AsyncCommand<any, any>

export type CommandRun<Return = unknown> = Generator<CommandRequest, Return, unknown>

export type AnyCommandRun = CommandRun<any>

export type AsyncCommandRun<Return = unknown> = Generator<AsyncCommandRequest, Return, unknown>

export type AnyAsyncCommandRun = AsyncCommandRun<any>

export type Event<Args extends Serializable[], Return> = ((
    ...args: Args
) => Generator<EventRequest, Return, unknown>) & {
    domain: AnyDomain
    methodName: string
}

export type AnyEvent = Event<any, any>

export type AsyncEvent<Args extends Serializable[], Return> = ((
    ...args: Args
) => Generator<AsyncEventRequest, Return, unknown>) & {
    domain: AnyDomain
    methodName: string
}

export type AnyAsyncEvent = AsyncEvent<any, any>

export type EffectContext = {
    abortSignal: AbortSignal
    abortController: AbortController
}

/**
 * AsyncCommandContext is double linked list of command contexts
 * it is used to implement sequence and switch semantics
 * it is active until the command completes, and it will remove itself from the list when the command completes
 */
export type AsyncCommandContext = {
    /** Promise that resolves when the command completes. */
    promise: Promise<void>
    /** Abort this run, or previous: ctx.previous?.abortController.abort() for switch semantics. */
    abortController: AbortController
    /** Previous running context at creation time (same domain+method). Undefined on first run. */
    previous?: AsyncCommandContext
    /** Next context in invocation order (later run). Undefined if this is the tail. */
    next?: AsyncCommandContext
}

export type EffectMethod<
    This,
    Args extends [] | [ctx: EffectContext],
    Request extends EffectRequest = EffectRequest,
> = {
    (this: This, ...args: Args): Generator<Request, void, unknown>
}

export type AnyEffectMethod = EffectMethod<any, any, any>

export type AsyncEffectMethod<
    This,
    Args extends [] | [ctx: EffectContext],
    Request extends AsyncEffectRequest = AsyncEffectRequest,
> = {
    (this: This, ...args: Args): Generator<Request, void, unknown>
}

export type AnyAsyncEffectMethod = AsyncEffectMethod<any, any, any>

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
        let head = 0
        while (head < queue.length) {
            const current = queue[head++]
            if (ancestorSet.has(current)) {
                continue
            }
            ancestorSet.add(current)
            for (const parent of Domain.getParentDomains(current)) {
                queue.push(parent)
            }
        }
        // Cycle detection: parent graph must be a DAG
        const visiting = new Set<AnyDomain>()
        const visited = new Set<AnyDomain>()
        function visit(node: AnyDomain): void {
            if (visited.has(node)) return
            if (visiting.has(node)) {
                throw new Error('[koka-domain] getAncestorDomains: cycle detected in parent domain graph')
            }
            visiting.add(node)
            for (const parent of Domain.getParentDomains(node)) {
                if (ancestorSet.has(parent)) visit(parent)
            }
            visiting.delete(node)
            visited.add(node)
        }
        for (const ancestor of ancestorSet) {
            visit(ancestor)
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
//
// 内存与生命周期简要说明：
// - DomainStorage: WeakMap<Domain, DomainStorage>，随 Domain 无引用时由 GC 回收。
// - Store.domainCache / Domain.localDomainCache: 唯一强引用 Domain；removeDomainFromCache
//   会从 cache 与父级 localDomainCache 移除，Domain 可被回收。
// - QueryStorage: 存放在 DomainStorage.queryStorages（Map）。不订阅的 Query 也保留缓存，
//   以保证 runQuery/getQueryResult 在 React 等场景下一致。Query 缓存仅随 domain result 的
//   ok|err 变化自动失效：getAffectedDomainStoragesFromDiff 在 type 变化时 removeDomainAndSubtree，
//   propagateFromAffectedDomainStorages 会重算受影响的 query。
// - Store.destroy(): 会 clear domainCache、effectStorages、listeners、lastCommandContextByKey、
//   eventSubscribers、pluginCleanup，避免 Store 被订阅/插件/事件闭包长期持有。
// - genToMeta / effectMethodsStorage / getKeyFromPathCache / domainCtorIdMap 等为 WeakMap
//   或按需创建，键可被 GC 时条目自动回收。
//

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
        if (this._result !== undefined) {
            this.clearResult()
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
    readonly resultSubscribers = new Set<(result: Result<any>) => unknown>()
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
        const queryKey = explicitKey ?? `${query.methodName}(${stableStringify(args)})`
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
    readonly methods: RegisteredEffectMethod[]

    constructor(domain: AnyDomain, key: string, methods: RegisteredEffectMethod[]) {
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
            if (domainStorage.usedByQueries.size + domainStorage.usedByEffects.size === 0) {
                domainStorage.domain.store.removeWatchedDomainStorage(domainStorage)
            }
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
            throw new Error('[koka-domain] dependency cycle detected in query/effect graph')
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
    runnerMode: RunnerMode
    /** Query only: args -> cacheKey for incremental computation, set in @query decorator */
    cacheKey?: string
    /** Set when using @commandWithContext: context for this run (sequence/switch semantics). */
    commandContext?: CommandContextWithSettle
}

type DomainYield = GenRequest | Async.Async

const genToMeta = new WeakMap<Generator<DomainYield, unknown, unknown>, GenRunMeta>()

export function getGenRunMeta(gen: Generator<DomainYield, unknown, unknown>): GenRunMeta | undefined {
    return genToMeta.get(gen)
}

function registerGen(gen: Generator<DomainYield, unknown, unknown>, meta: GenRunMeta): void {
    genToMeta.set(gen, meta)
}

type RunGeneratorCallbacks = {
    onComplete?: (value: unknown) => void
    onError?: (reason: unknown) => void
    /** When set, getCommandContext request will create context for this meta and return it; onComplete/onError settle meta.commandContext. */
    commandMeta?: GenRunMeta
}

function addDomainDep(
    domainStorage: DomainStorage,
    currentQueryStorage: QueryStorage | null,
    currentEffectStorage: EffectStorage | null,
): void {
    if (currentQueryStorage) {
        currentQueryStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
        domainStorage.usedByQueries.set(currentQueryStorage.key, currentQueryStorage)
    }
    if (currentEffectStorage) {
        currentEffectStorage.domainDeps.set(domainStorage.domain.key, domainStorage)
        domainStorage.usedByEffects.set(currentEffectStorage.key, currentEffectStorage)
    }
    if (currentQueryStorage || currentEffectStorage) {
        domainStorage.domain.store.addWatchedDomainStorage(domainStorage)
    }
}

function addQueryDep(
    subStorage: QueryStorage,
    currentQueryStorage: QueryStorage | null,
    currentEffectStorage: EffectStorage | null,
): void {
    if (currentQueryStorage) {
        currentQueryStorage.queryDeps.set(subStorage.key, subStorage)
        subStorage.usedByQueries.set(currentQueryStorage.key, currentQueryStorage)
    }
    if (currentEffectStorage) {
        currentEffectStorage.queryDeps.set(subStorage.key, subStorage)
        subStorage.usedByEffects.set(currentEffectStorage.key, currentEffectStorage)
    }
}

/** 单次 GenRequest 处理结果：供 runner 共用 */
type ProcessRequestOutcome =
    | { tag: 'value'; sendValue: unknown }
    | { tag: 'wait'; promise: Promise<unknown> }
    | { tag: 'effectReturn' }
    | { tag: 'throw'; error: unknown }

/** yielded 解析结果：区分 subGen 与 GenRequest */
type YieldedParsed =
    | { tag: 'subGen'; subGen: Generator<DomainYield, unknown, unknown>; meta: GenRunMeta }
    | { tag: 'request'; request: GenRequest | Async.Async }

function processYielded(yielded: unknown): YieldedParsed {
    if (
        yielded &&
        typeof (yielded as unknown as Generator).next === 'function' &&
        genToMeta.has(yielded as unknown as Generator<DomainYield, unknown, unknown>)
    ) {
        const subGen = yielded as unknown as Generator<DomainYield, unknown, unknown>
        const meta = genToMeta.get(subGen)!
        return { tag: 'subGen', subGen, meta }
    }
    return { tag: 'request', request: yielded as GenRequest | Async.Async }
}

function processGenRequest<Root>(
    store: Store<Root>,
    req: GenRequest | Async.Async,
    ctx: {
        currentQueryStorage: QueryStorage | null
        currentEffectStorage: EffectStorage | null
        commandMeta?: GenRunMeta
    },
): ProcessRequestOutcome {
    const { currentQueryStorage, currentEffectStorage, commandMeta } = ctx
    if (req.type === 'async') {
        return { tag: 'wait', promise: req.promise }
    }
    if (req.type === 'get') {
        const domainStorage = DomainStorage.getOrCreate(req.domain)
        addDomainDep(domainStorage, currentQueryStorage, currentEffectStorage)
        const result = DomainStorage.getDomainResult(req.domain)
        if (result.type === 'err') {
            if (currentEffectStorage) return { tag: 'effectReturn' }
            return { tag: 'throw', error: result.error }
        }
        return { tag: 'value', sendValue: result.value }
    }
    if (req.type === 'getResult') {
        const domainStorage = DomainStorage.getOrCreate(req.domain)
        addDomainDep(domainStorage, currentQueryStorage, currentEffectStorage)
        const res = DomainStorage.getDomainResult(req.domain)
        if (
            currentEffectStorage &&
            res !== null &&
            typeof res === 'object' &&
            (res as Result<unknown>).type === 'err'
        ) {
            return { tag: 'effectReturn' }
        }
        return { tag: 'value', sendValue: res }
    }
    if (req.type === 'set') {
        const sendValue = store.set(req.domain as Domain<unknown, Root>, req.setStateInput as SetStateInput<unknown>)
        if (
            currentEffectStorage &&
            sendValue !== null &&
            typeof sendValue === 'object' &&
            (sendValue as Result<unknown>).type === 'err'
        ) {
            return { tag: 'effectReturn' }
        }
        return { tag: 'value', sendValue }
    }
    if (req.type === 'emit') {
        store.emitEvent(req.event)
        return { tag: 'value', sendValue: undefined }
    }
    if (req.type === 'getCommandContext') {
        if (!commandMeta?.commandContext) {
            throw new Error('[koka-domain] getCommandContext only valid inside a command run')
        }
        return { tag: 'value', sendValue: commandMeta.commandContext }
    }
    throw new Error('[koka-domain] processGenRequest: unknown request')
}

const RUNNER_MAX_ITERATIONS = 100_000

const EFFECT_RETURN = Symbol('koka-domain.effectReturn')

type RunExecContext<Root> = {
    currentQueryStorage: QueryStorage | null
    currentEffectStorage: EffectStorage | null
    commandMeta?: GenRunMeta
    activeQueries: Set<QueryStorage>
}

function resolveSubQueryStorage<Root>(
    store: Store<Root>,
    currentQueryStorage: QueryStorage | null,
    currentEffectStorage: EffectStorage | null,
    subGen: Generator<DomainYield, unknown, unknown>,
    meta: GenRunMeta,
):
    | { kind: 'cachedValue'; value: unknown }
    | { kind: 'cachedError'; error: unknown }
    | { kind: 'run'; storage: QueryStorage | null } {
    const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery | undefined
    if (!queryRef) {
        return { kind: 'run', storage: null }
    }
    const subStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)
    if (subStorage !== currentQueryStorage) {
        addQueryDep(subStorage, currentQueryStorage, currentEffectStorage)
    }
    if (subStorage.result !== undefined && subStorage.version === store.version) {
        if (subStorage.result.type === 'ok') {
            return { kind: 'cachedValue', value: subStorage.result.value }
        }
        if (subStorage.result.type === 'err') {
            return { kind: 'cachedError', error: subStorage.result.error }
        }
    }
    void subGen
    return { kind: 'run', storage: subStorage }
}

function isRegisteredSubGenerator(yielded: unknown): yielded is Generator<DomainYield, unknown, unknown> {
    return (
        !!yielded &&
        typeof (yielded as Generator).next === 'function' &&
        genToMeta.has(yielded as Generator<DomainYield, unknown, unknown>)
    )
}

function isRegisteredSubGenerator(yielded: unknown): yielded is Generator<DomainYield, unknown, unknown> {
    return (
        !!yielded &&
        typeof (yielded as Generator).next === 'function' &&
        genToMeta.has(yielded as Generator<DomainYield, unknown, unknown>)
    )
}

function* executeDomainGenerator<Root>(
    store: Store<Root>,
    gen: Generator<DomainYield, unknown, unknown>,
    ctx: RunExecContext<Root>,
): Generator<Async.Async, unknown | typeof EFFECT_RETURN, unknown> {
    let iterations = 0
    let sendValue: unknown = undefined
    let throwReason: { error: unknown } | undefined = undefined
    for (;;) {
        if (++iterations > RUNNER_MAX_ITERATIONS) {
            throw new Error('[koka-domain] executeDomainGenerator: max iterations exceeded (possible infinite loop)')
        }
        let step: IteratorResult<DomainYield, unknown>
        try {
            if (throwReason !== undefined) {
                const err = throwReason.error
                throwReason = undefined
                step = gen.throw(err)
            } else {
                step = gen.next(sendValue)
            }
        } catch (e) {
            if (ctx.currentQueryStorage) {
                ctx.currentQueryStorage.result = Accessor.err(e instanceof Error ? e.message : String(e)) as Result<any>
                ctx.currentQueryStorage.version = store.version
            }
            throw e
        }
        if (step.done) {
            return step.value
        }

        const yielded = step.value
        if (isRegisteredSubGenerator(yielded)) {
            const subGen = yielded
            const subMeta = genToMeta.get(subGen)!
            const queryRef = (subMeta.domain as any)[subMeta.methodName] as AnyQuery | undefined
            let subStorage: QueryStorage | null = null
            if (queryRef) {
                subStorage = QueryStorage.getOrCreate(subMeta.domain, queryRef, subMeta.args, subMeta.cacheKey)
                if (subStorage !== ctx.currentQueryStorage) {
                    addQueryDep(subStorage, ctx.currentQueryStorage, ctx.currentEffectStorage)
                }
                if (subStorage.result !== undefined && subStorage.version === store.version) {
                    if (subStorage.result.type === 'ok') {
                        sendValue = subStorage.result.value
                        throwReason = undefined
                        continue
                    }
                    if (subStorage.result.type === 'err') {
                        sendValue = undefined
                        throwReason = { error: subStorage.result.error }
                        continue
                    }
                }
            }
            if (subStorage) {
                if (ctx.activeQueries.has(subStorage)) {
                    throw new Error('[koka-domain] re-entrant query not allowed')
                }
                ctx.activeQueries.add(subStorage)
            }
            try {
                const subRet = yield* executeDomainGenerator(store, subGen, {
                    ...ctx,
                    currentQueryStorage: subStorage,
                })
                if (subRet === EFFECT_RETURN) {
                    return EFFECT_RETURN
                }
                sendValue = subRet
                throwReason = undefined
            } catch (e) {
                sendValue = undefined
                throwReason = { error: e }
            } finally {
                if (subStorage) {
                    ctx.activeQueries.delete(subStorage)
                }
            }
            continue
        }
        const req = yielded as GenRequest | Async.Async
        if (req.type === 'async') {
            try {
                const value = yield* KokaAsync.await(req.promise)
                sendValue = value
                throwReason = undefined
            } catch (reason) {
                sendValue = undefined
                throwReason = { error: reason }
            }
            continue
        }
        if (req.type === 'get') {
            const domainStorage = DomainStorage.getOrCreate(req.domain)
            addDomainDep(domainStorage, ctx.currentQueryStorage, ctx.currentEffectStorage)
            const result = DomainStorage.getDomainResult(req.domain)
            if (result.type === 'err') {
                if (ctx.currentEffectStorage) {
                    return EFFECT_RETURN
                }
                sendValue = undefined
                throwReason = { error: result.error }
                continue
            }
            sendValue = result.value
            throwReason = undefined
            continue
        }
        if (req.type === 'getResult') {
            const domainStorage = DomainStorage.getOrCreate(req.domain)
            addDomainDep(domainStorage, ctx.currentQueryStorage, ctx.currentEffectStorage)
            const res = DomainStorage.getDomainResult(req.domain)
            if (
                ctx.currentEffectStorage &&
                res !== null &&
                typeof res === 'object' &&
                (res as Result<unknown>).type === 'err'
            ) {
                return EFFECT_RETURN
            }
            sendValue = res
            throwReason = undefined
            continue
        }
        if (req.type === 'set') {
            const result = store.set(req.domain as Domain<unknown, Root>, req.setStateInput as SetStateInput<unknown>)
            if (
                ctx.currentEffectStorage &&
                result !== null &&
                typeof result === 'object' &&
                (result as Result<unknown>).type === 'err'
            ) {
                return EFFECT_RETURN
            }
            sendValue = result
            throwReason = undefined
            continue
        }
        if (req.type === 'emit') {
            store.emitEvent(req.event)
            sendValue = undefined
            throwReason = undefined
            continue
        }
        if (req.type === 'getCommandContext') {
            if (!ctx.commandMeta?.commandContext) {
                sendValue = undefined
                throwReason = { error: new Error('[koka-domain] getCommandContext only valid inside a command run') }
                continue
            }
            sendValue = ctx.commandMeta.commandContext
            throwReason = undefined
            continue
        }
        sendValue = undefined
        throwReason = { error: new Error('[koka-domain] executeDomainGenerator: unknown request') }
    }
}

/** 轻量执行器：去掉 RunState，最大化交给 generator/koka 的控制流 */
function* runGeneratorEffector<Root>(
    store: Store<Root>,
    gen: Generator<DomainYield, unknown, unknown>,
    queryStorage: QueryStorage | null,
    effectStorage: EffectStorage | null,
    callbacks?: RunGeneratorCallbacks,
): Generator<Async.Async, unknown, unknown> {
    const { onComplete, onError, commandMeta } = callbacks ?? {}
    const activeQueries = new Set<QueryStorage>()
    if (queryStorage) {
        activeQueries.add(queryStorage)
    }
    try {
        const ret = yield* executeDomainGenerator(store, gen, {
            currentQueryStorage: queryStorage,
            currentEffectStorage: effectStorage,
            commandMeta,
            activeQueries,
        })
        if (ret === EFFECT_RETURN) {
            return undefined
        }
        if (queryStorage) {
            queryStorage.result = Accessor.ok(ret) as Result<any>
            queryStorage.version = store.version
        }
        onComplete?.(ret)
        return ret
    } catch (e) {
        if (queryStorage) {
            queryStorage.result = Accessor.err(e instanceof Error ? e.message : String(e)) as Result<any>
            queryStorage.version = store.version
        }
        onError?.(e)
        throw e
    }
}

function runGeneratorSync<Root>(
    store: Store<Root>,
    gen: Generator<DomainYield, unknown, unknown>,
    queryStorage: QueryStorage | null,
    effectStorage: EffectStorage | null = null,
    callbacks?: RunGeneratorCallbacks,
): unknown {
    return kokaRunSync(runGeneratorEffector(store, gen, queryStorage, effectStorage ?? null, callbacks) as any)
}

async function runGeneratorAsync<Root>(
    store: Store<Root>,
    gen: Generator<DomainYield, unknown, unknown>,
    queryStorage: QueryStorage | null,
    effectStorage: EffectStorage | null = null,
    callbacks?: RunGeneratorCallbacks,
): Promise<unknown> {
    return await kokaRunAsync(runGeneratorEffector(store, gen, queryStorage, effectStorage ?? null, callbacks))
}

// ---------------------------------------------------------------------------
// Generator helpers (yield request shape, return with as-cast)
// ---------------------------------------------------------------------------

export function* get<State, Root = any>(domain: Domain<State, Root>): Generator<GenGetRequest, State, unknown> {
    const state = yield { type: 'get', domain: domain }
    return state as State
}

export function* getResult<State, Root = any>(
    domain: Domain<State, Root>,
): Generator<GenGetResultRequest, Result<State>, unknown> {
    const result = yield { type: 'getResult', domain: domain }
    return result as Result<State>
}

export function* set<State, Root = any>(
    domain: Domain<State, Root>,
    setStateInput: SetStateInput<State>,
): Generator<GenSetRequest, Result<Root>, unknown> {
    const result = yield { type: 'set', domain: domain, setStateInput }
    return result as Result<Root>
}

export function* emit<E extends AnyEvent>(event: E): Generator<GenEmitRequest, void, unknown> {
    yield { type: 'emit', event }
}

/** Async suspend helper moved to koka/async: use `yield* Async.await(promise)` instead of waitFor. */

const effectMethodsStorage = new WeakMap<new (...args: any[]) => any, Map<string, RegisteredEffectMethod>>()

const getEffectfulMethods = (domain: AnyDomain): Map<string, RegisteredEffectMethod> | undefined => {
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
                    this.pluginCleanup.splice(index, 1)
                    cleanup()
                }
            }
        }
        return () => {}
    }

    createCommandContext<Args extends Serializable[], T = unknown>(
        domain: AnyDomain,
        methodName: string,
        args: Args,
    ): CommandContextWithSettle & AsyncCommandContext<Args, T> {
        const key = commandContextKey(domain, methodName)
        const previous = this.lastCommandContextByKey.get(key) as AsyncCommandContext | undefined
        const ctx = new AsyncCommandContextImpl(this, domain, methodName, args, previous) as CommandContextWithSettle &
            AsyncCommandContext<Args, T>
        if (previous) (previous as AsyncCommandContextImpl).next = ctx
        this.lastCommandContextByKey.set(key, ctx)
        return ctx
    }

    /** Called when a context's return promise is settled (from CommandContextImpl). Retreats last to nearest running. */
    onCommandContextEnd(ctx: CommandContextWithSettle, domain: AnyDomain, methodName: string): void {
        const key = commandContextKey(domain, methodName)
        ;(ctx as AsyncCommandContextImpl).running = false
        if (this.lastCommandContextByKey.get(key) !== ctx) return
        let previous: AsyncCommandContext | undefined = ctx.previous
        while (previous) {
            if (previous.running) {
                this.lastCommandContextByKey.set(key, previous as CommandContextWithSettle)
                previous.next = undefined
                return
            }
            previous = previous.previous
        }
        this.lastCommandContextByKey.delete(key)
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
        if (this._inPublish) {
            return
        }
        if (this._publishScheduled) {
            return
        }
        this._publishScheduled = true
        this.promise = Promise.resolve().then(() => {
            this._publishScheduled = false
            if (this.dirty) {
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
    private _publishScheduled = false
    private _inPublish = false
    private _publishRoundCount = 0
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
        this._publishRoundCount += 1
        if (this._publishRoundCount > 100) {
            this.dirty = false
            this._publishRoundCount = 0
            return
        }
        this.dirty = false
        this._inPublish = true
        try {
            this.publishImpl()
        } finally {
            this._inPublish = false
            if (!this.dirty) {
                this._publishRoundCount = 0
            } else if (!this._publishScheduled) {
                this._publishScheduled = true
                this.promise = Promise.resolve().then(() => {
                    this._publishScheduled = false
                    if (this.dirty) this.publish()
                })
            }
        }
    }

    private publishImpl(): void {
        const affectedDomainStorages = this.getAffectedDomainStoragesFromDiff()

        if (affectedDomainStorages.size > 0) {
            this.propagateFromAffectedDomainStorages(affectedDomainStorages)
        }

        for (const listener of [...this.listeners]) {
            listener(this.state)
        }
    }

    private getAffectedDomainStoragesFromDiff(): Set<DomainStorage> {
        const affected = new Set<DomainStorage>()
        for (const domainStorage of this.watchedDomainStorages) {
            const domain = domainStorage.domain
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

                const oldResult = queryStorage.result
                queryStorage.result = undefined
                queryStorage.version = undefined
                try {
                    const gen = queryStorage.query.call(queryStorage.query.domain, ...queryStorage.args) as AnyQueryRun
                    this.runQuerySync(gen)
                } catch (_) {
                    // query 抛错（如 errorQuery 在 filter !== 'done' 时），不加入 toNotify，避免打断 publish
                    continue
                }
                const resultAfter = queryStorage.result as Result<any> | undefined
                const resultChanged =
                    resultAfter !== undefined &&
                    (oldResult === undefined || !shallowEqualResult(oldResult, resultAfter))
                if (resultChanged) {
                    changed.add(queryStorage)
                    toNotify.add(queryStorage)
                }
            } else {
                this.runEffect(node)
            }
        }

        for (const queryStorage of toNotify) {
            const result = queryStorage.result
            const value = result?.type === 'ok' ? result.value : undefined
            for (const subscriber of queryStorage.subscribers) {
                subscriber(value)
            }
            if (result !== undefined) {
                for (const resultSubscriber of queryStorage.resultSubscribers) {
                    resultSubscriber(result)
                }
            }
        }
    }

    abortController = new AbortController()

    destroy(): void {
        this.abortController.abort()
        this.listeners = []
        this.lastCommandContextByKey.clear()
        this.eventSubscribers.clear()

        for (const cleanup of this.pluginCleanup) {
            cleanup()
        }

        this.pluginCleanup = []
        this.domainCache.clear()
        this.watchedDomainStorages.clear()

        for (const effectStorage of this.effectStorages.values()) {
            effectStorage.abort()
            effectStorage.removeFromUsedBy()
        }
        this.effectStorages.clear()
        this.effectRefCount.clear()
    }

    private domainCache = new Map<string, Domain<any, Root>>()
    /** Domain storages that have at least one query/effect dependent; used for O(watched) publish diff instead of O(domains). */
    private watchedDomainStorages = new Set<DomainStorage>()

    /** Internal: keep watched set in sync when deps are added (called from addDomainDep). */
    addWatchedDomainStorage(domainStorage: DomainStorage): void {
        this.watchedDomainStorages.add(domainStorage)
    }
    /** Internal: keep watched set in sync when deps are removed (called from removeFromUsedBy / runQuery clear). */
    removeWatchedDomainStorage(domainStorage: DomainStorage): void {
        this.watchedDomainStorages.delete(domainStorage)
    }

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
            for (const registered of effectStorage.methods) {
                const gen = registered.method.call(domain, effectContext) as Generator<DomainYield, unknown, unknown>
                if (registered.mode === 'async') {
                    void runGeneratorAsync(this, gen, null, effectStorage).catch(() => {
                        // Single effect run failure; avoid breaking publish
                    })
                } else {
                    runGeneratorSync(this, gen, null, effectStorage)
                }
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

    private resetQueryStorage(queryStorage: QueryStorage): void {
        if (queryStorage.result !== undefined) {
            queryStorage.result = undefined
            queryStorage.version = undefined
            for (const domainStorage of queryStorage.domainDeps.values()) {
                domainStorage.clearResult()
            }
        }
        for (const domainStorage of queryStorage.domainDeps.values()) {
            domainStorage.usedByQueries.delete(queryStorage.key)
            if (domainStorage.usedByQueries.size + domainStorage.usedByEffects.size === 0) {
                domainStorage.domain.store.removeWatchedDomainStorage(domainStorage)
            }
        }
        for (const queryDepStorage of queryStorage.queryDeps.values()) {
            queryDepStorage.usedByQueries.delete(queryStorage.key)
        }
        queryStorage.domainDeps.clear()
        queryStorage.queryDeps.clear()
    }

    runQuerySync<Return = unknown>(gen: QueryRun<Return>): Return {
        const store = this
        const meta = genToMeta.get(gen as Generator<DomainYield, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] runQuerySync: generator not registered')
        }
        const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery
        const queryStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)

        if (queryStorage.result !== undefined && queryStorage.version === store.version) {
            if (queryStorage.result.type === 'err') {
                throw queryStorage.result.error
            }
            return queryStorage.result.value
        }
        this.resetQueryStorage(queryStorage)

        runGeneratorSync(store, gen, queryStorage)
        const res = queryStorage.result as Result<Return> | undefined
        if (res === undefined) {
            return undefined as Return
        }
        if (res.type === 'ok') {
            return res.value as Return
        }
        throw res.error
    }

    async runQueryAsync<Return = unknown>(gen: QueryRun<Return>): Promise<Return> {
        const store = this
        const meta = genToMeta.get(gen as Generator<DomainYield, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] runQueryAsync: generator not registered')
        }
        const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery
        const queryStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)

        if (queryStorage.result !== undefined && queryStorage.version === store.version) {
            if (queryStorage.result.type === 'err') {
                throw queryStorage.result.error
            }
            return queryStorage.result.value as Return
        }

        this.resetQueryStorage(queryStorage)
        await runGeneratorAsync(store, gen, queryStorage)

        const res = queryStorage.result as Result<Return> | undefined
        if (res === undefined) {
            return undefined as Return
        }
        if (res.type === 'ok') {
            return res.value as Return
        }
        throw res.error
    }

    runQuery<Return = unknown>(gen: QueryRun<Return>): Return {
        const meta = genToMeta.get(gen as Generator<DomainYield, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] runQuery: generator not registered')
        }
        // Legacy sync entrypoint; async queries should use runQueryAsync explicitly.
        return this.runQuerySync(gen)
    }

    getQueryResult<Return = unknown>(gen: QueryRun<Return>): Result<Return> {
        const meta = genToMeta.get(gen as Generator<DomainYield, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] getQueryResult: generator not registered')
        }
        const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery
        const queryStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)
        if (queryStorage.result !== undefined && queryStorage.version === this.version) {
            return queryStorage.result as Result<Return>
        }
        try {
            this.runQuerySync(gen)
            return queryStorage.result as Result<Return>
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return Accessor.err(message) as Result<Return>
        }
    }

    subscribeQuery<Return = unknown>(gen: QueryRun<Return>, subscriber: (value: Return) => unknown): () => void {
        const meta = genToMeta.get(gen as Generator<DomainYield, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] subscribeQuery: generator not registered')
        }
        const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery
        const queryStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)
        const totalBefore = queryStorage.subscribers.size + queryStorage.resultSubscribers.size
        if (totalBefore === 0) {
            this.refDomainAndAncestors(meta.domain)
            if (meta.runnerMode === 'async') {
                void this.runQueryAsync(gen).catch(() => {
                    // ignore
                })
            } else {
                try {
                    this.runQuerySync(gen)
                } catch (_) {
                    // ignore
                }
            }
        }
        queryStorage.subscribers.add(subscriber as (value: unknown) => unknown)
        return () => {
            queryStorage.subscribers.delete(subscriber as (value: unknown) => unknown)
            if (queryStorage.subscribers.size + queryStorage.resultSubscribers.size === 0) {
                this.unrefDomainAndAncestors(meta.domain)
            }
        }
    }

    subscribeQueryResult<Return = unknown>(
        gen: QueryRun<Return>,
        subscriber: (result: Result<Return>) => unknown,
    ): () => void {
        const meta = genToMeta.get(gen as Generator<DomainYield, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] subscribeQueryResult: generator not registered')
        }
        const queryRef = (meta.domain as any)[meta.methodName] as AnyQuery
        const queryStorage = QueryStorage.getOrCreate(meta.domain, queryRef, meta.args, meta.cacheKey)
        const totalBefore = queryStorage.subscribers.size + queryStorage.resultSubscribers.size
        if (totalBefore === 0) {
            this.refDomainAndAncestors(meta.domain)
            if (meta.runnerMode === 'async') {
                void this.runQueryAsync(gen).catch(() => {
                    // ignore
                })
            } else {
                try {
                    this.runQuerySync(gen)
                } catch (_) {
                    // ignore
                }
            }
        }
        queryStorage.resultSubscribers.add(subscriber as (result: Result<any>) => unknown)
        return () => {
            queryStorage.resultSubscribers.delete(subscriber as (result: Result<any>) => unknown)
            if (queryStorage.subscribers.size + queryStorage.resultSubscribers.size === 0) {
                this.unrefDomainAndAncestors(meta.domain)
            }
        }
    }

    runCommandSync<Return = unknown>(gen: Generator<CommandRequest | Async.Async, Return, unknown>): Return {
        const meta = genToMeta.get(gen as Generator<DomainYield, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] runCommandSync: generator not registered')
        }
        // Create context at invocation time so list order = command method invocation order;
        // this gen will read it whenever it yields getCommandContext (e.g. after waitFor).
        meta.commandContext = this.createCommandContext(meta.domain, meta.methodName, meta.args)
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
            const result = runGeneratorSync(
                this,
                gen as Generator<DomainYield, unknown, unknown>,
                null,
                null,
                callbacks,
            )
            return result as Return
        } catch (e) {
            meta.commandContext?.[COMMAND_CONTEXT_SETTLE]?.reject(e)
            throw e
        }
    }

    async runCommandAsync<Return = unknown>(
        gen: Generator<CommandRequest | Async.Async, Return, unknown>,
    ): Promise<Return> {
        const meta = genToMeta.get(gen as Generator<DomainYield, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] runCommandAsync: generator not registered')
        }
        meta.commandContext = this.createCommandContext(meta.domain, meta.methodName, meta.args)
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
            const result = await runGeneratorAsync(
                this,
                gen as Generator<DomainYield, unknown, unknown>,
                null,
                null,
                callbacks,
            )
            return result as Return
        } catch (e) {
            meta.commandContext?.[COMMAND_CONTEXT_SETTLE]?.reject(e)
            throw e
        }
    }

    runCommand<Return = unknown>(gen: Generator<CommandRequest | Async.Async, Return, unknown>): Return {
        const meta = genToMeta.get(gen as Generator<DomainYield, unknown, unknown>)
        if (!meta) {
            throw new Error('[koka-domain] runCommand: generator not registered')
        }
        // Legacy sync entrypoint; async commands should use runCommandAsync explicitly.
        return this.runCommandSync(gen)
    }

    emitEvent<E extends AnyEvent>(event: E): void {
        const eventSubscribers = this.eventSubscribers.get(event.constructor as AnyEventCtor)
        if (!eventSubscribers) {
            return
        }
        const payload = event.payload
        for (const handler of [...eventSubscribers]) {
            const gen = handler(payload) as Generator<DomainYield, unknown, unknown>
            const meta = genToMeta.get(gen)
            if (meta?.runnerMode === 'async') {
                void runGeneratorAsync(this, gen, null).catch(() => {
                    // Event handlers are best-effort and should not break emit flow.
                })
            } else {
                runGeneratorSync(this, gen, null)
            }
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
            const domainStorage = DomainStorage.getOrCreate(domain)
            domainStorage.clearResult()
            this.removeWatchedDomainStorage(domainStorage)
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

function createEventDecorator(mode: RunnerMode) {
    return function eventDecorator<ES extends AnyEventCtor[], Request extends EventRequest | Async.Async>(
        ...Events: ES
    ) {
        return function <This>(
            target: (this: This, event: EventValue<InstanceType<ES[number]>>) => Generator<Request, void, unknown>,
            context: KokaClassMethodDecoratorContext<This, typeof target>,
        ): typeof target {
            context.addInitializer(function (this: This) {
                if (!(this instanceof Domain)) {
                    throw new Error('Event must be used on a Domain class')
                }
                const store = this.store
                const domain = this
                for (const EventCtor of Events) {
                    const handler = (payload: EventValue<InstanceType<typeof EventCtor>>) => {
                        const gen = (
                            target as (
                                this: AnyDomain,
                                event: EventValue<InstanceType<typeof EventCtor>>,
                            ) => Generator<Request, void, unknown>
                        ).call(domain, payload)
                        registerGen(gen as Generator<DomainYield, unknown, unknown>, {
                            domain,
                            methodName: context.name,
                            args: [payload] as Serializable[],
                            runnerMode: mode,
                        })
                        return gen
                    }
                    store.subscribeEvent(EventCtor, handler as EventHandler<typeof EventCtor>)
                }
            })
            return target
        }
    }
}

export const event = Object.assign(createEventDecorator('sync'), {
    sync: createEventDecorator('sync'),
    async: createEventDecorator('async'),
})

function createQueryDecorator(mode: RunnerMode) {
    return function queryDecorator<
        This,
        Request extends QueryRequest | Async.Async,
        Return,
        Args extends Serializable[],
        Root = any,
    >(
        target: (this: This, ...args: Args) => Generator<Request, Return, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = context.name
        function wrapper(this: any, ...args: Args) {
            const argsSer = args as Serializable[]
            const cacheKey = `${methodName}(${stableStringify(argsSer)})`
            const meta: GenRunMeta = {
                domain: this,
                methodName,
                args: argsSer,
                cacheKey,
                runnerMode: mode,
            }
            const gen = target.call(this, ...args) as Generator<Request, unknown, unknown>
            registerGen(gen as Generator<DomainYield, unknown, unknown>, meta)
            return gen as Return
        }
        context.addInitializer(function (this: This) {
            ;(this as any)[methodName] = wrapper.bind(this)
            const bound = (this as any)[methodName]
            bound.domain = this
            bound.methodName = methodName
        })
        return wrapper as unknown as typeof target
    }
}

export const query = Object.assign(
    function query() {
        return createQueryDecorator('sync')
    },
    {
        sync: () => createQueryDecorator('sync'),
        async: () => createQueryDecorator('async'),
    },
)

/** Generator helper: yield* command.context() inside a @command to get current run's context (no extra args). */
function* commandContextGenerator(): Generator<GenGetCommandContextRequest, AsyncCommandContext, unknown> {
    const ctx = yield { type: 'getCommandContext' }
    return ctx as AsyncCommandContext
}

function createCommandDecorator(mode: RunnerMode) {
    return function commandDecorator<
        This,
        Args extends Serializable[],
        Request extends CommandRequest | Async.Async,
        Return,
        Root = any,
    >(
        target: (this: This, ...args: Args) => Generator<Request, Return, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = context.name
        function wrapper(this: any, ...args: Args) {
            const meta: GenRunMeta = {
                domain: this as AnyDomain,
                methodName,
                args: args as Serializable[],
                runnerMode: mode,
            }
            const gen = target.call(this, ...args) as Generator<Request, unknown, unknown>
            registerGen(gen as Generator<DomainYield, unknown, unknown>, meta)
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
        return wrapper as unknown as typeof target
    }
}

export const command = Object.assign(
    function command() {
        return createCommandDecorator('sync')
    },
    {
        sync: () => createCommandDecorator('sync'),
        async: () => createCommandDecorator('async'),
        /** Inside a @command: yield* command.context() for ctx (args, return, abortController, previous). Sequence: yield* Async.await(ctx.previous?.return); Switch: ctx.previous?.abortController.abort(). */
        context: commandContextGenerator,
    },
)

function createEffectDecorator(mode: RunnerMode) {
    return function effectDecorator<
        This,
        Args extends [] | [ctx: EffectContext],
        Request extends EffectRequest | Async.Async,
    >(
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
            methods.set(methodName, {
                mode,
                method: target as EffectMethod<This, Args, Request>,
            })
        })
        return target
    }
}

export const effect = Object.assign(
    function effect() {
        return createEffectDecorator('sync')
    },
    {
        sync: () => createEffectDecorator('sync'),
        async: () => createEffectDecorator('async'),
    },
)

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
    return meta.domain.store.subscribeQuery(gen, subscriber as (value: unknown) => unknown)
}

export function subscribeQueryResult<Return = unknown>(
    gen: QueryRun<Return>,
    subscriber: (result: Result<Return>) => unknown,
): () => void {
    const meta = genToMeta.get(gen)
    if (!meta) {
        throw new Error('[koka-domain] subscribeQueryResult: generator not registered')
    }
    return meta.domain.store.subscribeQueryResult(gen, subscriber as (result: Result<any>) => unknown)
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

export function runQuery<Return = unknown>(gen: QueryRun<Return>): Return {}

export function runCommand<Return = unknown>(gen: CommandRun<Return>): Return {}

export function runQueryAsync<Return = unknown>(gen: AsyncQueryRun<Return>): Promise<Return> {}

export function runCommandAsync<Return = unknown>(gen: AsyncCommandRun<Return>): Promise<Return> {}
