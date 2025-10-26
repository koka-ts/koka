export const withResolvers: <T>() => PromiseWithResolvers<T> =
  Promise.withResolvers?.bind(Promise) ??
  (<T>() => {
    let resolve: (value: T) => void
    let reject: (reason?: any) => void

    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    // @ts-ignore as expected
    return { promise, resolve, reject }
  })