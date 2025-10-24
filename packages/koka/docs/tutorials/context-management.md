# Context Management: Dependency Injection with Algebraic Effects

Context effects in Koka provide a powerful and type-safe way to handle dependency injection. This tutorial shows you how to use context effects to manage dependencies, configuration, and shared state.

## What Are Context Effects?

Context effects represent values that your code needs to function. They're perfect for:

-   **Dependency injection**: Providing services and implementations
-   **Configuration**: Environment variables, settings, and options
-   **Shared state**: Database connections, caches, and other resources
-   **Testing**: Mocking dependencies for unit tests

## Basic Context Effects

Let's start with simple context effects:

```typescript
import * as Koka from 'koka'
import * as Ctx from 'koka/ctx'

// Define a context effect for a database connection
class Database extends Ctx.Ctx('Database')<{
    query: (sql: string) => Promise<any>
    close: () => Promise<void>
}> {}

// Define a context effect for configuration
class Config extends Ctx.Ctx('Config')<{
    apiUrl: string
    timeout: number
    debug: boolean
}> {}

// Use context effects in your code
function* getUser(id: string) {
    const db = yield* Ctx.get(Database)
    const config = yield* Ctx.get(Config)

    const user = yield* Async.await(db.query(`SELECT * FROM users WHERE id = '${id}'`))
    return user
}

// Provide implementations when running the program
const program = Koka.try(getUser('123')).handle({
    Database: {
        query: async (sql) => ({ id: '123', name: 'John Doe' }),
        close: async () => {},
    },
    Config: {
        apiUrl: 'https://api.example.com',
        timeout: 5000,
        debug: true,
    },
})

const result = await Koka.run(program)
console.log(result) // { id: '123', name: 'John Doe' }
```

## Dependency Injection Patterns

### 1. Service Layer Pattern

Create service interfaces and implementations:

```typescript
import * as Koka from 'koka'
import * as Ctx from 'koka/ctx'
import * as Async from 'koka/async'

// Service interfaces
class UserService extends Ctx.Ctx('UserService')<{
    getUser: (id: string) => Promise<User>
    createUser: (user: CreateUser) => Promise<User>
    updateUser: (id: string, user: UpdateUser) => Promise<User>
    deleteUser: (id: string) => Promise<void>
}> {}

class EmailService extends Ctx.Ctx('EmailService')<{
    sendWelcome: (email: string, name: string) => Promise<void>
    sendPasswordReset: (email: string) => Promise<void>
}> {}

// Business logic using services
function* createUserWithWelcome(userData: CreateUser) {
    const userService = yield* Ctx.get(UserService)
    const emailService = yield* Ctx.get(EmailService)

    // Create user
    const user = yield* Async.await(userService.createUser(userData))

    // Send welcome email
    yield* Async.await(emailService.sendWelcome(user.email, user.name))

    return user
}

// Provide implementations
const program = Koka.try(
    createUserWithWelcome({
        name: 'John Doe',
        email: 'john@example.com',
    }),
).handle({
    UserService: {
        getUser: async (id) => ({ id, name: 'John Doe', email: 'john@example.com' }),
        createUser: async (userData) => ({ id: '123', ...userData }),
        updateUser: async (id, userData) => ({ id, ...userData }),
        deleteUser: async (id) => {},
    },
    EmailService: {
        sendWelcome: async (email, name) => {
            console.log(`Sending welcome email to ${email} for ${name}`)
        },
        sendPasswordReset: async (email) => {
            console.log(`Sending password reset to ${email}`)
        },
    },
})

const result = await Koka.run(program)
```

### 2. Configuration Pattern

Manage application configuration:

```typescript
import * as Koka from 'koka'
import * as Ctx from 'koka/ctx'
import * as Async from 'koka/async'

// Configuration contexts
class DatabaseConfig extends Ctx.Ctx('DatabaseConfig')<{
    host: string
    port: number
    username: string
    password: string
    database: string
}> {}

class ApiConfig extends Ctx.Ctx('ApiConfig')<{
    baseUrl: string
    timeout: number
    retries: number
    apiKey: string
}> {}

class AppConfig extends Ctx.Ctx('AppConfig')<{
    environment: 'development' | 'production' | 'test'
    debug: boolean
    logLevel: 'error' | 'warn' | 'info' | 'debug'
}> {}

// Use configuration in your code
function* initializeDatabase() {
    const dbConfig = yield* Ctx.get(DatabaseConfig)
    const appConfig = yield* Ctx.get(AppConfig)

    if (appConfig.debug) {
        console.log('Connecting to database:', dbConfig.host)
    }

    // Simulate database connection
    const connection = yield* Async.await(connectToDatabase(dbConfig))

    return connection
}

// Provide configuration based on environment
const getConfig = (environment: string) => {
    const baseConfig = {
        development: {
            DatabaseConfig: {
                host: 'localhost',
                port: 5432,
                username: 'dev_user',
                password: 'dev_password',
                database: 'dev_db',
            },
            ApiConfig: {
                baseUrl: 'http://localhost:3000',
                timeout: 5000,
                retries: 3,
                apiKey: 'dev_key',
            },
            AppConfig: {
                environment: 'development' as const,
                debug: true,
                logLevel: 'debug' as const,
            },
        },
        production: {
            DatabaseConfig: {
                host: process.env.DB_HOST || 'prod-db.example.com',
                port: parseInt(process.env.DB_PORT || '5432'),
                username: process.env.DB_USER || 'prod_user',
                password: process.env.DB_PASS || 'prod_password',
                database: process.env.DB_NAME || 'prod_db',
            },
            ApiConfig: {
                baseUrl: process.env.API_URL || 'https://api.example.com',
                timeout: 10000,
                retries: 5,
                apiKey: process.env.API_KEY || 'prod_key',
            },
            AppConfig: {
                environment: 'production' as const,
                debug: false,
                logLevel: 'error' as const,
            },
        },
    }

    return baseConfig[environment as keyof typeof baseConfig] || baseConfig.development
}

const program = Koka.try(initializeDatabase()).handle(getConfig('development'))
const connection = await Koka.run(program)
```

