# Migrate from Effect-TS to Koka

This guide helps you migrate your existing Effect-TS codebase to Koka. While both libraries implement algebraic effects, they have different APIs and design philosophies.

## Key Differences

| Aspect            | Effect-TS                  | Koka                                 |
| ----------------- | -------------------------- | ------------------------------------ |
| Bundle Size       | ~50kB                      | ~3kB                                 |
| API Style         | Functional                 | Object-oriented                      |
| Effect Definition | `Effect<A, E, R>`          | `class MyEffect extends Err/Ctx/Opt` |
| Effect Handling   | `pipe()` with `Effect.gen` | `Koka.try().handle()`                |
| Type Safety       | Excellent                  | Excellent                            |
| Learning Curve    | Steep                      | Gentle                               |

## Migration Strategy

### Step 1: Install Koka

```bash
npm install koka
# or
yarn add koka
# or
pnpm add koka
```

### Step 2: Update Imports

**Effect-TS:**

```typescript
import { Effect, pipe } from '@effect/core'
import { Console, Exit } from '@effect/core'
```

**Koka:**

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Ctx from 'koka/ctx'
```

## Effect Definitions

### Effect-TS Effects

```typescript
// Effect-TS style
interface UserService {
    readonly _: unique symbol
}

interface UserService {
    getUser(id: string): Effect.Effect<User, UserNotFound, UserService>
}

const UserService = Context.Tag<UserService>()
```

### Koka Effects

```typescript
// Koka style
class UserNotFound extends Err.Err('UserNotFound')<string> {}
class UserService extends Ctx.Ctx('UserService')<{
    getUser: (id: string) => Promise<User>
}> {}
```

## Effectful Code

### Effect-TS Generator

```typescript
// Effect-TS
const getUser = (id: string) =>
    Effect.gen(function* (_) {
        const userService = yield* _(UserService)
        const user = yield* _(userService.getUser(id))
        return user
    })
```

### Koka Generator

```typescript
// Koka
function* getUser(id: string) {
    const userService = yield* Ctx.get(UserService)
    const user = yield* Async.await(userService.getUser(id))
    return user
}
```

## Effect Handling

### Effect-TS Handling

```typescript
// Effect-TS
const program = pipe(
    getUser('123'),
    Effect.provideService(UserService, {
        getUser: (id) => Effect.succeed({ id, name: 'John' }),
    }),
    Effect.catchAll((error) => Effect.succeed({ error })),
)

const result = await Effect.runPromise(program)
```

### Koka Handling

```typescript
// Koka
const program = Koka.try(getUser('123')).handle({
    UserNotFound: (error) => ({ error }),
    UserService: {
        getUser: async (id) => ({ id, name: 'John' }),
    },
})

const result = await Koka.run(program)
```

## Complete Migration Example

Let's migrate a complete Effect-TS application to Koka.

### Effect-TS Application

```typescript
import { Effect, pipe } from '@effect/core'
import { Console, Exit } from '@effect/core'

// Effect definitions
interface UserService {
    readonly _: unique symbol
}

interface UserService {
    getUser(id: string): Effect.Effect<User, UserNotFound, UserService>
}

const UserService = Context.Tag<UserService>()

interface Logger {
    readonly _: unique symbol
}

interface Logger {
    log(message: string): Effect.Effect<void, never, Logger>
}

const Logger = Context.Tag<Logger>()

// Error definitions
class UserNotFound {
    readonly _tag = 'UserNotFound'
    constructor(readonly id: string) {}
}

// Effectful code
const getUser = (id: string) =>
    Effect.gen(function* (_) {
        const logger = yield* _(Logger)
        const userService = yield* _(UserService)

        yield* _(logger.log(`Fetching user ${id}`))

        const user = yield* _(userService.getUser(id))

        yield* _(logger.log(`User ${id} fetched successfully`))

        return user
    })

