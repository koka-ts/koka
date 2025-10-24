# Async Operations with Algebraic Effects

Koka provides seamless integration with asynchronous operations through its `Async` module. This tutorial shows you how to handle Promises and async/await patterns using algebraic effects.

## Why Async Effects?

Traditional async/await has some limitations:

-   **Error handling complexity**: Async errors require try-catch blocks
-   **Mixed sync/async code**: Hard to compose synchronous and asynchronous operations
-   **Testing difficulties**: Mocking async operations is complex
-   **Type safety**: Promise types can be lost in complex chains

Koka's async effects solve these problems by treating async operations as effects that can be handled uniformly.

## Basic Async Operations

Let's start with simple async operations:

```typescript
import * as Koka from 'koka'
import * as Async from 'koka/async'

// Simple async operation
function* fetchUserData(id: string) {
    const user = yield* Async.await(fetch(`/api/users/${id}`).then((res) => res.json()))
    return user
}

// Run the async operation
const result = await Koka.run(fetchUserData('123'))
console.log(result) // { id: '123', name: 'John Doe', email: 'john@example.com' }
```

## Mixed Sync and Async Operations

One of the powerful features of Koka is the ability to mix synchronous and asynchronous operations seamlessly:

```typescript
import * as Koka from 'koka'
import * as Async from 'koka/async'

function* processUser(id: string) {
    // Synchronous validation
    if (!id) {
        throw new Error('User ID is required')
    }

    // Async operation
    const user = yield* Async.await(fetch(`/api/users/${id}`).then((res) => res.json()))

    // More synchronous processing
    const processedUser = {
        ...user,
        displayName: `${user.firstName} ${user.lastName}`,
        isActive: user.status === 'active',
    }

    // Another async operation
    const preferences = yield* Async.await(fetch(`/api/users/${id}/preferences`).then((res) => res.json()))

    return { ...processedUser, preferences }
}

const result = await Koka.run(processUser('123'))
console.log(result)
```

## Error Handling in Async Operations

Async operations can fail, and Koka makes error handling straightforward:

```typescript
import * as Koka from 'koka'
import * as Async from 'koka/async'
import * as Err from 'koka/err'

class NetworkError extends Err.Err('NetworkError')<string> {}
class UserNotFound extends Err.Err('UserNotFound')<string> {}

function* fetchUserSafely(id: string) {
    try {
        const response = yield* Async.await(fetch(`/api/users/${id}`))

        if (!response.ok) {
            if (response.status === 404) {
                yield* Err.throw(new UserNotFound(`User with ID ${id} not found`))
            } else {
                yield* Err.throw(new NetworkError(`HTTP ${response.status}: ${response.statusText}`))
            }
        }

        const user = yield* Async.await(response.json())
        return user
    } catch (error) {
        yield* Err.throw(new NetworkError(`Network error: ${error.message}`))
    }
}

// Handle both async and error effects
const program = Koka.try(fetchUserSafely('999')).handle({
    UserNotFound: (error) => ({ error, status: 404 }),
    NetworkError: (error) => ({ error, status: 500 }),
})

const result = await Koka.run(program)
console.log(result) // { error: 'User with ID 999 not found', status: 404 }
```

## Complex Async Patterns

### Parallel Operations

Koka's `Task` module provides powerful tools for concurrent operations:

```typescript
import * as Koka from 'koka'
import * as Async from 'koka/async'
import * as Task from 'koka/task'

function* fetchUserData(id: string) {
    return yield* Async.await(fetch(`/api/users/${id}`).then((res) => res.json()))
}

function* fetchUserPosts(id: string) {
    return yield* Async.await(fetch(`/api/users/${id}/posts`).then((res) => res.json()))
}

function* fetchUserProfile(id: string) {
    // Run both operations in parallel using Task.object (recommended)
    const result = yield* Task.object({
        user: () => fetchUserData(id),
        posts: () => fetchUserPosts(id),
    })

    return {
        ...result,
        postCount: result.posts.length,
    }
}

const result = await Koka.run(fetchUserProfile('123'))
console.log(result)
```

### Sequential Operations with Error Handling

```typescript
import * as Koka from 'koka'
import * as Async from 'koka/async'
import * as Err from 'koka/err'
import * as Task from 'koka/task'

class ValidationError extends Err.Err('ValidationError')<string> {}
class ProcessingError extends Err.Err('ProcessingError')<string> {}

function* validateUser(id: string) {
    const user = yield* Async.await(fetch(`/api/users/${id}`).then((res) => res.json()))

    if (!user.email) {
        yield* Err.throw(new ValidationError('User email is required'))
    }

    return user
}

function* processUserData(user: any) {
    const processed = yield* Async.await(
        fetch('/api/process', {
            method: 'POST',
            body: JSON.stringify(user),
        }).then((res) => res.json()),
    )

    if (!processed.success) {
        yield* Err.throw(new ProcessingError('Failed to process user data'))
    }

    return processed
}

function* userWorkflow(id: string) {
    // Sequential operations with error handling
    const user = yield* validateUser(id)
    const result = yield* processUserData(user)

    return result
}

const program = Koka.try(userWorkflow('123')).handle({
    ValidationError: (error) => ({ error, type: 'validation' }),
    ProcessingError: (error) => ({ error, type: 'processing' }),
})

const result = await Koka.run(program)
console.log(result)
```

## Async with Context and Optional Effects

You can combine async operations with other effect types:

