# Koka - Composable Effect Management for TypeScript

Koka is a lightweight effects library for TypeScript that provides a structured way to handle errors, contexts, and async operations in a composable and type-safe manner.

Inspired by algebraic effects especially [koka-lang](https://github.com/koka-lang/koka), it offers a more flexible alternative to traditional error handling patterns. You can use it as an alternative to libraries like [Effect-TS](https://github.com/Effect-TS/effect) when you need a simpler, more focused solution for managing effects in your applications.

## Features

-   **Typed Effects**: Define and handle typed effects including errors, context, and async operations
-   **Composable**: Effects compose naturally and can be handled at any level of the call stack
-   **Type-Safe**: Full TypeScript support with rich type inference
-   **Minimal API**: Small surface area with powerful primitives
-   **Async Support**: First-class support for async/await patterns

## Comparison with Effect-TS

While Effect-TS provides a more comprehensive effect management toolkit, Koka focuses specifically on effect management with a simpler API:

| Feature         | Koka | Effect-TS |
| --------------- | ---- | --------- |
| Error Effects   | ✅   | ✅        |
| Context Effects | ✅   | ✅        |
| Async Effects   | ✅   | ✅        |
| Size            | ~3kb | ~50kb     |

Koka is ideal when you need lightweight effect management without the full complexity of a larger library like Effect-TS. It provides the essential building blocks for managing effects in a type-safe and composable way.

## Core APIs

-   `Eff.err(name).throw(error?)`: Throws an error effect
-   `Eff.ctx(name).get<T>()`: Gets a context value
-   `Eff.await<T>(promise)`: awaits for a promise or value
-   `Eff.try(generator).catch(handlers)`: Handles effects
-   `Eff.run(generator)`: Runs a generator with effects handling

## Installation

```bash
npm install koka
# or
yarn add koka
# or
pnpm add koka
```

## Basic Usage

### Handling Errors

```typescript
import { Eff } from 'koka'

function* getUser(id: string) {
    if (!id) {
        yield* Eff.err('ValidationError').throw('ID is required')
    }
    return { id, name: 'John Doe' }
}

function* main() {
    yield* Eff.try(getUser('')).catch({
        ValidationError: (error) => {
            console.error('Validation error:', error)
            return null
        },
    })
}

const result = Eff.run(main()) // null
```

### Working with Context

```typescript
function* calculateTotal() {
    const discount = yield* Eff.ctx('Discount').get<number>()
    return 100 * (1 - discount)
}

function* main(discount?: number) {
    const total = yield* Eff.try(calculateTotal()).catch({
        Discount: discount ?? 0,
    })

    return total
}

const total = Eff.run(main(0.1)) // Returns 90
```

### Async Operations

```typescript
async function* fetchData() {
    const response = yield* Eff.await(fetch('/api/data'))
    return response.json()
}

const data = await Eff.run(fetchData())
```

### Combining Effects

```typescript
function* complexOperation() {
    const userId = yield* Eff.ctx('UserId').get<string>()
    const user = yield* getUser(userId)
    const data = yield* fetchUserData(user.id)
    return processData(data)
}

const result = await Eff.run(
    Eff.try(complexOperation()).catch({
        UserId: '123', // Context Effect
        ValidationError: (error) => ({ error }), // Error Effect
        NotFound: () => ({ message: 'Not found' }), // Another Error Effect
    }),
)
```

## API Reference

### Result

-   `Result.ok(value: T): Ok<T>`
-   `Result.err(name: Name, error: T): Err<Name, T>`

### Eff

-   `Eff.err(name).throw(error?)`: Throws an error effect
-   `Eff.ctx(name).get<T>()`: Gets a context value
-   `Eff.try(generator).catch(handlers)`: Handles effects
-   `Eff.run(generator)`: Runs a generator (handles async)
-   `Eff.runResult(generator)`: Runs and returns a Result
-   `Eff.result(generator)`: Converts to Result type
-   `Eff.ok(generator)`: Unwraps Ok results
-   `Eff.await<T>(Promise<T> | T)`: Handles async operations

## Contributing

PRs are welcome! Please ensure tests pass and new features include appropriate test coverage.

## License

MIT
