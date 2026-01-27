type RootPathLink = {
    type: 'root'
}

type FieldPathLink = {
    type: 'field'
    name: string
    entityKey?: string
    prev?: PathLink
}

type IndexPathLink = {
    type: 'index'
    index: number
    entityKey?: string
    prev?: PathLink
}

type PathLink = RootPathLink | FieldPathLink | IndexPathLink

const createRootPath = (): RootPathLink => ({ type: 'root' })

const createFieldPath = (segment: string, prev?: PathLink, entityKey?: string): FieldPathLink => ({
    type: 'field',
    name: segment,
    prev: prev ?? createRootPath(),
    entityKey,
})

const createIndexPath = (segment: number, prev?: PathLink, entityKey?: string): IndexPathLink => ({
    type: 'index',
    index: segment,
    prev: prev ?? createRootPath(),
    entityKey,
})

const generateUniqueId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

const createStructureKey = (path: PathLink): string => {
    let key = ''
    let current: PathLink | undefined = path

    while (current) {
        switch (current.type) {
            case 'root':
                key = '$.' + key
                current = undefined
                break
            case 'field':
                key = current.name + '.' + key
                current = current.prev
                break
            case 'index':
                key = String(current.index) + '.' + key
                current = current.prev
                break
            default:
                current satisfies never
                throw new Error(`Invalid path link: ${JSON.stringify(current)}`)
        }
    }

    return key
}

const createLogicalKey = (path: PathLink): string => {
    let key = ''
    let current: PathLink | undefined = path

    while (current) {
        switch (current.type) {
            case 'root':
                key = '$.' + key
                current = undefined
                break
            case 'field':
                if (current.entityKey) {
                    key = current.entityKey + '.' + key
                    return key
                }

                key = current.name + '.' + key
                current = current.prev
                break
            case 'index':
                if (current.entityKey) {
                    key = current.entityKey + '.' + key
                    return key
                }
                key = String(current.index) + '.' + key
                current = current.prev
                break
            default:
                current satisfies never
                throw new Error(`Invalid path link: ${JSON.stringify(current)}`)
        }
    }

    return key
}

type Ok<T> = {
    ok: true
    value: T
    path: PathLink
}

type Err = {
    ok: false
    error: string
    path: PathLink
}

type Result<T> = Ok<T> | Err

const Ok = <T>(value: T, path: PathLink): Ok<T> => {
    return {
        ok: true,
        value,
        path,
    }
}

const Err = (error: string, path: PathLink): Err => {
    return { ok: false, error, path }
}

type Getter<Local, Root> = (root: Root, path: PathLink) => Result<Local>

type Setter<Local, Root> = (value: Local, root: Root, path: PathLink) => Result<Root>

type GetKey<T> = (value: T) => string

class Accessor<Local, Root = any> {
    readonly get: Getter<Local, Root>
    readonly set: Setter<Local, Root>

    constructor(get: Getter<Local, Root>, set: Setter<Local, Root>) {
        this.get = get
        this.set = set
    }

    static id<Root>(): Accessor<Root, Root> {
        return new Accessor(
            (root, path) => Ok(root, path),
            (newRoot, _oldRoot, path) => Ok(newRoot, path),
        )
    }

    static get<Local, Root>(accessor: Accessor<Local, Root>, root: Root): Result<Local> {
        return accessor.get(root, createRootPath())
    }

    static set<Local, Root>(accessor: Accessor<Local, Root>, root: Root, value: Local): Result<Root> {
        return accessor.set(value, root, createRootPath())
    }

    map<Next>(get: Getter<Next, Local>, set: Setter<Next, Local>): Accessor<Next, Root> {
        return new Accessor<Next, Root>(
            (root, path) => {
                const localResult = this.get(root, path)

                if (!localResult.ok) {
                    return localResult
                }

                return get(localResult.value, localResult.path)
            },
            (nextValue, root, path) => {
                const localResult = this.get(root, path)

                if (!localResult.ok) {
                    return localResult
                }

                const nextResult = set(nextValue, localResult.value, localResult.path)

                if (!nextResult.ok) {
                    return nextResult
                }

                return this.set(nextResult.value, root, path)
            },
        )
    }

