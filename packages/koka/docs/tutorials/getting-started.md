# Getting Started with Koka

Welcome to Koka! This tutorial will guide you through your first steps with algebraic effects in TypeScript.

## What You'll Learn

-   How to install and set up Koka
-   Basic concepts of algebraic effects
-   Writing your first effectful program
-   Handling effects with type safety

## Prerequisites

-   Node.js >= 22.18
-   TypeScript >= 5.0
-   Basic understanding of TypeScript and generators

## Installation

First, install Koka in your project:

```bash
npm install koka
# or
yarn add koka
# or
pnpm add koka
```

## Your First Effectful Program

Let's start with a simple example that demonstrates the core concepts of Koka.

### Step 1: Import the Core Modules

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Ctx from 'koka/ctx'
```

### Step 2: Define Your Effects

Effects in Koka are classes that represent different types of operations. Let's create some basic effects:

```typescript
// Error effect for when a user is not found
class UserNotFound extends Err.Err('UserNotFound')<string> {}

// Context effect for authentication token
class AuthToken extends Ctx.Ctx('AuthToken')<string> {}
```

### Step 3: Write Effectful Code

Now let's write a function that uses these effects:

```typescript
function* getUser(id: string) {
    // Get the auth token from context
    const token = yield* Ctx.get(AuthToken)

    // Check if we have a valid token
    if (!token) {
        // Throw an error effect if no token is available
        yield* Err.throw(new UserNotFound('No authentication token provided'))
    }

    // Simulate fetching user data
    const user = { id, name: 'John Doe', email: 'john@example.com' }

    return user
}
```

### Step 4: Handle Effects

The magic happens when we handle these effects. We provide implementations for each effect type:

```typescript
// Create a program that handles the effects
const program = Koka.try(getUser('123')).handle({
    // Handle the UserNotFound error
    UserNotFound: (error) => ({ error, status: 'error' }),
    // Provide the auth token
    AuthToken: 'secret-token-123',
})

// Run the program
const result = Koka.run(program)
console.log(result) // { id: '123', name: 'John Doe', email: 'john@example.com' }
```

## Understanding What Happened

Let's break down what we just did:

1. **Effect Definition**: We defined two types of effects:

    - `UserNotFound`: An error effect that can be thrown
    - `AuthToken`: A context effect that provides a value

2. **Effectful Code**: Our `getUser` function uses `yield*` to:

    - Request the auth token from context
    - Potentially throw an error if no token is available

3. **Effect Handling**: We provided implementations for each effect:

    - `UserNotFound`: A function that handles the error
    - `AuthToken`: A value that provides the token

4. **Program Execution**: Koka runs our code and automatically:
    - Provides the auth token when requested
    - Handles any errors that are thrown

## Key Concepts

### Generators and Effects

Koka uses TypeScript generators (`function*`) to represent effectful computations. The `yield*` keyword is used to perform effects.

### Effect Types

Koka supports three main types of effects:

-   **Error Effects** (`Err`): For throwing and handling errors
-   **Context Effects** (`Ctx`): For dependency injection and configuration
-   **Optional Effects** (`Opt`): For optional dependencies

### Effect Handling

Effects are handled using the `Koka.try().handle()` pattern, which provides type-safe implementations for each effect type.

## Next Steps

Now that you understand the basics, you can:

-   Learn about [Core Concepts](./core-concepts.md) to dive deeper into algebraic effects
-   Explore [Error Handling](./error-handling.md) for more sophisticated error management
-   Discover [Context Management](./context-management.md) for dependency injection patterns
-   Try [Async Operations](./async-operations.md) for handling asynchronous code

## Complete Example

Here's the complete working example:

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
        yield* Err.throw(new UserNotFound('No authentication token provided'))
    }

    return { id, name: 'John Doe', email: 'john@example.com' }
}

// Handle effects and run
const program = Koka.try(getUser('123')).handle({
    UserNotFound: (error) => ({ error, status: 'error' }),
    AuthToken: 'secret-token-123',
})

const result = Koka.run(program)
console.log(result)
```

Congratulations! You've written your first effectful program with Koka. The power of algebraic effects is now at your fingertips!
