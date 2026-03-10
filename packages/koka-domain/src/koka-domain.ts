import * as Accessor from 'koka-accessor'
import * as Koka from 'koka'
import * as Async from 'koka/async'
import * as Ctx from 'koka/ctx'
import * as Result from 'koka/result'
import * as Err from 'koka/err'
import * as Opt from 'koka/opt'
import * as Task from 'koka/task'

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

export type DomainRootPath = {
    type: 'root'
}

export type DomainPath =
    | DomainRootPath
    | DomainSelectPath
    | DomainMatchPath
    | DomainFindPath
    | DomainFilterPath
    | DomainMapPath

export type SetStateInput<S> = S | Accessor.Updater<S> | ((state: S) => S)

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

export type AnyDomain = Domain<any, any>

export type DomainCtor<State, Root, This extends Domain<State, Root> = Domain<State, Root>> = new (
    ...args: ConstructorParameters<typeof Domain<State, Root>>
) => This

export type AnyDomainCtor = DomainCtor<any, any>

export type SyncQueryEff = GetCtx | Koka.Final | Err.AnyErr

export type AsyncQueryEff = Async.Async | GetCtx | Koka.Final | Err.AnyErr

export type SyncCommandEff = GetCtx | Koka.Final | Err.AnyErr | SetCtx | EmitCtx | Opt.AnyOpt | Ctx.AnyCtx

export type AsyncCommandEff =
    | Async.Async
    | GetCtx
    | Koka.Final
    | Err.AnyErr
    | SetCtx
    | EmitCtx
    | Opt.AnyOpt
    | Ctx.AnyCtx

export type EffectEff = GetCtx | Koka.Final | Err.AnyErr | SetCtx | EmitCtx | Opt.AnyOpt | Ctx.AnyCtx

export type AsyncEffectEff = Async.Async | GetCtx | Koka.Final | Err.AnyErr | SetCtx | EmitCtx | Opt.AnyOpt | Ctx.AnyCtx

export type SyncEventEff = GetCtx | Koka.Final | Err.AnyErr | SetCtx | EmitCtx | Opt.AnyOpt | Ctx.AnyCtx

export type AsyncEventEff = Async.Async | GetCtx | Koka.Final | Err.AnyErr | SetCtx | EmitCtx | Opt.AnyOpt | Ctx.AnyCtx

export interface Event<Name extends string, T> {
    type: 'event'
    name: Name
    payload: T
}

export type AnyEvent = Event<string, any>

type EventCtor<Name extends string, T> = new (...args: any[]) => Event<Name, T>

export type AnyEventCtor = EventCtor<string, any>

export type EventValue<E extends AnyEvent> = E['payload']

export type SyncEventHandler<Ctors extends AnyEventCtor[], Yield extends SyncEventEff> = {
    (event: EventValue<InstanceType<Ctors[number]>>): Generator<Yield, unknown, unknown>
    type: 'sync'
    domain: AnyDomain
    methodName: string
}

export type AsyncEventHandler<Ctors extends AnyEventCtor[], Yield extends AsyncEventEff> = {
    (event: EventValue<InstanceType<Ctors[number]>>): Generator<Yield, unknown, unknown>
    type: 'async'
    domain: AnyDomain
    methodName: string
}

export type AnySyncEventHandler = SyncEventHandler<any, any>

export type AnyAsyncEventHandler = AsyncEventHandler<any, any>

export type AnyEventHandler = AnySyncEventHandler | AnyAsyncEventHandler

export type SyncQueryHandler<Args extends Serializable[], Return, Yield extends SyncQueryEff> = {
    (...args: Args): Generator<Yield, Return, unknown>
    type: 'sync'
    domain: AnyDomain
    methodName: string
}

export type AsyncQueryHandler<Args extends Serializable[], Return, Yield extends AsyncQueryEff> = {
    (...args: Args): Generator<Yield, Return, unknown>
    type: 'async'
    domain: AnyDomain
    methodName: string
}

export type AnySyncQueryHandler = SyncQueryHandler<any, any, any>

export type AnyAsyncQueryHandler = AsyncQueryHandler<any, any, any>

export type AnyQueryHandler = AnySyncQueryHandler | AnyAsyncQueryHandler

export type SyncQuery<Yield extends SyncQueryEff, Return = unknown> = Generator<Yield, Return, unknown> & {
    queryStorage: SyncQueryStorage
}

export type AsyncQuery<Yield extends AsyncQueryEff, Return = unknown> = Generator<Yield, Return, unknown> & {
    queryStorage: AsyncQueryStorage
}

export type AnySyncQuery = SyncQuery<any, any>

export type AnyAsyncQuery = AsyncQuery<any, any>

export type AnyQuery = AnySyncQuery | AnyAsyncQuery

export type SyncCommandHandler<Args extends Serializable[], Return, Yield extends SyncCommandEff> = {
    (...args: Args): Generator<Yield, Return, unknown>
    type: 'sync'
    domain: AnyDomain
    methodName: string
}

