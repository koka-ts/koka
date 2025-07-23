# Koka Tutorials

This tutorial will guide you through learning Koka from scratch, mastering the basic concepts of effect management through practical examples.

## 📋 Table of Contents

-   [Getting Started](#getting-started)
    -   [What is Koka?](#what-is-koka)
    -   [Installation and Setup](#installation-and-setup)
    -   [Your First Koka Program](#your-first-koka-program)
-   [Error Handling Basics](#error-handling-basics)
    -   [Understanding Error Effects](#understanding-error-effects)
    -   [Error Propagation](#error-propagation)
-   [Context Management](#context-management)
    -   [Understanding Context Effects](#understanding-context-effects)
    -   [Optional Context](#optional-context)
-   [Async Programming](#async-programming)
    -   [Handling Async Operations](#handling-async-operations)
    -   [Combining Sync and Async Operations](#combining-sync-and-async-operations)
-   [Design-First Approach](#design-first-approach)
    -   [Predefined Effect Types](#predefined-effect-types)
    -   [Effect Composition](#effect-composition)
-   [Next Steps](#next-steps)

## Getting Started

### What is Koka?

Koka is a TypeScript effect management library based on algebraic effects. It allows you to handle errors, manage context, and execute asynchronous operations in a type-safe manner.

### Installation and Setup

First, install Koka:

```bash
npm install koka
```

Create a new TypeScript project and import Koka:

```typescript
import { Eff } from 'koka'
```

### Your First Koka Program

Let's start with a simple example:

```typescript
import { Eff } from 'koka'

// Define a simple effect function
class ValidationError extends Eff.Err('ValidationError')<string> {}

function* greet(name: string) {
    if (!name) {
        yield* Eff.throw(new ValidationError('Name is required'))
    }
    return `Hello, ${name}!`
}

// Run the effect
const result = Eff.run(
    Eff.try(greet('World')).handle({
        ValidationError: (error) => `Error: ${error}`,
    }),
)

console.log(result) // Output: "Hello, World!"
```

This simple example demonstrates Koka's core concepts:

-   Use generator functions to define effects
-   Use `Eff.throw()` to throw error effects
-   Use `Eff.try().handle()` to handle effects
-   Use `Eff.run()` to run effects

## Error Handling Basics

### Understanding Error Effects

In Koka, errors are represented as "effects" rather than exceptions. This means errors are type-safe and can be checked at compile time.

```typescript
class DivisionByZero extends Eff.Err('DivisionByZero')<string> {}

function* divide(a: number, b: number) {
    if (b === 0) {
        yield* Eff.throw(new DivisionByZero('Cannot divide by zero'))
    }
    return a / b
}

// Handle the error
const result = Eff.run(
    Eff.try(divide(10, 0)).handle({
        DivisionByZero: (error) => {
            console.error(error)
            return null
        },
    }),
)

console.log(result) // Output: null
```

### Error Propagation

Error effects propagate through the function call chain until they are handled:

```typescript
function* calculate(a: number, b: number) {
    const result = yield* divide(a, b)
    return result * 2
}

function* main() {
    const result = yield* calculate(10, 0)
    return result
}

// Error propagates to the top level
const result = Eff.run(
    Eff.try(main()).handle({
        DivisionByZero: (error) => `Handled: ${error}`,
    }),
)

console.log(result) // Output: "Handled: Cannot divide by zero"
```

## Context Management

### Understanding Context Effects

Context effects allow you to access externally provided values, similar to dependency injection:

```typescript
class UserId extends Eff.Ctx('UserId')<string> {}
class ApiKey extends Eff.Ctx('ApiKey')<string> {}

function* getUserInfo() {
    const userId = yield* Eff.get(UserId)
    const apiKey = yield* Eff.get(ApiKey)

    return `User ${userId} with API key ${apiKey.slice(0, 5)}...`
}

// Provide context values
const result = Eff.run(
    Eff.try(getUserInfo()).handle({
        UserId: '12345',
        ApiKey: 'secret-api-key-123',
    }),
)

console.log(result) // Output: "User 12345 with API key secre..."
```

### Optional Context

Use the `opt()` method to get optional context values:

```typescript
class Theme extends Eff.Opt('Theme')<string> {}
class FontSize extends Eff.Opt('FontSize')<number> {}

function* getUserPreferences() {
    const theme = yield* Eff.get(Theme)
    const fontSize = yield* Eff.get(FontSize)

    return {
        theme: theme ?? 'light',
        fontSize: fontSize ?? 14,
    }
}

// Don't provide any context values
const result = Eff.run(getUserPreferences())
console.log(result) // Output: { theme: 'light', fontSize: 14 }

// Provide partial context values
const result2 = Eff.run(
    Eff.try(getUserPreferences()).handle({
        Theme: 'dark',
    }),
)
console.log(result2) // Output: { theme: 'dark', fontSize: 14 }
```

## Async Programming

### Handling Async Operations

Koka uses `Eff.await()` to handle asynchronous operations:

```typescript
class FetchError extends Eff.Err('FetchError')<string> {}

async function* fetchUserData(userId: string) {
    const response = yield* Eff.await(fetch(`/api/users/${userId}`))

    if (!response.ok) {
        yield* Eff.throw(new FetchError(`Failed to fetch user: ${response.status}`))
    }

    return response.json()
}

// Run async effect
const result = await Eff.run(
    Eff.try(fetchUserData('123')).handle({
        FetchError: (error) => ({ error }),
    }),
)
```

### Combining Sync and Async Operations

You can mix synchronous and asynchronous operations in the same generator function:

```typescript
class ValidationError extends Eff.Err('ValidationError')<string> {}
class ApiError extends Eff.Err('ApiError')<string> {}
class ApiUrl extends Eff.Ctx('ApiUrl')<string> {}

async function* processUser(userId: string) {
    // Synchronous validation
    if (!userId) {
        yield* Eff.throw(new ValidationError('User ID is required'))
    }

    // Get configuration (synchronous context)
    const apiUrl = yield* Eff.get(ApiUrl)

    // Asynchronous data fetching
    const userData = yield* Eff.await(fetch(`${apiUrl}/users/${userId}`))

    // Handle response
    if (!userData.ok) {
        yield* Eff.throw(new ApiError('API request failed'))
    }

    return userData.json()
}

// Run combined effects
const result = await Eff.run(
    Eff.try(processUser('123')).handle({
        ValidationError: (error) => ({ error }),
        ApiError: (error) => ({ error }),
        ApiUrl: 'https://api.example.com',
    }),
)
```

## Design-First Approach

### Predefined Effect Types

Koka encourages you to predefine effect types, which provides better type safety and code organization:

```typescript
// Predefine error effects
class UserNotFound extends Eff.Err('UserNotFound')<string> {}
class ValidationError extends Eff.Err('ValidationError')<{ field: string; message: string }> {}

// Predefine context effects
class DatabaseConnection extends Eff.Ctx('Database')<{ query: (sql: string) => Promise<any> }> {}
class Logger extends Eff.Opt('Logger')<(level: string, message: string) => void> {}

// Use predefined effects
function* getUser(userId: string) {
    const logger = yield* Eff.get(Logger)
    const db = yield* Eff.get(DatabaseConnection)

    logger?.('info', `Fetching user ${userId}`)

    if (!userId) {
        yield* Eff.throw(new ValidationError({ field: 'userId', message: 'Required' }))
    }

    const user = yield* Eff.await(db.query(`SELECT * FROM users WHERE id = '${userId}'`))

    if (!user) {
        yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
    }

    logger?.('info', `User ${userId} found`)
    return user
}

// Run the program
const result = await Eff.run(
    Eff.try(getUser('123')).handle({
        UserNotFound: (error) => ({ error }),
        ValidationError: (error) => ({ error }),
        Database: { query: async (sql) => ({ id: '123', name: 'John' }) },
        Logger: (level, message) => console.log(`[${level}] ${message}`),
    }),
)
```

### Effect Composition

You can compose multiple effects to create complex programs:

```typescript
function* createUser(userData: { name: string; email: string }) {
    const db = yield* Eff.get(DatabaseConnection)
    const logger = yield* Eff.get(Logger)

    // Validate user data
    if (!userData.name) {
        yield* Eff.throw(new ValidationError({ field: 'name', message: 'Required' }))
    }

    if (!userData.email) {
        yield* Eff.throw(new ValidationError({ field: 'email', message: 'Required' }))
    }

    logger?.('info', `Creating user ${userData.name}`)

    // Check if email already exists
    const existingUser = yield* Eff.await(db.query(`SELECT id FROM users WHERE email = '${userData.email}'`))

    if (existingUser) {
        yield* Eff.throw(new ValidationError({ field: 'email', message: 'Already exists' }))
    }

    // Create user
    const newUser = yield* Eff.await(
        db.query(`INSERT INTO users (name, email) VALUES ('${userData.name}', '${userData.email}') RETURNING *`),
    )

    logger?.('info', `User ${newUser.id} created successfully`)
    return newUser
}

// Run user creation program
const result = await Eff.run(
    Eff.try(createUser({ name: 'Jane Doe', email: 'jane@example.com' })).handle({
        ValidationError: (error) => ({ error }),
        Database: { query: async (sql) => ({ id: '456', name: 'Jane Doe', email: 'jane@example.com' }) },
        Logger: (level, message) => console.log(`[${level}] ${message}`),
    }),
)
```

## Next Steps

Now you've mastered the basics of Koka! Next you can:

1. Check out the [How-to Guides](./how-to-guides.md) to learn how to solve specific problems
2. Read the [API Reference](./reference.md) to understand the complete API
3. Dive into [Explanations](./explanations.md) to understand Koka's design philosophy

Remember, Koka's core advantages are:

-   **Type Safety**: All effects are checked at compile time
-   **Composability**: Effects can be naturally composed and nested
-   **Simplicity**: Minimal API design
-   **Flexibility**: Support for both synchronous and asynchronous operations
