import { Eff, Err, isGenerator } from 'koka'

export type OpticErr = Err<'OpticErr', string>

export type Getter<State, Root> = (root: Root) => Generator<OpticErr, State, unknown>

export type Updater<State> = (state: State) => Generator<OpticErr, State, unknown>

export type Setter<State, Root> = (updater: Updater<State>) => Updater<Root>

export type OpticOptions<State, Root> = {
    get: Getter<State, Root>
    set: Setter<State, Root>
}

type ArrayItem<T> = T extends (infer U)[] | readonly (infer U)[] ? U : never

type GetKey<T> = (item: ArrayItem<T>) => string | number

export type MaybeOpticEff<T> = T | Generator<OpticErr, T, unknown>

export function* getOpticValue<T>(value: MaybeOpticEff<T>): Generator<OpticErr, T, unknown> {
    if (isGenerator(value)) {
        return yield* value
    } else {
        return value
    }
}

export type Selector<Target, State> = {
    get: (state: State) => MaybeOpticEff<Target>
    set: (target: Target, state: State) => MaybeOpticEff<State>
}

export type InferOpticState<T> = T extends Optic<infer State, any> ? State : never

export type InferOpticRoot<T> = T extends Optic<any, infer Root> ? Root : never

export type AnyOptic = Optic<any, any>

export type NestedArray<T> = Array<T | NestedArray<T>>

export type NestedReadonlyArray<T> = ReadonlyArray<T | NestedReadonlyArray<T>>

const opticWeakMap = new WeakMap<object | unknown[], WeakMap<AnyOptic, unknown>>()

const setOpticCache = (object: object | unknown[], optic: AnyOptic, value: unknown) => {
    let opticMap = opticWeakMap.get(object)

    if (!opticMap) {
        opticMap = new WeakMap()
        opticWeakMap.set(object, opticMap)
    }

    opticMap.set(optic, value)
}