export type AnySyncCommandHandler = SyncCommandHandler<any, any, any>

export type AsyncCommandHandler<Args extends Serializable[], Return, Yield extends AsyncCommandEff> = {
    (...args: Args): Generator<Yield, Return, unknown>
    type: 'async'
    domain: AnyDomain
    methodName: string
}

export type AnyAsyncCommandHandler = AsyncCommandHandler<any, any, any>

export type AnyCommandHandler = AnySyncCommandHandler | AnyAsyncCommandHandler

export type SyncCommand<Yield extends SyncCommandEff, Return = unknown> = Generator<Yield, Return, unknown>

export type AnySyncCommand = SyncCommand<any, any>

export type AsyncCommand<Yield extends AsyncCommandEff, Return = unknown> = Generator<Yield, Return, unknown>

export type AnyAsyncCommand = AsyncCommand<any, any>

export type AnyCommand = AnySyncCommand | AnyAsyncCommand

export type AsyncRunContext = {
    promise: Promise<void>
    abortController: AbortController
    previous?: AsyncRunContext
    next?: AsyncRunContext
}

export type SyncEffectHandler<This extends AnyDomain, E extends Koka.AnySyncEff = Koka.AnySyncEff | EffectEff> = {
    type: 'sync'
    domain: AnyDomain
    methodName: string
    (this: This): Generator<E, void, unknown>
}

export type AnySyncEffectHandler = SyncEffectHandler<any, any>

export type AsyncEffectHandler<This, E extends Koka.AnyEff = Koka.AnyEff | EffectEff> = {
    type: 'async'
    domain: AnyDomain
    methodName: string
    asyncRunContext?: AsyncRunContext
    (this: This): Generator<E, void, unknown>
}

export type AnyAsyncEffectHandler = AsyncEffectHandler<any, any>

export type AnyEffectHandler = AnySyncEffectHandler | AnyAsyncEffectHandler

export class Domain<State, Root> {
    readonly store: Store<Root>
    readonly accessor: Accessor.Accessor<State, Root>
    readonly path: DomainPath
    readonly key: string
    readonly parentDomain?: Domain<any, Root>

    constructor(
        store: Store<Root>,
        accessor: Accessor.Accessor<State, Root>,
        path: DomainPath,
        parentDomain?: Domain<any, Root>,
    ) {
        this.store = store
        this.accessor = accessor
        this.path = path
        this.parentDomain = parentDomain
        this.key = getDomainCacheKey(this.constructor as typeof Domain<State, Root>, this.path)
    }

    get result(): Accessor.AccessorResult<State> {
        return this.store.getDomainState(this)
    }

    private localDomainCache = new Map<string, Domain<any, Root>>()

    getDomainFromCache<S>(Ctor: DomainCtor<S, Root>, path: DomainPath): Domain<S, Root> | undefined {
        const key = getDomainCacheKey(Ctor as typeof Domain<any, Root>, path)
        const domain = this.localDomainCache.get(key) as Domain<S, Root> | undefined

        return domain
    }

    setDomainInCache<S>(domain: Domain<S, Root>) {
        this.store.setDomainInCache(domain, this)
        this.localDomainCache.set(domain.key, domain)
    }

    removeDomainFromCache(domain: Domain<any, Root>) {
        this.store.removeDomainFromCache(domain, this)
        this.localDomainCache.delete(domain.key)
    }

    getCachedDerivedDomains(): Domain<any, Root>[] {
        return Array.from(this.localDomainCache.values())
    }

    removeDerivedFromCache(key: string): void {
        this.localDomainCache.delete(key)
    }

    match<Key extends keyof State & string, Value extends SerializablePrimitives>(
        key: Key,
        value: Value,
    ): Domain<State & Record<Key, Value>, Root> {
        type Matched = State & Record<Key, Value>
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

        const predicate = (s: State): s is Matched => (s as Record<string, unknown>)[key] === value

        domain = new Domain(this.store, this.accessor.match(predicate), path, this)

        this.setDomainInCache(domain)

        return domain
    }

    find<Key extends keyof Accessor.ArrayItem<State> & string>(
        key: Key,
        value: Accessor.ArrayItem<State>[Key] & SerializablePrimitives,
    ): Domain<Accessor.ArrayItem<State>, Root> {
        type Item = Accessor.ArrayItem<State>

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

        this.setDomainInCache(domain)

        return domain
    }

    filter<Key extends keyof Accessor.ArrayItem<State> & string, Value extends SerializablePrimitives>(
        key: Key,
        value: Value,
    ): Domain<Accessor.ArrayItem<State>[], Root> {
        type Item = Accessor.ArrayItem<State>
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

        this.setDomainInCache(domain)

        return domain
    }

    map<Key extends keyof Accessor.ArrayItem<State> & string>(
        key: Key,
    ): Domain<Accessor.ArrayItem<State>[Key][], Root> {
        type Item = Accessor.ArrayItem<State>
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

        this.setDomainInCache(domain)

        return domain
    }

