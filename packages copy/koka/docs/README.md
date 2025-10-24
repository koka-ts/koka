# Koka Documentation

Welcome to the Koka documentation! This documentation follows the [Diátaxis](https://diataxis.fr/) framework to provide you with the most effective learning experience.

## What is Koka?

Koka is a lightweight 3kB Effect-TS alternative library based on Algebraic Effects. It provides a powerful and ergonomic way to handle effects in TypeScript applications with minimal bundle size and maximum developer experience.

## Documentation Structure

Our documentation is organized into four distinct sections, each serving a different purpose:

### 📚 [Tutorials](./tutorials/)

**Learning-oriented guides** that help you get started with Koka.

-   [Getting Started](./tutorials/getting-started.md) - Your first steps with Koka
-   [Core Concepts](./tutorials/core-concepts.md) - Understanding Algebraic Effects
-   [Error Handling](./tutorials/error-handling.md) - Managing errors with effects
-   [Context Management](./tutorials/context-management.md) - Working with context effects
-   [Async Operations](./tutorials/async-operations.md) - Handling asynchronous code
-   [Task Management](./tutorials/task-management.md) - Managing concurrent tasks

### 🛠️ [How-to Guides](./how-to/)

**Task-oriented guides** that show you how to solve specific problems.

-   [Handle Multiple Effects](./how-to/handle-multiple-effects.md)
-   [Create Custom Effects](./how-to/create-custom-effects.md)
-   [Migrate from Effect-TS](./how-to/migrate-from-effect-ts.md)
-   [Debug Effects](./how-to/debug-effects.md)
-   [Test Effectful Code](./how-to/test-effectful-code.md)
-   [Performance Optimization](./how-to/performance-optimization.md)

### 📖 [Reference](./reference/)

**Information-oriented documentation** for quick lookups.

-   [API Reference](./reference/api.md) - Complete API documentation
-   [Effect Types](./reference/effect-types.md) - All available effect types
-   [Type Definitions](./reference/types.md) - TypeScript type definitions
-   [Configuration](./reference/configuration.md) - Configuration options

### 💡 [Explanations](./explanations/)

**Understanding-oriented content** that explains concepts and decisions.

-   [Algebraic Effects Explained](./explanations/algebraic-effects.md)
-   [Comparison with Effect-TS](./explanations/effect-ts-comparison.md)
-   [Design Decisions](./explanations/design-decisions.md)
-   [Performance Characteristics](./explanations/performance.md)
-   [Best Practices](./explanations/best-practices.md)

## Quick Start

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

## Key Features

-   **Lightweight**: Only 3kB minified and gzipped
-   **Type Safe**: Full TypeScript support with excellent type inference
-   **Algebraic Effects**: Based on proven algebraic effects theory
-   **Async Support**: Seamless integration with Promises and async/await
-   **Error Handling**: Powerful error handling with type safety
-   **Context Management**: Dependency injection made simple
-   **Task Management**: Concurrent task execution with control

## Installation

```bash
npm install koka
# or
yarn add koka
# or
pnpm add koka
```

## Requirements

-   Node.js >= 22.18
-   TypeScript >= 5.0

## Documentation Navigation

### 🎯 Choose Your Path

**New to Algebraic Effects?**
Start with [Getting Started](./tutorials/getting-started.md) and [Core Concepts](./tutorials/core-concepts.md)

**Coming from Effect-TS?**
Check out [Migration Guide](./how-to/migrate-from-effect-ts.md) and [Comparison](./explanations/effect-ts-comparison.md)

**Need to Solve a Specific Problem?**
Browse the [How-to Guides](./how-to/) section

**Looking for API Details?**
Go to [API Reference](./reference/api.md)

**Want to Understand the Design?**
Read [Design Decisions](./explanations/design-decisions.md) and [Best Practices](./explanations/best-practices.md)

## Code Examples

All code examples in this documentation follow the pattern used in the test files:

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

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## External Resources

-   [GitHub Repository](https://github.com/koka-ts/koka)
-   [NPM Package](https://www.npmjs.com/package/koka)
-   [Effect-TS Documentation](https://effect.website/) (for comparison)
-   [Algebraic Effects Research](https://en.wikipedia.org/wiki/Algebraic_effect)
