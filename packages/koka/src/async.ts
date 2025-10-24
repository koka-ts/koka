export type MaybePromise<T> = T extends Promise<any> ? T : T | Promise<T>

export type Async = {
    type: 'async'
    name?: undefined
    promise: Promise<unknown>
}

function* awaitEffect<T>(value: T | Promise<T>): Generator<Async, T> {
    if (!(value instanceof Promise)) {
        return value
    }

    const result = yield {
        type: 'async',
        promise: value,
    }

    return result as T
}

export { awaitEffect as await }
