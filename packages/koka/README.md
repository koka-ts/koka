# Koka

A lightweight 3kB Effect-TS alternative library based on Algebraic Effects.

[![npm version](https://badge.fury.io/js/koka.svg)](https://badge.fury.io/js/koka)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/koka)](https://bundlephobia.com/package/koka)

## Features

-   **Lightweight**: Only 3kB minified and gzipped
-   **Type Safe**: Full TypeScript support with excellent type inference
-   **Algebraic Effects**: Based on proven algebraic effects theory
-   **Async Support**: Seamless integration with Promises and async/await
-   **Error Handling**: Powerful error handling with type safety
-   **Context Management**: Dependency injection made simple
-   **Task Management**: Concurrent task execution with control

## Quick Start

### Installation

```bash
npm install koka
# or
yarn add koka
# or
pnpm add koka
```

### Basic Usage

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Ctx from 'koka/ctx'

// Define your effects
class UserNotFound extends Err.Err('UserNotFound')<string> {}
class AuthToken extends Ctx.Ctx('AuthToken')<string> {}

// Write effectful code
function* getUser(id: string) {
    const token = yield* Ctx.get(AuthToken)

    if (!token) {
        yield* Err.throw(new UserNotFound('No auth token'))
    }

    return { id, name: 'John Doe' }
}

// Handle effects
const program = Koka.try(getUser('123')).handle({
    UserNotFound: (error) => ({ error }),
    AuthToken: 'secret-token',
})

const result = Koka.run(program)
console.log(result) // { id: '123', name: 'John Doe' }
```

## Core Concepts

### Error Effects

Handle errors with type safety:

```typescript
import * as Err from 'koka/err'

class ValidationError extends Err.Err('ValidationError')<{ field: string; message: string }> {}

function* validateUser(user: any) {
    if (!user.name) {
        yield* Err.throw(
            new ValidationError({
                field: 'name',
                message: 'Name is required',
            }),
        )
    }
    return user
}

const program = Koka.try(validateUser({})).handle({
    ValidationError: (error) => ({ error, status: 'error' }),
})

const result = Koka.run(program)
```

### Context Effects

Dependency injection made simple:

```typescript
import * as Ctx from 'koka/ctx'

class Database extends Ctx.Ctx('Database')<{
    query: (sql: string) => Promise<any>
}> {}

function* getUser(id: string) {
    const db = yield* Ctx.get(Database)
    const user = yield* Async.await(db.query(`SELECT * FROM users WHERE id = '${id}'`))
    return user
}

const program = Koka.try(getUser('123')).handle({
    Database: {
        query: async (sql) => ({ id: '123', name: 'John Doe' }),
    },
})

const result = await Koka.run(program)
```

### Async Operations

Seamless async/await integration:

```typescript
import * as Async from 'koka/async'

function* fetchUser(id: string) {
    const user = yield* Async.await(fetch(`/api/users/${id}`).then((res) => res.json()))
    return user
}

const result = await Koka.run(fetchUser('123'))
```

### Task Management

Concurrent operations with control:

```typescript
import * as Task from 'koka/task'

function* getUserProfile(userId: string) {
    const result = yield* Task.object({
        user: () => fetchUser(userId),
        posts: () => fetchPosts(userId),
        comments: () => fetchComments(userId),
    })

    return result
}

const profile = await Koka.run(getUserProfile('123'))
```

## Comparison with Effect-TS

| Aspect             | Koka             | Effect-TS       |
| ------------------ | ---------------- | --------------- |
| **Bundle Size**    | ~3kB             | ~50kB           |
| **API Style**      | Object-oriented  | Functional      |
| **Learning Curve** | Gentle           | Steep           |
| **Type Safety**    | Excellent        | Excellent       |
| **Performance**    | Minimal overhead | Higher overhead |

### Migration from Effect-TS

```typescript
// Effect-TS
const getUser = (id: string) =>
    Effect.gen(function* (_) {
        const userService = yield* _(UserService)
        const user = yield* _(userService.getUser(id))
        return user
    })

// Koka
function* getUser(id: string) {
    const userService = yield* Ctx.get(UserService)
    const user = yield* Async.await(userService.getUser(id))
    return user
}
```

See our [migration guide](./docs/how-to/migrate-from-effect-ts.md) for detailed instructions.

## API Reference

### Core Functions

-   `Koka.try()` - Create a program that can handle effects
-   `Koka.run()` - Run a program
-   `Koka.runSync()` - Run a program synchronously
-   `Koka.runAsync()` - Run a program asynchronously

### Effect Types

-   `Err.Err()` - Error effects
-   `Ctx.Ctx()` - Context effects
-   `Opt.Opt()` - Optional effects

### Task Functions

-   `Task.all()` - Array-based parallel execution
-   `Task.tuple()` - Tuple-based parallel execution
-   `Task.object()` - Object-based parallel execution (recommended)
-   `Task.race()` - Get first result
-   `Task.concurrent()` - Controlled concurrency

### Utility Functions

-   `Async.await()` - Await values or promises
-   `Result.run()` - Run with result handling
-   `Result.wrap()` - Wrap generators in results
-   `Result.unwrap()` - Unwrap result generators

## Documentation

Our documentation follows the [Diátaxis](https://diataxis.fr/) framework:

-   **[Tutorials](./docs/tutorials/)** - Learning-oriented guides
-   **[How-to Guides](./docs/how-to/)** - Task-oriented guides
-   **[Reference](./docs/reference/)** - API documentation
-   **[Explanations](./docs/explanations/)** - Concept explanations

### Quick Links

-   [Getting Started](./docs/tutorials/getting-started.md)
-   [Core Concepts](./docs/tutorials/core-concepts.md)
-   [API Reference](./docs/reference/api.md)
-   [Effect-TS Comparison](./docs/explanations/effect-ts-comparison.md)
-   [Migration Guide](./docs/how-to/migrate-from-effect-ts.md)

## Examples

### Error Handling

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Result from 'koka/result'

class NetworkError extends Err.Err('NetworkError')<string> {}

function* fetchData(url: string) {
    try {
        const response = yield* Async.await(fetch(url))
        const data = yield* Async.await(response.json())
        return data
    } catch (error) {
        yield* Err.throw(new NetworkError(error.message))
    }
}

// Handle errors explicitly
const result = Result.run(fetchData('https://api.example.com/data'))
if (result.type === 'ok') {
    console.log('Success:', result.value)
} else {
    console.log('Error:', result.error)
}
```

### Context Management

```typescript
import * as Koka from 'koka'
import * as Ctx from 'koka/ctx'
import * as Opt from 'koka/opt'

class Database extends Ctx.Ctx('Database')<{
    query: (sql: string) => Promise<any>
}> {}

class Logger extends Opt.Opt('Logger')<(message: string) => void> {}

function* getUser(id: string) {
    const db = yield* Ctx.get(Database)
    const logger = yield* Opt.get(Logger)

    logger?.('Fetching user...')
    const user = yield* Async.await(db.query(`SELECT * FROM users WHERE id = '${id}'`))
    logger?.('User fetched successfully')

    return user
}

const program = Koka.try(getUser('123')).handle({
    Database: {
        query: async (sql) => ({ id: '123', name: 'John Doe' }),
    },
    Logger: (message) => console.log(`[INFO] ${message}`),
})

const result = await Koka.run(program)
```

### Task Management

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'

function* processUserData(userId: string) {
    // Fetch data in parallel
    const data = yield* Task.object({
        user: () => fetchUser(userId),
        posts: () => fetchPosts(userId),
        comments: () => fetchComments(userId),
    })

    // Process data in parallel
    const processed = yield* Task.object({
        user: () => processUser(data.user),
        posts: () => processPosts(data.posts),
        comments: () => processComments(data.comments),
    })

    return processed
}

const result = await Koka.run(processUserData('123'))
```

## Requirements

-   Node.js >= 22.18
-   TypeScript >= 5.0

## Browser Support

Koka requires:

-   ES2015+ (for generators)
-   Promise support
-   Symbol support

For older browsers, consider using a polyfill or transpiler.

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

### Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build the project
pnpm build
```

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Related Projects

-   [Effect-TS](https://effect.website/) - Comprehensive algebraic effects library
-   [Algebraic Effects Research](https://en.wikipedia.org/wiki/Algebraic_effect) - Theory behind algebraic effects

## Support

-   [GitHub Issues](https://github.com/koka-ts/koka/issues)
-   [GitHub Discussions](https://github.com/koka-ts/koka/discussions)
-   [Documentation](./docs/)

---

Made with ❤️ by the Koka team