    compose<Next>(next: Accessor<Next, Local>): Accessor<Next, Root> {
        return this.map(next.get, next.set)
    }

    field<Key extends keyof Local & string, Value extends Local[Key]>(
        key: Key,
        getKey?: GetKey<Value>,
    ): Accessor<Value, Root> {
        return this.map(
            (local, path) => {
                const value = local[key] as Value
                const fieldPath = createFieldPath(key, path, getKey?.(value))
                return Ok(value, fieldPath)
            },
            (newValue, local, path) => {
                const value = local[key] as Value
                const fieldPath = createFieldPath(key, path, getKey?.(value))
                return Ok({ ...local, [key]: newValue }, fieldPath)
            },
        ) as Accessor<Value, Root>
    }

    index(
        this: Local extends unknown[] ? this : never,
        targetIndex: number,
        getKey?: GetKey<Local extends Array<infer Item> ? Item : never>,
    ): Accessor<Local extends Array<infer Item> ? Item : never, Root> {
        return this.map(
            (local, path) => {
                const array = local as any[]

                if (targetIndex >= 0 && targetIndex < array.length) {
                    const indexPath = createIndexPath(targetIndex, path, getKey?.(array[targetIndex]))
                    return Ok(array[targetIndex], indexPath)
                }

                return Err(`Index[${targetIndex}] out of bounds`, createErrorPath(path))
            },
            (newValue, local, path) => {
                const array = [...(local as any[])]

                if (targetIndex >= 0 && targetIndex < array.length) {
                    array[targetIndex] = newValue
                    const indexPath = createIndexPath(targetIndex, path, getKey?.(array[targetIndex]))
                    return Ok(array as any, indexPath)
                }

                return Err(`Index[${targetIndex}] out of bounds`, createErrorPath(path))
            },
        )
    }

    match<Matched extends Local>(predicate: (local: Local) => local is Matched): Accessor<Matched, Root> {
        return this.map<Matched>(
            (local, path) => {
                if (predicate(local)) {
                    return Ok(local, path)
                }

                return Err('Match predicate failed', createErrorPath(path))
            },
            (newValue, _local, path) => {
                return Ok(newValue, path)
            },
        )
    }

    find<Item = Local extends Array<infer ArrayItem> ? ArrayItem : never>(
        predicate: (item: Item, index: number) => boolean,
        getKey?: GetKey<Item>,
    ): Accessor<Item, Root> {
        return this.map(
            (local, path) => {
                const array = local as any as Item[]
                const foundIndex = array.findIndex(predicate)

                if (foundIndex !== -1) {
                    const indexPath = createIndexPath(foundIndex, path, getKey?.(array[foundIndex]))
                    return Ok(array[foundIndex], indexPath)
                }

                return Err('Item not found on find', path)
            },
            (newValue, local, path) => {
                const array = [...(local as any as any[])]
                const foundIndex = array.findIndex(predicate)
                if (foundIndex !== -1) {
                    array[foundIndex] = newValue
                    const indexPath = createIndexPath(foundIndex, path, getKey?.(array[foundIndex]))
                    return Ok(array as any, indexPath)
                }
                return Err('Item not found on find and set index', path)
            },
        )
    }
}

type SubscriberContext = {
    path: PathLink
    abortSignal: AbortSignal
    abortController: AbortController
}

type Subscriber<T> = (state: T, context: SubscriberContext) => void

type AnySubscriber = Subscriber<any>

type DomainCtorId = string

type DomainId = string

type PathKey = string

type DomainKey = `${DomainCtorId}:${PathKey}`

type PathTreeChildKey = string | number

type AnyResult = Result<any>

type DomainStorage = {
    domain: AnyDomain
    state: unknown

    effectContext?: EffectContext
}

type DomainStorageMap = Map<DomainKey, DomainStorage>

type StoreOptions<Root> = {
    state: Root
    effect?: boolean
}

class Store<Root> {
    private listeners: Set<(state: Root, path: PathLink) => void> = new Set()
    private unsubscribeListeners: Set<() => void> = new Set()
    state: Root

    constructor(options: StoreOptions<Root>) {
        this.state = options.state
        this.enabledEffects = options.effect ?? false
    }

