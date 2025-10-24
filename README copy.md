# Koka Stack

A monorepo containing lightweight TypeScript libraries for algebraic effects and related utilities.

## Packages

### [@koka/core](./packages/koka/)

A lightweight 3kB Effect-TS alternative library based on Algebraic Effects.

**Features:**

-   **Lightweight**: Only 3kB minified and gzipped
-   **Type Safe**: Full TypeScript support with excellent type inference
-   **Algebraic Effects**: Based on proven algebraic effects theory
-   **Async Support**: Seamless integration with Promises and async/await
-   **Error Handling**: Powerful error handling with type safety
-   **Context Management**: Dependency injection made simple
-   **Task Management**: Concurrent task execution with control

**Quick Start:**

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
```

**Documentation:** [📖 Full Documentation](./packages/koka/docs/)

### [koka-accessor](./packages/koka-accessor/)

Accessors library for immutable data manipulation.

### [koka-domain](./packages/koka-domain/)

State management library with algebraic effects.

## Documentation Navigation

Our documentation follows the [Diátaxis](https://diataxis.fr/) framework for comprehensive, user-friendly guides:

### 🎓 **New to Koka? Start Here**

-   [Getting Started](./packages/koka/docs/tutorials/getting-started.md) - Your first steps with Koka
-   [Core Concepts](./packages/koka/docs/tutorials/core-concepts.md) - Understanding algebraic effects
-   [Error Handling](./packages/koka/docs/tutorials/error-handling.md) - Managing errors with type safety

### 🔧 **Coming from Effect-TS?**

-   [Migration Guide](./packages/koka/docs/how-to/migrate-from-effect-ts.md) - Step-by-step migration
-   [Effect-TS Comparison](./packages/koka/docs/explanations/effect-ts-comparison.md) - Detailed comparison

### 📚 **Advanced Topics**

-   [Context Management](./packages/koka/docs/tutorials/context-management.md) - Dependency injection
-   [Async Operations](./packages/koka/docs/tutorials/async-operations.md) - Working with Promises
-   [Task Management](./packages/koka/docs/tutorials/task-management.md) - Concurrent operations

### 🔍 **Reference**

-   [API Reference](./packages/koka/docs/reference/api.md) - Complete API documentation

## Key Features

### Lightweight & Fast

-   **3kB** minified and gzipped (vs ~50kB for Effect-TS)
-   Minimal runtime overhead
-   Tree-shakeable for optimal bundle size

### Type Safe

-   Full TypeScript support
-   Excellent type inference
-   Compile-time effect checking

### Developer Friendly

-   Familiar generator syntax (`function*`, `yield*`)
-   Simple API design
-   Gentle learning curve

### Production Ready

-   Comprehensive error handling
-   Async/await integration
-   Concurrent task management
-   Dependency injection

## Comparison with Effect-TS

| Aspect             | Koka             | Effect-TS       |
| ------------------ | ---------------- | --------------- |
| **Bundle Size**    | ~3kB             | ~50kB           |
| **API Style**      | Object-oriented  | Functional      |
| **Learning Curve** | Gentle           | Steep           |
| **Type Safety**    | Excellent        | Excellent       |
| **Performance**    | Minimal overhead | Higher overhead |
| **Ecosystem**      | Lightweight      | Rich ecosystem  |

## Installation

```bash
# Install core package
npm install koka

# Install additional packages
npm install @koka/accessor @koka/store
```

## Code Style

All code examples in our documentation use the `import * as XXX from 'xxx'` style for consistency:

```typescript
// ✅ Correct import style (as used in tests)
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Ctx from 'koka/ctx'
import * as Async from 'koka/async'
import * as Task from 'koka/task'
import * as Result from 'koka/result'
import * as Opt from 'koka/opt'
import * as Gen from 'koka/gen'

// ❌ Not used in this documentation
import { try, run } from 'koka'
import { Err, Ctx } from 'koka'
```

## Quick Examples

### Error Handling

```typescript
import * as Koka from 'koka'
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

### Context Management

```typescript
import * as Koka from 'koka'
import * as Ctx from 'koka/ctx'
import * as Async from 'koka/async'

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

### Task Management

```typescript
import * as Koka from 'koka'
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

## Requirements

-   Node.js >= 22.18
-   TypeScript >= 5.0

## Browser Support

Koka requires:

-   ES2015+ (for generators)
-   Promise support
-   Symbol support

For older browsers, consider using a polyfill or transpiler.

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build all packages
pnpm build

# Sync repository structure
pnpm sync-repo
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Related Projects

-   [Effect-TS](https://effect.website/) - Comprehensive algebraic effects library
-   [Algebraic Effects Research](https://en.wikipedia.org/wiki/Algebraic_effect) - Theory behind algebraic effects

## Support

-   [GitHub Issues](https://github.com/koka-ts/koka/issues)
-   [GitHub Discussions](https://github.com/koka-ts/koka/discussions)
-   [Documentation](./packages/koka/docs/)

---

Made with ❤️ by the Koka team