### 3. Resource Management Pattern

Manage shared resources like database connections:

```typescript
import * as Koka from 'koka'
import * as Ctx from 'koka/ctx'
import * as Async from 'koka/async'
import * as Err from 'koka/err'

class DatabaseConnection extends Ctx.Ctx('DatabaseConnection')<{
    query: (sql: string) => Promise<any>
    transaction: <T>(fn: () => Promise<T>) => Promise<T>
    close: () => Promise<void>
}> {}

class Cache extends Ctx.Ctx('Cache')<{
    get: <T>(key: string) => Promise<T | null>
    set: <T>(key: string, value: T, ttl?: number) => Promise<void>
    delete: (key: string) => Promise<void>
}> {}

class ConnectionError extends Err.Err('ConnectionError')<string> {}

// Resource-aware operations
function* getUserWithCache(id: string) {
    const db = yield* Ctx.get(DatabaseConnection)
    const cache = yield* Ctx.get(Cache)

    // Try cache first
    const cached = yield* Async.await(cache.get<User>(`user:${id}`))
    if (cached) {
        return cached
    }

    // Fetch from database
    const user = yield* Async.await(db.query(`SELECT * FROM users WHERE id = '${id}'`))

    if (!user) {
        yield* Err.throw(new ConnectionError(`User ${id} not found`))
    }

    // Cache the result
    yield* Async.await(cache.set(`user:${id}`, user, 300)) // 5 minutes TTL

    return user
}

// Provide resource implementations
const program = Koka.try(getUserWithCache('123')).handle({
    DatabaseConnection: {
        query: async (sql) => ({ id: '123', name: 'John Doe' }),
        transaction: async (fn) => {
            console.log('Starting transaction')
            const result = await fn()
            console.log('Committing transaction')
            return result
        },
        close: async () => console.log('Closing database connection'),
    },
    Cache: {
        get: async (key) => null, // Cache miss
        set: async (key, value, ttl) => console.log(`Caching ${key} for ${ttl}s`),
        delete: async (key) => console.log(`Deleting ${key}`),
    },
    ConnectionError: (error) => ({ error, status: 404 }),
})

const result = await Koka.run(program)
```

## Nested Context Patterns

### 1. Context Composition

Compose multiple contexts together:

```typescript
import * as Koka from 'koka'
import * as Ctx from 'koka/ctx'

class AuthContext extends Ctx.Ctx('AuthContext')<{
    userId: string
    permissions: string[]
}> {}

class RequestContext extends Ctx.Ctx('RequestContext')<{
    requestId: string
    timestamp: Date
    headers: Record<string, string>
}> {}

// Nested context usage
function* processRequest(requestId: string, userId: string) {
    const auth = yield* Ctx.get(AuthContext)
    const request = yield* Ctx.get(RequestContext)

    console.log(`Processing request ${request.requestId} for user ${auth.userId}`)

    // Your business logic here
    return { success: true, requestId: request.requestId }
}

// Compose contexts
const program = Koka.try(processRequest('req-123', 'user-456')).handle({
    AuthContext: {
        userId: 'user-456',
        permissions: ['read', 'write'],
    },
    RequestContext: {
        requestId: 'req-123',
        timestamp: new Date(),
        headers: { 'user-agent': 'koka-client' },
    },
})

const result = Koka.run(program)
```

### 2. Context Layers

Create layered context handling:

