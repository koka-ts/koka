// =============================================================================
// PART 1: PRIMITIVES (Result & Accessor)
// =============================================================================

/**
 * PathNode: Tagged Linked List 结构，表示访问路径
 * - field: 对象字段访问
 * - index: 数组索引访问
 * - entity: 实体访问（用于 Entity Identity 机制）
 * - root: 根节点
 */

type RootPathNode = {
    type: 'root'
}

type FieldPathNode = {
    type: 'field'
    segment: string
    entityKey?: string
    prev?: PathNode
}

type IndexPathNode = {
    type: 'index'
    segment: number
    entityKey?: string
    prev?: PathNode
}

type ErrorPathNode = {
    type: 'error'
    segment: string
    prev?: PathNode
}

type PathNode = RootPathNode | FieldPathNode | IndexPathNode | ErrorPathNode

/**
 * 创建根路径节点
 */
const createRootPath = (): PathNode => ({ type: 'root' })

/**
 * 创建字段路径节点
 */
const createFieldPath = (segment: string, prev?: PathNode, entityKey?: string): FieldPathNode => ({
    type: 'field',
    segment,
    prev: prev || createRootPath(),
    entityKey,
})

/**
 * 创建索引路径节点
 */
const createIndexPath = (segment: number, prev?: PathNode, entityKey?: string): IndexPathNode => ({
    type: 'index',
    segment,
    prev: prev || createRootPath(),
    entityKey,
})

/** 生成唯一 ID */
const generateUniqueId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

/** 生成错误 ID，用于错误路径标识 */
const generateErrorId = () => {
    return `error-${generateUniqueId()}`
}

const createErrorPath = (prev?: PathNode): ErrorPathNode => ({
    type: 'error',
    segment: generateErrorId(),
    prev: prev || createRootPath(),
})

/**
 * 将 PathNode 转换为字符串（用于 debug/devtools）
 */
const createStructureKey = (path: PathNode): string => {
    let key = ''
    let current: PathNode | undefined = path

    while (current) {
        switch (current.type) {
            case 'root':
                key = '$.' + key
                current = undefined
                break
            case 'field':
                key = current.segment + '.' + key
                current = current.prev
                break
            case 'index':
                key = String(current.segment) + '.' + key
                current = current.prev
                break
            case 'error':
                key = current.segment + '.' + key
                current = current.prev
                break
        }
    }

    return key
}

const createLogicalKey = (path: PathNode): string => {
    let key = ''
    let current: PathNode | undefined = path

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

                key = current.segment + '.' + key
                current = current.prev
                break
            case 'index':
                if (current.entityKey) {
                    key = current.entityKey + '.' + key
                    return key
                }
                key = String(current.segment) + '.' + key
                current = current.prev
                break
            case 'error':
                key = current.segment + '.' + key
                current = current.prev
                break
        }
    }

    return key
}

/**
 * Result 类型：表示操作的成功或失败结果
 * - ok: true 时包含 value 和 path（PathNode 结构）
 * - ok: false 时包含 error 和 path（PathNode 结构，可能是动态构造的错误路径）
 * path 用于追踪数据访问路径，便于调试和错误定位
 */

type Ok<T> = {
    ok: true
    value: T
    path: PathNode
}

type Err = {
    ok: false
    error: string
    path: PathNode
}

type Result<T> = Ok<T> | Err

/** 创建成功结果 */
const Ok = <T>(value: T, path: PathNode): Ok<T> => {
    return {
        ok: true,
        value,
        path,
    }
}

/** 创建失败结果 */
const Err = (error: string, path: PathNode): Err => {
    return { ok: false, error, path }
}

/**
 * Getter: 从根状态中获取局部值的函数
 * @param root 根状态
 * @param path 当前访问路径（PathNode）
 * @returns 包含局部值或错误的结果
 */
type Getter<Local, Root> = (root: Root, path: PathNode) => Result<Local>

/**
 * Setter: 在根状态中设置局部值的函数
 * @param value 要设置的新值
 * @param root 根状态
 * @param path 当前访问路径（PathNode）
 * @returns 包含更新后的根状态或错误的结果
 */
type Setter<Local, Root> = (value: Local, root: Root, path: PathNode) => Result<Root>

