# API Reference

Complete API documentation for all Koka modules and functions.

## Core Module (`koka`)

### `Koka.try<T>(generator: () => Generator<any, T>)`

Creates a program that can handle effects.

**Type Signature:**

```typescript
function try<T>(generator: () => Generator<any, T>): TryProgram<T>
```

**Example:**

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'

class UserNotFound extends Err.Err('UserNotFound')<string> {}

function* getUser(id: string) {
    if (!id) {
        yield* Err.throw(new UserNotFound('Invalid user ID'))
    }
    return { id, name: 'John Doe' }
}

const program = Koka.try(getUser('123'))
```

### `Koka.run<T>(program: TryProgram<T>): T`

Runs a program synchronously.

**Type Signature:**

```typescript
function run<T>(program: TryProgram<T>): T
```

**Example:**

```typescript
const result = Koka.run(
    program.handle({
        UserNotFound: (error) => ({ error }),
    }),
)
```

### `Koka.runSync<T>(program: TryProgram<T>): T`

Alias for `Koka.run()`.

### `Koka.runAsync<T>(program: TryProgram<T>): Promise<T>`

Runs a program asynchronously.

**Type Signature:**

```typescript
function runAsync<T>(program: TryProgram<T>): Promise<T>
```

**Example:**

```typescript
const result = await Koka.runAsync(
    program.handle({
        UserNotFound: (error) => ({ error }),
    }),
)
```

## Error Effects (`koka/err`)

### `Err.Err<T>(name: string)`

Creates an error effect class.

**Type Signature:**

```typescript
function Err<T>(name: string): new (data: T) => ErrInstance<T>
```

**Example:**

```typescript
import * as Err from 'koka/err'

class ValidationError extends Err.Err('ValidationError')<{ field: string; message: string }> {}
class NetworkError extends Err.Err('NetworkError')<string> {}
```

### `Err.throw<T>(error: ErrInstance<T>)`

Throws an error effect.

**Type Signature:**

```typescript
function throw<T>(error: ErrInstance<T>): never
```

**Example:**

```typescript
yield * Err.throw(new ValidationError({ field: 'email', message: 'Invalid email' }))
```

## Context Effects (`koka/ctx`)

### `Ctx.Ctx<T>(name: string)`

Creates a context effect class.

**Type Signature:**

```typescript
function Ctx<T>(name: string): new () => CtxInstance<T>
```

**Example:**

```typescript
import * as Ctx from 'koka/ctx'

class Database extends Ctx.Ctx('Database')<{
    query: (sql: string) => Promise<any>
}> {}
class Config extends Ctx.Ctx('Config')<{ apiUrl: string }> {}
```

### `Ctx.get<T>(ctx: CtxInstance<T>)`

Gets a value from context.

**Type Signature:**

```typescript
function get<T>(ctx: CtxInstance<T>): T
```

**Example:**

```typescript
const db = yield * Ctx.get(Database)
const user = yield * Async.await(db.query('SELECT * FROM users WHERE id = ?'))
```

## Optional Effects (`koka/opt`)

### `Opt.Opt<T>(name: string)`

Creates an optional effect class.

**Type Signature:**

```typescript
function Opt<T>(name: string): new () => OptInstance<T>
```

**Example:**

```typescript
import * as Opt from 'koka/opt'

class Logger extends Opt.Opt('Logger')<(message: string) => void> {}
class Cache extends Opt.Opt('Cache')<Map<string, any>> {}
```

### `Opt.get<T>(opt: OptInstance<T>)`

Gets an optional value.

**Type Signature:**

```typescript
function get<T>(opt: OptInstance<T>): T | undefined
```

**Example:**

```typescript
const logger = yield * Opt.get(Logger)
logger?.('Processing user data...')
```

## Async Effects (`koka/async`)

### `Async.await<T>(value: T | Promise<T>)`

Awaits a value or promise.

**Type Signature:**

```typescript
function await<T>(value: T | Promise<T>): T
```

**Example:**

```typescript
import * as Async from 'koka/async'

const user = yield * Async.await(fetch('/api/user').then((res) => res.json()))
const data = yield * Async.await(Promise.resolve('some data'))
```

## Result Module (`koka/result`)

### `Result.ok<T>(value: T)`

Creates a successful result.

**Type Signature:**

```typescript
function ok<T>(value: T): OkResult<T>
```

**Example:**

```typescript
import * as Result from 'koka/result'