    subscribe(listener: (state: Root) => void, onUnsubscribe?: () => void): () => void {
        this.listeners.add(listener)
        if (onUnsubscribe) {
            this.unsubscribeListeners.add(onUnsubscribe)
        }

        return () => {
            this.listeners.delete(listener)
            if (onUnsubscribe && this.unsubscribeListeners.has(onUnsubscribe)) {
                onUnsubscribe()
                this.unsubscribeListeners.delete(onUnsubscribe)
            }
        }
    }

    commit(newState: Root, path: PathLink): void {
        if (this.state !== newState) {
            this.state = newState
            this.verifyDomainStorageMap()
            this.listeners.forEach((listener) => listener(this.state, path))
        }
    }

    private verifyDomainStorageMap() {
        for (const [domainKey, domainStorage] of this.domainStorageMap) {
            const result = domainStorage.domain.get()

            if (!result.ok) {
                this.stopEffect(domainStorage.domain)
                this.effectfulDomainStorageMap.delete(domainStorage.domain)
                this.domainStorageMap.delete(domainKey)
            }
        }
    }

    enabledEffects: boolean = false

    private domainStorageMap: DomainStorageMap = new Map()

    private effectfulDomainStorageMap: Map<AnyDomain, DomainStorage> = new Map()

    getOrCreateDomain<Local, Ctor extends DomainCtor<Local, Root>>(
        DomainCtor: Ctor,
        accessor: Accessor<Local, Root>,
        parent?: Domain<any, Root>,
    ): InstanceType<Ctor> {
        const result = Accessor.get(accessor, this.state)

        if (!result.ok) {
            return new DomainCtor(this, accessor, parent) as InstanceType<Ctor>
        }

        const pathKey = createLogicalKey(result.path)
        const domainCtorId = getDomainCtorId(DomainCtor)

        const domainKey: DomainKey = `${domainCtorId}:${pathKey}`

        let domainStorage = this.domainStorageMap.get(domainKey)

        if (!domainStorage) {
            domainStorage = {
                domain: new DomainCtor(this, accessor, parent),
                state: result.value,
            }

            this.domainStorageMap.set(domainKey, domainStorage)

            if (getEffectfulMethods(domainStorage.domain)) {
                this.effectfulDomainStorageMap.set(domainStorage.domain, domainStorage)

                const domain = domainStorage.domain
                const unsubscribe = domain.subscribe(
                    () => {
                        this.startEffect(domain)
                    },
                    () => {
                        this.stopEffect(domain)
                    },
                )
            }
        }

        return domainStorage.domain as InstanceType<Ctor>
    }

    stopEffect<Local>(domain: Domain<Local, Root>): void {
        const domainStorage = this.effectfulDomainStorageMap.get(domain)

        if (!domainStorage) {
            return
        }

        domainStorage.effectContext?.abortController.abort()
        domainStorage.effectContext = undefined
    }

    startEffect<Local>(domain: Domain<Local, Root>): void {
        const domainStorage = this.effectfulDomainStorageMap.get(domain)

        if (!domainStorage) {
            return
        }

        this.stopEffect(domain)

        const effectContext: EffectContext = {
            abortSignal: new AbortSignal(),
            abortController: new AbortController(),
        }

        domainStorage.effectContext = effectContext

        const methods = getEffectfulMethods(domain) ?? []

        for (const method of methods.values()) {
            method.call(domainStorage.domain, effectContext)
        }
    }

    startEffects(): void {
        if (!this.enabledEffects) {
            return
        }

        for (const domainStorage of this.effectfulDomainStorageMap.values()) {
            this.startEffect(domainStorage.domain)
        }
    }

    stopEffects(): void {
        if (!this.enabledEffects) {
            return
        }

        for (const domainStorage of this.effectfulDomainStorageMap.values()) {
            this.stopEffect(domainStorage.domain)
        }
    }
}

type DomainStatic = Omit<typeof Domain, 'prototype'>

interface DomainCtor<Local, Root = any> extends DomainStatic {
    new (...args: ConstructorParameters<typeof Domain<Local, Root>>): Domain<Local, Root>
}

let domainCtorUid = 0

const domainWeakUidMap = new WeakMap<DomainCtor<any, any>, string>()

