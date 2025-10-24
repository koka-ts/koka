# Koka vs Effect-TS: A Comprehensive Comparison

This document provides a detailed comparison between Koka and Effect-TS, two TypeScript libraries that implement algebraic effects. Understanding the differences will help you choose the right tool for your project.

## Overview

Both Koka and Effect-TS are excellent libraries for handling algebraic effects in TypeScript, but they have different design philosophies and trade-offs.

| Aspect             | Koka             | Effect-TS       |
| ------------------ | ---------------- | --------------- |
| **Bundle Size**    | ~3kB             | ~50kB           |
| **API Style**      | Object-oriented  | Functional      |
| **Learning Curve** | Gentle           | Steep           |
| **Type Safety**    | Excellent        | Excellent       |
| **Performance**    | Minimal overhead | Higher overhead |
| **Ecosystem**      | Lightweight      | Rich ecosystem  |
| **Maturity**       | Newer            | Mature          |

## Design Philosophy

### Koka: Simplicity and Performance

Koka prioritizes:

-   **Simplicity**: Easy to learn and use
-   **Performance**: Minimal runtime overhead
-   **Bundle size**: Small footprint for web applications
-   **Familiarity**: Uses familiar TypeScript patterns

### Effect-TS: Completeness and Expressiveness

Effect-TS prioritizes:

-   **Completeness**: Comprehensive effect system
-   **Expressiveness**: Rich set of combinators and operators
-   **Ecosystem**: Extensive tooling and libraries
-   **Academic rigor**: Based on solid theoretical foundations

## API Comparison

### Effect Definition

**Koka:**

```typescript
import * as Err from 'koka/err'
import * as Ctx from 'koka/ctx'

class UserNotFound extends Err.Err('UserNotFound')<string> {}
class UserService extends Ctx.Ctx('UserService')<{
    getUser: (id: string) => Promise<User>
}> {}
```

**Effect-TS:**

```typescript
import { Effect, Context } from '@effect/core'

interface UserService {
    readonly _: unique symbol
}

interface UserService {
    getUser(id: string): Effect.Effect<User, UserNotFound, UserService>
}

const UserService = Context.Tag<UserService>()

class UserNotFound {
    readonly _tag = 'UserNotFound'
    constructor(readonly id: string) {}
}
```

### Effectful Code

**Koka:**

```typescript
function* getUser(id: string) {
    const userService = yield* Ctx.get(UserService)
    const user = yield* Async.await(userService.getUser(id))
    return user
}
```

**Effect-TS:**

```typescript
const getUser = (id: string) =>
    Effect.gen(function* (_) {
        const userService = yield* _(UserService)
        const user = yield* _(userService.getUser(id))
        return user
    })
```

### Effect Handling

**Koka:**

```typescript
const program = Koka.try(getUser('123')).handle({
    UserNotFound: (id) => ({ error: `User ${id} not found` }),
    UserService: {
        getUser: async (id) => ({ id, name: 'John' }),
    },
})

const result = await Koka.run(program)
```

**Effect-TS:**

```typescript
const program = pipe(
    getUser('123'),
    Effect.provideService(UserService, {
        getUser: (id) => Effect.succeed({ id, name: 'John' }),
    }),
    Effect.catchAll((error) =>
        error._tag === 'UserNotFound' ? Effect.succeed({ error: `User ${error.id} not found` }) : Effect.fail(error),
    ),
)

const result = await Effect.runPromise(program)
```

## Feature Comparison

### 1. Bundle Size

**Koka: ~3kB**

-   Minimal dependencies
-   Tree-shakeable
-   Optimized for web applications

**Effect-TS: ~50kB**

-   Comprehensive feature set
-   Multiple modules
-   Rich ecosystem

### 2. Type Safety

Both libraries provide excellent type safety, but with different approaches:

**Koka:**

-   Compile-time effect checking
-   Type inference for effect handlers
-   Simple type definitions

**Effect-TS:**

-   Advanced type inference
-   Higher-kinded types
-   Complex type relationships

### 3. Error Handling

**Koka:**

```typescript
// Simple error handling
const program = Koka.try(operation()).handle({
    SomeError: (error) => ({ error }),
})
```

**Effect-TS:**

```typescript
// Rich error handling with combinators
const program = pipe(
    operation,
    Effect.catchAll((error) => Effect.succeed({ error })),
    Effect.retry(Schedule.recurs(3)),
    Effect.timeout(Duration.seconds(5)),
)
```

### 4. Context Management

**Koka:**

```typescript
// Simple dependency injection
const program = Koka.try(operation()).handle({
    Database: mockDatabase,
    Logger: console.log,
})
```

**Effect-TS:**

```typescript
// Advanced context management
const program = pipe(operation, Effect.provideLayer(DatabaseLayer), Effect.provideLayer(LoggerLayer))
```

### 5. Concurrency

**Koka:**

```typescript
// Simple parallel execution
const [user, posts] = yield * Task.all([fetchUser(id), fetchPosts(id)])

// Object-based parallel execution (recommended)
const result =
    yield *
    Task.object({
        user: () => fetchUser(id),
        posts: () => fetchPosts(id),
    })
```

**Effect-TS:**

```typescript
// Advanced concurrency control
const program = pipe(Effect.all([fetchUser(id), fetchPosts(id)]), Effect.withParallelism(5))

// Object-based parallel execution
const program = pipe(
    Effect.all({
        user: fetchUser(id),
        posts: fetchPosts(id),
        comments: fetchComments(id),
    }),
)
```

## Performance Characteristics

### Runtime Performance

**Koka:**

-   Minimal runtime overhead
-   Direct generator execution
-   No complex abstractions

**Effect-TS:**