// Program execution
const program = pipe(
    getUser('123'),
    Effect.provideService(Logger, {
        log: (message) => Effect.sync(() => console.log(message)),
    }),
    Effect.provideService(UserService, {
        getUser: (id) => (id === '123' ? Effect.succeed({ id, name: 'John Doe' }) : Effect.fail(new UserNotFound(id))),
    }),
    Effect.catchAll((error) =>
        error._tag === 'UserNotFound' ? Effect.succeed({ error: `User ${error.id} not found` }) : Effect.fail(error),
    ),
)

const result = await Effect.runPromise(program)
```

### Koka Migration

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Ctx from 'koka/ctx'
import * as Opt from 'koka/opt'
import * as Async from 'koka/async'

// Effect definitions
class UserNotFound extends Err.Err('UserNotFound')<string> {}
class UserService extends Ctx.Ctx('UserService')<{
    getUser: (id: string) => Promise<User>
}> {}
class Logger extends Opt.Opt('Logger')<(message: string) => void> {}

// Effectful code
function* getUser(id: string) {
    const logger = yield* Opt.get(Logger)
    const userService = yield* Ctx.get(UserService)

    logger?.(`Fetching user ${id}`)

    const user = yield* Async.await(userService.getUser(id))

    logger?.(`User ${id} fetched successfully`)

    return user
}

// Program execution
const program = Koka.try(getUser('123')).handle({
    UserNotFound: (id) => ({ error: `User ${id} not found` }),
    UserService: {
        getUser: async (id) => {
            if (id === '123') {
                return { id, name: 'John Doe' }
            } else {
                throw new UserNotFound(id)
            }
        },
    },
    Logger: (message) => console.log(message),
})

const result = await Koka.run(program)
```

## Migration Patterns

### 1. Effect Composition

**Effect-TS:**

```typescript
const program = pipe(
    Effect.succeed(1),
    Effect.flatMap((n) => Effect.succeed(n + 1)),
    Effect.map((n) => n * 2),
)
```

**Koka:**

```typescript
function* program() {
    const n = 1
    const incremented = n + 1
    return incremented * 2
}
```

### 2. Error Handling

**Effect-TS:**

```typescript
const program = pipe(
    riskyOperation,
    Effect.catchAll((error) => Effect.succeed({ error })),
)
```

**Koka:**

```typescript
const program = Koka.try(riskyOperation()).handle({
    SomeError: (error) => ({ error }),
})
```

### 3. Context Provision

**Effect-TS:**

```typescript
const program = pipe(effectfulCode, Effect.provideService(Service, implementation))
```

**Koka:**

```typescript
const program = Koka.try(effectfulCode()).handle({
    Service: implementation,
})
```

### 4. Parallel Operations

**Effect-TS:**

```typescript
const program = pipe(Effect.all([operation1, operation2, operation3]))
```

**Koka:**

```typescript
function* program() {
    const [result1, result2, result3] = yield* Task.all([operation1(), operation2(), operation3()])
    return [result1, result2, result3]
}
```

### 5. Tuple and Object Operations

**Effect-TS:**

```typescript
// Tuple operations
const program = pipe(Effect.all([operation1, operation2]))

// Object operations
const program = pipe(
    Effect.all({
        user: getUser(id),
        posts: getPosts(id),
    }),
)
```

**Koka:**

```typescript
function* program() {
    // For tuples, use Task.tuple
    const [result1, result2] = yield* Task.tuple([operation1(), operation2()])

    // For objects, use Task.object (recommended)
    const result = yield* Task.object({
        user: () => getUser(id),
        posts: () => getPosts(id),
    })

    return result
}
```

## Advanced Migration Patterns

### 1. Effect Layers

**Effect-TS:**

```typescript
const program = pipe(effectfulCode, Effect.provideLayer(layer1), Effect.provideLayer(layer2))
```

**Koka:**