type GetKey<T> = (value: T) => string

/**
 * Accessor: 提供对嵌套状态的类型安全访问
 * - Local: 局部状态类型
 * - Root: 根状态类型
 *
 * Accessor 通过组合的方式构建，可以从根状态导航到任意嵌套的局部状态，
 * 同时保持路径追踪和错误处理。
 */
class Accessor<Local, Root = any> {
    readonly get: Getter<Local, Root>
    readonly set: Setter<Local, Root>

    constructor(get: Getter<Local, Root>, set: Setter<Local, Root>) {
        this.get = get
        this.set = set
    }

    /**
     * 创建身份访问器，直接访问根状态
     * 用于创建根 Domain
     */
    static id<Root>(): Accessor<Root, Root> {
        return new Accessor(
            (root, path) => Ok(root, path),
            (newRoot, _oldRoot, path) => Ok(newRoot, path),
        )
    }

    /**
     * 静态方法：从根状态获取局部值
     * @param accessor 访问器
     * @param root 根状态
     * @returns 局部值或错误
     */
    static get<Local, Root>(accessor: Accessor<Local, Root>, root: Root): Result<Local> {
        return accessor.get(root, createRootPath())
    }

    /**
     * 静态方法：在根状态中设置局部值
     * @param accessor 访问器
     * @param root 根状态
     * @param value 新值
     * @returns 更新后的根状态或错误
     */
    static set<Local, Root>(accessor: Accessor<Local, Root>, root: Root, value: Local): Result<Root> {
        return accessor.set(value, root, createRootPath())
    }

    /**
     * map: 将当前访问器映射到新的访问器
     * 用于从 Local 类型导航到 Next 类型
     */
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

    /**
     * compose: 组合两个访问器
     * 等价于 this.map(next.get, next.set)
     */
    compose<Next>(next: Accessor<Next, Local>): Accessor<Next, Root> {
        return this.map(next.get, next.set)
    }

    /**
     * field: 访问对象的字段
     * @param key 字段名
     * @returns 字段值的访问器
     */
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

    /**
     * index: 访问数组的指定索引
     * @param targetIndex 目标索引
     * @returns 数组元素的访问器
     * @throws 如果索引越界，返回错误结果
     */
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

    /**
     * match: 通过字段值匹配来缩小类型
     * 只有当指定字段的值匹配时，才能访问该对象
     * @param predicate 匹配条件函数
     * @returns 匹配的局部状态的访问器
     */
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

    /**
     * find: 在数组中查找匹配条件的元素
     * @param predicate 查找条件函数
     * @param getKey 可选的 Entity Identity 提取函数，用于生成 entity key
     * @returns 找到的元素的访问器
     * @throws 如果未找到匹配项，返回错误结果
     */
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

                return Err('Item not found', createErrorPath(path))
            },
            (newValue, local, path) => {
                const array = [...(local as any as any[])]
                const foundIndex = array.findIndex(predicate)
                if (foundIndex !== -1) {
                    array[foundIndex] = newValue
                    const indexPath = createIndexPath(foundIndex, path, getKey?.(array[foundIndex]))
                    return Ok(array as any, indexPath)
                }
                return Err('Item not found on set', createErrorPath(path))
            },
        )
    }
}

/**
 * Ref: 引用类型，用于在 effect 中存储和访问值
 */
class Ref<T> {
    private current: T
    constructor(initialValue: T) {
        this.current = initialValue
    }
    get value(): T {
        return this.current
    }
    set value(v: T) {
        this.current = v
    }
}

/**
 * Store: 状态管理容器
 * 提供状态存储和变更通知机制，以及 effect 管理
 * @template Root 根状态类型
 */
class Store<Root> {
    private listeners: Set<(state: Root, path: PathNode) => void> = new Set()
    state: Root

    /** Effects 开关 */
    enabledEffects: boolean = false

    constructor(initialState: Root) {
        this.state = initialState
    }

