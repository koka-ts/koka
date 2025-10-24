# Error Handling with Algebraic Effects

Error handling in Koka is powerful, type-safe, and expressive. This tutorial shows you how to handle errors using algebraic effects instead of traditional try-catch blocks.

## Why Algebraic Effects for Errors?

Traditional error handling has several limitations:

-   **Hidden control flow**: Errors can be thrown anywhere, making code hard to follow
-   **Type erasure**: Error types are often lost in catch blocks
-   **Difficult testing**: Mocking error conditions is complex
-   **Poor composition**: Error handling logic is scattered throughout code

Algebraic effects solve these problems by making errors explicit, type-safe, and composable.

## Basic Error Effects

Let's start with simple error handling:

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'

// Define error effects
class ValidationError extends Err.Err('ValidationError')<{ field: string; message: string }> {}
class NetworkError extends Err.Err('NetworkError')<string> {}

// Write effectful code that can fail
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

// Handle errors with type safety
const program = Koka.try(validateUser({ name: 'John' })).handle({
    ValidationError: (error) => ({
        success: false,
        errors: [error],
    }),
})

const result = Koka.run(program)
console.log(result) // { success: false, errors: [{ field: 'email', message: 'Email is required' }] }
```

## Error Recovery Patterns

### 1. Fallback Values

You can provide fallback values when errors occur:

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'

class FileNotFound extends Err.Err('FileNotFound')<string> {}

function* readConfig(path: string) {
    // Simulate file reading
    if (path === 'missing.txt') {
        yield* Err.throw(new FileNotFound(`File not found: ${path}`))
    }

    return { apiUrl: 'https://api.example.com', timeout: 5000 }
}

// Provide fallback configuration
const program = Koka.try(readConfig('missing.txt')).handle({
    FileNotFound: (error) => ({
        apiUrl: 'https://default-api.example.com',
        timeout: 3000,
    }),
})

const result = Koka.run(program)
console.log(result) // { apiUrl: 'https://default-api.example.com', timeout: 3000 }
```

### 2. Error Transformation

Transform errors into different types or add context:

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'

class DatabaseError extends Err.Err('DatabaseError')<string> {}
class UserFriendlyError extends Err.Err('UserFriendlyError')<string> {}

function* fetchUser(id: string) {
    // Simulate database operation
    if (id === 'invalid') {
        yield* Err.throw(new DatabaseError('Connection timeout'))
    }

    return { id, name: 'John Doe' }
}

// Transform technical errors into user-friendly messages
const program = Koka.try(fetchUser('invalid')).handle({
    DatabaseError: (error) => {
        if (error.includes('timeout')) {
            yield * Err.throw(new UserFriendlyError('Service temporarily unavailable. Please try again later.'))
        } else {
            yield * Err.throw(new UserFriendlyError('An unexpected error occurred. Please contact support.'))
        }
    },
})

// Handle the transformed error
const finalProgram = Koka.try(program).handle({
    UserFriendlyError: (message) => ({ error: message, status: 'error' }),
})

const result = Koka.run(finalProgram)
console.log(result) // { error: 'Service temporarily unavailable. Please try again later.', status: 'error' }
```

### 3. Error Logging

Log errors while still handling them:

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'

class ApiError extends Err.Err('ApiError')<{ status: number; message: string }> {}

function* callApi(endpoint: string) {
    // Simulate API call
    if (endpoint === '/users/999') {
        yield* Err.throw(new ApiError({ status: 404, message: 'User not found' }))
    }

    return { data: 'success' }
}

// Log errors and provide fallback
const program = Koka.try(callApi('/users/999')).handle({
    ApiError: (error) => {
        console.error(`API Error: ${error.status} - ${error.message}`)
        return { data: null, error: 'User not found' }
    },
})

const result = Koka.run(program)
console.log(result) // { data: null, error: 'User not found' }
```

## Complex Error Handling

### Multiple Error Types

Handle different types of errors with different strategies:

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'

class ValidationError extends Err.Err('ValidationError')<{ field: string; message: string }> {}
class AuthenticationError extends Err.Err('AuthenticationError')<string> {}
class PermissionError extends Err.Err('PermissionError')<string> {}

function* processUserRequest(user: any, action: string) {
    // Validate user data
    if (!user.id) {
        yield* Err.throw(new ValidationError({ field: 'id', message: 'User ID is required' }))
    }

    // Check authentication
    if (!user.token) {
        yield* Err.throw(new AuthenticationError('Authentication required'))
    }

    // Check permissions
    if (action === 'admin' && user.role !== 'admin') {
        yield* Err.throw(new PermissionError('Admin access required'))
    }

    return { success: true, action }
}