```typescript
const program = Koka.try(Koka.try(effectfulCode()).handle(layer1)).handle(layer2)
```

### 2. Effect Scheduling

**Effect-TS:**

```typescript
const program = pipe(Effect.schedule(Schedule.fixed(Duration.seconds(1))))
```

**Koka:**

```typescript
function* program() {
    yield* Async.await(new Promise((resolve) => setTimeout(resolve, 1000)))
}
```

### 3. Effect Retry

**Effect-TS:**

```typescript
const program = pipe(effectfulCode, Effect.retry(Schedule.recurs(3)))
```

**Koka:**

```typescript
function* retry<T>(operation: () => Generator<any, T>, maxRetries: number) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return yield* operation()
        } catch (error) {
            if (i === maxRetries) throw error
            yield* Async.await(new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))))
        }
    }
}
```

## Testing Migration

### Effect-TS Testing

```typescript
import { TestContext } from '@effect/test'

const test = pipe(getUser('123'), Effect.provide(TestContext.TestContext), Effect.runSync)
```

### Koka Testing

```typescript
// Koka testing is straightforward - just provide mock implementations
const testProgram = Koka.try(getUser('123')).handle({
    UserService: {
        getUser: async (id) => ({ id, name: 'Test User' }),
    },
    Logger: (message) => console.log(`[TEST] ${message}`),
})

const result = await Koka.run(testProgram)
```

## Performance Considerations

### Bundle Size

-   **Effect-TS**: ~50kB minified + gzipped
-   **Koka**: ~3kB minified + gzipped

### Runtime Performance

Koka has minimal runtime overhead compared to Effect-TS, making it suitable for performance-critical applications.

## Migration Checklist

-   [ ] Install Koka
-   [ ] Update import statements
-   [ ] Convert Effect definitions to classes
-   [ ] Rewrite generators using `function*` syntax
-   [ ] Replace `pipe()` with `Koka.try().handle()`
-   [ ] Update error handling patterns
-   [ ] Migrate context provision
-   [ ] Update parallel operations (use Task.object for objects)
-   [ ] Test all functionality
-   [ ] Remove Effect-TS dependencies

## Common Pitfalls

### 1. Forgetting to Handle Effects

```typescript
// ❌ This will cause a runtime error
const result = Koka.run(getUser('123'))

// ✅ This is correct
const result = Koka.run(
    Koka.try(getUser('123')).handle({
        UserService: mockService,
    }),
)
```

### 2. Incorrect Effect Types

```typescript
// ❌ Wrong effect type
class UserService extends Err.Err('UserService')<Service> {}

// ✅ Correct effect type
class UserService extends Ctx.Ctx('UserService')<Service> {}
```

### 3. Missing Async Handling

```typescript
// ❌ Forgetting to await async operations
function* getUser(id: string) {
    const user = userService.getUser(id) // Missing yield* Async.await
    return user
}

// ✅ Correct async handling
function* getUser(id: string) {
    const user = yield* Async.await(userService.getUser(id))
    return user
}
```

### 4. Incorrect Task API Usage

```typescript
// ❌ Wrong: Using Task.all for objects
const result =
    yield *
    Task.all({
        user: () => getUser(id),
        posts: () => getPosts(id),
    })

// ✅ Correct: Using Task.object for objects
const result =
    yield *
    Task.object({
        user: () => getUser(id),
        posts: () => getPosts(id),
    })

// ✅ Correct: Using Task.all for arrays
const results = yield * Task.all([() => getUser(id), () => getPosts(id)])
```

## Next Steps

After migration, explore Koka's additional features:

-   [Task Management](../tutorials/task-management.md) - Advanced concurrency
-   [Context Management](../tutorials/context-management.md) - Dependency injection
-   [Error Handling](../tutorials/error-handling.md) - Advanced error patterns

The migration to Koka will result in a smaller bundle size, simpler API, and better performance while maintaining the power of algebraic effects!
