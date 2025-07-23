# Koka 操作指南

本指南提供解决具体问题的步骤和方法。

## 📋 目录

-   [处理特定错误类型](#处理特定错误类型)
    -   [如何定义和使用自定义错误类型](#如何定义和使用自定义错误类型)
    -   [如何创建错误处理中间件](#如何创建错误处理中间件)
-   [组合多个效果](#组合多个效果)
    -   [如何并行执行多个效果](#如何并行执行多个效果)
    -   [如何组合对象效果](#如何组合对象效果)
-   [使用设计优先方法](#使用设计优先方法)
    -   [如何组织效果定义](#如何组织效果定义)
    -   [如何创建可重用的效果组合](#如何创建可重用的效果组合)
-   [消息传递](#消息传递)
    -   [如何实现双向通信](#如何实现双向通信)
    -   [如何创建消息处理器](#如何创建消息处理器)
-   [流式处理](#流式处理)
    -   [如何处理流式数据](#如何处理流式数据)
    -   [如何处理数据流](#如何处理数据流)
-   [错误恢复和重试](#错误恢复和重试)
    -   [如何实现重试机制](#如何实现重试机制)
    -   [如何处理临时错误](#如何处理临时错误)
-   [测试效果](#测试效果)
    -   [如何为效果编写测试](#如何为效果编写测试)
    -   [如何模拟效果处理器](#如何模拟效果处理器)

## 处理特定错误类型

### 如何定义和使用自定义错误类型

```typescript
import { Eff } from 'koka'

// 定义自定义错误类型
class UserNotFound extends Eff.Err('UserNotFound')<string> {}
class ValidationError extends Eff.Err('ValidationError')<{ field: string; message: string }> {}
class DatabaseError extends Eff.Err('DatabaseError')<{ code: string; details: string }> {}

// 在函数中使用
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

// 处理特定错误
const result = await Eff.run(
    Eff.try(getUser('123')).handle({
        UserNotFound: (error) => ({ status: 404, message: error }),
        ValidationError: (error) => ({ status: 400, message: `${error.field}: ${error.message}` }),
        DatabaseError: (error) => ({ status: 500, message: `Database error: ${error.code}` }),
    }),
)
```

### 如何创建错误处理中间件

```typescript
// 创建通用的错误处理函数
function createErrorHandler<T>(handlers: {
    UserNotFound?: (error: string) => T
    ValidationError?: (error: { field: string; message: string }) => T
    DatabaseError?: (error: { code: string; details: string }) => T
}) {
    return handlers
}

// 使用中间件
const errorHandler = createErrorHandler({
    UserNotFound: (error) => ({ type: 'not_found', message: error }),
    ValidationError: (error) => ({ type: 'validation_error', field: error.field, message: error.message }),
    DatabaseError: (error) => ({ type: 'database_error', code: error.code }),
})

const result = await Eff.run(Eff.try(getUser('123')).handle(errorHandler))
```

## 组合多个效果

### 如何并行执行多个效果

```typescript
import { Eff } from 'koka'

// 并行获取用户和订单数据
async function* getUserAndOrders(userId: string) {
    const [user, orders] = yield* Eff.combine([fetchUser(userId), fetchOrders(userId)])

    return { user, orders }
}

// 使用 race 获取最快的结果
async function* getFastestData(userId: string) {
    const result = yield* Eff.race([fetchFromCache(userId), fetchFromDatabase(userId), fetchFromAPI(userId)])

    return result
}

// 使用 all 等待所有结果
async function* getAllUserData(userId: string) {
    const results = yield* Eff.all([fetchProfile(userId), fetchPreferences(userId), fetchHistory(userId)])

    return {
        profile: results[0],
        preferences: results[1],
        history: results[2],
    }
}
```

### 如何组合对象效果

```typescript
// 组合对象中的多个效果
async function* createUserProfile(userData: any) {
    const result = yield* Eff.combine({
        user: createUser(userData),
        profile: createProfile(userData.profile),
        settings: getDefaultSettings(),
        avatar: uploadAvatar(userData.avatar),
    })

    return result
}

// 运行组合效果
const profile = await Eff.run(
    Eff.try(createUserProfile(userData)).handle({
        ValidationError: (error) => ({ error }),
        UploadError: (error) => ({ error }),
        DatabaseError: (error) => ({ error }),
    }),
)
```

## 使用设计优先方法

### 如何组织效果定义

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

### 如何创建可重用的效果组合

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

// 使用日志包装器
function* getUserWithLogging(userId: string) {
    return yield* withLogging(`Fetching user ${userId}`, () => getUserService(userId))
}

// 使用包装器
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

## 消息传递

### 如何实现生成器之间的通信

```typescript
import { Eff } from 'koka'

// 定义消息类型
class UserRequest extends Eff.Msg('UserRequest')<{ userId: string }> {}
class UserResponse extends Eff.Msg('UserResponse')<{ user: any }> {}
class LogMessage extends Eff.Msg('Log')<string> {}

// 客户端生成器
function* userClient() {
    yield* Eff.send(new UserRequest({ userId: '123' }))
    const response = yield* Eff.wait(UserResponse)
    yield* Eff.send(new LogMessage(`Received user: ${response.user.name}`))
    return `Client: ${response.user.name}`
}

// 服务端生成器
function* userServer() {
    const request = yield* Eff.wait(UserRequest)
    yield* Eff.send(new LogMessage(`Processing request for user: ${request.userId}`))

    const user = { id: request.userId, name: 'John Doe' }
    yield* Eff.send(new UserResponse({ user }))

    return `Server: processed ${request.userId}`
}

// 日志生成器
function* logger() {
    const log1 = yield* Eff.wait(LogMessage)
    const log2 = yield* Eff.wait(LogMessage)
    return `Logger: ${log1}, ${log2}`
}

// 运行通信程序
const result = Eff.runSync(
    Eff.communicate({
        client: userClient,
        server: userServer,
        logger,
    }),
)

console.log(result)
// 输出:
// {
//   client: 'Client: John Doe',
//   server: 'Server: processed 123',
//   logger: 'Logger: Processing request for user: 123, Received user: John Doe'
// }
```

### 如何实现请求-响应模式

```typescript
// 定义请求-响应消息
class ApiRequest extends Eff.Msg('ApiRequest')<{ method: string; url: string; data?: any }> {}
class ApiResponse extends Eff.Msg('ApiResponse')<{ status: number; data: any }> {}

// API 客户端
function* apiClient() {
    yield* Eff.send(new ApiRequest({ method: 'GET', url: '/users/123' }))
    const response = yield* Eff.wait(ApiResponse)
    return response.data
}

// API 服务器
function* apiServer() {
    const request = yield* Eff.wait(ApiRequest)

    // 模拟 API 处理
    const data = { id: '123', name: 'John Doe' }
    yield* Eff.send(new ApiResponse({ status: 200, data }))

    return `Processed ${request.method} ${request.url}`
}

// 运行 API 通信
const result = Eff.runSync(
    Eff.communicate({
        client: apiClient,
        server: apiServer,
    }),
)
```

## 流式处理

### 如何处理流式数据

```typescript
import { Eff } from 'koka'

// 创建数据生成器
function* dataGenerator(id: number) {
    yield* Eff.await(new Promise((resolve) => setTimeout(resolve, id * 10)))
    return `Data ${id}`
}

// 流式处理多个生成器
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

// 运行流式处理
const result = await Eff.run(processStream())
console.log(result) // ['Processed: Data 1', 'Processed: Data 2', 'Processed: Data 3']
```

### 如何实现并发控制

```typescript
// 限制并发数量的流处理
async function* limitedConcurrency() {
    const generators = Array.from({ length: 10 }, (_, i) => dataGenerator(i + 1))

    const results = yield* Eff.stream(generators, async (stream) => {
        const results = []
        let count = 0

        for await (const { index, value } of stream) {
            results[index] = value
            count++

            // 限制同时处理的数量
            if (count % 3 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 100))
            }
        }

        return results
    })

    return results
}
```

### 如何处理流式错误

```typescript
// 处理流中的错误
function* failingGenerator(id: number) {
    if (id === 2) {
        class StreamError extends Eff.Err('StreamError')<string> {}
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

// 运行错误处理
const result = await Eff.runResult(handleStreamErrors())
if (result.type === 'err') {
    console.error('Stream error:', result.error)
} else {
    console.log('Stream results:', result.value)
}
```

## 错误恢复和重试

### 如何实现自动重试机制

```typescript
// 重试函数
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

// 使用重试机制
function* fetchUserWithRetry(userId: string) {
    return yield* withRetry(() => fetchUser(userId), 3, 1000)
}
```

### 如何实现断路器模式

```typescript
// 简单的断路器实现
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

// 在 Koka 中使用断路器
const breaker = new CircuitBreaker()

function* fetchUserWithCircuitBreaker(userId: string) {
    return yield* Eff.await(breaker.execute(() => fetchUser(userId)))
}
```

## 测试效果

### 如何为效果编写测试

```typescript
import { Eff } from 'koka'

// 测试用户服务
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

### 如何模拟效果进行测试

```typescript
// 创建测试工具
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

// 使用测试工具
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