// Handle different error types appropriately
const program = Koka.try(processUserRequest({ name: 'John' }, 'admin')).handle({
    ValidationError: (error) => ({
        success: false,
        type: 'validation',
        field: error.field,
        message: error.message,
    }),
    AuthenticationError: (error) => ({
        success: false,
        type: 'auth',
        message: error,
        redirectTo: '/login',
    }),
    PermissionError: (error) => ({
        success: false,
        type: 'permission',
        message: error,
        status: 403,
    }),
})

const result = Koka.run(program)
console.log(result) // { success: false, type: 'validation', field: 'id', message: 'User ID is required' }
```

### Error Aggregation

Collect multiple errors and handle them together:

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'

class ValidationError extends Err.Err('ValidationError')<{ field: string; message: string }> {}

function* validateForm(data: any) {
    const errors: Array<{ field: string; message: string }> = []

    if (!data.name) {
        errors.push({ field: 'name', message: 'Name is required' })
    }

    if (!data.email) {
        errors.push({ field: 'email', message: 'Email is required' })
    }

    if (!data.password) {
        errors.push({ field: 'password', message: 'Password is required' })
    }

    if (errors.length > 0) {
        // Throw all validation errors at once
        for (const error of errors) {
            yield* Err.throw(new ValidationError(error))
        }
    }

    return data
}

// Collect all validation errors
const program = Koka.try(validateForm({})).handle({
    ValidationError: (error) => {
        // This handler will be called for each validation error
        // In a real application, you might want to collect them
        return { field: error.field, message: error.message }
    },
})

const result = Koka.run(program)
console.log(result) // { field: 'name', message: 'Name is required' }
```

## Error Handling with Result Types

Koka provides a `Result` module for working with success/error values:

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'
import * as Result from 'koka/result'

class NetworkError extends Err.Err('NetworkError')<string> {}

function* fetchData(url: string) {
    // Simulate network request
    if (url === 'https://broken-api.com') {
        yield* Err.throw(new NetworkError('Connection failed'))
    }

    return { data: 'success' }
}

// Wrap the generator to get a Result
const result = Result.run(fetchData('https://broken-api.com'))

console.log(result) // { type: 'err', name: 'NetworkError', error: 'Connection failed' }

// Handle the result
if (result.type === 'ok') {
    console.log('Success:', result.value)
} else {
    console.log('Error:', result.error)
}
```

## Testing Error Conditions

One of the biggest advantages of algebraic effects is how easy they make testing:

```typescript
import * as Koka from 'koka'
import * as Err from 'koka/err'

class DatabaseError extends Err.Err('DatabaseError')<string> {}

function* getUser(id: string) {
    // Simulate database operation
    if (id === 'error') {
        yield* Err.throw(new DatabaseError('Database connection failed'))
    }

    return { id, name: 'John Doe' }
}

// Test success case
const successProgram = Koka.try(getUser('123')).handle({
    DatabaseError: (error) => ({ error }),
})

const successResult = Koka.run(successProgram)
console.log(successResult) // { id: '123', name: 'John Doe' }

// Test error case
const errorProgram = Koka.try(getUser('error')).handle({
    DatabaseError: (error) => ({ error }),
})

const errorResult = Koka.run(errorProgram)
console.log(errorResult) // { error: 'Database connection failed' }
```

## Best Practices

### 1. Use Descriptive Error Names

```typescript
// ✅ Good
class UserAuthenticationFailed extends Err.Err('UserAuthenticationFailed')<{ userId: string; reason: string }> {}

// ❌ Bad
class Error extends Err.Err('Error')<string> {}
```

### 2. Include Context in Error Data

```typescript
// ✅ Good
yield *
    Err.throw(
        new ValidationError({
            field: 'email',
            message: 'Invalid email format',
            value: user.email,
            timestamp: new Date().toISOString(),
        }),
    )

// ❌ Bad
yield * Err.throw(new ValidationError('Invalid email'))
```

### 3. Handle Errors at the Right Level

```typescript
// Handle technical errors at the infrastructure level
const program = Koka.try(businessLogic()).handle({
    DatabaseError: (error) => {
        // Log technical details
        console.error('Database error:', error)
        // Return user-friendly message
        return { error: 'Service temporarily unavailable' }
    },
})
```

### 4. Use Result Types for Explicit Error Handling

```typescript
// When you want to handle errors explicitly in your code
const result = Result.run(someOperation())
if (result.type === 'ok') {
    // Handle success
} else {
    // Handle error
}
```

## Next Steps

Now that you understand error handling with algebraic effects, explore:

-   [Context Management](./context-management.md) - Dependency injection patterns
-   [Async Operations](./async-operations.md) - Handling async errors
-   [Task Management](./task-management.md) - Error handling in concurrent operations

Algebraic effects make error handling explicit, type-safe, and composable. No more hidden control flow or lost error types!