    /**
     * 订阅状态变更（保留用于 effect 和外部监听）
     * @param listener 状态变更回调函数
     * @returns 取消订阅的函数
     */
    subscribe(listener: (state: Root) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /**
     * 提交新状态
     * 只有当新状态与当前状态不同时才会更新并通知所有监听器
     * 同时触发 ComponentStore 的更新调度和 effect 检查
     * @param newState 新状态
     * @param path 访问路径（从 accessor.set 的 Result 获取）
     */
    commit(newState: Root, path: PathNode): void {
        if (this.state !== newState) {
            this.state = newState
            // 通知传统监听器（用于 effect 等）
            this.listeners.forEach((listener) => listener(this.state, path))
        }
    }
}

/**
 * Effect 方法存储：存储被 @effect() 装饰器标记的方法
 * 键：Domain 类构造函数，值：方法名到 effect 方法的映射
 * 注意：不存储在实例上，因为 Domain 实例是次抛的
 */
const effectMethodsStorage = new WeakMap<new (...args: any[]) => any, Map<string, EffectMethod>>()

type DomainStatic = Omit<typeof Domain, 'prototype'>

interface DomainCtor<Local, Root = any> extends DomainStatic {
    new (...args: ConstructorParameters<typeof Domain<Local, Root>>): Domain<Local, Root>
}

let domainCtorUid = 0

const domainWeakUidMap = new WeakMap<DomainCtor<any, any>, string>()

const getDomainCtorId = (DomainCtor: DomainCtor<any, any>): string => {
    let id = domainWeakUidMap.get(DomainCtor)
    if (!id) {
        id = `${DomainCtor.name}-${domainCtorUid++}`
        domainWeakUidMap.set(DomainCtor, id)
    }
    return id
}

/**
 * Domain: 将 Accessor 提升到 Store 层面，提供状态访问和副作用管理
 *
 * @template Local 局部状态类型
 * @template Root 根状态类型
 *
 * Domain 提供了：
 * - 状态读写（get/set/update）
 * - 嵌套导航（field/index/match/find）
 * - 子 Domain 实例化（use）
 * - 状态订阅（subscribe）
 * - Effect 生命周期管理（通过 @effect() 装饰器）
 *
 * Effect 管理机制（响应式，挂载到 Store）：
 * - Domain 实例是次抛的，不能挂在任何可变状态或引用
 * - Effect 挂载到 Store 层面，使用稳固的 effect id
 * - effect id = Domain.uniqueName + path + effectMethodName
 * - 根据 domain path/result-status/state 进行响应式变化
 * - 在 subscribe/unsubscribe 过程中，ok result + uniqueEffectId 可以得到维护
 * - 使用 setTimeout(0) 处理 subscribe/unsubscribe 的真空间隙问题
 */
class Domain<Local, Root = any> {
    readonly store: Store<Root>
    readonly accessor: Accessor<Local, Root>

    constructor(store: Store<Root>, accessor: Accessor<Local, Root>) {
        this.store = store
        this.accessor = accessor
    }

    get state(): Local {
        const result = this.result

        if (result.ok) {
            return result.value
        }

        throw new Error(result.error)
    }

    set state(newValue: Local) {
        const result = Accessor.set(this.accessor, this.store.state, newValue)

        if (result.ok) {
            this.store.commit(result.value, result.path)
        } else {
            throw new Error(result.error)
        }
    }

    get result(): Result<Local> {
        return Accessor.get(this.accessor, this.store.state)
    }

    update(updater: (currentValue: Local) => Local): void {
        const state = this.state

        const newState = updater(state)

        this.set(newState)
    }

    /**
     * 获取当前局部状态（用于组件显式订阅）
     * 返回 Result，供 ComponentStore 追踪依赖
     * @returns Result 包含 value 和 path
     */
    get(): Result<Local> {
        return Accessor.get(this.accessor, this.store.state)
    }

    /**
     * 设置当前局部状态
     * @param newValue 新值
     */
    set(newValue: Local): void {
        const result = Accessor.set(this.accessor, this.store.state, newValue)
        if (result.ok) {
            // 传递 path 给 commit，用于触发精确更新
            this.store.commit(result.value, result.path)
        }
    }

    field<Key extends keyof Local & string, Value extends Local[Key]>(
        key: Key,
        getKey?: GetKey<Value>,
    ): Domain<Value, Root> {
        return new Domain(this.store, this.accessor.field(key, getKey))
    }

