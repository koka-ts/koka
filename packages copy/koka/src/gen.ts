export const isGen = <T = unknown, TReturn = any, TNext = any>(
    value: unknown,
): value is Generator<T, TReturn, TNext> => {
    return typeof value === 'object' && value !== null && 'next' in value && 'throw' in value
}

export const cleanUpGen = <Yield, Return, Next>(gen: Generator<Yield, Return, Next>) => {
    const result = (gen as Generator<Yield, Return | undefined, Next>).return(undefined)

    if (!result.done) {
        throw new Error(`You can not use yield in the finally block of a generator`)
    }
}

export function* of<T>(value: T) {
    return value
}