    select<Key extends keyof State & (string | number)>(key: Key): Domain<State[Key], Root> {
        const path: DomainSelectPath = {
            type: 'select',
            key,
            prev: this.path,
        }

        let domain = this.getDomainFromCache(Domain, path) as Domain<State[Key], Root> | undefined

        if (domain) {
            return domain as any
        }

        let accessor: Accessor.Accessor<State[Key], Root>
        if (typeof key === 'string') {
            accessor = this.accessor.prop(key) as typeof accessor
        } else if (typeof key === 'number') {
            accessor = this.accessor.index(key) as typeof accessor
        } else {
            throw new Error('[koka-domain] Domain.select: invalid key type')
        }

        domain = new Domain(this.store, accessor, path, this)

        this.setDomainInCache(domain)

        return domain
    }

    use<Used extends Domain<State, Root>>(Ctor: DomainCtor<State, Root, Used>): Used {
        let domain = this.getDomainFromCache(Ctor, this.path) as Used | undefined

        if (domain) {
            return domain as Used
        }

        domain = new Ctor(this.store, this.accessor, this.path, this)

        this.setDomainInCache(domain)

        return domain
    }
}

export class DomainStorage {
    readonly kind = 'domain'
    readonly domain: AnyDomain
    result: Accessor.AccessorResult<any> | undefined
    queryStorages = new Map<string, QueryStorage>()
    effectStorages = new Map<string, EffectStorage>()
    usedByQueries = new Set<QueryStorage>()
    usedByEffects = new Set<EffectStorage>()
    syncEventHandlers = new Map<AnyEventCtor, Set<AnySyncEventHandler>>()
    asyncEventHandlers = new Map<AnyEventCtor, Set<AnyAsyncEventHandler>>()

    constructor(domain: AnyDomain) {
        this.domain = domain
    }

    clearResult(): void {
        this.result = undefined
    }

    getResult(): Accessor.AccessorResult<any> {
        if (this.result !== undefined) {
            return this.result as Accessor.AccessorResult<any>
        }
        this.result = this.domain.result
        return this.result as Accessor.AccessorResult<any>
    }

    static readonly cache = new WeakMap<AnyDomain, DomainStorage>()

    static getOrCreate(domain: AnyDomain): DomainStorage {
        let storage = DomainStorage.cache.get(domain)
        if (!storage) {
            storage = new DomainStorage(domain)
            DomainStorage.cache.set(domain, storage)
        }
        return storage
    }
}

class QueryError extends Err.Err('QueryError')<Error> { }

export type QueryResult<T> = Result.Ok<T> | Accessor.AccessorErr | QueryError | Err.AnyErr

interface SyncQueryStorage extends QueryStorage {
    queryHandler: AnySyncQueryHandler
    result: QueryResult<any> | undefined
}

interface AsyncQueryStorage extends QueryStorage {
    queryHandler: AnyAsyncQueryHandler
    result: Promise<any> | undefined
}

class QueryStorage {
    readonly kind = 'query'
    readonly domain: AnyDomain
    readonly queryHandler: AnyQueryHandler
    readonly key: string
    readonly args: Serializable[]
    domainDeps = new Set<DomainStorage>()
    queryDeps = new Set<QueryStorage>()
    usedByQueries = new Set<QueryStorage>()
    usedByEffects = new Set<EffectStorage>()
    subscribers = new Set<(value: unknown) => unknown>()
    resultSubscribers = new Set<(result: QueryResult<any>) => unknown>()
    result: QueryResult<any> | Promise<any> | undefined
    abortController: AbortController | null = null

    constructor(query: AnyQueryHandler, key: string, args: Serializable[], domain: AnyDomain) {
        this.queryHandler = query
        this.key = key
        this.args = args
        this.domain = domain
    }

    static getOrCreate(domain: AnyDomain, query: AnyQueryHandler, args: Serializable[]): QueryStorage {
        const domainStorage = DomainStorage.getOrCreate(domain)
        const queryKey = `${query.methodName}(${stableStringify(args)})`
        let queryStorage = domainStorage.queryStorages.get(queryKey)
        if (!queryStorage) {
            queryStorage = new QueryStorage(query, queryKey, args, domain)
            domainStorage.queryStorages.set(queryKey, queryStorage)
        }
        return queryStorage
    }
}

function runQuerySync<Yield extends SyncQueryEff, Return = unknown>(
    syncQueryRun: SyncQuery<Yield, Return>,
): QueryResult<Return> {
    const queryStorage = syncQueryRun.queryStorage

    let result = queryStorage.result

    if (result) {
        return result
    }

    if (queryStorage.domainDeps.size !== 0 || queryStorage.queryDeps.size !== 0) {
        throw new Error(`Unexpected deps found before initializing sync query.`)
    }

    result = Koka.runSync(function* () {
        return yield* Koka.try(syncQueryRun).handle({
            // @ts-ignore
            [GetCtx.field]: {
                type: 'query-get' as const,
                queryStorage,
            },
        })
    } as any)

    if (result) {
        return result
    }

    throw new Error(`Unexpected result in sync query: ${result}.`)
}

