import * as Err from 'koka/err'
import * as Gen from 'koka/gen'
import * as Result from 'koka/result'

export class AccessorErr extends Err.Err('koka-accessor/accessor-err')<string> {}

export type Getter<State, Root> = (root: Root) => Generator<AccessorErr, State>

export type Updater<State> = (state: State) => Generator<AccessorErr, State>

export type Setter<State, Root> = (updater: Updater<State>) => Updater<Root>

export type AccessorOptions<State, Root> = {
    get: Getter<State, Root>
    set: Setter<State, Root>
}

export type ArrayItem<T> = T extends (infer U)[] | readonly (infer U)[] ? U : never

export type GetKey<T> = (item: ArrayItem<T>) => string | number

export type MaybeAccessorEff<T> = T | Generator<AccessorErr, T>

export function* getValue<T>(value: MaybeAccessorEff<T>): Generator<AccessorErr, T> {
    if (Gen.isGen(value)) {
        return yield* value
    } else {
        return value
    }
}

export type Transformer<Target, State> = {
    get: (state: State) => MaybeAccessorEff<Target>
    set: (target: Target, state: State) => MaybeAccessorEff<State>
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
        *get(root) {
            return root
        },
        set: (updater) => {
            return function* (root) {
                const newRoot = yield* updater(root)

                return newRoot
            }
        },
    })
}

export function object<T extends Record<string, AnyAccessor>>(
    accessors: T,
): Accessor<{ [K in keyof T]: InferAccessorState<T[K]> }, InferAccessorRoot<T[keyof T]>> {
    return root<InferAccessorRoot<T[keyof T]>>()
        .transform({
            *get(root) {
                const object = {} as { [K in keyof T]: InferAccessorState<T[K]> }

                for (const key in accessors) {
                    // @ts-ignore
                    object[key] = yield* accessors[key].get(root)
                }

                return {
                    oldObject: object,
                    newObject: object,
                }
            },
            *set(state, root) {
                for (const key in state.newObject) {
                    const newValue = state.newObject[key]
                    const oldValue = state.oldObject[key]

                    if (newValue === oldValue) {
                        continue
                    }

                    // @ts-ignore expected
                    root = yield* accessors[key].set(function* () {
                        return newValue as any
                    })(root)
                }

                return root
            },
        })
        .prop('newObject')
}

export function optional<State, Root>(accessor: Accessor<State, Root>): Accessor<Koka.Final | State | undefined, Root> {
    return root<Root>().transform<State | undefined>({
        *get(root) {
            const result = yield* Result.wrap(accessor.get(root))

            if (result.type === 'ok') {
                return result.value
            }
        },
        *set(state, root) {
            if (state === undefined) {
                return root
            }

            const newState = state as State

            const newRoot = yield* accessor.set(function* () {
                return newState
            })(root)

            return newRoot
        },
    })
}

export function get<State, Root>(root: Root, accessor: Accessor<State, Root>): Generator<AccessorErr, State> {
    return accessor.get(root)
}