-   Higher runtime overhead
-   Complex effect tracking
-   Rich feature set comes with cost

### Memory Usage

**Koka:**

-   Low memory footprint
-   Simple data structures
-   Efficient garbage collection

**Effect-TS:**

-   Higher memory usage
-   Complex effect trees
-   More objects to track

## Ecosystem and Tooling

### Effect-TS Ecosystem

**Strengths:**

-   Rich ecosystem of libraries
-   Comprehensive testing tools
-   Advanced debugging capabilities
-   Strong community support
-   Extensive documentation

**Examples:**

-   `@effect/data` - Data structures
-   `@effect/schema` - Schema validation
-   `@effect/test` - Testing utilities
-   `@effect/debug` - Debugging tools

### Koka Ecosystem

**Strengths:**

-   Lightweight and focused
-   Easy to integrate
-   Minimal dependencies
-   Fast adoption

**Current State:**

-   Core functionality only
-   Growing community
-   Focus on simplicity

## Use Cases

### Choose Koka When:

-   **Bundle size matters**: Web applications with strict size limits
-   **Simple effects**: Basic error handling and dependency injection
-   **Performance critical**: Applications requiring minimal overhead
-   **Learning curve**: Teams new to algebraic effects
-   **Integration**: Easy integration with existing codebases

### Choose Effect-TS When:

-   **Complex effects**: Advanced effect patterns and combinators
-   **Rich ecosystem**: Need for comprehensive tooling and libraries
-   **Academic rigor**: Require theoretical soundness
-   **Enterprise**: Large applications with complex requirements
-   **Team expertise**: Experienced functional programming teams

## Migration Considerations

### From Effect-TS to Koka

**Benefits:**

-   Reduced bundle size
-   Simpler API
-   Better performance
-   Easier learning curve

**Challenges:**

-   Loss of advanced features
-   Need to rewrite complex patterns
-   Smaller ecosystem

### From Koka to Effect-TS

**Benefits:**

-   Rich ecosystem
-   Advanced features
-   Better tooling
-   Mature community

**Challenges:**

-   Larger bundle size
-   Steeper learning curve
-   More complex API

## Code Examples Comparison

### Simple CRUD Operations

**Koka:**

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Ctx from 'koka/ctx'
import * as Async from 'koka/async'

class UserNotFound extends Err.Err('UserNotFound')<string> {}
class Database extends Ctx.Ctx('Database')<{
    query: (sql: string) => Promise<any>
}> {}

function* getUser(id: string) {
    const db = yield* Ctx.get(Database)
    const user = yield* Async.await(db.query(`SELECT * FROM users WHERE id = '${id}'`))

    if (!user) {
        yield* Err.throw(new UserNotFound(`User ${id} not found`))
    }

    return user
}

const program = Koka.try(getUser('123')).handle({
    UserNotFound: (error) => ({ error }),
    Database: {
        query: async (sql) => ({ id: '123', name: 'John' }),
    },
})

const result = await Koka.run(program)
```

**Effect-TS:**

```typescript
import { Effect, pipe } from '@effect/core'
import { Context } from '@effect/core'

interface Database {
    readonly _: unique symbol
}

interface Database {
    query(sql: string): Effect.Effect<any, never, Database>
}

const Database = Context.Tag<Database>()

class UserNotFound {
    readonly _tag = 'UserNotFound'
    constructor(readonly id: string) {}
}

const getUser = (id: string) =>
    Effect.gen(function* (_) {
        const db = yield* _(Database)
        const user = yield* _(db.query(`SELECT * FROM users WHERE id = '${id}'`))

        if (!user) {
            yield* _(Effect.fail(new UserNotFound(id)))
        }

        return user
    })

const program = pipe(
    getUser('123'),
    Effect.provideService(Database, {
        query: (sql) => Effect.succeed({ id: '123', name: 'John' }),
    }),
    Effect.catchAll((error) =>
        error._tag === 'UserNotFound' ? Effect.succeed({ error: `User ${error.id} not found` }) : Effect.fail(error),
    ),
)

const result = await Effect.runPromise(program)
```

### Parallel Operations

**Koka:**

```typescript
import * as Task from 'koka/task'

// Array-based parallel execution
const [user, posts] = yield * Task.all([() => fetchUser(id), () => fetchPosts(id)])

// Object-based parallel execution (recommended)
const result =
    yield *
    Task.object({
        user: () => fetchUser(id),
        posts: () => fetchPosts(id),
        comments: () => fetchComments(id),
    })
```

**Effect-TS:**

```typescript
import { Effect, pipe } from '@effect/core'

// Array-based parallel execution
const program = pipe(Effect.all([fetchUser(id), fetchPosts(id)]))

// Object-based parallel execution
const program = pipe(
    Effect.all({
        user: fetchUser(id),
        posts: fetchPosts(id),
        comments: fetchComments(id),
    }),
)
```

## Conclusion

Both Koka and Effect-TS are excellent choices for algebraic effects in TypeScript, but they serve different needs:

-   **Koka** is perfect for teams that want the benefits of algebraic effects with minimal complexity and overhead
-   **Effect-TS** is ideal for teams that need the full power of algebraic effects with rich tooling and ecosystem

The choice depends on your specific requirements, team expertise, and project constraints. Koka excels in simplicity and performance, while Effect-TS provides completeness and expressiveness.

For most applications, Koka provides the right balance of power and simplicity. For complex enterprise applications or teams with deep functional programming expertise, Effect-TS might be the better choice.

## Further Reading

-   [Koka Getting Started](../tutorials/getting-started.md)
-   [Effect-TS Documentation](https://effect.website/)
-   [Algebraic Effects Explained](./algebraic-effects.md)
-   [Performance Characteristics](./performance.md)