return Result.ok({ id: '123', name: 'John' })
```

### `Result.err<T>(error: T)`

Creates an error result.

**Type Signature:**

```typescript
function err<T>(error: T): ErrResult<T>
```

**Example:**

```typescript
return Result.err('User not found')
```

### `Result.run<T>(generator: () => Generator<any, T>)`

Runs a generator and returns a result.

**Type Signature:**

```typescript
function run<T>(generator: () => Generator<any, T>): Result<T, any>
```

**Example:**

```typescript
const result = Result.run(function* () {
    const user = yield* Async.await(fetch('/api/user').then((res) => res.json()))
    return user
})

if (result.type === 'ok') {
    console.log('Success:', result.value)
} else {
    console.log('Error:', result.error)
}
```

### `Result.wrap<T>(generator: () => Generator<any, T>)`

Wraps a generator in a result.

**Type Signature:**

```typescript
function wrap<T>(generator: () => Generator<any, T>): () => Generator<any, Result<T, any>>
```

**Example:**

```typescript
const wrappedGenerator = Result.wrap(function* () {
    const user = yield* Async.await(fetch('/api/user').then((res) => res.json()))
    return user
})

const result = yield * wrappedGenerator()
```

### `Result.unwrap<T>(generator: () => Generator<any, Result<T, any>>)`

Unwraps a result generator.

**Type Signature:**

```typescript
function unwrap<T>(generator: () => Generator<any, Result<T, any>>): () => Generator<any, T>
```

**Example:**

```typescript
const unwrappedGenerator = Result.unwrap(function* () {
    const result = yield* someOperation()
    return result
})
```

## Task Module (`koka/task`)

### `Task.all<T>(tasks: Array<() => Generator<any, T>>)`

Executes an array of tasks in parallel.

**Type Signature:**

```typescript
function all<T>(tasks: Array<() => Generator<any, T>>): Generator<any, T[]>
```

**Example:**

```typescript
import * as Task from 'koka/task'

const results = yield * Task.all([() => fetchUser('1'), () => fetchUser('2'), () => fetchUser('3')])
// Returns: [user1, user2, user3]
```

### `Task.tuple<T extends readonly unknown[]>(tasks: { [K in keyof T]: () => Generator<any, T[K]> })`

Executes a tuple of tasks in parallel.

**Type Signature:**

```typescript
function tuple<T extends readonly unknown[]>(tasks: { [K in keyof T]: () => Generator<any, T[K]> }): Generator<any, T>
```

**Example:**

```typescript
const [user, posts] = yield * Task.tuple([() => fetchUser(id), () => fetchPosts(id)])
// Returns: [user, posts] with proper typing
```

### `Task.object<T extends Record<string, any>>(tasks: { [K in keyof T]: () => Generator<any, T[K]> })`

Executes an object of tasks in parallel (recommended for structured data).

**Type Signature:**

```typescript
function object<T extends Record<string, any>>(tasks: { [K in keyof T]: () => Generator<any, T[K]> }): Generator<any, T>
```

**Example:**

```typescript
const result =
    yield *
    Task.object({
        user: () => fetchUser(id),
        posts: () => fetchPosts(id),
        comments: () => fetchComments(id),
    })
// Returns: { user, posts, comments }
```

### `Task.race<T>(tasks: Array<() => Generator<any, T>>)`

Returns the first completed task result.

**Type Signature:**

```typescript
function race<T>(tasks: Array<() => Generator<any, T>>): Generator<any, T>
```

**Example:**

```typescript
const result = yield * Task.race([() => fetchFromPrimary(id), () => fetchFromBackup(id)])
// Returns the first successful result
```

### `Task.concurrent<T, R>(tasks: Array<() => Generator<any, T>>, handler: (stream: AsyncIterable<{ index: number; value: T }>) => Promise<R>, options?: { maxConcurrency?: number })`

Executes tasks with controlled concurrency.

**Type Signature:**

```typescript
function concurrent<T, R>(
    tasks: Array<() => Generator<any, T>>,
    handler: (stream: AsyncIterable<{ index: number; value: T }>) => Promise<R>,
    options?: { maxConcurrency?: number },
): Generator<any, R>
```

**Example:**

```typescript
const results =
    yield *
    Task.concurrent(
        tasks,
        async (stream) => {
            const results = []
            for await (const { index, value } of stream) {
                results[index] = value
            }
            return results
        },
        { maxConcurrency: 5 },
    )