```typescript
import * as Koka from 'koka'
import * as Ctx from 'koka/ctx'

class DatabaseLayer extends Ctx.Ctx('DatabaseLayer')<{
    query: (sql: string) => Promise<any>
}> {}

class ServiceLayer extends Ctx.Ctx('ServiceLayer')<{
    userService: {
        getUser: (id: string) => Promise<User>
    }
}> {}

// Inner function uses database layer
function* getUserFromDb(id: string) {
    const db = yield* Ctx.get(DatabaseLayer)
    return yield* Async.await(db.query(`SELECT * FROM users WHERE id = '${id}'`))
}

// Middle function uses service layer
function* getUserService(id: string) {
    const service = yield* Ctx.get(ServiceLayer)
    return yield* Async.await(service.userService.getUser(id))
}

// Outer function composes everything
function* getUser(id: string) {
    // This will use the service layer if available, fall back to database layer
    try {
        return yield* getUserService(id)
    } catch {
        return yield* getUserFromDb(id)
    }
}

// Provide different layers
const program = Koka.try(getUser('123')).handle({
    ServiceLayer: {
        userService: {
            getUser: async (id) => ({ id, name: 'John Doe' }),
        },
    },
    DatabaseLayer: {
        query: async (sql) => ({ id: '123', name: 'John Doe' }),
    },
})

const result = await Koka.run(program)
```

## Testing with Context Effects

Context effects make testing much easier:

```typescript
import * as Koka from 'koka'
import * as Ctx from 'koka/ctx'
import * as Err from 'koka/err'

class UserService extends Ctx.Ctx('UserService')<{
    getUser: (id: string) => Promise<User>
    createUser: (user: CreateUser) => Promise<User>
}> {}

class UserNotFound extends Err.Err('UserNotFound')<string> {}

function* getUserOrCreate(id: string, defaultUser: CreateUser) {
    const userService = yield* Ctx.get(UserService)

    try {
        return yield* Async.await(userService.getUser(id))
    } catch {
        return yield* Async.await(userService.createUser(defaultUser))
    }
}

// Test with mock implementations
describe('getUserOrCreate', () => {
    it('should return existing user', async () => {
        const mockUserService = {
            getUser: jest.fn().mockResolvedValue({ id: '123', name: 'John' }),
            createUser: jest.fn(),
        }

        const program = Koka.try(getUserOrCreate('123', { name: 'Default' })).handle({
            UserService: mockUserService,
        })

        const result = await Koka.run(program)

        expect(result).toEqual({ id: '123', name: 'John' })
        expect(mockUserService.getUser).toHaveBeenCalledWith('123')
        expect(mockUserService.createUser).not.toHaveBeenCalled()
    })

    it('should create user when not found', async () => {
        const mockUserService = {
            getUser: jest.fn().mockRejectedValue(new Error('Not found')),
            createUser: jest.fn().mockResolvedValue({ id: '123', name: 'Default' }),
        }

        const program = Koka.try(getUserOrCreate('123', { name: 'Default' })).handle({
            UserService: mockUserService,
        })

        const result = await Koka.run(program)

        expect(result).toEqual({ id: '123', name: 'Default' })
        expect(mockUserService.getUser).toHaveBeenCalledWith('123')
        expect(mockUserService.createUser).toHaveBeenCalledWith({ name: 'Default' })
    })
})
```

## Best Practices

### 1. Use Descriptive Names

```typescript
// ✅ Good
class DatabaseConnection extends Ctx.Ctx('DatabaseConnection')<Connection> {}
class UserRepository extends Ctx.Ctx('UserRepository')<Repository> {}

// ❌ Bad
class DB extends Ctx.Ctx('DB')<Connection> {}
class Repo extends Ctx.Ctx('Repo')<Repository> {}
```

### 2. Group Related Dependencies

```typescript
// ✅ Good: Group related services
class DataServices extends Ctx.Ctx('DataServices')<{
    userService: UserService
    postService: PostService
    commentService: CommentService
}> {}

// ❌ Bad: Too many separate contexts
class UserService extends Ctx.Ctx('UserService')<UserService> {}
class PostService extends Ctx.Ctx('PostService')<PostService> {}
class CommentService extends Ctx.Ctx('CommentService')<CommentService> {}
```

### 3. Use Type-Safe Interfaces

```typescript
// ✅ Good: Define clear interfaces
interface UserService {
    getUser(id: string): Promise<User>
    createUser(user: CreateUser): Promise<User>
    updateUser(id: string, user: UpdateUser): Promise<User>
}

class UserService extends Ctx.Ctx('UserService')<UserService> {}

// ❌ Bad: Loose typing
class UserService extends Ctx.Ctx('UserService')<{
    getUser: any
    createUser: any
    updateUser: any
}> {}
```

### 4. Handle Context Dependencies

```typescript
// ✅ Good: Handle missing context gracefully
function* logMessage(message: string) {
    const logger = yield* Ctx.get(Logger)
    logger?.(message) // Optional chaining for optional contexts
}

// ❌ Bad: Assume context is always available
function* logMessage(message: string) {
    const logger = yield* Ctx.get(Logger)
    logger(message) // Will fail if Logger is not provided
}
```

## Next Steps

Now that you understand context management, explore:

-   [Error Handling](./error-handling.md) - Combining context with error handling
-   [Async Operations](./async-operations.md) - Using context with async operations
-   [Task Management](./task-management.md) - Managing context in concurrent operations

Context effects provide a clean, type-safe way to manage dependencies and configuration in your applications!
