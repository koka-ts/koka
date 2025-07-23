# Koka How-to Guides

This guide provides step-by-step solutions to specific problems.

## 📋 Table of Contents

-   [Handle Specific Error Types](#handle-specific-error-types)
    -   [How to Define and Use Custom Error Types](#how-to-define-and-use-custom-error-types)
    -   [How to Create Error Handling Middleware](#how-to-create-error-handling-middleware)
-   [Combine Multiple Effects](#combine-multiple-effects)
    -   [How to Execute Multiple Effects in Parallel](#how-to-execute-multiple-effects-in-parallel)
    -   [How to Combine Object Effects](#how-to-combine-object-effects)
-   [Use Design-First Approach](#use-design-first-approach)
    -   [How to Organize Effect Definitions](#how-to-organize-effect-definitions)
    -   [How to Create Reusable Effect Combinations](#how-to-create-reusable-effect-combinations)
-   [Message Passing](#message-passing)
    -   [How to Implement Bidirectional Communication](#how-to-implement-bidirectional-communication)
    -   [How to Create Message Handlers](#how-to-create-message-handlers)
-   [Stream Processing](#stream-processing)
    -   [How to Handle Streaming Data](#how-to-handle-streaming-data)
    -   [How to Process Data Streams](#how-to-process-data-streams)
-   [Error Recovery and Retry](#error-recovery-and-retry)
    -   [How to Implement Retry Mechanisms](#how-to-implement-retry-mechanisms)
    -   [How to Handle Transient Errors](#how-to-handle-transient-errors)
-   [Test Effects](#test-effects)
    -   [How to Write Tests for Effects](#how-to-write-tests-for-effects)
    -   [How to Mock Effect Handlers](#how-to-mock-effect-handlers)

## Handle Specific Error Types

### How to Define and Use Custom Error Types

```typescript
import { Eff } from 'koka'

// Define custom error types
class UserNotFound extends Eff.Err('UserNotFound')<string> {}
class ValidationError extends Eff.Err('ValidationError')<{ field: string; message: string }> {}
class DatabaseError extends Eff.Err('DatabaseError')<{ code: string; details: string }> {}

// Use in functions
function* getUser(userId: string) {
    if (!userId) {
        yield* Eff.throw(new ValidationError({ field: 'userId', message: 'Required' }))
    }

    try {
        const user = yield* Eff.await(fetchUserFromDatabase(userId))
        if (!user) {
            yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
        }
        return user
    } catch (error) {
        yield* Eff.throw(new DatabaseError({ code: 'FETCH_FAILED', details: error.message }))
    }
}

// Handle specific errors
const result = await Eff.run(
    Eff.try(getUser('123')).handle({
        UserNotFound: (error) => ({ status: 404, message: error }),
        ValidationError: (error) => ({ status: 400, message: `${error.field}: ${error.message}` }),
        DatabaseError: (error) => ({ status: 500, message: `Database error: ${error.code}` }),
    }),
)
```

### How to Create Error Handling Middleware

```typescript
// Create generic error handling function
function createErrorHandler<T>(handlers: {
    UserNotFound?: (error: string) => T
    ValidationError?: (error: { field: string; message: string }) => T
    DatabaseError?: (error: { code: string; details: string }) => T
}) {
    return handlers
}

// Use middleware
const errorHandler = createErrorHandler({
    UserNotFound: (error) => ({ type: 'not_found', message: error }),
    ValidationError: (error) => ({ type: 'validation_error', field: error.field, message: error.message }),
    DatabaseError: (error) => ({ type: 'database_error', code: error.code }),
})

const result = await Eff.run(Eff.try(getUser('123')).handle(errorHandler))
```

## Combine Multiple Effects

### How to Execute Multiple Effects in Parallel

```typescript
import { Eff } from 'koka'

// Fetch user and orders data in parallel
async function* getUserAndOrders(userId: string) {
    const [user, orders] = yield* Eff.combine([fetchUser(userId), fetchOrders(userId)])

    return { user, orders }
}

// Use race to get the fastest result
async function* getFastestData(userId: string) {
    const result = yield* Eff.race([fetchFromCache(userId), fetchFromDatabase(userId), fetchFromAPI(userId)])

    return result
}

// Use all to wait for all results
async function* getAllUserData(userId: string) {
    const results = yield* Eff.all([fetchProfile(userId), fetchPreferences(userId), fetchHistory(userId)])

    return {
        profile: results[0],
        preferences: results[1],
        history: results[2],
    }
}
```

### How to Combine Object Effects

```typescript
// Combine multiple effects in an object
async function* createUserProfile(userData: any) {
    const result = yield* Eff.combine({
        user: createUser(userData),
        profile: createProfile(userData.profile),
        settings: getDefaultSettings(),
        avatar: uploadAvatar(userData.avatar),
    })

    return result
}

// Run combined effects
const profile = await Eff.run(
    Eff.try(createUserProfile(userData)).handle({
        ValidationError: (error) => ({ error }),
        UploadError: (error) => ({ error }),
        DatabaseError: (error) => ({ error }),
    }),
)
```

## Use Design-First Approach

### How to Organize Effect Definitions

```typescript
// effects/user.ts
export class UserNotFound extends Eff.Err('UserNotFound')<string> {}
export class UserValidationError extends Eff.Err('UserValidationError')<{ field: string; message: string }> {}

export class UserDatabase extends Eff.Ctx('UserDatabase')<{
    findById: (id: string) => Promise<any>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<any>
}> {}

export class UserLogger extends Eff.Opt('UserLogger')<(level: string, message: string) => void> {}

// services/user-service.ts
import { UserNotFound, UserValidationError, UserDatabase, UserLogger } from '../effects/user'

export function* getUserService(userId: string) {
    const db = yield* Eff.get(UserDatabase)
    const logger = yield* Eff.get(UserLogger)

    logger?.('info', `Fetching user ${userId}`)

    if (!userId) {
        yield* Eff.throw(new UserValidationError({ field: 'userId', message: 'Required' }))
    }

    const user = yield* Eff.await(db.findById(userId))

    if (!user) {
        yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
    }

    logger?.('info', `User ${userId} found`)
    return user
}

// main.ts
import { getUserService } from './services/user-service'

const result = await Eff.run(
    Eff.try(getUserService('123')).handle({
        UserNotFound: (error) => ({ error }),
        UserValidationError: (error) => ({ error }),
        UserDatabase: {
            findById: async (id) => ({ id, name: 'John Doe' }),
            create: async (data) => data,
            update: async (id, data) => data,
        },
        UserLogger: (level, message) => console.log(`[${level}] ${message}`),
    }),
)
```

### How to Create Reusable Effect Combinations

```typescript
// utils/with-logging.ts
export function* withLogging<T>(message: string, effect: () => Generator<any, T>) {
    const logger = yield* Eff.get(UserLogger)
    logger?.('info', `Starting: ${message}`)

    try {
        const result = yield* effect()
        logger?.('info', `Completed: ${message}`)
        return result
    } catch (error) {
        logger?.('error', `Failed: ${message} - ${error}`)
        throw error
    }
}

// Use logging wrapper
function* getUserWithLogging(userId: string) {
    return yield* withLogging(`Fetching user ${userId}`, () => getUserService(userId))
}

// Use the wrapper
const result = await Eff.run(
    Eff.try(getUserWithLogging('123')).handle({
        UserNotFound: (error) => ({ error }),
        UserValidationError: (error) => ({ error }),
        UserDatabase: {
            findById: async (id) => ({ id, name: 'John Doe' }),
            create: async (data) => data,
            update: async (id, data) => data,
        },
        UserLogger: (level, message) => console.log(`[${level}] ${message}`),
    }),
)
```

## Message Passing

### How to Implement Generator Communication

```typescript
import { Eff } from 'koka'

// Define message type
class UserRequest extends Eff.Msg('UserRequest')<{ userId: string }> {}
class UserResponse extends Eff.Msg('UserResponse')<{ user: any }> {}
class LogMessage extends Eff.Msg('Log')<string> {}

// Client generator
function* userClient() {
    yield* Eff.send(new UserRequest({ userId: '123' }))
    const response = yield* Eff.wait(UserResponse)
    yield* Eff.send(new LogMessage(`Received user: ${response.user.name}`))
    return `Client: ${response.user.name}`
}

// Server generator
function* userServer() {
    const request = yield* Eff.wait(UserRequest)
    yield* Eff.send(new LogMessage(`Processing request for user: ${request.userId}`))

    const user = { id: request.userId, name: 'John Doe' }
    yield* Eff.send(new UserResponse({ user }))

    return `Server: processed ${request.userId}`
}

// Log generator
function* logger() {
    const log1 = yield* Eff.wait(LogMessage)
    const log2 = yield* Eff.wait(LogMessage)
    return `Logger: ${log1}, ${log2}`
}

// Run communication program
const result = Eff.runSync(
    Eff.communicate({
        client: userClient,
        server: userServer,
        logger,
    }),
)

console.log(result)
// Output:
// {
//   client: 'Client: John Doe',
//   server: 'Server: processed 123',
//   logger: 'Logger: Processing request for user: 123, Received user: John Doe'
// }
```

### How to Implement Request-Response Pattern

```typescript
// Define request-response message
class ApiRequest extends Eff.Msg('ApiRequest')<{ method: string; url: string; data?: any }> {}
class ApiResponse extends Eff.Msg('ApiResponse')<{ status: number; data: any }> {}

// API Client
function* apiClient() {
    yield* Eff.send(new ApiRequest({ method: 'GET', url: '/users/123' }))
    const response = yield* Eff.wait(ApiResponse)
    return response.data
}

// API Server
function* apiServer() {
    const request = yield* Eff.wait(ApiRequest)

    // Simulate API processing
    const data = { id: '123', name: 'John Doe' }
    yield* Eff.send(new ApiResponse({ status: 200, data }))

    return `Processed ${request.method} ${request.url}`
}

// Run API communication
const result = Eff.runSync(
    Eff.communicate({
        client: apiClient,
        server: apiServer,
    }),
)
```

## Stream Processing

### How to Handle Stream Data

```typescript
import { Eff } from 'koka'

// Create data generator
function* dataGenerator(id: number) {
    yield* Eff.await(new Promise((resolve) => setTimeout(resolve, id * 10)))
    return `Data ${id}`
}

// Stream processing multiple generators
async function* processStream() {
    const results = yield* Eff.stream([dataGenerator(1), dataGenerator(2), dataGenerator(3)], async (stream) => {
        const processed = []
        for await (const { index, value } of stream) {
            processed[index] = `Processed: ${value}`
        }
        return processed
    })

    return results
}

// Run stream processing
const result = await Eff.run(processStream())
console.log(result) // ['Processed: Data 1', 'Processed: Data 2', 'Processed: Data 3']
```

### How to Implement Concurrency Control

```typescript
// Limit stream processing concurrency
async function* limitedConcurrency() {
    const generators = Array.from({ length: 10 }, (_, i) => dataGenerator(i + 1))

    const results = yield* Eff.stream(generators, async (stream) => {
        const results = []
        let count = 0

        for await (const { index, value } of stream) {
            results[index] = value
            count++

            // Limit simultaneous processing
            if (count % 3 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 100))
            }
        }

        return results
    })

    return results
}
```

### How to Handle Stream Errors

```typescript
// Handle errors in stream
class StreamError extends Eff.Err('StreamError')<string> {}

function* failingGenerator(id: number) {
    if (id === 2) {
        yield* Eff.throw(new StreamError(`Error in generator ${id}`))
    }
    return `Data ${id}`
}

async function* handleStreamErrors() {
    const result = yield* Eff.stream(
        [failingGenerator(1), failingGenerator(2), failingGenerator(3)],
        async (stream) => {
            const results = []
            try {
                for await (const { index, value } of stream) {
                    results[index] = value
                }
                return results
            } catch (error) {
                return { error: error.message }
            }
        },
    )

    return result
}

// Run error handling
const result = await Eff.runResult(handleStreamErrors())
if (result.type === 'err') {
    console.error('Stream error:', result.error)
} else {
    console.log('Stream results:', result.value)
}
```

## Error Recovery and Retry

### How to Implement Automatic Retry Mechanism

```typescript
// Retry function
function* withRetry<T>(effect: () => Generator<any, T>, maxRetries: number = 3, delay: number = 1000) {
    let lastError: any

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return yield* effect()
        } catch (error) {
            lastError = error

            if (attempt < maxRetries) {
                yield* Eff.await(new Promise((resolve) => setTimeout(resolve, delay * attempt)))
            }
        }
    }

    throw lastError
}

// Use retry mechanism
function* fetchUserWithRetry(userId: string) {
    return yield* withRetry(() => fetchUser(userId), 3, 1000)
}
```

### How to Implement Circuit Breaker Pattern

```typescript
// Simple circuit breaker implementation
class CircuitBreaker {
    private failures = 0
    private lastFailure = 0
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'

    constructor(private threshold: number = 5, private timeout: number = 60000) {}

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailure > this.timeout) {
                this.state = 'HALF_OPEN'
            } else {
                throw new Error('Circuit breaker is OPEN')
            }
        }

        try {
            const result = await fn()
            this.onSuccess()
            return result
        } catch (error) {
            this.onFailure()
            throw error
        }
    }

    private onSuccess() {
        this.failures = 0
        this.state = 'CLOSED'
    }

    private onFailure() {
        this.failures++
        this.lastFailure = Date.now()

        if (this.failures >= this.threshold) {
            this.state = 'OPEN'
        }
    }
}

// Use circuit breaker in Koka
const breaker = new CircuitBreaker()

function* fetchUserWithCircuitBreaker(userId: string) {
    return yield* Eff.await(breaker.execute(() => fetchUser(userId)))
}
```

## Test Effects

### How to Write Tests for Effects

```typescript
import { Eff } from 'koka'

// Test user service
describe('UserService', () => {
    it('should fetch user successfully', async () => {
        const mockUser = { id: '123', name: 'John Doe' }

        const result = await Eff.run(
            Eff.try(getUserService('123')).handle({
                UserNotFound: (error) => ({ error }),
                UserValidationError: (error) => ({ error }),
                UserDatabase: {
                    findById: async (id) => mockUser,
                    create: async (data) => data,
                    update: async (id, data) => data,
                },
                UserLogger: (level, message) => console.log(`[${level}] ${message}`),
            }),
        )

        expect(result).toEqual(mockUser)
    })

    it('should handle user not found', async () => {
        const result = await Eff.run(
            Eff.try(getUserService('999')).handle({
                UserNotFound: (error) => ({ error }),
                UserValidationError: (error) => ({ error }),
                UserDatabase: {
                    findById: async (id) => null,
                    create: async (data) => data,
                    update: async (id, data) => data,
                },
                UserLogger: (level, message) => console.log(`[${level}] ${message}`),
            }),
        )

        expect(result).toEqual({ error: 'User 999 not found' })
    })
})
```

### How to Simulate Effects for Testing

```typescript
// Create test tool
function createTestContext(overrides: any = {}) {
    return {
        UserNotFound: (error: string) => ({ error }),
        UserValidationError: (error: any) => ({ error }),
        UserDatabase: {
            findById: async (id: string) => ({ id, name: 'Test User' }),
            create: async (data: any) => data,
            update: async (id: string, data: any) => data,
            ...overrides.UserDatabase,
        },
        UserLogger: (level: string, message: string) => console.log(`[${level}] ${message}`),
        ...overrides,
    }
}

// Use test tool
it('should handle database errors', async () => {
    const testContext = createTestContext({
        UserDatabase: {
            findById: async (id: string) => {
                throw new Error('Database connection failed')
            },
        },
    })

    const result = await Eff.run(Eff.try(getUserService('123')).handle(testContext))

    expect(result).toEqual({ error: 'Database connection failed' })
})
```