    index<Item = Local extends Array<infer ArrayItem> ? ArrayItem : never>(
        targetIndex: number,
        getKey?: GetKey<Item>,
    ): Domain<Item, Root> {
        return new Domain(this.store, (this.accessor as unknown as Accessor<Item[], Root>).index(targetIndex, getKey))
    }

    match<Matched extends Local>(predicate: (local: Local) => local is Matched): Domain<Matched, Root> {
        return new Domain(this.store, this.accessor.match(predicate))
    }

    find<Item = Local extends Array<infer ArrayItem> ? ArrayItem : never>(
        predicate: (item: Item, index: number) => boolean,
        getKey?: GetKey<Item>,
    ): Domain<Item, Root> {
        return new Domain(this.store, this.accessor.find(predicate, getKey))
    }

    /**
     * use: 实例化 Domain 子类
     * @param DomainCtor Domain 子类构造函数
     * @returns Domain 子类实例
     */
    use<D extends DomainCtor<Local, Root>>(DomainCtor: D): InstanceType<D> {
        return new DomainCtor(this.store, this.accessor) as InstanceType<D>
    }

    /**
     * 订阅状态变更
     *
     * 功能：
     * 1. 立即触发一次回调（如果当前状态有效）
     * 2. 监听后续状态变更
     * 3. 管理 effect 生命周期：
     *    - 第一次订阅时启动所有 @effect() 方法
     *    - 监听 result 变化，根据 ok/err/value change 管理 effect
     *    - 最后一次取消订阅时停止所有 effect
     *
     * Effect 管理规则（响应式）：
     * - path 变化 -> 取消旧 effect，启动新 effect
     * - result-state 从 ok 变为 err -> 取消 effect（结构删除）
     * - result-state 从 err 变为 ok -> 启动 effect
     * - value 变化（path 和 result-state 不变）-> 重新触发 effect
     * - 三者任意一个变化都会触发 effect 变化
     *
     * @param onNext 状态变更回调函数
     * @returns 取消订阅的函数
     */
    subscribe(onNext: (state: Local) => void): () => void {
        let lastValue: Local | undefined
        let hasEmitted = false

        // 如果当前状态有效，立即触发回调
        const currentResult = this.get()
        if (currentResult.ok) {
            lastValue = currentResult.value
            hasEmitted = true
            onNext(currentResult.value)
        }

        // 订阅 store 变更
        const unsubscribe = this.store.subscribe(() => {
            const result = this.get()

            if (result.ok) {
                // 只在值发生变化时触发回调
                if (!hasEmitted || lastValue !== result.value) {
                    lastValue = result.value
                    hasEmitted = true
                    onNext(result.value)
                }
            }
            // 如果 accessor 返回错误，不触发回调（domain 路径不再有效）
        })

        return () => {
            unsubscribe()
        }
    }
}

// =============================================================================
// PART 4: EFFECT DECORATOR
// =============================================================================

type EffectContext = {
    abortSignal: AbortSignal
}

/**
 * Effect 方法类型定义
 *
 * Effect 方法接收一个 EffectContext 参数，提供：
 * 1. abortSignal: 用于检查是否已被取消和监听取消事件
 * 2. abort(): 主动中断 effect
 * 3. get(Ref)/set(Ref, value): 引用管理机制
 *
 * Effect 方法应该：
 * - 在方法内部设置订阅、定时器等异步操作
 * - 在 abortSignal 触发时清理这些资源
 * - 使用 this.get() 获取当前 domain state
 * - 确保每次 effect 启动时，上一次的 effect 会被取消
 */
type EffectMethod = (effectContext: EffectContext) => void

/**
 * Effect 装饰器
 *
 * 用法：
 * ```ts
 * class MyDomain extends Domain<State> {
 *   @effect()
 *   myEffect(abortSignal: AbortSignal): void {
 *     const unsubscribe = this.subscribe((state) => {
 *       if (abortSignal.aborted) {
 *         unsubscribe()
 *         return
 *       }
 *       // 处理状态变更
 *     })
 *     abortSignal.addEventListener('abort', () => unsubscribe())
 *   }
 * }
 * ```
 *
 * 生命周期：
 * - Effect 方法存储在 Domain 类构造函数上（不是实例上），因为 Domain 实例是次抛的
 * - 当 Domain 第一次被订阅时，所有 @effect() 方法会被调用
 * - Effect 挂载到 Store 层面，使用稳固的 effect id (uniqueName + path + methodName)
 * - 根据 path/result-state/value 的变化响应式地管理 effect
 * - 当 Domain 最后一次取消订阅时，使用 setTimeout(0) 延迟取消，处理间隙问题
 */
function effect() {
    return function <This, Value extends EffectMethod>(
        target: Value,
        context: ClassMethodDecoratorContext<This, Value> & {
            static: false
        },
    ): Value {
        const methodName = String(context.name)

        context.addInitializer(function (this: any) {
            // 获取 Domain 类构造函数（不是实例）
            const DomainCtor = this.constructor as new (...args: any[]) => any

            let methods = effectMethodsStorage.get(DomainCtor)
            if (!methods) {
                methods = new Map()
                effectMethodsStorage.set(DomainCtor, methods)
            }

            // 存储原始的 effect 方法（不绑定 this，因为会在调用时绑定）
            methods.set(methodName, target as EffectMethod)
        })

        return target
    }
}

// =============================================================================
// PART 5: FRAMEWORK (Component)
// =============================================================================

/**
 * Component 静态方法类型（排除 prototype）
 */
type ComponentCtorStatic = Omit<typeof Component, 'prototype'>

/**
 * Component 构造函数接口
 */
interface ComponentCtor<Input, Out, Context = any> extends ComponentCtorStatic {
    new (input: Input, context: Context): Component<Input, Out, Context>
}

/**
 * Component: 通用组件基类
 *
 * @template Input 组件输入类型
 * @template Out 组件输出类型
 * @template Context 组件上下文类型
 *
 * 提供：
 * - 统一的运行接口（run 静态方法）
 * - 错误处理机制（catch 方法）
 * - 显式依赖订阅（get 方法）
 * - 子组件组合（use 方法，隔离依赖追踪）
 *
 * 核心机制：
 * - 组件必须通过 this.get(domain) 显式订阅依赖
 * - use() 方法不追踪子组件的依赖（隔离机制）
 * - 更新由 ComponentStore 自顶向下调度
 */
abstract class Component<Input, Out, Context = any> {
    protected readonly context: Context
    protected readonly input: Input
    /** 组件唯一 ID，用于依赖追踪 */
    readonly id: string = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

