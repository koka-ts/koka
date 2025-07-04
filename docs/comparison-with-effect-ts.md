# Koka vs Effect-TS: Detailed Comparison

This document provides an in-depth comparison between Koka and Effect-TS, focusing on their generator-based effect management approaches.

## 📋 Table of Contents

-   [Core Philosophy](#core-philosophy)
-   [Type System](#type-system)
    -   [Effect-TS Effect Types](#effect-ts-effect-types)
    -   [Koka Effect Types](#koka-effect-types)
-   [Generator-Based Error Handling and Async Processing](#generator-based-error-handling-and-async-processing)
    -   [Effect-TS Approach](#effect-ts-approach)
    -   [Koka Approach](#koka-approach)
-   [Context and Dependency Management](#context-and-dependency-management)
    -   [Effect-TS Context](#effect-ts-context)
    -   [Koka Context](#koka-context)
-   [Async Operations](#async-operations)
    -   [Koka Async](#koka-async)
    -   [Effect-TS Async](#effect-ts-async)
-   [Effect Composition](#effect-composition)
    -   [Koka Effect Composition](#koka-effect-composition)
    -   [Effect-TS Effect Composition](#effect-ts-effect-composition)
-   [Performance Comparison](#performance-comparison)
-   [Use Case Recommendations](#use-case-recommendations)
    -   [Choose Koka When:](#choose-koka-when)
    -   [Choose Effect-TS When:](#choose-effect-ts-when)
-   [Migration Guide](#migration-guide)
    -   [From Effect-TS to Koka](#from-effect-ts-to-koka)
    -   [From Koka to Effect-TS](#from-koka-to-effect-ts)
-   [Conclusion](#conclusion)

## Core Philosophy

| Aspect             | Koka                          | Effect-TS                      |
| ------------------ | ----------------------------- | ------------------------------ |
| **Design Goal**    | Lightweight Effect Management | Complete Feature Effect System |
| **Package Size**   | ~3kB                          | ~50kB                          |
| **Learning Curve** | Low                           | High                           |

## Type System

### Effect-TS Effect Types

```typescript
         ┌─── Success type
         │        ┌─── Error type
         │        │      ┌─── Required dependencies
         ▼        ▼      ▼
Effect<Success, Error, Requirements>
```

### Koka Effect Types

```typescript
//                      ┌─── Return type
//                      │   ┌─── Error effect type
//                      │   │     ┌─── Context effect type
//                      │   │     │     ┌─── Async effect type
//                      │   │     │     │     ┌─── Message effect type
//                      ▼   ▼     ▼     ▼     ▼
type Effect = Generator<T, Err | Ctx | Async | Msg>
```

Key differences:

-   Koka uses simpler, more direct generator types
-   Effect-TS uses more complex type systems

## Generator-Based Error Handling and Async Processing

### Effect-TS Approach

```typescript
import { Effect, pipe } from 'effect'

const getUser = (id: string) =>
    Effect.gen(function* () {
        if (!id) {
            yield* Effect.fail({ _tag: 'ValidationError', message: 'ID required' })
        }

        const user = yield* Effect.tryPromise(() => fetch(`/users/${id}`))

        return user
    })

const result = await Effect.runPromise(
    pipe(
        getUser(''),
        Effect.catchTag('ValidationError', (e) => Effect.sync(() => console.error(e.message))),
    ),
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
    Eff.try(getUser('')).handle({
        ValidationError: (message) => console.error(message),
    }),
)
```

Key architectural differences:

-   **Generator Implementation**:
    -   Koka uses native generators
    -   Effect-TS wraps generators with `Effect.gen`
-   **Error Handling**:
    -   Koka uses imperative-style methods
    -   Effect-TS uses functional error channels
-   **Async Operations**:
    -   Koka automatically infers async operations
    -   Effect-TS requires explicit handling via `Effect.runPromise`
-   **Effect Management**:
    -   Koka minimizes wrapping requirements
    -   Effect-TS requires explicit effect wrapping/unwrapping

## Context and Dependency Management

### Effect-TS Context

```typescript
import { Effect, Context } from 'effect'

// Declare a service tag for generating random numbers
class Random extends Context.Tag('MyRandomService')<Random, { readonly next: Effect.Effect<number> }>() {}

// Use the service
const program = Effect.gen(function* () {
    const random = yield* Random
    const randomNumber = yield* random.next
    console.log(`random number: ${randomNumber}`)
})

// Provide implementation
//
//      ┌─── Effect<void, never, never>
//      ▼
const runnable = Effect.provideService(program, Random, {
    next: Effect.sync(() => Math.random()),
})

// Run successfully
Effect.runPromise(runnable)
/*
Example output:
random number: 0.8241872233134417
*/
```

### Koka Context

```typescript
import { Eff } from 'koka'

const program = function* () {
    const getRandom = yield* Eff.ctx('MyRandom').get<() => number>()
    const randomNumber = getRandom()

    console.log(`random number: ${randomNumber}`)
}

// Provide implementation
Eff.run(
    Eff.try(program).handle({
        MyRandom: () => Math.random(),
    }),
)
```

Key context management differences:

-   **Effect-TS**:
    -   Uses complex context system with `Context.Tag`
    -   Provides type-safe dependency injection
-   **Koka**:
    -   Uses simple string-based context retrieval via `Eff.ctx`
    -   Provides more direct setup

## Async Operations

### Koka Async

```typescript
const data = yield * Eff.await(fetch('/data'))
```

### Effect-TS Async

```typescript
const data = yield * Effect.tryPromise(() => fetch('/data'))
```

Key differences:

-   Koka directly handles Promises
-   Effect-TS requires explicit Promise conversion
-   Both support async/await style

## Effect Composition

### Koka Effect Composition

```typescript
// Parallel composition
const [user, orders] = yield * Eff.combine([fetchUser(userId), fetchOrders(userId)])

// Object composition
const result =
    yield *
    Eff.combine({
        user: fetchUser(userId),
        profile: fetchProfile(userId),
        settings: getDefaultSettings(),
    })
```

### Effect-TS Effect Composition

```typescript
// Parallel composition
const [user, orders] = yield * Effect.all([fetchUser(userId), fetchOrders(userId)])

// Sequential composition
const result =
    yield *
    Effect.gen(function* () {
        const user = yield* fetchUser(userId)
        const profile = yield* fetchProfile(userId)
        const settings = yield* getDefaultSettings()

        return { user, profile, settings }
    })
```

## Performance Comparison

| Metric               | Koka | Effect-TS |
| -------------------- | ---- | --------- |
| **Bundle Size**      | ~3kB | ~50kB     |
| **Runtime Overhead** | Low  | Medium    |
| **Memory Usage**     | Low  | Medium    |
| **Startup Time**     | Fast | Medium    |

## Use Case Recommendations

### Choose Koka When:

-   You need lightweight effect management
-   Your project is small to medium-sized
-   Your team is not familiar with algebraic effects
-   You need quick integration
-   You prefer imperative programming style
-   Bundle size is a concern

### Choose Effect-TS When:

-   You need a complete effect ecosystem
-   Your project is large-scale
-   Your team has functional programming experience
-   You need enterprise-level features
-   You prefer functional programming style
-   You need advanced type safety features

## Migration Guide

### From Effect-TS to Koka

```typescript
// Effect-TS
const program = Effect.gen(function* () {
    const user = yield* Effect.tryPromise(() => fetchUser(id))
    return user
})

// Koka equivalent
function* program() {
    const user = yield* Eff.await(fetchUser(id))
    return user
}
```

### From Koka to Effect-TS

```typescript
// Koka
function* program() {
    const user = yield* Eff.await(fetchUser(id))
    return user
}

// Effect-TS equivalent
const program = Effect.gen(function* () {
    const user = yield* Effect.tryPromise(() => fetchUser(id))
    return user
})
```

## Conclusion

Both Koka and Effect-TS provide powerful effect management capabilities, but they serve different needs:

-   **Koka** is ideal for developers who want a lightweight, simple approach to effect management with minimal learning curve
-   **Effect-TS** is better suited for teams that need a comprehensive, enterprise-grade effect system with advanced features

The choice between them depends on your project requirements, team expertise, and performance constraints.
