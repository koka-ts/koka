# Koka - Lightweight 3kB Effect-TS alternative library based on Algebraic Effects

Koka is a minimal yet powerful effects library for TypeScript that provides structured error handling, context management, and async operations in a composable, type-safe manner.

Inspired by algebraic effects from [koka-lang](https://github.com/koka-lang/koka), it offers a pragmatic alternative to traditional error handling. Compared to comprehensive solutions like [Effect-TS](https://github.com/Effect-TS/effect), Koka focuses on delivering essential effect management with minimal overhead.

## Key Features

-   **Typed Effects**: Handle errors, context, and async operations with full type safety
-   **Composition**: Effects naturally compose across function boundaries
-   **Minimal API**: Just 7 core functions cover most use cases
-   **Async Ready**: Seamless Promise integration
-   **Tiny Footprint**: Only ~3kB gzipped

## Comparison with Effect-TS

While Effect-TS provides a more comprehensive effect management toolkit, Koka focuses on simplicity and minimalism. Here’s a quick comparison:

| Feature             | Koka | Effect-TS |
| ------------------- | ---- | --------- |
| **Error Effects**   | ✅   | ✅        |
| **Context Effects** | ✅   | ✅        |
| **Async Effects**   | ✅   | ✅        |
| **Composability**   | ✅   | ✅        |
| **Type Safety**     | ✅   | ✅        |
| **Minimal API**     | ✅   | ❌        |
| **Full Ecosystem**  | ❌   | ✅        |
| **Learning Curve**  | Low  | High      |
| **Size**            | ~3kb | ~50kb     |

Koka is ideal when you need lightweight effect management without the full complexity of a larger library like Effect-TS. It provides the essential building blocks for managing effects in a type-safe and composable way.

Just like the relationship between immer and immutable-js, Koka is a minimalistic alternative to Effect-TS.

[Koka vs Effect-TS: Detailed Comparison](./docs/comparison-with-effect-ts.md)

## Installation

```bash
npm install koka
# or
yarn add koka
# or
pnpm add koka
```

## Core Concepts

Effects are represented as generator functions yielding different effect types:

```typescript
type Effect<T, E, C> = Generator<
    T, // Return type
    | Err<E> // Error effects
    | Ctx<C> // Context effects
    | Async // Async operations
>
```

## Basic Usage

### Handling Errors

```typescript
import { Eff } from 'koka'

function* getUser(id: string) {
    if (!id) {
        // Throw an error effect in a type-safe way
        throw yield* Eff.err('ValidationError').throw('ID is required')
    }
    // Simulate fetching user data
    return { id, name: 'John Doe' }
}

function* main(id: string) {
    // Handle the error effect just like try/catch
    const user = yield* Eff.try(getUser(id)).catch({
        ValidationError: (error) => {
            console.error('Validation error:', error)
            return null
        },
    })

    return user // null if error occurred
}

const result = Eff.run(main('')) // null
```

### Working with Context

```typescript
function* calculateTotal() {
    // Get a context value in a type-safe way
    const discount = yield* Eff.ctx('Discount').get<number>()
    return 100 * (1 - discount)
}

function* main(discount?: number) {
    const total = yield* Eff.try(calculateTotal()).catch({
        // catch Discount context effect, and provide value for it
        Discount: discount ?? 0,
    })

    return total
}

const total = Eff.run(main(0.1)) // Returns 90
```

### Async Operations

```typescript
async function* fetchData() {
    // Use Eff.await to handle async operations just like async/await
    const response = yield* Eff.await(fetch('/api/data'))
    return response.json()
}

const data = await Eff.run(fetchData())
```

### Combining Effects

```typescript
// multiple effects can be combined in a single function or nested functions
function* complexOperation() {
    const userId = yield* Eff.ctx('UserId').get<string>()
    const user = yield* getUser(userId)
    const data = yield* fetchUserData(user.id)
    return processData(data)
}

const result = await Eff.run(
    // Using Eff.try to handle multiple effects without caring about nesting
    Eff.try(complexOperation()).catch({
        UserId: '123', // Context Effect
        ValidationError: (error) => ({ error }), // Error Effect
        NotFound: () => ({ message: 'Not found' }), // Another Error Effect
    }),
)
```

## Advanced Usage

### interpolating between error effects and result types

You can move all error effects in a generator function from `effect position` to `return position` via using `Eff.result`.

You can convert any Result type back to a generator function using `Eff.ok`

You can run a generator function that returns a Result type using `Eff.runResult`.

```typescript
import { Eff, Result } from 'koka'

function* fetchData() {
    const data = yield* Eff.await(fetch('/api/data'))
    if (!data.ok) {
        throw yield* Eff.err('FetchError').throw('Failed to fetch data')
    }
    return data.json()
}

const result = Eff.run(Eff.result(fetchData()))

if (result.type === 'ok') {
    console.log('Data:', result.value)
} else {
    console.error('Error:', result.error)
}

// Convert Result back to error effect
const generator = Eff.ok(Eff.result(fetchData()))

const finalResult = Eff.runResult(generator)

if (finalResult.type === 'ok') {
    console.log('Data:', finalResult.value)
} else {
    console.error('Error:', finalResult.error)
}
```

## API Reference

### Eff

-   `Eff.err(name).throw(error?)`: Throws an error effect
-   `Eff.ctx(name).get<T>()`: Gets a context value
-   `Eff.await<T>(Promise<T> | T)`: Handles async operations
-   `Eff.try(generator).catch(handlers)`: Handles effects
-   `Eff.run(generator)`: Runs a generator (handles async)
-   `Eff.result(generator)`:
-   `Eff.ok(generator)`: Unwraps Ok results
-   `Eff.runResult(generator)`: Runs a generator and returns a Result type

### Result

-   `Result.ok(value: T): Ok<T>`
-   `Result.err(name: Name, error: T): Err<Name, T>`

## Contributing

PRs are welcome! Please ensure tests pass and new features include appropriate test coverage.

## License

MIT
