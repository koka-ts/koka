import { Eff, Err, isGenerator } from 'koka'

export type DomainErr = Err<'DomainErr', string>

export type Getter<State, Root> = (root: Root) => Generator<DomainErr, State, unknown>

export type Updater<State> = (state: State) => Generator<DomainErr, State, unknown>

export type Setter<State, Root> = (updater: Updater<State>) => Updater<Root>

export type DomainOptions<State, Root> = {
    get: Getter<State, Root>
    set: Setter<State, Root>
}

type ArrayItem<T> = T extends (infer U)[] | readonly (infer U)[] ? U : never

type GetKey<T> = (item: ArrayItem<T>) => string | number

export type MaybeDomainEff<T> = T | Generator<DomainErr, T, unknown>

export function* getDomainValue<T>(value: MaybeDomainEff<T>): Generator<DomainErr, T, unknown> {
    if (isGenerator(value)) {
        return yield* value
    } else {
        return value
    }
}

export type Selector<Target, State> = {
    get: (state: State) => MaybeDomainEff<Target>
    set: (target: Target, state: State) => MaybeDomainEff<State>
}

export type InferDomainState<T> = T extends Domain<infer State, any> ? State : never

export type InferDomainRoot<T> = T extends Domain<any, infer Root> ? Root : never

export type AnyDomain = Domain<any, any>

export type NestedArray<T> = Array<T | NestedArray<T>>

export type NestedReadonlyArray<T> = ReadonlyArray<T | NestedReadonlyArray<T>>

const domainWeakMap = new WeakMap<object | unknown[], WeakMap<AnyDomain, unknown>>()

const setDomainCache = (object: object | unknown[], domain: AnyDomain, value: unknown) => {
    let domainMap = domainWeakMap.get(object)

    if (!domainMap) {
        domainMap = new WeakMap()
        domainWeakMap.set(object, domainMap)
    }

    domainMap.set(domain, value)
}

