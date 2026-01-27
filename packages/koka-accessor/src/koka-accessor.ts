export type AccessorErr = {
    type: 'err'
    name: 'koka-accessor/accessor-err'
    error: string
}

export type AccessorOk<T> = {
    type: 'ok'
    value: T
}

export function ok<T>(value: T): AccessorOk<T> {
    return {
        type: 'ok',
        value,
    }
}

export function err(error: string): AccessorErr {
    return {
        type: 'err',
        name: 'koka-accessor/accessor-err',
        error,
    }
}

export type AccessorResult<T> = AccessorOk<T> | AccessorErr

export function isAccessorResult<T>(value: unknown): value is AccessorResult<T> {
    return (
        typeof value === 'object' && value !== null && 'type' in value && (value.type === 'ok' || value.type === 'err')
    )
}

export type Getter<State, Root> = (root: Root) => AccessorResult<State>

export type Updater<State> = (state: State) => AccessorResult<State>

export type Setter<State, Root> = (updater: Updater<State>) => Updater<Root>

export type AccessorOptions<State, Root> = {
    get: Getter<State, Root>
    set: Setter<State, Root>
}

export type ArrayItem<T> = T extends (infer U)[] | readonly (infer U)[] ? U : never

export type GetKey<T> = (item: ArrayItem<T>) => string | number

export type Transformer<Target, State> = {
    get: (state: State) => AccessorResult<Target>
    set: (target: Target, state: State) => AccessorResult<State>
}

export type InferAccessorState<T> = T extends Accessor<infer State, any> ? State : never

export type InferAccessorRoot<T> = T extends Accessor<any, infer Root> ? Root : never

export type AnyAccessor = Accessor<any, any>

const accessorWeakMap = new WeakMap<object | unknown[], WeakMap<AnyAccessor, unknown>>()

const setAccessorCache = (object: object | unknown[], accessor: AnyAccessor, value: unknown) => {
    let accessorMap = accessorWeakMap.get(object)

    if (!accessorMap) {
        accessorMap = new WeakMap()
        accessorWeakMap.set(object, accessorMap)
    }

    accessorMap.set(accessor, value)
}

const AccessorProxySymbol = Symbol.for('koka-accessor-proxy')

type AccessorProxySymbol = typeof AccessorProxySymbol

export type LeafAccessorProxy<State extends number | string | boolean> = {
    [AccessorProxySymbol]: State
}

export type ArrayAccessorProxy<State extends unknown[]> = {
    [index: number]: AccessorProxy<State[number]>
    length: LeafAccessorProxy<number>
    [AccessorProxySymbol]: State
}

export type ObjectAccessorProxy<State extends object> = {
    [K in keyof State | AccessorProxySymbol]: K extends AccessorProxySymbol
        ? State
        : AccessorProxy<State[K & keyof State]>
}

export type AccessorProxy<State> = State extends unknown[]
    ? ArrayAccessorProxy<State>
    : State extends object
    ? ObjectAccessorProxy<State>
    : State extends number | string | boolean
    ? LeafAccessorProxy<State>
    : never

type AccessorProxyPath = (string | number)[]

const accessorProxyPathWeakMap = new WeakMap<object, AccessorProxyPath>()

const getAccessorProxyPath = (proxy: object): AccessorProxyPath => {
    const path = accessorProxyPathWeakMap.get(proxy)

    if (!path) {
        throw new Error('[koka-accessor] Accessor proxy path not found')
    }

    return path
}

function createAccessorProxy<State>(path: AccessorProxyPath = []): AccessorProxy<State> {
    const proxy: AccessorProxy<State> = new Proxy(
        {},
        {
            get(_target, prop) {
                if (typeof prop === 'symbol') {
                    throw new Error('[koka-accessor] Accessor proxy does not support symbols')
                }

                const index = Number(prop)

                if (!Number.isNaN(index)) {
                    return createAccessorProxy<State>([...path, index])
                }

                return createAccessorProxy<State>([...path, prop])
            },
        },
    ) as AccessorProxy<State>

    accessorProxyPathWeakMap.set(proxy, path)

    return proxy
}

