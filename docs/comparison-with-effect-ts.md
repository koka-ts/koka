# Koka vs Effect-TS: Detailed Comparison

This document provides an in-depth comparison between Koka and Effect-TS, focusing on their approaches to effect management using generators.

## Core Philosophy

| Aspect             | Koka                      | Effect-TS                   |
| ------------------ | ------------------------- | --------------------------- |
| **Focus**          | Minimal effect management | Full featured effect system |
| **Size**           | ~3kB                      | ~50kB                       |
| **Learning Curve** | Low                       | High                        |

## Type System

### Effect-TS Effect Type

```typescript
         ┌─── Represents the success type
         │        ┌─── Represents the error type
         │        │      ┌─── Represents required dependencies
         ▼        ▼      ▼
Effect<Success, Error, Requirements>
```

### Koka Effect Type

```typescript
//                      ┌─── Return type
//                      │   ┌─── Error effect type
//                      │   │     ┌─── Context Effect type
//                      │   │     │     ┌─── Async Effect type
//                      ▼   ▼     ▼     ▼
type Effect = Generator<T, Err | Ctx | Async>
```

Key Differences:

-   Koka types are simpler and more direct using generators

## Generator-Based Error Handling and Async Handling

### Effect-TS Approach

```typescript
import { Effect, pipe } from 'effect'

const getUser = (id: string) => Effect.gen(function*() {
  if (!id) {
    yield* Effect.fail({ _tag: 'ValidationError', message: 'ID required' })
  }

  const user = yield* Effect.tryPromise(() => fetch(`/users/${id}`))

  return user
})

const result = await Effect.runPromise(
  pipe(
    getUser(''),
    Effect.catchTag('ValidationError', (e) =>
      Effect.sync(() => console.error(e.message))
  )
)
```

### Koka Approach

```typescript
import { Eff } from 'koka'

function* getUser(id: string) {
    if (!id) {
        yield* Eff.err('ValidationError').throw('ID required')
    }

    const user = yield* Eff.await(fetch(`/users/${id}`))

    return user
}

const result = await Eff.run(
    Eff.try(getUser('')).catch({
        ValidationError: (message) => console.error(message),
    }),
)
```

Key Architectural Differences:

-   **Generator Implementation**:
    -   Koka uses plain generators
    -   Effect-TS wraps generators in `Effect.gen`
-   **Error Handling**:
    -   Koka follows an imperative-style approach
    -   Effect-TS uses functional error channels
-   **Async Operations**:
    -   Koka automatically infers async operations
    -   Effect-TS requires explicit handling via `Effect.runPromise`
-   **Effect Management**:
    -   Koka has minimal wrapping requirements
    -   Effect-TS requires explicit effect wrapping/unwrapping

## Context and Dependency Management

### Effect-TS Context

```typescript
import { Effect, Context } from 'effect'

// Declaring a tag for a service that generates random numbers
class Random extends Context.Tag('MyRandomService')<Random, { readonly next: Effect.Effect<number> }>() {}

// Using the service
const program = Effect.gen(function* () {
    const random = yield* Random
    const randomNumber = yield* random.next
    console.log(`random number: ${randomNumber}`)
})

// Providing the implementation
//
//      ┌─── Effect<void, never, never>
//      ▼
const runnable = Effect.provideService(program, Random, {
    next: Effect.sync(() => Math.random()),
})

// Run successfully
Effect.runPromise(runnable)
/*
Example Output:
random number: 0.8241872233134417
*/
```

### Koka Context

```typescript
import { Eff } from 'koka'

const program = function* () {
    const getRandom = yield* Eff.ctx('MyRandom').get<() => number>()
    const randomNumber = getRandom

    console.log(`random number: ${randomNumber}`)
}

// Providing the implementation
Eff.run(
    Eff.try(program).catch({
        MyRandom: () => Math.random(),
    }),
)
```

Key Context Management Differences:

-   **Effect-TS**:
    -   Uses a sophisticated context system with `Context.Tag`
    -   Provides type-safe dependency injection
-   **Koka**:
    -   Uses simple string-based context retrieval via `Eff.ctx`
    -   Offers more straightforward setup

## Async Operations

### Koka Async

```typescript
const data = yield * Eff.await(fetch('/data'))
```

### Effect-TS Async

```typescript
const data = yield * Effect.tryPromise(() => fetch('/data'))
```

Key Differences:

-   Koka handles promises directly
-   Effect-TS requires explicit promise conversion
-   Both support async/await style

## When to Choose

**Choose Koka when:**

-   You need lightweight effect management
-   You want minimal bundle size
-   You need quick integration

**Choose Effect-TS when:**

-   You need a full-featured effect system and ecosystem
-   You require advanced effect combinators

## Migration Guide

### From Effect-TS to Koka

1. Replace `Effect.gen` with plain generators
2. Convert `Effect.fail` to `Eff.err().throw()`
3. Replace services with context effects
4. Use `Eff.await` instead of `Effect.tryPromise`

### From Koka to Effect-TS

1. Wrap generators in `Effect.gen`
2. Convert string errors to tagged unions
3. Replace context with services
4. Use Effect's built-in async handling

## Conclusion

Both libraries provide powerful effect management, but with different tradeoffs. Koka offers a simpler, more focused solution while Effect-TS provides a comprehensive effect management toolkit.
