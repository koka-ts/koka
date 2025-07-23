# Koka Concept Explanations

This document provides in-depth explanations of Koka's core concepts and design philosophy.

## 📋 Table of Contents

-   [Algebraic Effects](#algebraic-effects)
    -   [What are Algebraic Effects?](#what-are-algebraic-effects)
    -   [Core Ideas of Algebraic Effects](#core-ideas-of-algebraic-effects)
    -   [Differences from Traditional Error Handling](#differences-from-traditional-error-handling)
-   [Effect System Design](#effect-system-design)
    -   [Koka's Effect Type System](#kokas-effect-type-system)
    -   [Effect Composition Principles](#effect-composition-principles)
    -   [Effect Handling Mechanism](#effect-handling-mechanism)
-   [Generators and Effects](#generators-and-effects)
    -   [Why Use Generators?](#why-use-generators)
    -   [Generator Effect Pattern](#generator-effect-pattern)
    -   [Effect Runner](#effect-runner)
-   [Type System Design](#type-system-design)
    -   [Advanced Type Tools](#advanced-type-tools)
    -   [Type Inference](#type-inference)
-   [Detailed Comparison with Effect-TS](#detailed-comparison-with-effect-ts)
    -   [Design Philosophy](#design-philosophy)
    -   [Type System Comparison](#type-system-comparison)
    -   [Error Handling Comparison](#error-handling-comparison)
    -   [Context Management Comparison](#context-management-comparison)
    -   [Performance Comparison](#performance-comparison)
    -   [Applicability](#applicability)
-   [Best Practices](#best-practices)
    -   [Effect Design Principles](#effect-design-principles)
    -   [Code Organization](#code-organization)
    -   [Error Handling Strategy](#error-handling-strategy)
    -   [Performance Optimization](#performance-optimization)
-   [Future Development Directions](#future-development-directions)
    -   [Planned Features](#planned-features)
    -   [Community Contributions](#community-contributions)
    -   [Learning Resources](#learning-resources)

## Algebraic Effects

### What are Algebraic Effects?

Algebraic Effects are a programming language feature that allows programs to suspend execution at runtime, transfer control to the caller, and then resume execution from where it was suspended. This mechanism provides a structured, type-safe way to handle side effects.

### Core Ideas of Algebraic Effects

1. **Effect Abstraction**: Abstract side effects (such as errors, I/O, state) as "effects"
2. **Effect Handling**: Handle these effects at different levels of the program
3. **Effect Composition**: Effects can be naturally composed and nested
4. **Type Safety**: All effects are checked at compile time

### Differences from Traditional Error Handling

**Traditional Exception Handling:**

```typescript
function getUser(id: string) {
    if (!id) {
        throw new Error('ID is required') // Throw error, interrupt execution
    }
    return fetchUser(id)
}

try {
    const user = getUser('')
} catch (error) {
    // error is of unknown type, lacks type safety
    console.error(error)
}
```

**Algebraic Effect Handling:**

```typescript
function* getUser(id: string) {
    if (!id) {
        yield* Eff.throw(new ValidationError('ID is required')) // Throw error, interrupt execution
    }
    return yield* Eff.await(fetchUser(id))
}

const result = Eff.run(
    Eff.try(getUser('')).handle({
        ValidationError: (error) => ({ error }), // Structured handling, error is the type thrown by ValidationError
    }),
)
```

## Effect System Design

### Koka's Effect Type System

Koka defines four basic effect types:

#### 1. Error Effects (Err)

Represent situations where a program might fail:

```typescript
type Err<Name extends string, T> = {
    type: 'err'
    name: Name
    error: T
}
```

Characteristics of error effects:

-   **Type Safety**: Error types are checked at compile time
-   **Structured**: Errors contain names and detailed information
-   **Composable**: Errors can propagate through function call chains

#### 2. Context Effects (Ctx)

Represent dependencies or configuration that programs need:

```typescript
type Ctx<Name extends string, T> = {
    type: 'ctx'
    name: Name
    context: EffSymbol | T
    optional?: true
}
```

Characteristics of context effects:

-   **Dependency Injection**: Provide dependencies at runtime
-   **Optionality**: Support optional context values
-   **Type Safety**: Context types are checked at compile time

#### 3. Async Effects (Async)

Represent asynchronous operations:

```typescript
type Async = {
    type: 'async'
    name?: undefined
    promise: Promise<unknown>
}
```

Characteristics of async effects:

-   **Seamless Integration**: Seamless integration with Promises
-   **Automatic Inference**: Automatically infer sync/async operations
-   **Error Propagation**: Async errors can be caught with try-catch

#### 4. Message Effects (Msg)

Represent communication between generators:

```typescript
type Msg<Name extends string, T> = {
    type: 'msg'
    name: Name
    message?: T
}
```

Characteristics of message effects:

-   **Bidirectional Communication**: Support sending and receiving messages
-   **Decoupled Design**: Loose coupling between generators

### Effect Composition Principles

Koka uses TypeScript's advanced type system to implement effect composition:

```typescript
// Effect union type
type AnyEff = Err<string, any> | Ctx<string, any> | Opt<string, any> | Async | Msg<string, any>

// Generator type
type Effect<T, E, C> = Generator<
    T, // Return type
    | Err<E> // Error effects
    | Ctx<C> // Context effects
    | Async // Async operations
    | Msg<M> // Message effects
>
```

### Effect Handling Mechanism

#### Effect Propagation

Effects naturally propagate through function call chains:

```typescript
function* inner() {
    yield* Eff.throw(new InnerError('inner error'))
    return 'should not reach here'
}

function* outer() {
    return yield* inner() // Error effects propagate to outer layer
}

// Handle effects at the top level
const result = Eff.run(
    Eff.try(outer()).handle({
        InnerError: (error) => `Handled: ${error}`,
    }),
)
```

#### Effect Handling

Use `Eff.try().handle()` to handle effects:

```typescript
const result = Eff.run(
    Eff.try(getUser('123')).handle({
        // Error handling
        ValidationError: (error) => ({ error }),
        UserNotFound: (error) => ({ error }),

        // Context provision
        UserId: '123',
        ApiKey: 'secret-key',

        // Optional context
        Logger: (level, message) => console.log(`[${level}] ${message}`),
    }),
)
```

## Generators and Effects

### Why Use Generators?

Generator functions are the ideal choice for implementing algebraic effects in JavaScript:

1. **Pause and Resume**: Generator functions can pause execution and resume
2. **Value Passing**: Values can be passed between pauses and resumes
3. **Error Propagation**: Errors can naturally propagate
4. **Type Safety**: TypeScript provides complete type checking

### Generator Effect Pattern

```typescript
function* effectFunction() {
    // 1. Produce effect
    const value = yield {
        type: 'ctx',
        name: 'SomeContext',
        context: EffSymbol,
    }

    // 2. Handle effect result
    if (value === null) {
        yield {
            type: 'err',
            name: 'SomeError',
            error: 'Context value is null',
        }
    }

    // 3. Return final result
    return `Processed: ${value}`
}
```

### Effect Runner

Koka provides a smart effect runner:

```typescript
function runEffect<T>(generator: Generator<any, T>): T | Promise<T> {
    const process = (result: IteratorResult<any, T>): T | Promise<T> => {
        while (!result.done) {
            const effect = result.value

            switch (effect.type) {
                case 'async':
                    return effect.promise.then(
                        (value) => process(generator.next(value)),
                        (error) => process(generator.throw(error)),
                    )
                case 'ctx':
                    // Handle optional context effects
                    result = generator.next(undefined)
                    break
                default:
                    throw new Error(`Unhandled effect: ${effect.type}`)
            }
        }

        return result.value
    }

    return process(generator.next())
}
```

## Type System Design

### Advanced Type Tools

Koka uses TypeScript's advanced type features:

#### Conditional Types

```typescript
// Extract error type
type ExtractErr<T> = T extends AnyErr ? T : never

// Exclude error type
type ExcludeErr<T> = T extends AnyErr ? never : T
```

#### Mapping Types

```typescript
// Convert effect to handler type
type ToHandler<Effect> = Effect extends Err<infer Name, infer U>
    ? Record<Name, (error: U) => unknown>
    : Effect extends Ctx<infer Name, infer U>
    ? Record<Name, U>
    : never
```

#### Intersection Types

```typescript
// Merge multiple handler types
type EffectHandlers<Effect> = UnionToIntersection<ToHandler<Effect>>
```

### Type Inference

Koka provides powerful type inference:

```typescript
// Automatically infer effect type
function* getUser(userId: string) {
    if (!userId) {
        yield* Eff.throw(new ValidationError('ID required'))
        // TypeScript knows this will produce ValidationError effect
    }

    const user = yield* Eff.await(fetchUser(userId))
    // TypeScript knows this will produce Async effect

    return user
}

// Type-safe handler
const result = Eff.run(
    Eff.try(getUser('123')).handle({
        ValidationError: (error: string) => ({ error }), // Type checking
        // TypeScript checks if all possible effects are handled
    }),
)
```

## Detailed Comparison with Effect-TS

### Design Philosophy

| Aspect             | Koka                | Effect-TS              |
| ------------------ | ------------------- | ---------------------- |
| **Design Goal**    | Lightweight, Simple | Complete, Feature-Rich |
| **Learning Curve** | Low                 | High                   |
| **API Complexity** | Minimal             | Comprehensive          |
| **Type System**    | Simple Direct       | Complex Powerful       |

### Type System Comparison

**Effect-TS Type:**

```typescript
// Effect-TS uses complex type system
Effect<Success, Error, Requirements>
```

**Koka Type:**

```typescript
// Koka uses simple generator type
Generator<T, Err | Ctx | Async>
```

### Error Handling Comparison

**Effect-TS:**

```typescript
import { Effect, pipe } from 'effect'

const getUser = (id: string) =>
    Effect.gen(function* () {
        if (!id) {
            yield* Effect.fail({ _tag: 'ValidationError', message: 'ID required' })
        }
        return yield* Effect.tryPromise(() => fetch(`/users/${id}`))
    })

const result = await Effect.runPromise(
    pipe(
        getUser(''),
        Effect.catchTag('ValidationError', (e) => Effect.sync(() => console.error(e.message))),
    ),
)
```

**Koka:**

```typescript
import { Eff } from 'koka'

class ValidationError extends Eff.Err('ValidationError')<string> {}

function* getUser(id: string) {
    if (!id) {
        yield* Eff.throw(new ValidationError('ID required'))
    }
    return yield* Eff.await(fetch(`/users/${id}`))
}

const result = await Eff.run(
    Eff.try(getUser('')).handle({
        ValidationError: (error) => console.error(error),
    }),
)
```

### Context Management Comparison

**Effect-TS:**

```typescript
import { Effect, Context } from 'effect'

class Random extends Context.Tag('MyRandomService')<Random, { readonly next: Effect.Effect<number> }>() {}

const program = Effect.gen(function* () {
    const random = yield* Random
    const randomNumber = yield* random.next
    return randomNumber
})

const runnable = Effect.provideService(program, Random, {
    next: Effect.sync(() => Math.random()),
})

const result = await Effect.runPromise(runnable)
```

**Koka:**

```typescript
import { Eff } from 'koka'

class MyRandom extends Eff.Ctx('MyRandom')<() => number> {}

function* program() {
    const getRandom = yield* Eff.get(MyRandom)
    return getRandom()
}

const result = Eff.run(
    Eff.try(program()).handle({
        MyRandom: () => Math.random(),
    }),
)
```

### Performance Comparison

| Metric               | Koka | Effect-TS |
| -------------------- | ---- | --------- |
| **Package Size**     | ~3kB | ~50kB     |
| **Runtime Overhead** | Low  | Medium    |
| **Memory Usage**     | Low  | Medium    |
| **Startup Time**     | Fast | Medium    |

### Applicability

**Choose Koka When:**

-   需要轻量级的效果管理
-   项目对包大小敏感
-   团队对函数式编程不熟悉
-   需要快速集成

**Choose Effect-TS When:**

-   需要完整的效果生态系统
-   项目需要高级的类型系统
-   团队有函数式编程经验
-   需要企业级功能

## Best Practices

### Effect Design Principles

1. **Single Responsibility**: Each effect should have a clear purpose
2. **Type Safety**: Utilize TypeScript's type system
3. **Composability**: Design effects that can be composed
4. **Testability**: Effects should be easy to test and simulate

### Code Organization

```typescript
// effects/user.ts - Define effect types
export class UserNotFound extends Eff.Err('UserNotFound')<string> {}
export class UserDatabase extends Eff.Ctx('UserDatabase')<Database> {}

// services/user-service.ts - Implement business logic
export function* getUserService(userId: string) {
    const db = yield* Eff.get(UserDatabase)
    // Business logic
}

// main.ts - Combine and run
const result = await Eff.run(
    Eff.try(getUserService('123')).handle({
        UserNotFound: (error) => ({ error }),
        UserDatabase: mockDatabase,
    }),
)
```

### Error Handling Strategy

1. **Layered Handling**: Handle errors at the appropriate level
2. **Error Transformation**: Transform low-level errors into high-level errors
3. **Error Recovery**: Provide error recovery mechanism
4. **Error Logging**: Record error information for debugging

### Performance Optimization

1. **Effect Merging**: Merge multiple effects to reduce overhead
2. **Lazy Loading**: Delay loading unnecessary effects
3. **Caching**: Cache repeated effect results
4. **Concurrency Handling**: Use `Eff.combine` and `Eff.all` for concurrency handling

## Future Development Directions

### Planned Features

1. **More Powerful Type Inference**: Improve TypeScript type inference
2. **Performance Optimization**: Further reduce runtime overhead
3. **Development Tools**: Provide better development experience
4. **Ecosystem**: Establish plugin and extension ecosystem

### Community Contributions

Koka welcomes community contributions:

1. **Issue Reporting**: Report bugs and feature requests
2. **Code Contribution**: Submit PR to improve code
3. **Documentation Improvement**: Help improve documentation
4. **Example Sharing**: Share usage examples and best practices

### Learning Resources

1. **Official Documentation**: Complete API documentation and tutorials
2. **Example Project**: Actual usage examples
3. **Community Discussions**: GitHub Issues and Discussions
4. **Blog Articles**: Deep technical articles and tutorials