export function root<Root>(): Accessor<Root, Root> {
    return new Accessor({
        get(root) {
            return ok(root)
        },
        set: (updater) => {
            return (root) => {
                const result = updater(root)
                if (result.type === 'err') {
                    return result
                }
                return ok(result.value)
            }
        },
    })
}

export function object<T extends Record<string, AnyAccessor>>(
    accessors: T,
): Accessor<{ [K in keyof T]: InferAccessorState<T[K]> }, InferAccessorRoot<T[keyof T]>> {
    return root<InferAccessorRoot<T[keyof T]>>()
        .transform({
            get(root) {
                const object = {} as { [K in keyof T]: InferAccessorState<T[K]> }

                for (const key in accessors) {
                    // @ts-ignore
                    const result = accessors[key].get(root)
                    if (result.type === 'err') {
                        return result
                    }
                    object[key] = result.value
                }

                return ok({
                    oldObject: object,
                    newObject: object,
                })
            },
            set(state, root) {
                let currentRoot = root
                for (const key in state.newObject) {
                    const newValue = state.newObject[key]
                    const oldValue = state.oldObject[key]

                    if (newValue === oldValue) {
                        continue
                    }

                    // @ts-ignore expected
                    const result = accessors[key].set(() => ok(newValue as any))(currentRoot)
                    if (result.type === 'err') {
                        return result
                    }
                    currentRoot = result.value
                }

                return ok(currentRoot)
            },
        })
        .prop('newObject')
}

export function optional<State, Root>(accessor: Accessor<State, Root>): Accessor<State | undefined, Root> {
    return root<Root>().transform<State | undefined>({
        get(root) {
            const result = accessor.get(root)

            if (result.type === 'ok') {
                return ok(result.value)
            }
            return ok(undefined)
        },
        set(state, root) {
            if (state === undefined) {
                return ok(root)
            }

            const newState = state as State

            const result = accessor.set(() => ok(newState))(root)
            if (result.type === 'err') {
                return result
            }

            return ok(result.value)
        },
    })
}

export function get<State, Root>(root: Root, accessor: Accessor<State, Root>): AccessorResult<State> {
    return accessor.get(root)
}

export function set<State, Root>(
    root: Root,
    accessor: Accessor<State, Root>,
    stateOrUpdater: State | ((state: State) => State) | Updater<State>,
): AccessorResult<Root> {
    if (typeof stateOrUpdater === 'function') {
        const updater = stateOrUpdater as ((state: State) => State) | Updater<State>
        return accessor.set((state) => {
            const result = updater(state)

            if (isAccessorResult(result)) {
                return result
            }

            return ok(result)
        })(root)
    } else {
        const state = stateOrUpdater as State
        return accessor.set(() => ok(state))(root)
    }
}

export class Accessor<State, Root> {
    get: Getter<State, Root>
    set: Setter<State, Root>

    constructor(options: AccessorOptions<State, Root>) {
        this.get = options.get
        this.set = options.set
    }

    toJSON(): undefined {
        return undefined
    }

