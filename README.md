# Koka - Lightweight TypeScript Effect Management Library Based on Algebraic Effects

**Warning: This library is in early development and may undergo significant changes. Do not use in production environments.**

Koka is a lightweight TypeScript effect management library based on algebraic effects, providing structured error handling, context management, and asynchronous operations with composability and type safety.

## 📚 Documentation Navigation

[中文文档](./README.zh_CN.md)

-   **[Documentation Home](./docs/README.md)** - Complete documentation navigation
-   **[Tutorials](./docs/tutorials.md)** - Learn Koka from scratch
-   **[How-to Guides](./docs/how-to-guides.md)** - Step-by-step solutions to specific problems
-   **[API Reference](./docs/reference.md)** - Complete API documentation
-   **[Concept Explanations](./docs/explanations.md)** - Deep understanding of Koka's design philosophy

## 📋 Quick Navigation

-   [🚀 Quick Start](#-quick-start)
-   [✨ Core Features](#-core-features)
-   [🔄 Comparison with Effect-TS](#-comparison-with-effect-ts)
-   [📖 Documentation Structure](#-documentation-structure)
-   [🤝 Contributing](#-contributing)

## 🚀 Quick Start

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
import { Eff } from 'koka'

// Error handling
function* getUser(id: string) {
    if (!id) {
        yield* Eff.err('ValidationError').throw('ID is required')
    }
    return { id, name: 'John Doe' }
}

// Context management
function* calculateTotal() {
    const discount = yield* Eff.ctx('Discount').get<number>()
    return 100 * (1 - discount)
}

// Async operations
async function* fetchData() {
    const response = yield* Eff.await(fetch('/api/data'))
    return response.json()
}

// Run effects
const result = await Eff.run(
    Eff.try(getUser('123')).handle({
        ValidationError: (error) => ({ error }),
    }),
)
```

## ✨ Core Features

-   **Type Safe** - Full TypeScript support
-   **Lightweight** - Only ~3kB gzipped
-   **Composable** - Effects naturally compose
-   **Async Ready** - Seamless Promise integration
-   **Design First** - Support for predefined effect types

## 🔄 Comparison with Effect-TS

| Feature         | Koka | Effect-TS |
| --------------- | ---- | --------- |
| Error Effects   | ✅   | ✅        |
| Context Effects | ✅   | ✅        |
| Async Effects   | ✅   | ✅        |
| Composability   | ✅   | ✅        |
| Type Safety     | ✅   | ✅        |
| Minimal API     | ✅   | ❌        |
| Full Ecosystem  | ❌   | ✅        |
| Learning Curve  | Low  | High      |
| Package Size    | ~3kB | ~50kB     |

Koka is a lightweight alternative to Effect-TS, focusing on providing core effect management functionality without the complete ecosystem.

## 📖 Documentation Structure

### Tutorials

-   [Getting Started](./docs/tutorials.md#getting-started) - Create your first Koka program
-   [Error Handling Basics](./docs/tutorials.md#error-handling-basics) - Learn how to handle error effects
-   [Context Management](./docs/tutorials.md#context-management) - Understand how to use context effects
-   [Async Programming](./docs/tutorials.md#async-programming) - Master async effect handling

### How-to Guides

-   [Handle Specific Error Types](./docs/how-to-guides.md#handle-specific-error-types)
-   [Combine Multiple Effects](./docs/how-to-guides.md#combine-multiple-effects)
-   [Use Design-First Approach](./docs/how-to-guides.md#use-design-first-approach)
-   [Message Passing](./docs/how-to-guides.md#message-passing)
-   [Stream Processing](./docs/how-to-guides.md#stream-processing)

### Reference

-   [Eff API](./docs/reference.md#eff-api) - Complete Eff class API
-   [Effect Types](./docs/reference.md#effect-types) - Definitions of all effect types
-   [Utility Functions](./docs/reference.md#utility-functions) - Helper functions and types

### Explanations

-   [Algebraic Effects](./docs/explanations.md#algebraic-effects) - Concepts of algebraic effects
-   [Effect System Design](./docs/explanations.md#effect-system-design) - Koka's design philosophy
-   [Detailed Comparison with Effect-TS](./docs/explanations.md#detailed-comparison-with-effect-ts)

## 🤝 Contributing

PRs are welcome! Please ensure tests pass and new features include appropriate test coverage.

## 📄 License

MIT
