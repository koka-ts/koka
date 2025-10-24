export function shallowEqual(objA: any, objB: any): boolean {
    if (Object.is(objA, objB)) {
        return true
    }

    if (typeof objA !== 'object' || !objA || typeof objB !== 'object' || !objB) {
        return false
    }

    const keysA = Object.keys(objA)
    const keysB = Object.keys(objB)

    if (keysA.length !== keysB.length) {
        return false
    }

    const bHasOwnProperty = Object.prototype.hasOwnProperty.bind(objB)

    // Test for A's keys different from B.
    for (let idx = 0; idx < keysA.length; idx++) {
        const key = keysA[idx]

        if (!bHasOwnProperty(key)) {
            return false
        }

        const valueA = objA[key]
        const valueB = objB[key]

        if (!Object.is(valueA, valueB)) {
            return false
        }
    }

    return true
}