    constructor(input: Input, context: Context) {
        this.context = context
        this.input = input
        // 注册到 ComponentStore
        globalComponentStore.register(this)
    }

    /**
     * 运行组件
     * 创建组件实例，调用 impl() 方法，捕获错误并调用 catch() 方法
     */
    static run<Input, Out, Context>(this: ComponentCtor<Input, Out, Context>, input: Input, context: Context): Out {
        const Ctor = this
        const instance = new Ctor(input, context)
        try {
            return instance.impl()
        } catch (error) {
            return instance.catch(error instanceof Error ? error : new Error(String(error), { cause: error }))
        }
    }

    /**
     * 显式订阅 Domain：组件必须通过此方法访问数据并注册依赖
     *
     * 行为：
     * 1. 调用 domain.get() 获取数据和 path
     * 2. 从 path 提取 EffectKey 并注册依赖关系到 ComponentStore
     * 3. 返回 Result 供组件使用
     *
     * @param domain Domain 实例
     * @returns Result 包含 value 和 path
     */
    protected get<T>(domain: Domain<T>): Result<T> {
        const result = domain.get()
        if (result.ok) {
            // 从 path 提取 EffectKey 并注册依赖
            const effectKey = getEffectKeyFromResultPath(result.path)
            globalComponentStore.track(effectKey, this.id)
        }
        return result
    }

    /**
     * 使用子组件（隔离机制）
     *
     * 关键特性：
     * - 父组件调用 use() 时，不会追踪子组件内部访问的 domain
     * - 只有子组件内部调用 get() 时才会注册依赖
     * - 这确保了更新范围被限制在受影响的最小子树中
     *
     * @param Child 子组件构造函数
     * @param input 子组件输入
     * @returns 子组件输出
     */
    use<SubInput, SubOut>(Child: ComponentCtor<SubInput, SubOut, Context>, input: SubInput): SubOut {
        // 创建子组件实例（会自动注册到 ComponentStore）
        const child = new Child(input, this.context)
        try {
            return child.impl()
        } catch (error) {
            return child.catch(error instanceof Error ? error : new Error(String(error), { cause: error }))
        }
    }

