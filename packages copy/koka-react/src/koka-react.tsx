import { useSyncExternalStore } from 'react'
import * as Domain from 'koka-domain'
import * as Err from 'koka/err'
import * as Result from 'koka/result'
import * as Accessor from 'koka-accessor'

export function useDomainResult<State, Root>(
    domain: Domain.Domain<State, Root>,
): Result.Result<State, Accessor.AccessorErr> {
    const subscribe = (onStoreChange: () => void) => {
        return Domain.subscribeDomainResult(domain, onStoreChange)
    }

    const getState = () => {
        return Domain.getState(domain)
    }

    const result = useSyncExternalStore(subscribe, getState, getState)

    return result
}

export function useDomainState<State, Root>(domain: Domain.Domain<State, Root>): State {
    const result = useDomainResult(domain)

    if (result.type === 'err') {
        throw result.error
    }

    return result.value
}

export function useDomainQueryResult<Return, Yield extends Err.AnyErr = Err.AnyErr>(
    query: Domain.Query<Return, Yield>,
): Result.Result<Return, Yield> {
    const subscribe = (onStoreChange: () => void) => {
        return Domain.subscribeQueryResult(query, onStoreChange)
    }

    const getState = () => {
        return Domain.getQueryResult(query)
    }

    const result = useSyncExternalStore(subscribe, getState, getState)

    return result
}

export function useDomainQuery<Return, Yield extends Err.AnyErr = Err.AnyErr>(
    query: Domain.Query<Return, Yield>,
): Return {
    const result = useDomainQueryResult(query)

    if (result.type === 'err') {
        throw result.error
    }

    return result.value
}