const getDomainCtorId = (DomainCtor: DomainCtor<any, any>): string => {
    let id = domainWeakUidMap.get(DomainCtor)

    if (!id) {
        id = `Domain(${DomainCtor.name}:${domainCtorUid++})`
        domainWeakUidMap.set(DomainCtor, id)
    }

    return id
}

type AnyDomain = Domain<any, any>

class Domain<Local, Root = any> {
    readonly store: Store<Root>
    readonly accessor: Accessor<Local, Root>
    readonly parent?: Domain<any, Root>

    constructor(store: Store<Root>, accessor: Accessor<Local, Root>, parent?: Domain<any, Root>) {
        this.store = store
        this.accessor = accessor
        this.parent = parent
    }

    update(updater: (currentValue: Local) => Local): Result<Local> {
        const result = this.get()

        if (!result.ok) {
            return result
        }

        const newState = updater(result.value)

        return this.set(newState)
    }

    get(): Result<Local> {
        return Accessor.get(this.accessor, this.store.state)
    }

    set(newValue: Local): Result<Local> {
        const result = Accessor.set(this.accessor, this.store.state, newValue)

        if (result.ok) {
            this.store.commit(result.value, result.path)
        }

        return this.get()
    }

    field<Key extends keyof Local & string, Value extends Local[Key]>(
        key: Key,
        getKey?: GetKey<Value>,
    ): Domain<Value, Root> {
        return this.store.getOrCreateDomain(Domain<Value, Root>, this.accessor.field(key, getKey), this)
    }

    index<Item = Local extends Array<infer ArrayItem> ? ArrayItem : never>(
        targetIndex: number,
        getKey?: GetKey<Item>,
    ): Domain<Item, Root> {
        return this.store.getOrCreateDomain(
            Domain<Item, Root>,
            (this.accessor as unknown as Accessor<Item[], Root>).index(targetIndex, getKey),
            this,
        )
    }

    match<Matched extends Local>(predicate: (local: Local) => local is Matched): Domain<Matched, Root> {
        return this.store.getOrCreateDomain(Domain<Matched, Root>, this.accessor.match(predicate), this)
    }

    find<Item = Local extends Array<infer ArrayItem> ? ArrayItem : never>(
        predicate: (item: Item, index: number) => boolean,
        getKey?: GetKey<Item>,
    ): Domain<Item, Root> {
        return this.store.getOrCreateDomain(Domain<Item, Root>, this.accessor.find(predicate, getKey), this)
    }

    use<D extends DomainCtor<Local, Root>>(DomainCtor: D): InstanceType<D> {
        return this.store.getOrCreateDomain(DomainCtor, this.accessor, this) as InstanceType<D>
    }