    /**
     * 重新运行组件（由 ComponentStore 调度时调用）
     * 在调用前会清除旧的依赖关系
     */
    run(): Out {
        // 清除旧依赖（impl() 会重新收集）
        globalComponentStore.clearDependencies(this.id)
        try {
            return this.impl()
        } catch (error) {
            return this.catch(error instanceof Error ? error : new Error(String(error), { cause: error }))
        }
    }

    /**
     * 处理输出（可选，用于更新 DOM 等）
     * 子类可以重写此方法来实现自定义输出处理
     */
    handleOutput?(output: Out): void

    /** 组件实现：子类必须实现此方法 */
    abstract impl(): Out
    /** 错误处理：子类必须实现此方法 */
    abstract catch(error: Error): Out
}
// =============================================================================
// PART 6: HTML VIEW
// =============================================================================

/**
 * EventRegistry: 事件处理器注册表
 *
 * 用于在 HTML 字符串中注册事件处理器，通过 ID 引用
 * 每次渲染时重置，确保事件处理器与当前渲染的组件对应
 */
class EventRegistry {
    private handlers: Map<string, Function> = new Map()
    private counter = 0

    /**
     * 注册事件处理器
     * @param fn 处理器函数
     * @returns 处理器 ID
     */
    register(fn: Function): string {
        const id = `e${++this.counter}`
        this.handlers.set(id, fn)
        return id
    }

    /**
     * 触发事件处理器
     * @param id 处理器 ID
     * @param payload 可选的事件数据
     */
    trigger(id: string, payload?: any): void {
        const fn = this.handlers.get(id)
        if (fn) fn(payload)
        else console.warn(`[Event] Unknown handler: ${id}`)
    }

    /**
     * 重置注册表
     * 在每次渲染前调用，清除旧的事件处理器
     */
    reset(): void {
        this.handlers.clear()
        this.counter = 0
    }
}

const eventRegistry = new EventRegistry()

/**
 * 全局事件处理器
 * 在 HTML 字符串中通过 globalHandlers.trigger(id) 调用
 */
const globalHandlers = {
    trigger: (id: string) => eventRegistry.trigger(id),
}

// 在全局作用域中注册全局处理器（浏览器环境）
if (typeof globalThis !== 'undefined') (globalThis as any).globalHandlers = globalHandlers

/**
 * HtmlView: HTML 视图组件基类
 *
 * 提供：
 * - handler() 方法：注册事件处理器并返回可嵌入 HTML 的调用代码
 * - 默认的错误处理：返回错误信息的 HTML
 * - handleOutput() 方法：更新 DOM
 */
abstract class HtmlView<Input, Context> extends Component<Input, string, Context> {
    /**
     * 注册事件处理器
     * @param fn 事件处理函数
     * @returns 可嵌入 HTML 的 JavaScript 代码字符串
     */
    protected handler<E = any>(fn: (e: E) => void): string {
        const id = eventRegistry.register(fn)
        return `globalHandlers.trigger('${id}')`
    }

    /**
     * 处理输出：更新 DOM（可选）
     * 当使用全局重新渲染时，此方法不会被调用
     * 保留此方法以便未来实现增量更新
     */
    handleOutput?(html: string): void

    /**
     * 错误处理：返回错误信息的 HTML
     */
    catch(error: Error): string {
        return `<div style="color:red; border:1px solid red; padding:8px;">
            <strong>Component Error:</strong> ${error.message}
            <pre style="font-size:10px">${JSON.stringify(this.input, null, 2)}</pre>
        </div>`
    }
}

// =============================================================================
// PART 7: USER LAND - TODO APP WITH EFFECTS
// =============================================================================

// --- Models ---
type Todo = { id: number; text: string; done: boolean }

// --- Domains (Logic) with Effects ---

/**
 * TodoDomain: 单个 Todo 项的 Domain
 */
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

