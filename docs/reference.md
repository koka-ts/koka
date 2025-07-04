# Koka API Reference

This document provides the complete API reference for the Koka library.

## 📋 Table of Contents

-   [Eff API](#eff-api)
    -   [Core Methods](#core-methods)
    -   [Effect Composition Methods](#effect-composition-methods)
    -   [Stream Processing Methods](#stream-processing-methods)
    -   [Message Passing Methods](#message-passing-methods)
    -   [Result Processing Methods](#result-processing-methods)
    -   [Predefined Effect Classes](#predefined-effect-classes)
    -   [Effect Operation Methods](#effect-operation-methods)
-   [Effect Type](#effect-type)
    -   [Base Types](#base-types)
    -   [Combined Types](#combined-types)
-   [Result Type](#result-type)
    -   [Base Types](#base-types-1)
    -   [Result Tools Functions](#result-tools-functions)
-   [Tools Functions](#tools-functions)
    -   [`isGenerator(value)`](#isgeneratorvalue)
-   [Type Tools](#type-tools)
    -   [`Task<Yield, Return>`](#taskyield-return)
    -   [`MaybePromise<T>`](#maybepromiset)
    -   [`MaybeFunction<T>`](#maybefunctiont)
    -   [`StreamResult<T>`](#streamresultt)
    -   [`StreamResults<TaskReturn>`](#streamresultstaskreturn)
    -   [`StreamHandler<TaskReturn, HandlerReturn>`](#streamhandlertaskreturn-handlerreturn)

## Eff API

### Core Methods

#### `Eff.err(name).throw(error?)`

Throw an error effect.

**Parameters:**

-   `name` (string): Name of the error type
-   `error` (any, optional): Error information

**Returns:** `Generator<Err<Name, E>, never>`

**Example:**

```typescript
function* validateUser(userId: string) {
    if (!userId) {
        yield* Eff.err('ValidationError').throw('User ID is required')
    }
    return { id: userId, name: 'John Doe' }
}
```

#### `Eff.ctx(name).get<T>()`

Get a context value.

**Parameters:**

-   `name` (string): Context name
-   `T` (type parameter): Type of the context value

**Returns:** `Generator<Ctx<Name, T>, T>`

**Example:**

```typescript
function* getUserInfo() {
    const userId = yield* Eff.ctx('UserId').get<string>()
    const apiKey = yield* Eff.ctx('ApiKey').get<string>()
    return { userId, apiKey }
}
```

#### `Eff.ctx(name).opt<T>()`

Get an optional context value.

**Parameters:**

-   `name` (string): Context name
-   `T` (type parameter): Type of the context value

**Returns:** `Generator<Opt<Name, T>, T | undefined>`

**Example:**

```typescript
function* getUserPreferences() {
    const theme = yield* Eff.ctx('Theme').opt<string>()
    const fontSize = yield* Eff.ctx('FontSize').opt<number>()
    return { theme: theme ?? 'light', fontSize: fontSize ?? 14 }
}
```

#### `Eff.await<T>(promise)`

Handle asynchronous operations.

**Parameters:**

-   `promise` (Promise<T> | T): Promise or synchronous value

**Returns:** `Generator<Async, T>`

**Example:**

```typescript
async function* fetchData() {
    const response = yield* Eff.await(fetch('/api/data'))
    return response.json()
}
```

#### `Eff.try(generator).handle(handlers)`

Handle effects.

**Parameters:**

-   `generator` (Task<Yield, Return>): Generator function or generator
-   `handlers` (Partial<EffectHandlers<Yield>>): Effect handlers

**Returns:** `Task<Exclude<Yield, { name: keyof Handlers }>, Return | ExtractErrorHandlerReturn<Handlers, Yield>>`

**Example:**

```typescript
const result = Eff.run(
    Eff.try(getUser('123')).handle({
        ValidationError: (error) => ({ error }),
        UserNotFound: (error) => ({ error }),
        UserId: '123',
    }),
)
```

#### `Eff.run(generator)`

Run a generator.

**Parameters:**

-   `generator` (MaybeFunction<Generator<AnyOpt, Return>>): Generator function or generator

**Returns:** `Return` or `Promise<Return>`

**Example:**

```typescript
// Synchronous execution
const result = Eff.run(getUserPreferences())

// Asynchronous execution
const result = await Eff.run(fetchData())
```

#### `Eff.runSync(generator)`

Run a generator synchronously.

**Parameters:**

-   `generator` (MaybeFunction<Generator<AnyOpt, Return>>): Generator function or generator

**Returns:** `Return`

**Example:**

```typescript
const result = Eff.runSync(getUserPreferences())
```

#### `Eff.runAsync(generator)`

Run a generator asynchronously.

**Parameters:**

-   `generator` (MaybeFunction<Generator<Async | AnyOpt, Return>>): Generator function or generator

**Returns:** `Promise<Return>`

**Example:**

```typescript
const result = await Eff.runAsync(fetchData())
```

### Effect Composition Methods

#### `Eff.combine(inputs)`

Combine multiple effects.

**Parameters:**

-   `inputs` (T): Input in array or object form

**Returns:** `Generator<ExtractYield<T> | Async, ExtractReturn<T>>`

**Example:**

```typescript
// Array form
const [user, orders] = yield * Eff.combine([fetchUser(userId), fetchOrders(userId)])

// Object form
const result =
    yield *
    Eff.combine({
        user: fetchUser(userId),
        profile: fetchProfile(userId),
        settings: getDefaultSettings(),
    })
```

#### `Eff.all(inputs)`

Execute all effects in parallel and wait for all results.

**Parameters:**

-   `inputs` (Iterable<Task<Yield, Return>>): Iterable list of effects

**Returns:** `Generator<Yield | Async, Return[]>`

**Example:**

```typescript
const results = yield * Eff.all([fetchUser(userId), fetchProfile(userId), fetchOrders(userId)])
```

#### `Eff.race(inputs)`

Execute effects in parallel and return the fastest result.

**Parameters:**

-   `inputs` (Iterable<Task<Yield, Return>>): Iterable list of effects

**Returns:** `Generator<Yield | Async, Return>`

**Example:**

```typescript
const result = yield * Eff.race([fetchFromCache(userId), fetchFromDatabase(userId), fetchFromAPI(userId)])
```

### Stream Processing Methods

#### `Eff.stream(inputs, handler)`

Process stream data.

**Parameters:**

-   `inputs` (Iterable<Task<Yield, TaskReturn>>): Iterable list of effects
-   `handler` (StreamHandler<TaskReturn, HandlerReturn>): Stream processor function

**Returns:** `Generator<Async | Yield, HandlerReturn>`

**Example:**

```typescript
const results =
    yield *
    Eff.stream([generator1(), generator2(), generator3()], async (stream) => {
        const processed = []
        for await (const { index, value } of stream) {
            processed[index] = `Processed: ${value}`
        }
        return processed
    })
```

### Message Passing Methods

#### `Eff.communicate(inputs)`

Message passing between generators.

**Parameters:**

-   `inputs` (T): Object containing generators

**Returns:** `Generator<Exclude<ExtractYield<T>, { type: 'msg' }>, ExtractReturn<T>>`

**Example:**

```typescript
const result = Eff.runSync(
    Eff.communicate({
        sender: senderGenerator,
        receiver: receiverGenerator,
    }),
)
```

#### `Eff.msg(name).send(message)`

Send a message.

**Parameters:**

-   `name` (string): Message name
-   `message` (T): Message content

**Returns:** `Generator<SendMsg<Name, T>, void>`

**Example:**

```typescript
yield * Eff.msg('Greeting').send('Hello, World!')
```

#### `Eff.msg(name).wait<T>()`

Wait for a message.

**Parameters:**

-   `name` (string): Message name
-   `T` (type parameter): Message type

**Returns:** `Generator<WaitMsg<Name, T>, T>`

**Example:**

```typescript
const message = yield * Eff.msg('Greeting').wait<string>()
```

### Result Processing Methods

#### `Eff.result(generator)`

Convert a generator to a result type.

**Parameters:**

-   `generator` (Generator<Yield, Return>): Generator

**Returns:** `Generator<ExcludeErr<Yield>, Ok<Return> | ExtractErr<Yield>>`

**Example:**

```typescript
const result = Eff.run(Eff.result(getUser('123')))
if (result.type === 'ok') {
    console.log('User:', result.value)
} else {
    console.error('Error:', result.error)
}
```

#### `Eff.ok(generator)`

Unpack Ok result.

**Parameters:**

-   `generator` (Generator<Yield, Return>): Return Result type generator

**Returns:** `Generator<Yield | ExtractErr<Return>, InferOkValue<Return>>`

**Example:**

```typescript
const user = yield * Eff.ok(Eff.result(getUser('123')))
```

#### `Eff.runResult(generator)`

Run a generator and return a result type.

**Parameters:**

-   `generator` (MaybeFunction<Generator<Yield, Return>>): Generator function or generator

**Returns:** `Ok<Return> | ExtractErr<Yield>` or `Promise<Ok<Return> | ExtractErr<Yield>>`

**Example:**

```typescript
const result = await Eff.runResult(getUser('123'))
```

### Predefined Effect Classes

#### `Eff.Err(name)<Error>`

Create error effect class.

**Parameters:**

-   `name` (string): Error type name
-   `Error` (type parameter): Error data type

**Returns:** Error effect class

**Example:**

```typescript
class UserNotFound extends Eff.Err('UserNotFound')<string> {}
class ValidationError extends Eff.Err('ValidationError')<{ field: string; message: string }> {}

const error = new UserNotFound('User not found')
```

#### `Eff.Ctx(name)<Context>`

Create context effect class.

**Parameters:**

-   `name` (string): Context name
-   `Context` (type parameter): Context data type

**Returns:** Context effect class

**Example:**

```typescript
class DatabaseConnection extends Eff.Ctx('Database')<{ query: (sql: string) => Promise<any> }> {}
class Logger extends Eff.Opt('Logger')<(level: string, message: string) => void> {}

const db = new DatabaseConnection()
```

#### `Eff.Opt(name)<T>`

Create optional effect class.

**Parameters:**

-   `name` (string): Effect name
-   `T` (type parameter): Data type

**Returns:** Optional effect class

**Example:**

```typescript
class Theme extends Eff.Opt('Theme')<string> {}
class FontSize extends Eff.Opt('FontSize')<number> {}

const theme = new Theme()
```

#### `Eff.Msg(name)<T>`

Create message effect class.

**Parameters:**

-   `name` (string): Message name
-   `T` (type parameter): Message data type

**Returns:** Message effect class

**Example:**

```typescript
class UserRequest extends Eff.Msg('UserRequest')<{ userId: string }> {}
class UserResponse extends Eff.Msg('UserResponse')<{ user: any }> {}

const request = new UserRequest({ userId: '123' })
```

### Effect Operation Methods

#### `Eff.throw(err)`

Throw predefined error effect.

**Parameters:**

-   `err` (Err): Error effect instance

**Returns:** `Generator<E, never>`

**Example:**

```typescript
class UserNotFound extends Eff.Err('UserNotFound')<string> {}

function* getUser(userId: string) {
    if (!user) {
        yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
    }
    return user
}
```

#### `Eff.get(ctx)`

Get value from predefined context.

**Parameters:**

-   `ctx` (Ctx | (new () => C)): Context class or instance

**Returns:** `Generator<C, CtxValue<C>>`

**Example:**

```typescript
class DatabaseConnection extends Eff.Ctx('Database')<{ query: (sql: string) => Promise<any> }> {}

function* getUser(userId: string) {
    const db = yield* Eff.get(DatabaseConnection)
    return yield* Eff.await(db.query(`SELECT * FROM users WHERE id = '${userId}'`))
}
```

## Effect Type

### Base Types

#### `Err<Name, T>`

Error effect type.

```typescript
type Err<Name extends string, T> = {
    type: 'err'
    name: Name
    error: T
}
```

#### `Ctx<Name, T>`

Context effect type.

```typescript
type Ctx<Name extends string, T> = {
    type: 'ctx'
    name: Name
    context: EffSymbol | T
    optional?: true
}
```

#### `Opt<Name, T>`

Optional effect type.

```typescript
interface Opt<Name extends string, T> extends Ctx<Name, T> {
    optional: true
}
```

#### `Async`

Asynchronous effect type.

```typescript
type Async = {
    type: 'async'
    name?: undefined
    promise: Promise<unknown>
}
```

#### `Msg<Name, T>`

Message effect type.

```typescript
type Msg<Name extends string, T> = {
    type: 'msg'
    name: Name
    message?: T
}
```

### Combined Types

#### `AnyErr`

Any error effect type.

```typescript
type AnyErr = Err<string, any>
```

#### `AnyCtx`

Any context effect type.

```typescript
type AnyCtx = Ctx<string, any>
```

#### `AnyOpt`

Any optional effect type.

```typescript
type AnyOpt = Opt<string, any>
```

#### `AnyMsg`

Any message effect type.

```typescript
type AnyMsg = Msg<string, any>
```

#### `AnyEff`

Any effect type.

```typescript
type AnyEff = Err<string, any> | Ctx<string, any> | Opt<string, any> | Async | Msg<string, any>
```

## Result Type

### Base Types

#### `Ok<T>`

Success result type.

```typescript
type Ok<T> = {
    type: 'ok'
    value: T
}
```

#### `Result<T, E>`

Result union type.

```typescript
type Result<T, E> = Ok<T> | (E extends AnyErr ? E : never)
```

### Result Tools Functions

#### `Result.ok(value)`

Create success result.

**Parameters:**

-   `value` (T): Success value

**Returns:** `Ok<T>`

**Example:**

```typescript
const success = Result.ok(42)
```

#### `Result.err(name, error)`

Create error result.

**Parameters:**

-   `name` (Name): Error name
-   `error` (T): Error information

**Returns:** `Err<Name, T>`

**Example:**

```typescript
const error = Result.err('ValidationError', 'Invalid input')
```

## Tools Functions

### `isGenerator(value)`

Check if value is a generator.

**Parameters:**

-   `value` (unknown): Value to check

**Returns:** `boolean`

**Example:**

```typescript
function* gen() {}
const notGen = () => {}

console.log(isGenerator(gen())) // true
console.log(isGenerator(notGen())) // false
```

## Type Tools

### `Task<Yield, Return>`

Task type, can be a generator or generator function.

```typescript
type Task<Yield extends AnyEff, Return> = Generator<Yield, Return> | (() => Generator<Yield, Return>)
```

### `MaybePromise<T>`

Maybe Promise type.

```typescript
type MaybePromise<T> = T extends Promise<any> ? T : T | Promise<T>
```

### `MaybeFunction<T>`

Maybe function type.

```typescript
type MaybeFunction<T> = T | (() => T)
```

### `StreamResult<T>`

Stream result type.

```typescript
type StreamResult<T> = {
    index: number
    value: T
}
```

### `StreamResults<TaskReturn>`

Stream results asynchronous generator type.

```typescript
type StreamResults<TaskReturn> = AsyncGenerator<StreamResult<TaskReturn>, void, void>
```

### `StreamHandler<TaskReturn, HandlerReturn>`

Stream processor type.

```typescript
type StreamHandler<TaskReturn, HandlerReturn> = (results: StreamResults<TaskReturn>) => Promise<HandlerReturn>
```
