import { useSyncExternalStore } from 'react'
import * as Domain from 'koka-domain'
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

export function useDomainQueryResult<Return = unknown>(queryRun: Domain.QueryRun<Return>): Domain.Result<Return> {
    const subscribe = (onStoreChange: () => void) => {
        return Domain.subscribeQueryResult<Return>(queryRun, () => onStoreChange())
    }

    const getState = () => {
        return Domain.getQueryResult<Return>(queryRun)
    }

    return useSyncExternalStore(subscribe, getState, getState) as Domain.Result<Return>
}

export function useDomainQuery<Return = unknown>(queryRun: Domain.QueryRun<Return>): Return {
    const result = useDomainQueryResult<Return>(queryRun)

    if (result.type === 'err') {
        throw result.error
    }

    return result.value
}