export class Domain<State, Root> {
    static root<Root>(): Domain<Root, Root> {
        return new Domain({
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

    static object<T extends Record<string, AnyDomain>>(
        domains: T,
    ): Domain<{ [K in keyof T]: InferDomainState<T[K]> }, InferDomainRoot<T[keyof T]>> {
        return this.root<InferDomainRoot<T[keyof T]>>()
            .$select({
                *get(root) {
                    const object = {} as { [K in keyof T]: InferDomainState<T[K]> }

                    for (const key in domains) {
                        // @ts-ignore
                        object[key] = yield* domains[key].get(root)
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
                        root = yield* domains[key].set(function* () {
                            return newValue as any
                        })(root)
                    }

                    return root
                },
            })
            .$prop('newObject')
    }

    static optional<State, Root>(domain: Domain<State, Root>): Domain<State | undefined, Root> {
        return Domain.root<Root>().$select<State | undefined>({
            *get(root) {
                const result = yield* Eff.result(domain.get(root))

                if (result.type === 'ok') {
                    return result.value
                }
            },
            *set(state, root) {
                if (state === undefined) {
                    return root
                }

                const newState = state as State

                const newRoot = yield* domain.set(function* () {
                    return newState
                })(root)

                return newRoot
            },
        })
    }

    get: Getter<State, Root>
    set: Setter<State, Root>

    constructor(options: DomainOptions<State, Root>) {
        this.get = options.get
        this.set = options.set
    }

    toJSON(): undefined {
        return undefined
    }

    $select<Target>(selector: Selector<Target, State>): Domain<Target, Root> {
        const { get, set } = this

        const domain: Domain<Target, Root> = new Domain({
            *get(root) {
                const isObjectRoot = typeof root === 'object' && root !== null

                let domainMap = isObjectRoot ? domainWeakMap.get(root) : null

                if (domainMap?.has(domain)) {
                    return domainMap.get(domain)! as Target
                }

                const state = yield* get(root)

                const isObjectState = typeof state === 'object' && state !== null

                domainMap = isObjectState ? domainWeakMap.get(state) : null

                if (domainMap?.has(domain)) {
                    const target = domainMap.get(domain)! as Target

                    if (isObjectRoot) {
                        setDomainCache(root, domain, target)
                    }

                    return target
                }

                const target = yield* getDomainValue(selector.get(state))

                if (isObjectState) {
                    setDomainCache(state, domain, target)
                }

                if (isObjectRoot) {
                    setDomainCache(root, domain, target)
                }

                return target
            },
            set: (updater) => {
                const updateState = function* (state: State) {
                    let target: Target

                    const isObjectState = typeof state === 'object' && state !== null

                    const domainMap = isObjectState ? domainWeakMap.get(state) : null

                    if (domainMap?.has(domain)) {
                        target = domainMap.get(domain)! as Target
                    } else {
                        target = yield* getDomainValue(selector.get(state))

                        if (isObjectState) {
                            setDomainCache(state, domain, target)
                        }
                    }

                    const newTarget = yield* updater(target)
                    const newState = yield* getDomainValue(selector.set(newTarget, state))

                    const isObjectNewState = typeof newState === 'object' && newState !== null

                    if (isObjectNewState) {
                        setDomainCache(newState, domain, newTarget)
                    }

                    return newState
                }

                const updateRoot = set(updateState)

                return updateRoot
            },
        })

        return domain
    }

    $prop<Key extends keyof State & string>(key: Key): Domain<State[Key], Root> {
        return this.$select({
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

    $index<Index extends keyof State & number>(index: Index): Domain<State[Index], Root> {
        return this.$select({
            *get(state) {
                if (!Array.isArray(state)) {
                    throw yield* Eff.err('DomainErr').throw(`[koka-domain] Index ${index} is not applied for an array`)
                }

                if (index < 0 || index >= state.length) {
                    throw yield* Eff.err('DomainErr').throw(
                        `[koka-domain] Index ${index} is out of bounds: ${state.length}`,
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

    $find<Target extends ArrayItem<State>>(
        predicate:
            | ((item: ArrayItem<State>, index: number) => boolean)
            | ((item: ArrayItem<State>, index: number) => item is Target),
    ): Domain<Target, Root> {
        type TargetInfo = {
            target: Target
            index: number
        }

        return this.$select<TargetInfo>({
            *get(list) {
                if (!Array.isArray(list)) {
                    throw yield* Eff.err('DomainErr').throw(
                        `[koka-domain] Find ${predicate} is not applied for an array`,
                    )
                }

                const index = list.findIndex(predicate)

                if (index === -1) {
                    throw yield* Eff.err('DomainErr').throw(`[koka-domain] Item not found`)
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
        }).$prop('target')
    }

    $match<Matched extends State>(predicate: (state: State) => state is Matched): Domain<Matched, Root> {
        return this.$select({
            *get(state) {
                if (!predicate(state)) {
                    throw yield* Eff.err('DomainErr').throw(`[koka-domain] State does not match by ${predicate}`)
                }

                return state
            },
            set(newState) {
                return newState
            },
        })
    }

    $refine(predicate: (state: State) => boolean): Domain<State, Root> {
        return this.$select({
            *get(state) {
                if (!predicate(state)) {
                    throw yield* Eff.err('DomainErr').throw(`[koka-domain] State does not match by ${predicate}`)
                }

                return state
            },
            set(newState) {
                return newState
            },
        })
    }

    $as<Refined>(): Domain<Refined, Root> {
        return this as unknown as Domain<Refined, Root>
    }

    $map<Target>(
        mapper:
            | Selector<Target, ArrayItem<State>>
            | Domain<Target, ArrayItem<State>>
            | ((state: Domain<ArrayItem<State>, ArrayItem<State>>) => Domain<Target, ArrayItem<State>>),
    ): Domain<Target[], Root> {
        const from = Domain.root<ArrayItem<State>>()

        let mapper$: Domain<Target, ArrayItem<State>>

        if (typeof mapper === 'function') {
            mapper$ = mapper(from)
        } else if (mapper instanceof Domain) {
            mapper$ = mapper
        } else {
            mapper$ = from.$select(mapper)
        }

        return this.$select({
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
                    throw yield* Eff.err('DomainErr').throw(
                        `[koka-domain] List length mismatch: ${list.length} !== ${targetList.length}`,
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

    $filter<Target extends ArrayItem<State>>(
        predicate:
            | ((item: ArrayItem<State>, index: number) => boolean)
            | ((item: ArrayItem<State>, index: number) => item is Target),
    ): Domain<Target[], Root> {
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

        return this.$select<FilteredInfo>({
            *get(list) {
                if (!Array.isArray(list)) {
                    throw yield* Eff.err('DomainErr').throw(
                        `[koka-domain] Filter ${predicate} is not applied for an array`,
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
                            throw new Error(`[koka-domain] Key ${key} is not unique`)
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
        }).$prop('filtered')
    }
}