export function set<State, Root>(
    root: Root,
    accessor: Accessor<State, Root>,
    stateOrUpdater: State | ((state: State) => State) | Updater<State>,
): Generator<AccessorErr, Root> {
    if (typeof stateOrUpdater === 'function') {
        const updater = stateOrUpdater as ((state: State) => State) | Updater<State>
        return accessor.set(function* (state) {
            const newState = updater(state)

            if (Gen.isGen(newState)) {
                return yield* newState
            }

            return newState
        })(root)
    } else {
        const state = stateOrUpdater as State
        return accessor.set(function* () {
            return state
        })(root)
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
            *get(root) {
                const isObjectRoot = typeof root === 'object' && root !== null

                let accessorMap = isObjectRoot ? accessorWeakMap.get(root) : null

                if (accessorMap?.has(accessor)) {
                    return accessorMap.get(accessor)! as Target
                }

                const state = yield* get(root)

                const isObjectState = typeof state === 'object' && state !== null

                accessorMap = isObjectState ? accessorWeakMap.get(state) : null

                if (accessorMap?.has(accessor)) {
                    const target = accessorMap.get(accessor)! as Target

                    if (isObjectRoot) {
                        setAccessorCache(root, accessor, target)
                    }

                    return target
                }

                const target = yield* getValue(selector.get(state))

                if (isObjectState) {
                    setAccessorCache(state, accessor, target)
                }

                if (isObjectRoot) {
                    setAccessorCache(root, accessor, target)
                }

                return target
            },
            set: (updater) => {
                const updateState = function* (state: State) {
                    let target: Target

                    const isObjectState = typeof state === 'object' && state !== null

                    const accessorMap = isObjectState ? accessorWeakMap.get(state) : null

                    if (accessorMap?.has(accessor)) {
                        target = accessorMap.get(accessor)! as Target
                    } else {
                        target = yield* getValue(selector.get(state))

                        if (isObjectState) {
                            setAccessorCache(state, accessor, target)
                        }
                    }

                    const newTarget = yield* updater(target)
                    const newState = yield* getValue(selector.set(newTarget, state))

                    const isObjectNewState = typeof newState === 'object' && newState !== null

                    if (isObjectNewState) {
                        setAccessorCache(newState, accessor, newTarget)
                    }

                    return newState
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
                return state[key]
            },
            set(newValue, state) {
                return {
                    ...state,
                    [key]: newValue,
                }
            },
        })
    }

    index<Index extends keyof State & number>(index: Index): Accessor<State[Index], Root> {
        return this.transform({
            *get(state) {
                if (!Array.isArray(state)) {
                    throw yield* Err.throw(
                        new AccessorErr(`[koka-accessor] Index ${index} is not applied for an array`),
                    )
                }

                if (index < 0 || index >= state.length) {
                    throw yield* Err.throw(
                        new AccessorErr(`[koka-accessor] Index ${index} is out of bounds: ${state.length}`),
                    )
                }

                return state[index] as State[Index]
            },
            *set(newValue, state) {
                const newState = [...(state as State[Index][])]
                newState[index] = newValue

                return newState as typeof state
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
            *get(list) {
                if (!Array.isArray(list)) {
                    throw yield* Err.throw(
                        new AccessorErr(`[koka-accessor] Find ${predicate} is not applied for an array`),
                    )
                }

                const index = list.findIndex(predicate)

                if (index === -1) {
                    throw yield* Err.throw(new AccessorErr(`[koka-accessor] Item not found`))
                }

                const target = list[index]

                return {
                    target,
                    index,
                }
            },
            set(itemInfo, list) {
                const newList = [...(list as ArrayItem<State>[])]
                newList[itemInfo.index] = itemInfo.target

                return newList as typeof list
            },
        }).prop('target')
    }

    match<Matched extends State>(predicate: (state: State) => state is Matched): Accessor<Matched, Root> {
        return this.transform({
            *get(state) {
                if (!predicate(state)) {
                    throw yield* Err.throw(new AccessorErr(`[koka-accessor] State does not match by ${predicate}`))
                }

                return state
            },
            set(newState) {
                return newState
            },
        })
    }

    refine(predicate: (state: State) => boolean): Accessor<State, Root> {
        return this.transform({
            *get(state) {
                if (!predicate(state)) {
                    throw yield* Err.throw(new AccessorErr(`[koka-accessor] State does not match by ${predicate}`))
                }

                return state
            },
            set(newState) {
                return newState
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
            *get(state) {
                const list = state as ArrayItem<State>[]

                const targetList: Target[] = []

                for (const item of list as ArrayItem<State>[]) {
                    const target = yield* mapper$.get(item)

                    targetList.push(target)
                }

                return targetList
            },
            *set(targetList, state) {
                const list = state as ArrayItem<State>[]

                const newList = [] as ArrayItem<State>[]

                if (list.length !== targetList.length) {
                    throw yield* Err.throw(
                        new AccessorErr(
                            `[koka-accessor] List length mismatch: ${list.length} !== ${targetList.length}`,
                        ),
                    )
                }

                for (let i = 0; i < list.length; i++) {
                    const item = list[i]
                    const newTarget = targetList[i]

                    const updateItem = mapper$.set(function* () {
                        return newTarget
                    })

                    const newItem = yield* updateItem(item)
                    newList.push(newItem)
                }

                return newList as State
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
            *get(list) {
                if (!Array.isArray(list)) {
                    throw yield* Err.throw(
                        new AccessorErr(`[koka-accessor] Filter ${predicate} is not applied for an array`),
                    )
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

                return {
                    filtered,
                    indexRecord,
                    indexList,
                }
            },
            *set(filteredInfo, list) {
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

                return newList as State
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
