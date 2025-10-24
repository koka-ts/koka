# Core Concepts: Algebraic Effects

This tutorial dives deep into the fundamental concepts that make Koka powerful and unique.

## What Are Algebraic Effects?

Algebraic effects are a programming paradigm that separates the **what** from the **how**. They allow you to write code that describes what operations you want to perform, without specifying how those operations should be implemented.

Think of it like this: you write a recipe (the effects), and someone else provides the kitchen equipment (the handlers).

## The Three Pillars of Koka

Koka is built around three core effect types, each serving a specific purpose:

### 1. Error Effects (`Err`)

Error effects represent operations that can fail. They're like throwing exceptions, but with type safety and explicit handling.

```typescript
import * as Err from 'koka/err'

// Define an error effect
class ValidationError extends Err.Err('ValidationError')<{ field: string; message: string }> {}

// Use the error effect
function* validateUser(user: any) {
    if (!user.name) {
        yield* Err.throw(
            new ValidationError({
                field: 'name',
                message: 'Name is required',
            }),
        )
    }

    if (!user.email) {
        yield* Err.throw(
            new ValidationError({
                field: 'email',
                message: 'Email is required',
            }),
        )
    }

    return user
}
```

### 2. Context Effects (`Ctx`)

Context effects provide values that your code needs to function. They're perfect for dependency injection and configuration.

```typescript
import * as Ctx from 'koka/ctx'

// Define context effects
class DatabaseConnection extends Ctx.Ctx('DatabaseConnection')<{ query: (sql: string) => Promise<any> }> {}
class Config extends Ctx.Ctx('Config')<{ apiUrl: string; timeout: number }> {}

// Use context effects
function* getUserById(id: string) {
    const db = yield* Ctx.get(DatabaseConnection)
    const config = yield* Ctx.get(Config)

    const user = await db.query(`SELECT * FROM users WHERE id = '${id}'`)
    return user
}
```

### 3. Optional Effects (`Opt`)

Optional effects provide values that might not be available. They're great for optional features or debugging.

```typescript
import * as Opt from 'koka/opt'

// Define optional effects
class Logger extends Opt.Opt('Logger')<(message: string) => void> {}
class DebugMode extends Opt.Opt('DebugMode')<boolean> {}

// Use optional effects
function* processData(data: any) {
    const logger = yield* Opt.get(Logger)
    const debugMode = yield* Opt.get(DebugMode)

    logger?.('Processing data...')

    if (debugMode) {
        logger?.('Debug mode enabled')
        console.log('Data:', data)
    }

    return process(data)
}
```

## The Generator Pattern

Koka uses TypeScript generators to represent effectful computations. Here's why:

```typescript
function* effectfulFunction() {
    // This function can perform effects
    const value = yield* someEffect()
    return value
}
```

The `function*` syntax creates a generator, and `yield*` is used to perform effects. This pattern allows Koka to:

-   **Pause execution** when an effect is performed
-   **Resume execution** with the result from the effect handler
-   **Maintain type safety** throughout the process

## Effect Handling

The real power comes from how effects are handled. Let's look at a comprehensive example:

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Ctx from 'koka/ctx'
import * as Opt from 'koka/opt'

// Define our effects
class UserNotFound extends Err.Err('UserNotFound')<string> {}
class DatabaseError extends Err.Err('DatabaseError')<string> {}
class DatabaseConnection extends Ctx.Ctx('DatabaseConnection')<{ query: (sql: string) => Promise<any> }> {}
class Logger extends Opt.Opt('Logger')<(message: string) => void> {}

// Write effectful code
function* getUserById(id: string) {
    const logger = yield* Opt.get(Logger)
    const db = yield* Ctx.get(DatabaseConnection)

    logger?.(`Fetching user with ID: ${id}`)

    try {
        const user = await db.query(`SELECT * FROM users WHERE id = '${id}'`)

        if (!user) {
            yield* Err.throw(new UserNotFound(`User with ID ${id} not found`))
        }

        logger?.(`Successfully fetched user: ${user.name}`)
        return user
    } catch (error) {
        yield* Err.throw(new DatabaseError(`Database error: ${error.message}`))
    }
}

// Handle effects with different implementations
const program = Koka.try(getUserById('123')).handle({
    // Error handlers
    UserNotFound: (error) => ({ error, status: 404 }),
    DatabaseError: (error) => ({ error, status: 500 }),

    // Context providers
    DatabaseConnection: {
        query: async (sql) => {
            // Mock database implementation
            if (sql.includes('123')) {
                return { id: '123', name: 'John Doe', email: 'john@example.com' }
            }
            return null
        },
    },

    // Optional providers
    Logger: (message) => console.log(`[INFO] ${message}`),
})

// Run the program
const result = Koka.run(program)
console.log(result)
```

## Type Safety

One of Koka's greatest strengths is its type safety. The TypeScript compiler ensures that:

1. **All effects are handled**: You can't run a program without handling all its effects
2. **Effect types match**: The types of your effect handlers must match the effect definitions
3. **Return types are correct**: The return type of your program is inferred correctly

```typescript
// TypeScript will catch these errors at compile time:

// ❌ Missing effect handler
const program1 = Koka.try(getUserById('123')).handle({
    // Missing UserNotFound handler - TypeScript error!
    DatabaseConnection: { query: async () => null },
})

// ❌ Wrong handler type
const program2 = Koka.try(getUserById('123')).handle({
    UserNotFound: (error: number) => {}, // TypeScript error: should be string
    DatabaseConnection: { query: async () => null },
})

// ✅ Correct handling
const program3 = Koka.try(getUserById('123')).handle({
    UserNotFound: (error: string) => ({ error }),
    DatabaseError: (error: string) => ({ error }),
    DatabaseConnection: { query: async () => null },
    Logger: (message: string) => console.log(message),
})
```

## Effect Composition

Effects compose naturally. You can combine multiple effects in a single function:

```typescript
function* complexOperation() {
    // Use multiple effect types
    const config = yield* Ctx.get(Config)
    const logger = yield* Opt.get(Logger)

    logger?.('Starting complex operation')

    try {
        const result = yield* someRiskyOperation()
        logger?.('Operation completed successfully')
        return result
    } catch (error) {
        yield* Err.throw(new OperationError(error.message))
    }
}
```

## The Power of Separation

The key insight of algebraic effects is **separation of concerns**:

-   **Business logic** focuses on what needs to be done
-   **Effect handlers** focus on how it should be done
-   **Testing** becomes easier because you can swap implementations
-   **Reusability** increases because the same logic can work with different handlers

## Next Steps

Now that you understand the core concepts, explore:

-   [Error Handling](./error-handling.md) - Advanced error management patterns
-   [Context Management](./context-management.md) - Dependency injection strategies
-   [Async Operations](./async-operations.md) - Working with asynchronous code
-   [Task Management](./task-management.md) - Concurrent operations

The power of algebraic effects lies in their simplicity and expressiveness. Once you grasp these concepts, you'll see how they can transform your code architecture!