```

### `Task.series<T>(tasks: Array<() => Generator<any, T>>)`

Executes tasks sequentially.

**Type Signature:**

```typescript
function series<T>(tasks: Array<() => Generator<any, T>>): Generator<any, T[]>
```

**Example:**

```typescript
const results = yield * Task.series([() => step1(), () => step2(), () => step3()])
```

### `Task.parallel<T>(tasks: Array<() => Generator<any, T>>, maxConcurrency?: number)`

Executes tasks in parallel with optional concurrency limit.

**Type Signature:**

```typescript
function parallel<T>(tasks: Array<() => Generator<any, T>>, maxConcurrency?: number): Generator<any, T[]>
```

**Example:**

```typescript
const results = yield * Task.parallel(tasks, 3)
```

## Generator Utilities (`koka/gen`)

### `Gen.isGen(value: any): value is Generator`

Checks if a value is a generator.

**Type Signature:**

```typescript
function isGen(value: any): value is Generator
```

**Example:**

```typescript
import * as Gen from 'koka/gen'

if (Gen.isGen(someValue)) {
    // Handle generator
}
```

### `Gen.cleanUpGen<T>(gen: Generator<any, T>): T`

Cleans up a generator and returns its final value.

**Type Signature:**

```typescript
function cleanUpGen<T>(gen: Generator<any, T>): T
```

**Example:**

```typescript
const result = Gen.cleanUpGen(someGenerator)
```

### `Gen.of<T>(value: T): Generator<any, T>`

Creates a generator that yields a single value.

**Type Signature:**

```typescript
function of<T>(value: T): Generator<any, T>
```

**Example:**

```typescript
const gen = Gen.of('hello world')
```

## Core Types

### `TryProgram<T>`

A program that can handle effects.

```typescript
interface TryProgram<T> {
    handle(handlers: EffectHandlers): T
}
```

### `ErrInstance<T>`

An error effect instance.

```typescript
interface ErrInstance<T> {
    readonly _tag: string
    readonly data: T
}
```

### `CtxInstance<T>`

A context effect instance.

```typescript
interface CtxInstance<T> {
    readonly _tag: string
}
```

### `OptInstance<T>`

An optional effect instance.

```typescript
interface OptInstance<T> {
    readonly _tag: string
}
```

### `Result<T, E>`

A result type that can be either success or error.

```typescript
type Result<T, E> = OkResult<T> | ErrResult<E>

interface OkResult<T> {
    readonly type: 'ok'
    readonly value: T
}

interface ErrResult<E> {
    readonly type: 'err'
    readonly error: E
}
```

## Constants

### `KOKA_VERSION`

The current version of Koka.

```typescript
const KOKA_VERSION = '1.0.0'
```

## Best Practices

### 1. Use Task.object for Structured Data

```typescript
// ✅ Recommended: Use Task.object for named, structured data
const userProfile =
    yield *
    Task.object({
        user: () => fetchUser(id),
        posts: () => fetchPosts(id),
        comments: () => fetchComments(id),
    })

// ❌ Less ideal: Using Task.all for structured data
const [user, posts, comments] = yield * Task.all([() => fetchUser(id), () => fetchPosts(id), () => fetchComments(id)])
```

### 2. Handle All Effects

```typescript
// ✅ Good: Handle all effects
const program = Koka.try(operation()).handle({
    SomeError: (error) => ({ error }),
    SomeContext: 'value',
})

// ❌ Bad: Missing effect handlers
const program = Koka.try(operation()) // Will cause runtime error
```

### 3. Use Descriptive Effect Names

```typescript
// ✅ Good: Descriptive names
class UserNotFound extends Err.Err('UserNotFound')<string> {}
class DatabaseConnection extends Ctx.Ctx('DatabaseConnection')<Connection> {}

// ❌ Bad: Generic names
class Error extends Err.Err('Error')<string> {}
class Context extends Ctx.Ctx('Context')<any> {}
```

### 4. Leverage Type Inference

```typescript
// ✅ Good: Let TypeScript infer types
const user = yield * Ctx.get(Database)
const result = yield * Async.await(user.query('SELECT * FROM users'))

// ❌ Bad: Unnecessary type annotations
const user: Database = yield * Ctx.get(Database)
const result: any = yield * Async.await(user.query('SELECT * FROM users'))
```

This API reference covers all the functions and types available in Koka. For more detailed examples and tutorials, see the [Tutorials](../tutorials/) section.