    /**
     * Effect: 记录 Todo 列表变更
     *
     * 监听 todos$ 的变化，记录总数和完成数
     *
     * 关键点：
     * - 使用 abortSignal 检查是否已取消
     * - 跳过第一次触发（初始值）
     * - 在 abort 时清理订阅
     */
    @effect()
    logTodoChanges(effectContext: EffectContext): void {
        let isFirst = true
        const unsubscribe = this.todos$.subscribe((todoList) => {
            if (effectContext.abortSignal.aborted) {
                unsubscribe()
                return
            }
            // 跳过第一次触发（初始值）
            if (isFirst) {
                isFirst = false
                return
            }
            const totalCount = todoList.length
            const completedCount = todoList.filter((todo) => todo.done).length
            this.logs$.addLog(`Todos updated: ${totalCount} total, ${completedCount} done`)
        })
        // 在 abort 时清理订阅
        effectContext.abortSignal.addEventListener('abort', () => unsubscribe())
    }

    /**
     * Effect: 自动保存模拟
     *
     * 监听整个应用状态的变化，使用防抖（debounce）机制
     * 在状态变化后 1 秒才执行保存操作
     *
     * 关键点：
     * - 使用 setTimeout 实现防抖
     * - 每次新变化时清除之前的定时器
     * - 在 abort 时清理定时器和订阅
     */
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
            // 跳过第一次触发（初始值）
            if (isFirst) {
                isFirst = false
                return
            }
            // 防抖：清除之前的定时器
            if (debounceTimer) clearTimeout(debounceTimer)
            // 设置新的定时器
            debounceTimer = setTimeout(() => {
                if (effectContext.abortSignal.aborted) return
                console.log('🔄 Auto-saving state...', appState)
                this.logs$.addLog('State auto-saved')
            }, 1000)
        })

        // 在 abort 时清理定时器和订阅
        effectContext.abortSignal.addEventListener('abort', () => {
            if (debounceTimer) clearTimeout(debounceTimer)
            unsubscribe()
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

// =============================================================================
// PART 8: BOOTSTRAP (DOM & Node.js Compat)
// =============================================================================

/**
 * 应用启动函数
 *
 * 功能：
 * 1. 创建 Store 和 Domain
 * 2. 设置主题切换功能
 * 3. 订阅状态变更并渲染
 * 4. 支持浏览器和 Node.js 环境
 */
function bootstrap() {
    // 可变的主题状态
    let currentTheme: ThemeName = 'light'

    /**
     * 创建应用上下文
     * 包含当前主题和主题切换函数
     */
    const createContext = (): AppContext => ({
        theme: currentTheme,
        toggleTheme: () => {
            currentTheme = currentTheme === 'light' ? 'dark' : 'light'
            console.log(`🎨 Theme switched to: ${currentTheme}`)
            render() // Re-render with new context
        },
    })

    // 创建 Store 并初始化状态
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

    // 构造根 Domain
    const rootDomain = new Domain(store, Accessor.id<AppState>()).use(AppDomain)

    // 订阅 Domain（这会启动所有 @effect() 方法！）
    const unsubscribe = rootDomain.subscribe((state) => {
        console.log('📊 State updated:', state.user, '- Todos:', state.todos.length)
    })

    /**
     * 渲染函数
     *
     * 功能：
     * 1. 重置事件注册表
     * 2. 创建新的上下文
     * 3. 运行 App 组件生成 HTML
     * 4. 在浏览器中更新 DOM，或在 Node.js 中输出到控制台
     *
     * 注意：现在更新由 ComponentStore 自动调度，不再需要手动订阅 Store
     */
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

    // 设置全局渲染函数到 ComponentStore
    globalComponentStore.setGlobalRender(render)

    // 初始渲染
    // 后续更新由 ComponentStore 自动调度，当 domain.set() 被调用时
    // Store.commit() 会触发 ComponentStore.triggerUpdate()
    // ComponentStore 会找到依赖该路径的组件并触发全局重新渲染
    render()

    // 返回控制接口
    return { store, rootDomain, unsubscribe, toggleTheme: () => createContext().toggleTheme() }
}

// --- RUN ---
bootstrap()