function rerunQuerySync<Yield extends SyncQueryEff, Return = unknown>(
    syncQueryRun: SyncQuery<Yield, Return>,
): QueryResult<Return> {
    const queryStorage = syncQueryRun.queryStorage
    let result = queryStorage.result

    if (!result) {
        result = runQuerySync(syncQueryRun)
        queryStorage.result = result
        return result
    }

    for (const domainDepStorage of queryStorage.domainDeps) {
        domainDepStorage.usedByQueries.delete(queryStorage)
    }

    for (const queryDepStorage of queryStorage.queryDeps) {
        queryDepStorage.usedByQueries.delete(queryStorage)
    }

    queryStorage.domainDeps = new Set()
    queryStorage.queryDeps = new Set()
    queryStorage.result = undefined

    const newResult = runQuerySync(syncQueryRun)

    if (!shallowEqualResult(result, newResult)) {
        queryStorage.result = newResult
        queryStorage.domain.store.changedQueries.add(queryStorage)
        return newResult
    }

    return result
}

export type RunQueryAsyncOptions = {
    abortSignal?: AbortSignal
    onAsyncStart?: () => unknown
    onAsyncEnd?: () => unknown
}

function runQueryAsync<Yield extends AsyncQueryEff, Return = unknown>(
    asyncQueryRun: AsyncQuery<Yield, Return>,
    options?: RunQueryAsyncOptions,
): Promise<Return> {
    const queryStorage = asyncQueryRun.queryStorage

    let result = queryStorage.result

    if (result) {
        return result
    }

    if (queryStorage.domainDeps.size !== 0 || queryStorage.queryDeps.size !== 0) {
        throw new Error(`Unexpected deps found before initializing async query.`)
    }

    queryStorage.abortController?.abort()

    queryStorage.abortController = new AbortController()

    if (options?.abortSignal) {
        options.abortSignal.addEventListener(
            'abort',
            () => {
                queryStorage.abortController?.abort()
            },
            {
                once: true,
                signal: queryStorage.abortController?.signal,
            },
        )
    }

    result = Koka.runAsync(
        function* () {
            return yield* Koka.try(asyncQueryRun).handle({
                // @ts-ignore
                [GetCtx.field]: {
                    type: 'query-get' as const,
                    queryStorage,
                },
            })
        } as any,
        {
            abortSignal: queryStorage.abortController?.signal,
            onAsyncStart: options?.onAsyncStart,
            onAsyncEnd: options?.onAsyncEnd,
        },
    )

    if (result) {
        return result
    }

    throw new Error(`Unexpected result in async query: ${result}.`)
}

function rerunQueryAsync<Yield extends AsyncQueryEff, Return = unknown>(
    asyncQueryRun: AsyncQuery<Yield, Return>,
    options?: RunQueryAsyncOptions,
): Promise<Return> {
    const queryStorage = asyncQueryRun.queryStorage
    const previousResult = queryStorage.result

    if (!previousResult) {
        const result = runQueryAsync(asyncQueryRun, options)
        queryStorage.result = result
        return result
    }

    for (const domainDepStorage of queryStorage.domainDeps) {
        domainDepStorage.usedByQueries.delete(queryStorage)
    }

    for (const queryDepStorage of queryStorage.queryDeps) {
        queryDepStorage.usedByQueries.delete(queryStorage)
    }

    queryStorage.result = undefined
    queryStorage.domainDeps = new Set()
    queryStorage.queryDeps = new Set()

    const newResult = runQueryAsync(asyncQueryRun, options)

    queryStorage.result = newResult

    Promise.all([previousResult, newResult]).then(
        ([prevValue, newValue]) => {
            if (!shallowEqual(prevValue, newValue)) {
                queryStorage.domain.store.changedQueries.add(queryStorage)
            }
        },
        () => {
            queryStorage.domain.store.changedQueries.add(queryStorage)
        },
    )

    return newResult
}

interface SyncEffectStorage {
    effectMethod: AnySyncEffectHandler
}

interface AsyncEffectStorage {
    effectMethod: AnyAsyncEffectHandler
}

export class EffectStorage {
    readonly kind = 'effect'
    readonly domain: AnyDomain
    domainDeps = new Set<DomainStorage>()
    queryDeps = new Set<QueryStorage>()
    abortController: AbortController | null = null
    readonly effectMethod: AnyEffectHandler

    constructor(domain: AnyDomain, method: AnyEffectHandler) {
        this.domain = domain
        this.effectMethod = method
    }

    abort(): void {
        if (this.abortController) {
            this.abortController.abort()
        }
        this.abortController = null
    }

    clearDeps(): void {
        this.domainDeps.clear()
        this.queryDeps.clear()
    }

    destroy(): void {
        this.abort()
        this.clearDeps()
    }