    transform<Target>(selector: Transformer<Target, State>): Accessor<Target, Root> {
        const { get, set } = this

        const accessor: Accessor<Target, Root> = new Accessor({
            get(root) {
                const isObjectRoot = typeof root === 'object' && root !== null

                let accessorMap = isObjectRoot ? accessorWeakMap.get(root) : null

                if (accessorMap?.has(accessor)) {
                    return ok(accessorMap.get(accessor)! as Target)
                }

                const stateResult = get(root)
                if (stateResult.type === 'err') {
                    return stateResult
                }
                const state = stateResult.value

                const isObjectState = typeof state === 'object' && state !== null

                accessorMap = isObjectState ? accessorWeakMap.get(state) : null

                if (accessorMap?.has(accessor)) {
                    const target = accessorMap.get(accessor)! as Target

                    if (isObjectRoot) {
                        setAccessorCache(root, accessor, target)
                    }

                    return ok(target)
                }

                const targetResult = selector.get(state)
                if (targetResult.type === 'err') {
                    return targetResult
                }
                const target = targetResult.value

                if (isObjectState) {
                    setAccessorCache(state, accessor, target)
                }

                if (isObjectRoot) {
                    setAccessorCache(root, accessor, target)
                }

                return ok(target)
            },
            set: (updater) => {
                const updateState = (state: State): AccessorResult<State> => {
                    let target: Target

                    const isObjectState = typeof state === 'object' && state !== null

                    const accessorMap = isObjectState ? accessorWeakMap.get(state) : null

                    if (accessorMap?.has(accessor)) {
                        target = accessorMap.get(accessor)! as Target
                    } else {
                        const targetResult = selector.get(state)
                        if (targetResult.type === 'err') {
                            return targetResult
                        }
                        target = targetResult.value

                        if (isObjectState) {
                            setAccessorCache(state, accessor, target)
                        }
                    }

                    const newTargetResult = updater(target)
                    if (newTargetResult.type === 'err') {
                        return newTargetResult
                    }
                    const newTarget = newTargetResult.value

                    const newStateResult = selector.set(newTarget, state)
                    if (newStateResult.type === 'err') {
                        return newStateResult
                    }
                    const newState = newStateResult.value

                    const isObjectNewState = typeof newState === 'object' && newState !== null

                    if (isObjectNewState && (Array.isArray(newState) || typeof newState === 'object')) {
                        setAccessorCache(newState as object | unknown[], accessor, newTarget)
                    }

                    return ok(newState)
                }

                const updateRoot = set(updateState)

                return updateRoot
            },
        })

        return accessor
    }

    prop<Key extends keyof State & string>(key: Key): Accessor<State[Key], Root> {
        return this.transform({
            get(state) {
                return ok(state[key])
            },
            set(newValue, state) {
                return ok({
                    ...state,
                    [key]: newValue,
                })
            },
        })
    }

    index<Index extends keyof State & number>(index: Index): Accessor<State[Index], Root> {
        return this.transform({
            get(state) {
                if (!Array.isArray(state)) {
                    return err(`[koka-accessor] Index ${index} is not applied for an array`)
                }

                if (index < 0 || index >= state.length) {
                    return err(`[koka-accessor] Index ${index} is out of bounds: ${state.length}`)
                }

                return ok(state[index] as State[Index])
            },
            set(newValue, state) {
                const newState = [...(state as State[Index][])]
                newState[index] = newValue

                return ok(newState as typeof state)
            },
        })
    }

    find<Target extends ArrayItem<State>>(
        predicate:
            | ((item: ArrayItem<State>, index: number) => boolean)
            | ((item: ArrayItem<State>, index: number) => item is Target),
    ): Accessor<Target, Root> {
        type TargetInfo = {
            target: Target
            index: number
        }

        return this.transform<TargetInfo>({
            get(list) {
                if (!Array.isArray(list)) {
                    return err(`[koka-accessor] Find ${predicate} is not applied for an array`)
                }

                const index = list.findIndex(predicate)

                if (index === -1) {
                    return err(`[koka-accessor] Item not found`)
                }

                const target = list[index]

                return ok({
                    target,
                    index,
                })
            },
            set(itemInfo, list) {
                const newList = [...(list as ArrayItem<State>[])]
                newList[itemInfo.index] = itemInfo.target

                return ok(newList as typeof list)
            },
        }).prop('target')
    }

    match<Matched extends State>(predicate: (state: State) => state is Matched): Accessor<Matched, Root> {
        return this.transform({
            get(state) {
                if (!predicate(state)) {
                    return err(`[koka-accessor] State does not match by ${predicate}`)
                }

                return ok(state)
            },
            set(newState) {
                return ok(newState)
            },
        })
    }

    refine(predicate: (state: State) => boolean): Accessor<State, Root> {
        return this.transform({
            get(state) {
                if (!predicate(state)) {
                    return err(`[koka-accessor] State does not match by ${predicate}`)
                }

                return ok(state)
            },
            set(newState) {
                return ok(newState)
            },
        })
    }

    as<Refined>(): Accessor<Refined, Root> {
        return this as unknown as Accessor<Refined, Root>
    }

