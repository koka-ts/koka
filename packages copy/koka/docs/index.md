# Koka Documentation Index

Welcome to the Koka documentation! This index provides quick navigation to all documentation sections.

## 📚 Tutorials (Learning-oriented)

Start here if you're new to Koka or algebraic effects:

-   **[Getting Started](./tutorials/getting-started.md)** - Your first steps with Koka
-   **[Core Concepts](./tutorials/core-concepts.md)** - Understanding Algebraic Effects
-   **[Error Handling](./tutorials/error-handling.md)** - Managing errors with effects
-   **[Context Management](./tutorials/context-management.md)** - Working with context effects
-   **[Async Operations](./tutorials/async-operations.md)** - Handling asynchronous code
-   **[Task Management](./tutorials/task-management.md)** - Managing concurrent tasks

## 🛠️ How-to Guides (Task-oriented)

Solve specific problems with Koka:

-   **[Handle Multiple Effects](./how-to/handle-multiple-effects.md)** - Working with multiple effect types
-   **[Create Custom Effects](./how-to/create-custom-effects.md)** - Building your own effects
-   **[Migrate from Effect-TS](./how-to/migrate-from-effect-ts.md)** - Transitioning from Effect-TS
-   **[Debug Effects](./how-to/debug-effects.md)** - Troubleshooting effectful code
-   **[Test Effectful Code](./how-to/test-effectful-code.md)** - Testing strategies
-   **[Performance Optimization](./how-to/performance-optimization.md)** - Optimizing your code

## 📖 Reference (Information-oriented)

Quick lookups and API documentation:

-   **[API Reference](./reference/api.md)** - Complete API documentation
-   **[Effect Types](./reference/effect-types.md)** - All available effect types
-   **[Type Definitions](./reference/types.md)** - TypeScript type definitions
-   **[Configuration](./reference/configuration.md)** - Configuration options

## 💡 Explanations (Understanding-oriented)

Deep dives into concepts and decisions:

-   **[Algebraic Effects Explained](./explanations/algebraic-effects.md)** - Theory behind algebraic effects
-   **[Comparison with Effect-TS](./explanations/effect-ts-comparison.md)** - Detailed comparison
-   **[Design Decisions](./explanations/design-decisions.md)** - Why Koka is designed this way
-   **[Performance Characteristics](./explanations/performance.md)** - Performance analysis
-   **[Best Practices](./explanations/best-practices.md)** - Recommended patterns

## 🚀 Quick Start

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Ctx from 'koka/ctx'

// Define effects
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

## 📋 Documentation Structure

This documentation follows the [Diátaxis](https://diataxis.fr/) framework:

-   **Tutorials** help you learn Koka step by step
-   **How-to guides** show you how to solve specific problems
-   **Reference** provides complete API documentation
-   **Explanations** help you understand concepts and decisions

## 🎯 Choose Your Path

### New to Algebraic Effects?

Start with [Getting Started](./tutorials/getting-started.md) and [Core Concepts](./tutorials/core-concepts.md)

### Coming from Effect-TS?

Check out [Migration Guide](./how-to/migrate-from-effect-ts.md) and [Comparison](./explanations/effect-ts-comparison.md)

### Need to Solve a Specific Problem?

Browse the [How-to Guides](./how-to/) section

### Looking for API Details?

Go to [API Reference](./reference/api.md)

### Want to Understand the Design?

Read [Design Decisions](./explanations/design-decisions.md) and [Best Practices](./explanations/best-practices.md)

## 🔗 External Resources

-   [GitHub Repository](https://github.com/koka-ts/koka)
-   [NPM Package](https://www.npmjs.com/package/koka)
-   [Effect-TS Documentation](https://effect.website/) (for comparison)
-   [Algebraic Effects Research](https://en.wikipedia.org/wiki/Algebraic_effect)

## 🤝 Contributing

Found an issue or want to improve the documentation? Please contribute!

-   [GitHub Issues](https://github.com/koka-ts/koka/issues)
-   [GitHub Discussions](https://github.com/koka-ts/koka/discussions)
-   [Contributing Guide](../../CONTRIBUTING.md)

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.