export class Optic<State, Root> {
    static root<Root>(): Optic<Root, Root> {
        return new Optic({
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

    static object<T extends Record<string, AnyOptic>>(
        optics: T,
    ): Optic<{ [K in keyof T]: InferOpticState<T[K]> }, InferOpticRoot<T[keyof T]>> {
        return this.root<InferOpticRoot<T[keyof T]>>()
            .select({
                *get(root) {
                    const object = {} as { [K in keyof T]: InferOpticState<T[K]> }

                    for (const key in optics) {
                        // @ts-ignore
                        object[key] = yield* optics[key].get(root)
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
                        root = yield* optics[key].set(function* () {
                            return newValue as any
                        })(root)
                    }

                    return root
                },
            })
            .prop('newObject')
    }

    static optional<State, Root>(optic: Optic<State, Root>): Optic<State | undefined, Root> {
        return Optic.root<Root>().select<State | undefined>({
            *get(root) {
                const result = yield* Eff.result(optic.get(root))

                if (result.type === 'ok') {
                    return result.value
                }
            },
            *set(state, root) {
                if (state === undefined) {
                    return root
                }

                const newState = state as State

                const newRoot = yield* optic.set(function* () {
                    return newState
                })(root)

                return newRoot
            },
        })
    }

    __type = 'KokaOptic' as const

    get: Getter<State, Root>
    set: Setter<State, Root>

    constructor(options: OpticOptions<State, Root>) {
        this.get = options.get
        this.set = options.set
    }

    toJSON(): undefined {
        return undefined
    }

    select<Target>(selector: Selector<Target, State>): Optic<Target, Root> {
        const { get, set } = this

        const optic: Optic<Target, Root> = new Optic({
            *get(root) {
                const isObjectRoot = typeof root === 'object' && root !== null

                let opticMap = isObjectRoot ? opticWeakMap.get(root) : null

                if (opticMap?.has(optic)) {
                    return opticMap.get(optic)! as Target
                }

                const state = yield* get(root)

                const isObjectState = typeof state === 'object' && state !== null

                opticMap = isObjectState ? opticWeakMap.get(state) : null

                if (opticMap?.has(optic)) {
                    const target = opticMap.get(optic)! as Target

                    if (isObjectRoot) {
                        setOpticCache(root, optic, target)
                    }

                    return target
                }

                const target = yield* getOpticValue(selector.get(state))

                if (isObjectState) {
                    setOpticCache(state, optic, target)
                }

                if (isObjectRoot) {
                    setOpticCache(root, optic, target)
                }

                return target
            },
            set: (updater) => {
                const updateState = function* (state: State) {
                    let target: Target

                    const isObjectState = typeof state === 'object' && state !== null

                    const opticMap = isObjectState ? opticWeakMap.get(state) : null

                    if (opticMap?.has(optic)) {
                        target = opticMap.get(optic)! as Target
                    } else {
                        target = yield* getOpticValue(selector.get(state))

                        if (isObjectState) {
                            setOpticCache(state, optic, target)
                        }
                    }

                    const newTarget = yield* updater(target)
                    const newState = yield* getOpticValue(selector.set(newTarget, state))

                    const isObjectNewState = typeof newState === 'object' && newState !== null

                    if (isObjectNewState) {
                        setOpticCache(newState, optic, newTarget)
                    }

                    return newState
                }

                const updateRoot = set(updateState)

                return updateRoot
            },
        })

        return optic
    }

    prop<Key extends keyof State & string>(key: Key): Optic<State[Key], Root> {
        return this.select({
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

    index<Index extends keyof State & number>(index: Index): Optic<State[Index], Root> {
        return this.select({
            *get(state) {
                if (!Array.isArray(state)) {
                    throw yield* Eff.err('OpticErr').throw(`[koka-optic] Index ${index} is not applied for an array`)
                }

                if (index < 0 || index >= state.length) {
                    throw yield* Eff.err('OpticErr').throw(
                        `[koka-optic] Index ${index} is out of bounds: ${state.length}`,
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
    ): Optic<Target, Root> {
        type TargetInfo = {
            target: Target
            index: number
        }

        return this.select<TargetInfo>({
            *get(list) {
                if (!Array.isArray(list)) {
                    throw yield* Eff.err('OpticErr').throw(`[koka-optic] Find ${predicate} is not applied for an array`)
                }

                const index = list.findIndex(predicate)

                if (index === -1) {
                    throw yield* Eff.err('OpticErr').throw(`[koka-optic] Item not found`)
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

    match<Matched extends State>(predicate: (state: State) => state is Matched): Optic<Matched, Root> {
        return this.select({
            *get(state) {
                if (!predicate(state)) {
                    throw yield* Eff.err('OpticErr').throw(`[koka-optic] State does not match by ${predicate}`)
                }

                return state
            },
            set(newState) {
                return newState
            },
        })
    }

    refine(predicate: (state: State) => boolean): Optic<State, Root> {
        return this.select({
            *get(state) {
                if (!predicate(state)) {
                    throw yield* Eff.err('OpticErr').throw(`[koka-optic] State does not match by ${predicate}`)
                }

                return state
            },
            set(newState) {
                return newState
            },
        })
    }

    as<Refined>(): Optic<Refined, Root> {
        return this as unknown as Optic<Refined, Root>
    }

    map<Target>(
        mapper:
            | Selector<Target, ArrayItem<State>>
            | Optic<Target, ArrayItem<State>>
            | ((state: Optic<ArrayItem<State>, ArrayItem<State>>) => Optic<Target, ArrayItem<State>>),
    ): Optic<Target[], Root> {
        const from = Optic.root<ArrayItem<State>>()

        let mapper$: Optic<Target, ArrayItem<State>>

        if (typeof mapper === 'function') {
            mapper$ = mapper(from)
        } else if (mapper instanceof Optic) {
            mapper$ = mapper
        } else {
            mapper$ = from.select(mapper)
        }

        return this.select({
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
                    throw yield* Eff.err('OpticErr').throw(
                        `[koka-optic] List length mismatch: ${list.length} !== ${targetList.length}`,
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
    ): Optic<Target[], Root> {
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

        return this.select<FilteredInfo>({
            *get(list) {
                if (!Array.isArray(list)) {
                    throw yield* Eff.err('OpticErr').throw(
                        `[koka-optic] Filter ${predicate} is not applied for an array`,
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
                            throw new Error(`[koka-optic] Key ${key} is not unique`)
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
}