    static getOrCreate(domain: AnyDomain, method: SyncEffectHandler<AnyDomain, any>): EffectStorage {
        const domainStorage = DomainStorage.getOrCreate(domain)
        const key = `${domain.key}.${method.methodName}()`
        let effectStorage = domainStorage.effectStorages.get(key)
        if (!effectStorage) {
            effectStorage = new EffectStorage(domain, method)
            domainStorage.effectStorages.set(key, effectStorage)
        }
        return effectStorage
    }
}

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

export function shallowEqualResult(resultA: Result.AnyResult, resultB: Result.AnyResult): boolean {
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

export type GetEnv =
    | {
        type: 'query-get'
        queryStorage: QueryStorage
    }
    | {
        type: 'effect-get'
        effectStorage: EffectStorage
    }
    | {
        type: 'command-get'
    }

class GetCtx extends Ctx.Ctx('GetCtx')<GetEnv> { }

export function* get<State, Root = any>(domain: Domain<State, Root>): Generator<GetCtx, State, unknown> {
    const domainStorage = DomainStorage.getOrCreate(domain)
    const result = domain.result

    const env = yield* Ctx.get(GetCtx)

    if (env.type === 'query-get') {
        env.queryStorage.domainDeps.add(domainStorage)
        domainStorage.usedByQueries.add(env.queryStorage)
    } else if (env.type === 'effect-get') {
        env.effectStorage.domainDeps.add(domainStorage)
        domainStorage.usedByEffects.add(env.effectStorage)
    } else {
        env.type satisfies 'command-get'
    }

    if (result.type === 'err') {
        throw new Error(result.error)
    }

    return result.value
}

type SetEnv = {
    type: 'set-storage'
}

class SetCtx extends Ctx.Ctx('SetCtx')<SetEnv> { }

export function* set<State, Root = any>(
    domain: Domain<State, Root>,
    setStateInput: SetStateInput<State>,
): Generator<SetCtx, Root, unknown> {
    const domainStorage = DomainStorage.getOrCreate(domain)

    const root = domain.store.getState()
    const result = domain.store.setDomainState(domain, setStateInput)

    if (result.type !== 'ok') {
        throw new Error(result.error)
    }

    if (!shallowEqual(root, result.value)) {
        domain.store.dirtyDomains.add(domainStorage)
    }

    return result.value
}

export type EmitEnv = {
    type: 'emit'
}

class EmitCtx extends Ctx.Ctx('EmitCtx')<EmitEnv> { }

export function* emit<E extends AnyEvent>(domain: AnyDomain, event: E): Generator<EmitCtx, void, unknown> {
    domain.store.pendingEvents.push({
        domain,
        event,
    })
}

export type StorePlugin<Root, S extends Store<Root> = Store<Root>> = (store: S) => (() => void) | void

export type StoreOptions<Root> = {
    state: Root
    plugins?: StorePlugin<Root, Store<Root>>[]
}

type GlobalDomainCacheEntry<Root = any> = {
    domain: Domain<any, Root>
    usedByDomains: Set<Domain<any, Root>>
}

export class Store<Root> {
    state: Root
    domain: Domain<Root, Root>

    plugins: StorePlugin<Root>[] = []
    private pluginCleanup: (() => void)[] = []

    constructor(options: StoreOptions<Root>) {
        this.state = options.state
        this.domain = new Domain<Root, Root>(this, Accessor.root<Root>(), { type: 'root' })
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
        return () => { }
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
    }

    getDomainState<S>(domain: Domain<S, Root>): Accessor.AccessorResult<S> {
        return Accessor.get(this.state, domain.accessor)
    }

    setDomainState<S>(domain: Domain<S, Root>, setStateInput: SetStateInput<S>): Accessor.AccessorResult<Root> {
        const result = Accessor.set(this.state, domain.accessor, setStateInput)
        if (result.type === 'err') {
            return result
        }
        this.setState(result.value)
        return result
    }

    subscribeDomainResult<S>(
        domain: Domain<S, Root>,
        callback: (result: Accessor.AccessorResult<S>) => unknown,
    ): () => void {
        let previous: Accessor.AccessorResult<S> = this.getDomainState(domain)
        const unsubscribeState = this.subscribeState(() => {
            const current = this.getDomainState(domain)
            if (shallowEqualResult(previous, current)) {
                return
            }
            previous = current
            callback(current)
        })
        return () => {
            unsubscribeState()
        }
    }

    subscribeDomainState<S>(domain: Domain<S, Root>, subscriber: (state: S) => unknown): () => void {
        return this.subscribeDomainResult(domain, (result) => {
            if (result.type === 'ok') {
                subscriber(result.value)
            }
        })
    }

    dirtyDomains = new Set<DomainStorage>()

    changedDomains = new Set<DomainStorage>()

    changedQueries = new Set<QueryStorage>()

    changedEffects = new Set<EffectStorage>()

    pendingEvents: Array<{ domain: AnyDomain, event: AnyEvent }> = []

    private dirty = false

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

        for (const listener of [...this.listeners]) {
            listener(this.state)
        }
    }

    update() {
        const pendingEvents = this.pendingEvents

        this.pendingEvents = []

        for (const event of pendingEvents) {
            triggerSyncEventHandlers(event.domain, event.event)
        }

        const changedDomains = this.changedDomains





        for (const event of pendingEvents) {
            triggerAsyncEventHandlers(event.domain, event.event)
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
        this.globalDomainCache.clear()
    }

    private globalDomainCache = new Map<string, GlobalDomainCacheEntry<Root>>()

    getDomainFromCache<S>(Ctor: DomainCtor<S, Root>, path: DomainPath): Domain<S, Root> | undefined {
        const key = getDomainCacheKey(Ctor as typeof Domain<any, Root>, path)
        return this.globalDomainCache.get(key)?.domain
    }

    setDomainInCache<S>(domain: Domain<S, Root>, usedByDomain: Domain<any, Root>) {
        const cacheEntry = this.globalDomainCache.get(domain.key)

        if (cacheEntry) {
            cacheEntry.usedByDomains.add(usedByDomain)
        } else {
            this.globalDomainCache.set(domain.key, { domain, usedByDomains: new Set([usedByDomain]) })
        }
    }

    removeDomainFromCache<StateType>(domain: Domain<StateType, Root>, usedByDomain: Domain<any, Root>) {
        const cacheEntry = this.globalDomainCache.get(domain.key)

        if (cacheEntry) {
            cacheEntry.usedByDomains.delete(usedByDomain)
            if (cacheEntry.usedByDomains.size === 0) {
                this.globalDomainCache.delete(domain.key)
            }
        }
    }

    effectHasStarted = false

    private startEffect(): void {
        this.effectHasStarted = true
    }

    private stopEffect(): void {
        this.effectHasStarted = false
    }

    // TODO: implement event subscription with handler registration and cleanup
    subscribeEvent<Ctors extends AnyEventCtor[], Yield extends AsyncEffectEff>(
        events: Ctors,
        handlers: (
            event: EventValue<InstanceType<Ctors[number]>>,
        ) => Generator<Koka.AnySyncEff | AsyncEventEff, void, unknown>,
    ): () => void {
        return () => { }
    }

    runQuerySync<Yield extends SyncQueryEff, Return = unknown>(gen: Generator<Yield, Return>): Return {
        if ((gen as any).queryStorage) {
            try {
                const syncQuery = gen as SyncQuery<Yield, Return>
                const result = runQuerySync(syncQuery)

                if (result.type === 'ok') {
                    return result.value
                }

                if (result.type === 'err') {
                    if (result.error instanceof Error) {
                        throw result.error
                    } else {
                        throw new Error(result.error)
                    }
                }

                throw new Error(`Unexpected result in sync query: ${result}.`)
            } finally {
                this.publish()
            }
        }

        throw new Error(`Unexpected query type: ${(gen as any).type}.`)
    }

    runQueryAsync<Yield extends AsyncQueryEff, Return = unknown>(
        gen: Generator<Yield, Return, unknown>,
        options?: RunQueryAsyncOptions,
    ): Promise<Return> {
        if ((gen as any).queryStorage) {
            const asyncQuery = gen as AsyncQuery<Yield, Return>
            return runQueryAsync(asyncQuery, {
                abortSignal: options?.abortSignal,
                onAsyncStart: () => {
                    this.publish()
                    options?.onAsyncStart?.()
                },
                onAsyncEnd: options?.onAsyncEnd,
            }).finally(() => {
                this.publish()
            })
        }

        throw new Error(`Unexpected query type: ${(gen as any).type}.`)
    }

    // TODO: implement query value subscription with dependency-based invalidation
    subscribeQuery<E extends Koka.AnySyncEff, Return = unknown>(
        gen: SyncQuery<E, Return>,
        subscriber: (value: Return) => unknown,
    ): () => void {
        return () => { }
    }

    // TODO: implement query result subscription with dependency-based invalidation
    subscribeQueryResult<E extends Koka.AnySyncEff, Return = unknown>(
        gen: SyncQuery<E, Return>,
        subscriber: (result: Result<Return>) => unknown,
    ): () => void {
        return () => { }
    }

    runCommandSync<E extends Koka.AnySyncEff | SyncCommandEff, Return = unknown>(
        gen: Generator<E, Return, unknown>,
    ): Return {
        const result = Koka.runSync(function* () {
            const value = yield* Koka.try(gen).handle({})
            return value as Return
        })

        if (result.type === 'err') {
            throw new Error(result.error)
        }

        return result.value
    }

    async runCommandAsync<E extends Koka.AnyEff | SyncCommandEff, Return = unknown>(
        gen: Generator<E, Return, unknown>,
    ): Promise<Return> {
        const result = await Koka.runAsync(function* () {
            const value = yield* Koka.try(gen).handle({})
            return value as Return
        })

        if (result.type === 'err') {
            throw new Error(result.error)
        }

        return result.value
    }
}

function topologicalSort<T>(
    nodes: Set<T>,
    getDependencies: (node: T) => Set<T>,
    visitor: (node: T) => void
): void {
    const visited = new Set<T>()
    const visiting = new Set<T>()

    function visit(node: T) {
        if (visited.has(node)) return
        if (visiting.has(node)) throw new Error('Cycle detected')
        visiting.add(node)
        visitor(node)
        for (const dependency of getDependencies(node)) {
            visit(dependency)
        }
        visiting.delete(node)
        visited.add(node)
    }

    for (const node of nodes) {
        visit(node)
    }

}

function triggerSyncEventHandlers<Ctors extends AnyEventCtor[]>(
    domain: AnyDomain,
    event: EventValue<InstanceType<Ctors[number]>>,
): void {
    const domainStorage = DomainStorage.getOrCreate(domain)

    const handlers = domainStorage.syncEventHandlers.get(event)

    if (handlers) {
        for (const handler of handlers) {
            domain.store.runCommandSync(handler(event))
        }
    }

    if (domain.parentDomain) {
        triggerSyncEventHandlers(domain.parentDomain, event)
    }
}

async function triggerAsyncEventHandlers<Ctors extends AnyEventCtor[]>(
    domain: AnyDomain,
    event: EventValue<InstanceType<Ctors[number]>>,
) {
    const domainStorage = DomainStorage.getOrCreate(domain)

    const tasks = [] as Koka.AnyEffector[]
    domainStorage.asyncEventHandlers.get(event)

    let current: DomainStorage | undefined = domainStorage

    while (current) {
        const currentHandlers = current.asyncEventHandlers.get(event)
        if (currentHandlers) {
            for (const handler of currentHandlers) {
                tasks.push(handler(event))
            }
        }

        if (current.domain.parentDomain) {
            current = DomainStorage.getOrCreate(current.domain.parentDomain)
        } else {
            current = undefined
        }
    }


    // @ts-ignore
    await Koka.runAsync(Task.drain(tasks))
}


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

function createSyncEventDecorator<EventCtors extends AnyEventCtor[]>(EventCtors: EventCtors) {
    return function eventDecorator<This, Yield extends SyncEventEff>(
        target: (this: This, event: EventValue<InstanceType<EventCtors[number]>>) => Generator<Yield, unknown, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = String(context.name)

        context.addInitializer(function (this: This) {
            if (!(this instanceof Domain)) {
                throw new Error('Event must be used on a Domain class')
            }

            const domainStorage = DomainStorage.getOrCreate(this)

            const eventMethod = target.bind(this) as SyncEventHandler<EventCtors, Yield>

            for (const EventCtor of EventCtors) {
                let handlers = domainStorage.syncEventHandlers.get(EventCtor)

                if (!handlers) {
                    handlers = new Set<AnySyncEventHandler>()
                    domainStorage.syncEventHandlers.set(EventCtor, handlers)
                }

                handlers.add(eventMethod)
            }
        })

        return target
    }
}

function createAsyncEventDecorator<EventCtors extends AnyEventCtor[]>(EventCtors: EventCtors) {
    return function eventDecorator<This, Yield extends AsyncEventEff>(
        target: (this: This, event: EventValue<InstanceType<EventCtors[number]>>) => Generator<Yield, unknown, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = String(context.name)

        context.addInitializer(function (this: This) {
            if (!(this instanceof Domain)) {
                throw new Error('Event must be used on a Domain class')
            }

            const domainStorage = DomainStorage.getOrCreate(this)

            const eventMethod = target.bind(this) as AsyncEventHandler<EventCtors, Yield>

            for (const EventCtor of EventCtors) {
                let handlers = domainStorage.asyncEventHandlers.get(EventCtor)
                if (!handlers) {
                    handlers = new Set<AnyAsyncEventHandler>()
                    domainStorage.asyncEventHandlers.set(EventCtor, handlers)
                }
                handlers.add(eventMethod)
            }
        })

        return target
    }
}

export const event = {
    sync: createSyncEventDecorator,
    async: createAsyncEventDecorator,
}

function createSyncQueryDecorator() {
    return function syncQueryDecorator<
        This,
        E extends Koka.AnySyncEff | SyncQueryEff,
        Args extends Serializable[],
        Return = unknown,
    >(
        target: (this: This, ...args: Args) => Generator<E, Return, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = context.name

        function* wrapper(this: AnyDomain, ...args: Args) {
            const syncQuery = (this as any)[methodName] as SyncQueryHandler<Args, Return, E>
            const queryStorage = QueryStorage.getOrCreate(this, syncQuery, args)

            const env = yield* Ctx.get(GetCtx)

            if (env.type === 'query-get') {
                env.queryStorage.queryDeps.add(queryStorage)
                queryStorage.usedByQueries.add(env.queryStorage)
            } else if (env.type === 'effect-get') {
                env.effectStorage.queryDeps.add(queryStorage)
                queryStorage.usedByEffects.add(env.effectStorage)
            }

            if (!queryStorage.result) {
                return yield* target.call(this as This, ...args)
            }

            const cachedResult = queryStorage.result as QueryResult<Return>

            if (cachedResult.type === 'err') {
                throw new Error(cachedResult.error as string)
            }

            return (cachedResult as Result.Ok<Return>).value
        }

        context.addInitializer(function (this: This) {
            if (!(this instanceof Domain)) {
                throw new Error('Query must be used on a Domain class')
            }

            const queryMethod = wrapper.bind(this) as SyncQueryHandler<Args, Return, E>
            queryMethod.type = 'sync'
            queryMethod.domain = this
            queryMethod.methodName = methodName
        })
        return target
    }
}

function createAsyncQueryDecorator() {
    return function asyncQueryDecorator<
        This,
        E extends Koka.AnyEff | SyncQueryEff,
        Args extends Serializable[],
        Return = unknown,
    >(
        target: (this: This, ...args: Args) => Generator<E, Return, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = context.name

        function wrapper(this: AnyDomain, ...args: Args) {
            const asyncQuery = (this as any)[methodName] as AsyncQueryHandler<Args, Return, E>
            const queryStorage = QueryStorage.getOrCreate(this, asyncQuery, args)

            if (!queryStorage.result) {
                return this.store.runQueryAsync(target.call(this as This, ...args) as any)
            }

            const cachedResult = queryStorage.result as QueryResult<Return>

            if (cachedResult.type === 'err') {
                throw new Error(cachedResult.error as string)
            }

            return (cachedResult as Result.Ok<Return>).value
        }

        context.addInitializer(function (this: This) {
            if (!(this instanceof Domain)) {
                throw new Error('Query must be used on a Domain class')
            }

            const queryMethod = wrapper.bind(this) as unknown as AsyncQueryHandler<Args, Return, E>
            queryMethod.type = 'async'
            queryMethod.domain = this
            queryMethod.methodName = methodName
        })
        return target
    }
}

export const query = {
    sync: createSyncQueryDecorator,
    async: createAsyncQueryDecorator,
}

function createSyncCommandDecorator() {
    return function syncCommandDecorator<
        This,
        E extends Koka.AnySyncEff | SyncCommandEff,
        Args extends Serializable[],
        Return = unknown,
    >(
        target: (this: This, ...args: Args) => Generator<E, Return, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = String(context.name)

        context.addInitializer(function (this: This) {
            if (!(this instanceof Domain)) {
                throw new Error('Command must be used on a Domain class')
            }
            const commandMethod = target.bind(this) as SyncCommandHandler<Args, Return, E>
            commandMethod.type = 'sync'
            commandMethod.domain = this
            commandMethod.methodName = methodName
        })

        return target
    }
}

function createAsyncCommandDecorator() {
    return function asyncCommandDecorator<
        This,
        E extends Koka.AnyEff | SyncCommandEff,
        Args extends Serializable[],
        Return = unknown,
    >(
        target: (this: This, ...args: Args) => Generator<E, Return, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = String(context.name)
        context.addInitializer(function (this: This) {
            if (!(this instanceof Domain)) {
                throw new Error('Command must be used on a Domain class')
            }
            const commandMethod = target.bind(this) as AsyncCommandHandler<Args, Return, E>
            commandMethod.type = 'async'
            commandMethod.domain = this
            commandMethod.methodName = methodName
        })
        return target
    }
}

export const command = {
    sync: createSyncCommandDecorator,
    async: createAsyncCommandDecorator,
}

function createSyncEffectDecorator() {
    return function syncEffectDecorator<This, E extends Koka.AnySyncEff | EffectEff, Return = unknown>(
        target: (this: This) => Generator<E, Return, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = String(context.name)
        context.addInitializer(function (this: This) {
            if (!(this instanceof Domain)) {
                throw new Error('Effect must be used on a Domain class')
            }
            const effectMethod = target.bind(this) as SyncEffectHandler<AnyDomain, E>
                ; (this as any)[methodName] = effectMethod
            effectMethod.type = 'sync'
            effectMethod.domain = this
            effectMethod.methodName = methodName
        })
        return target
    }
}

function createAsyncEffectDecorator() {
    return function asyncEffectDecorator<This, E extends Koka.AnyEff | EffectEff, Return = unknown>(
        target: (this: This) => Generator<E, Return, unknown>,
        context: KokaClassMethodDecoratorContext<This, typeof target>,
    ): typeof target {
        const methodName = String(context.name)
        context.addInitializer(function (this: This) {
            if (!(this instanceof Domain)) {
                throw new Error('Effect must be used on a Domain class')
            }
            const effectMethod = target.bind(this) as AsyncEffectHandler<AnyDomain, E>
                ; (this as any)[methodName] = effectMethod
            effectMethod.type = 'async'
            effectMethod.domain = this
            effectMethod.methodName = methodName
        })
        return target
    }
}

export const effect = {
    sync: createSyncEffectDecorator,
    async: createAsyncEffectDecorator,
}