```typescript
import * as Koka from 'koka'
import * as Async from 'koka/async'
import * as Ctx from 'koka/ctx'
import * as Opt from 'koka/opt'
import * as Err from 'koka/err'

class ApiConfig extends Ctx.Ctx('ApiConfig')<{ baseUrl: string; timeout: number }> {}
class Logger extends Opt.Opt('Logger')<(message: string) => void> {}
class ApiError extends Err.Err('ApiError')<string> {}

function* apiCall(endpoint: string) {
    const config = yield* Ctx.get(ApiConfig)
    const logger = yield* Opt.get(Logger)

    logger?.(`Making API call to ${endpoint}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout)

    try {
        const response = yield* Async.await(
            fetch(`${config.baseUrl}${endpoint}`, {
                signal: controller.signal,
            }),
        )

        clearTimeout(timeoutId)

        if (!response.ok) {
            yield* Err.throw(new ApiError(`HTTP ${response.status}: ${response.statusText}`))
        }

        const data = yield* Async.await(response.json())
        logger?.('API call successful')

        return data
    } catch (error) {
        clearTimeout(timeoutId)
        if (error.name === 'AbortError') {
            yield* Err.throw(new ApiError('Request timeout'))
        } else {
            yield* Err.throw(new ApiError(`Network error: ${error.message}`))
        }
    }
}

const program = Koka.try(apiCall('/users/123')).handle({
    ApiConfig: { baseUrl: 'https://api.example.com', timeout: 5000 },
    Logger: (message) => console.log(`[API] ${message}`),
    ApiError: (error) => ({ error, status: 'error' }),
})

const result = await Koka.run(program)
console.log(result)
```

## Async Result Handling

Use the `Result` module with async operations for explicit error handling:

```typescript
import * as Koka from 'koka'
import * as Async from 'koka/async'
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

// Wrap async operation in Result
const result = await Koka.run(Result.run(fetchData('https://api.example.com/data')))

if (result.type === 'ok') {
    console.log('Success:', result.value)
} else {
    console.log('Error:', result.error)
}
```

## Testing Async Operations

Testing async operations with Koka is straightforward:

```typescript
import * as Koka from 'koka'
import * as Async from 'koka/async'
import * as Err from 'koka/err'

class NetworkError extends Err.Err('NetworkError')<string> {}

function* fetchUser(id: string) {
    const user = yield* Async.await(fetch(`/api/users/${id}`).then((res) => res.json()))
    return user
}

// Test with mock data
const mockFetch = (url: string) => {
    if (url.includes('123')) {
        return Promise.resolve({
            json: () => Promise.resolve({ id: '123', name: 'John Doe' }),
        })
    } else {
        return Promise.reject(new Error('Network error'))
    }
}

// Replace global fetch for testing
const originalFetch = global.fetch
global.fetch = mockFetch as any

try {
    const result = await Koka.run(fetchUser('123'))
    console.log(result) // { id: '123', name: 'John Doe' }
} finally {
    global.fetch = originalFetch
}
```

## Performance Considerations

### Avoiding Unnecessary Await

```typescript
// ❌ Bad: Unnecessary await
function* badExample() {
    const promise = fetch('/api/data')
    const data = yield* Async.await(promise.then((res) => res.json()))
    return data
}

// ✅ Good: Direct await
function* goodExample() {
    const data = yield* Async.await(fetch('/api/data').then((res) => res.json()))
    return data
}
```

### Parallel vs Sequential

```typescript
// ❌ Bad: Sequential operations when parallel is possible
function* sequential() {
    const user = yield* Async.await(fetch('/api/user').then((res) => res.json()))
    const posts = yield* Async.await(fetch('/api/posts').then((res) => res.json()))
    return { user, posts }
}

// ✅ Good: Parallel operations using Task.object
function* parallel() {
    const result = yield* Task.object({
        user: () => fetch('/api/user').then((res) => res.json()),
        posts: () => fetch('/api/posts').then((res) => res.json()),
    })
    return result
}
```

## Best Practices

### 1. Use Descriptive Error Messages

```typescript
// ✅ Good
yield * Err.throw(new NetworkError(`Failed to fetch user ${id}: ${error.message}`))

// ❌ Bad
yield * Err.throw(new NetworkError('Error'))
```

### 2. Handle Timeouts

```typescript
function* fetchWithTimeout(url: string, timeout: number) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
        const response = yield* Async.await(fetch(url, { signal: controller.signal }))
        clearTimeout(timeoutId)
        return response
    } catch (error) {
        clearTimeout(timeoutId)
        if (error.name === 'AbortError') {
            yield* Err.throw(new NetworkError('Request timeout'))
        }
        throw error
    }
}
```

### 3. Use Result Types for Explicit Error Handling

```typescript
// When you want to handle errors explicitly in your code
const result = await Koka.run(Result.run(someAsyncOperation()))
if (result.type === 'ok') {
    // Handle success
} else {
    // Handle error
}
```

### 4. Prefer Task.object for Structured Parallel Operations

```typescript
// ✅ Good: Use Task.object for structured data
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

## Next Steps

Now that you understand async operations with Koka, explore:

-   [Task Management](./task-management.md) - Advanced concurrent operations
-   [Context Management](./context-management.md) - Dependency injection with async
-   [Error Handling](./error-handling.md) - Advanced error patterns

Koka makes async programming more predictable, testable, and type-safe!