    map<Target>(
        mapper:
            | Transformer<Target, ArrayItem<State>>
            | Accessor<Target, ArrayItem<State>>
            | ((state: Accessor<ArrayItem<State>, ArrayItem<State>>) => Accessor<Target, ArrayItem<State>>),
    ): Accessor<Target[], Root> {
        const from = root<ArrayItem<State>>()

        let mapper$: Accessor<Target, ArrayItem<State>>

        if (typeof mapper === 'function') {
            mapper$ = mapper(from)
        } else if (mapper instanceof Accessor) {
            mapper$ = mapper
        } else {
            mapper$ = from.transform(mapper)
        }

        return this.transform({
            get(state) {
                const list = state as ArrayItem<State>[]

                const targetList: Target[] = []

                for (const item of list as ArrayItem<State>[]) {
                    const targetResult = mapper$.get(item)
                    if (targetResult.type === 'err') {
                        return targetResult
                    }
                    targetList.push(targetResult.value)
                }

                return ok(targetList)
            },
            set(targetList, state) {
                const list = state as ArrayItem<State>[]

                const newList = [] as ArrayItem<State>[]

                if (list.length !== targetList.length) {
                    return err(`[koka-accessor] List length mismatch: ${list.length} !== ${targetList.length}`)
                }

                for (let i = 0; i < list.length; i++) {
                    const item = list[i]
                    const newTarget = targetList[i]

                    const updateItem = mapper$.set(() => ok(newTarget))

                    const newItemResult = updateItem(item)
                    if (newItemResult.type === 'err') {
                        return newItemResult
                    }
                    newList.push(newItemResult.value)
                }

                return ok(newList as State)
            },
        })
    }

    getKey?: GetKey<State>

    filter<Target extends ArrayItem<State>>(
        predicate:
            | ((item: ArrayItem<State>, index: number) => boolean)
            | ((item: ArrayItem<State>, index: number) => item is Target),
    ): Accessor<Target[], Root> {
        const { getKey } = this

        type Index = number

        type IndexRecord = {
            [key: string | number]: Index
        }

        type IndexList = Index[]

        type FilteredInfo = {
            filtered: Target[]
            indexRecord?: IndexRecord
            indexList?: IndexList
        }

        return this.transform<FilteredInfo>({
            get(list) {
                if (!Array.isArray(list)) {
                    return err(`[koka-accessor] Filter ${predicate} is not applied for an array`)
                }

                let indexRecord: IndexRecord | undefined
                let indexList: IndexList | undefined

                const filtered = list.filter((item, index) => {
                    if (!predicate(item, index)) return false

                    if (getKey) {
                        const key = getKey(item)

                        if (indexRecord === undefined) {
                            indexRecord = {}
                        }

                        if (key in indexRecord) {
                            throw new Error(`[koka-accessor] Key ${key} is not unique`)
                        }

                        indexRecord[key] = index
                    } else {
                        if (indexList === undefined) {
                            indexList = []
                        }

                        indexList.push(index)
                    }

                    return true
                })

                return ok({
                    filtered,
                    indexRecord,
                    indexList,
                })
            },
            set(filteredInfo, list) {
                const newList = [...(list as ArrayItem<State>[])]

                const { filtered, indexRecord, indexList } = filteredInfo

                if (indexRecord) {
                    for (const newItem of filtered) {
                        const key = getKey!(newItem)

                        if (!(key in indexRecord)) {
                            continue
                        }

                        const index = indexRecord[key]

                        newList[index] = newItem
                    }
                } else if (indexList) {
                    for (let i = 0; i < indexList.length; i++) {
                        if (i >= filtered.length) {
                            break
                        }

                        const index = indexList[i]
                        const newItem = filtered[i]

                        newList[index] = newItem
                    }
                }

                return ok(newList as State)
            },
        }).prop('filtered')
    }

    proxy<Selected>(selector: (proxy: AccessorProxy<State>) => AccessorProxy<Selected>): Accessor<Selected, Root> {
        const proxy = createAccessorProxy<State>()
        const selected = selector(proxy)
        const path = getAccessorProxyPath(selected)

        let accessor: Accessor<any, Root> = this

        for (const key of path) {
            if (typeof key === 'number') {
                accessor = accessor.index(key)
            } else {
                accessor = accessor.prop(key)
            }
        }

        return accessor
    }
}