    subscribe(onNext: (state: Local) => void, onUnsubscribe?: () => void): () => void {
        let lastValue: Local | undefined
        let hasEmitted = false

        const currentResult = this.get()
        if (currentResult.ok) {
            lastValue = currentResult.value
            hasEmitted = true
            onNext(currentResult.value)
        }

        const unsubscribe = this.store.subscribe(() => {
            const result = this.get()

            if (result.ok) {
                if (!hasEmitted || lastValue !== result.value) {
                    lastValue = result.value
                    hasEmitted = true
                    onNext(result.value)
                }
            }
        }, onUnsubscribe)

        return unsubscribe
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

type ComponentCtorStatic = Omit<typeof Component, 'prototype'>

interface ComponentCtor<Input, Out, Context = any> extends ComponentCtorStatic {
    new (input: Input, context: Context): Component<Input, Out, Context>
}

abstract class Component<Input, Out, Context = any> {
    protected readonly context: Context
    protected readonly input: Input
    readonly id: string = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

    constructor(input: Input, context: Context) {
        this.context = context
        this.input = input
        globalComponentStore.register(this)
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

    protected get<T>(domain: Domain<T>): Result<T> {
        const result = domain.get()
        if (result.ok) {
            const effectKey = getEffectKeyFromResultPath(result.path)
            globalComponentStore.track(effectKey, this.id)
        }
        return result
    }

    use<SubInput, SubOut>(Child: ComponentCtor<SubInput, SubOut, Context>, input: SubInput): SubOut {
        const child = new Child(input, this.context)
        try {
            return child.impl()
        } catch (error) {
            return child.catch(error instanceof Error ? error : new Error(String(error), { cause: error }))
        }
    }

    run(): Out {
        globalComponentStore.clearDependencies(this.id)
        try {
            return this.impl()
        } catch (error) {
            return this.catch(error instanceof Error ? error : new Error(String(error), { cause: error }))
        }
    }

    handleOutput?(output: Out): void

    abstract impl(): Out
    abstract catch(error: Error): Out
}

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

const globalHandlers = {
    trigger: (id: string) => eventRegistry.trigger(id),
}

if (typeof globalThis !== 'undefined') (globalThis as any).globalHandlers = globalHandlers

abstract class HtmlView<Input, Context> extends Component<Input, string, Context> {
    protected handler<E = any>(fn: (e: E) => void): string {
        const id = eventRegistry.register(fn)
        return `globalHandlers.trigger('${id}')`
    }

    handleOutput?(html: string): void

    catch(error: Error): string {
        return `<div style="color:red; border:1px solid red; padding:8px;">
            <strong>Component Error:</strong> ${error.message}
            <pre style="font-size:10px">${JSON.stringify(this.input, null, 2)}</pre>
        </div>`
    }
}

type Todo = { id: number; text: string; done: boolean }

class TodoDomain extends Domain<Todo> {
    toggle(): void {
        this.update((todo) => ({ ...todo, done: !todo.done }))
    }

    remove(): void {
        console.log('Remove not implemented (needs parent list access)')
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
    todos$ = this.field('todos').use(ListDomain)
    logs$ = this.field('logs').use(LogsDomain)

    toggleFilter(): void {
        this.update((state) => ({ ...state, filter: state.filter === 'all' ? 'active' : 'all' }))
    }

    @effect()
    logTodoChanges(effectContext: EffectContext): void {
        let isFirst = true
        const unsubscribe = this.todos$.subscribe((todoList) => {
            if (effectContext.abortSignal.aborted) {
                unsubscribe()
                return
            }
            if (isFirst) {
                isFirst = false
                return
            }
            const totalCount = todoList.length
            const completedCount = todoList.filter((todo) => todo.done).length
            this.logs$.addLog(`Todos updated: ${totalCount} total, ${completedCount} done`)
        })
        effectContext.abortSignal.addEventListener('abort', () => unsubscribe())
    }

    @effect()
    autoSave(effectContext: EffectContext): void {
        let isFirst = true
        let debounceTimer: ReturnType<typeof setTimeout> | null = null

        const unsubscribe = this.subscribe((appState) => {
            if (effectContext.abortSignal.aborted) {
                if (debounceTimer) clearTimeout(debounceTimer)
                unsubscribe()
                return
            }
            if (isFirst) {
                isFirst = false
                return
            }
            if (debounceTimer) clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => {
                if (effectContext.abortSignal.aborted) return
                console.log('🔄 Auto-saving state...', appState)
                this.logs$.addLog('State auto-saved')
            }, 1000)
        })

        effectContext.abortSignal.addEventListener('abort', () => {
            if (debounceTimer) clearTimeout(debounceTimer)
            unsubscribe()
        })
    }
}

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

        const result = this.get(domain)
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

        const result = this.get(domain)
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

        const result = this.get(domain)
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

class App extends HtmlView<AppDomain, AppContext> {
    impl(): string {
        const domain = this.input
        const { theme, toggleTheme } = this.context
        const colors = themes[theme]

        const stateResult = this.get(domain)
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

function bootstrap() {
    let currentTheme: ThemeName = 'light'

    const createContext = (): AppContext => ({
        theme: currentTheme,
        toggleTheme: () => {
            currentTheme = currentTheme === 'light' ? 'dark' : 'light'
            console.log(`🎨 Theme switched to: ${currentTheme}`)
            render()
        },
    })

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

    const rootDomain = new Domain(store, Accessor.id<AppState>()).use(AppDomain)

    const unsubscribe = rootDomain.subscribe((state) => {
        console.log('📊 State updated:', state.user, '- Todos:', state.todos.length)
    })

    const render = () => {
        eventRegistry.reset()
        const context = createContext()
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

    globalComponentStore.setGlobalRender(render)

    render()

    return { store, rootDomain, unsubscribe, toggleTheme: () => createContext().toggleTheme() }
}

bootstrap()
