# Koka 概念解释

本文档深入解释 Koka 的核心概念和设计理念。

## 📋 目录

-   [代数效应](#代数效应)
    -   [什么是代数效应？](#什么是代数效应)
    -   [代数效应的核心思想](#代数效应的核心思想)
    -   [与传统错误处理的区别](#与传统错误处理的区别)
-   [效果系统设计](#效果系统设计)
    -   [Koka 的效果类型系统](#koka-的效果类型系统)
    -   [效果组合原理](#效果组合原理)
    -   [效果处理机制](#效果处理机制)
-   [生成器与效果](#生成器与效果)
    -   [为什么使用生成器？](#为什么使用生成器)
    -   [生成器效果模式](#生成器效果模式)
    -   [效果运行器](#效果运行器)
-   [类型系统设计](#类型系统设计)
    -   [高级类型工具](#高级类型工具)
    -   [类型推断](#类型推断)
-   [与 Effect-TS 的详细对比](#与-effect-ts-的详细对比)
    -   [设计理念](#设计理念)
    -   [类型系统对比](#类型系统对比)
    -   [错误处理对比](#错误处理对比)
    -   [上下文管理对比](#上下文管理对比)
    -   [性能对比](#性能对比)
    -   [适用性](#适用性)
-   [最佳实践](#最佳实践)
    -   [效果设计原则](#效果设计原则)
    -   [代码组织](#代码组织)
    -   [错误处理策略](#错误处理策略)
    -   [性能优化](#性能优化)
-   [未来发展方向](#未来发展方向)
    -   [计划功能](#计划功能)
    -   [社区贡献](#社区贡献)
    -   [学习资源](#学习资源)

## 代数效应

### 什么是代数效应？

代数效应（Algebraic Effects）是一种编程语言特性，允许程序在运行时暂停执行，将控制权交给调用者，然后从暂停的地方继续执行。这种机制提供了一种结构化、类型安全的方式来处理副作用。

### 代数效应的核心思想

1. **效果抽象**：将副作用（如错误、I/O、状态）抽象为"效果"
2. **效果处理**：在程序的不同层次处理这些效果
3. **效果组合**：效果可以自然地组合和嵌套
4. **类型安全**：所有效果都在编译时检查

### 与传统错误处理的区别

**传统异常处理：**

```typescript
function getUser(id: string) {
    if (!id) {
        throw new Error('ID is required') // 抛出错误，中断执行
    }
    return fetchUser(id)
}

try {
    const user = getUser('')
} catch (error) {
    // error 为 unknown 类型，缺少类型安全
    console.error(error)
}
```

**代数效应处理：**

```typescript
class ValidationError extends Eff.Err('ValidationError')<string> {}

function* getUser(id: string) {
    if (!id) {
        yield* Eff.throw(new ValidationError('ID is required')) // 抛出错误，中断执行
    }
    return yield* Eff.await(fetchUser(id))
}

const result = Eff.run(
    Eff.try(getUser('')).handle({
        ValidationError: (error) => ({ error }), // 结构化处理，error 为 ValidationError 所 throw 的类型
    }),
)
```

## 效果系统设计

### Koka 的效果类型系统

Koka 定义了四种基本的效果类型：

#### 1. 错误效果 (Err)

表示程序可能失败的情况：

```typescript
type Err<Name extends string, T> = {
    type: 'err'
    name: Name
    error: T
}
```

错误效果的特点：

-   **类型安全**：错误类型在编译时检查
-   **结构化**：错误包含名称和详细信息
-   **可组合**：错误可以在函数调用链中传播

#### 2. 上下文效果 (Ctx)

表示程序需要的依赖或配置：

```typescript
type Ctx<Name extends string, T> = {
    type: 'ctx'
    name: Name
    context: EffSymbol | T
    optional?: true
}
```

上下文效果的特点：

-   **依赖注入**：在运行时提供依赖
-   **可选性**：支持可选的上下文值
-   **类型安全**：上下文类型在编译时检查

#### 3. 异步效果 (Async)

表示异步操作：

```typescript
type Async = {
    type: 'async'
    name?: undefined
    promise: Promise<unknown>
}
```

异步效果的特点：

-   **无缝集成**：与 Promise 无缝集成
-   **自动推断**：自动推断同步/异步操作
-   **错误传播**：异步错误可以 try-catch 捕获

#### 4. 消息效果 (Msg)

表示生成器之间的通信：

```typescript
type Msg<Name extends string, T> = {
    type: 'msg'
    name: Name
    message?: T
}
```

消息效果的特点：

-   **双向通信**：支持发送和接收消息
-   **解耦设计**：生成器之间松耦合

### 效果组合原理

Koka 使用 TypeScript 的高级类型系统来实现效果组合：

```typescript
// 效果联合类型
type AnyEff = Err<string, any> | Ctx<string, any> | Opt<string, any> | Async | Msg<string, any>

// 生成器类型
type Effect<T, E, C> = Generator<
    T, // 返回类型
    | Err<E> // 错误效果
    | Ctx<C> // 上下文效果
    | Async // 异步操作
    | Msg<M> // 消息效果
>
```

### 效果处理机制

#### 效果传播

效果在函数调用链中自然传播：

```typescript
class InnerError extends Eff.Err('InnerError')<string> {}

function* inner() {
    yield* Eff.throw(new InnerError('inner error'))
    return 'should not reach here'
}

function* outer() {
    return yield* inner() // 错误效果会传播到外层
}

// 在顶层处理效果
const result = Eff.run(
    Eff.try(outer()).handle({
        InnerError: (error) => `Handled: ${error}`,
    }),
)
```

#### 效果处理

使用 `Eff.try().handle()` 处理效果：

```typescript
const result = Eff.run(
    Eff.try(getUser('123')).handle({
        // 错误处理
        ValidationError: (error) => ({ error }),
        UserNotFound: (error) => ({ error }),

        // 上下文提供
        UserId: '123',
        ApiKey: 'secret-key',

        // 可选上下文
        Logger: (level, message) => console.log(`[${level}] ${message}`),
    }),
)
```

## 生成器与效果

### 为什么使用生成器？

生成器函数是 JavaScript 中实现代数效应的理想选择：

1. **暂停和恢复**：生成器可以暂停执行并恢复
2. **值传递**：可以在暂停和恢复之间传递值
3. **错误传播**：错误可以自然传播
4. **类型安全**：TypeScript 提供完整的类型检查

### 生成器效果模式

```typescript
function* effectFunction() {
    // 1. 产生效果
    const value = yield {
        type: 'ctx',
        name: 'Config',
        value: 'some-value',
    }

    // 2. 处理效果结果
    if (value === null) {
        yield {
            type: 'err',
            name: 'ConfigError',
            error: 'Configuration not found',
        }
    }

    // 3. 返回最终结果
    return `Processed: ${value}`
}
```

### 效果运行器

Koka 提供了智能的效果运行器：

```typescript
function runEffect(generator: Generator) {
    let result = generator.next()

    while (!result.done) {
        const effect = result.value

        switch (effect.type) {
            case 'err':
                // 处理错误效果
                result = generator.throw(effect.error)
                break
            case 'ctx':
                // 处理上下文效果
                result = generator.next(effect.value)
                break
            case 'opt':
                // 处理可选的上下文效果
                result = generator.next(undefined)
                break
            case 'async':
                // 处理异步效果
                result = generator.next(await effect.promise)
                break
        }
    }

    return result.value
}
```

## 类型系统设计

### 高级类型工具

Koka 使用 TypeScript 的高级类型特性：

#### 条件类型

```typescript
// 提取错误类型
type ExtractErr<T> = T extends AnyErr ? T : never

// 排除错误类型
type ExcludeErr<T> = T extends AnyErr ? never : T
```

#### 映射类型

```typescript
// 将效果转换为处理器类型
type ToHandler<Effect> = Effect extends Err<infer Name, infer U>
    ? Record<Name, (error: U) => unknown>
    : Effect extends Ctx<infer Name, infer U>
    ? Record<Name, U>
    : never
```

#### 交叉类型

```typescript
// 合并多个处理器类型
type EffectHandlers<Effect> = UnionToIntersection<ToHandler<Effect>>
```

### 类型推断

Koka 提供强大的类型推断：

```typescript
// 自动推断效果类型
function* getUser(userId: string) {
    if (!userId) {
        yield* Eff.throw(new ValidationError('ID required'))
        // TypeScript 知道这里会产生 ValidationError 效果
    }

    const user = yield* Eff.await(fetchUser(userId))
    // TypeScript 知道这里会产生 Async 效果

    return user
}

// 类型安全的处理器
const result = Eff.run(
    Eff.try(getUser('123')).handle({
        ValidationError: (error: string) => ({ error }), // 类型检查
        // TypeScript 会检查是否处理了所有可能的效果
    }),
)
```

## 与 Effect-TS 的详细对比

### 设计哲学

| 方面           | Koka         | Effect-TS      |
| -------------- | ------------ | -------------- |
| **设计目标**   | 轻量级、简单 | 完整、功能丰富 |
| **学习曲线**   | 低           | 高             |
| **API 复杂度** | 最小化       | 全面           |
| **类型系统**   | 简单直接     | 复杂强大       |

### 类型系统对比

**Effect-TS 类型：**

```typescript
// Effect-TS 使用复杂的类型系统
Effect<Success, Error, Requirements>
```

**Koka 类型：**

```typescript
// Koka 使用简单的生成器类型
Generator<T, Err | Ctx | Async>
```

### 错误处理对比

**Effect-TS：**

```typescript
import { Effect, pipe } from '@effect/core'

const program = pipe(
    Effect.succeed('hello'),
    Effect.flatMap((str) => Effect.fail(new Error(str))),
)

const result = Effect.runSync(program)
```

**Koka：**

```typescript
import { Eff } from 'koka'

function* program() {
    const str = 'hello'
    yield* Eff.throw(new Error(str))
}

const result = Eff.run(
    Eff.try(program()).handle({
        Error: (error) => ({ error }),
    }),
)
```

### 上下文管理对比

**Effect-TS：**

```typescript
import { Effect, Context } from '@effect/core'

interface Database extends Context.Service {
    query(sql: string): Effect.Effect<never, Error, any>
}

const program = Effect.gen(function* (_) {
    const db = yield* _(Database)
    return yield* _(db.query('SELECT * FROM users'))
})
```

**Koka：**

```typescript
import { Eff } from 'koka'

class Database extends Eff.Ctx('Database')<{ query: (sql: string) => Promise<any> }> {}

function* program() {
    const db = yield* Eff.get(Database)
    return yield* Eff.await(db.query('SELECT * FROM users'))
}
```

### 性能对比

| 指标           | Koka | Effect-TS |
| -------------- | ---- | --------- |
| **包大小**     | ~3kB | ~50kB     |
| **运行时开销** | 低   | 中等      |
| **内存使用**   | 低   | 中等      |
| **启动时间**   | 快   | 中等      |

### 适用场景

**选择 Koka 当：**

-   需要轻量级的效果管理
-   项目规模较小或中等
-   团队对代数效应概念不熟悉
-   需要快速集成

**选择 Effect-TS 当：**

-   需要完整的效果生态系统
-   项目规模较大
-   团队有函数式编程经验
-   需要企业级功能

## 最佳实践

### 效果设计原则

1. **单一职责**：每个效果应该有一个明确的职责
2. **类型安全**：充分利用 TypeScript 的类型系统
3. **可组合性**：设计可以组合的效果
4. **可测试性**：效果应该易于测试和模拟

### 代码组织

```typescript
// effects/user.ts - 定义效果类型
export class UserNotFound extends Eff.Err('UserNotFound')<string> {}
export class UserDatabase extends Eff.Ctx('UserDatabase')<Database> {}

// services/user-service.ts - 实现业务逻辑
export function* getUserService(userId: string) {
    const db = yield* Eff.get(UserDatabase)
    // 业务逻辑
}

// main.ts - 组合和运行
const result = await Eff.run(
    Eff.try(getUserService('123')).handle({
        UserNotFound: (error) => ({ error }),
        UserDatabase: mockDatabase,
    }),
)
```

### 错误处理策略

1. **分层处理**：在适当的层次处理错误
2. **错误转换**：将低级错误转换为高级错误
3. **错误恢复**：提供错误恢复机制
4. **错误日志**：记录错误信息用于调试

### 性能优化

1. **效果合并**：合并多个效果减少开销
2. **懒加载**：延迟加载不必要的效果
3. **缓存**：缓存重复的效果结果
4. **并发处理**：使用 `Eff.combine` 和 `Eff.all` 进行并发处理

## 未来发展方向

### 计划中的功能

1. **更强大的类型推断**：改进 TypeScript 类型推断
2. **性能优化**：进一步减少运行时开销
3. **开发工具**：提供更好的开发体验
4. **生态系统**：建立插件和扩展生态系统

### 社区贡献

Koka 欢迎社区贡献：

1. **问题报告**：报告 bug 和功能请求
2. **代码贡献**：提交 PR 改进代码
3. **文档改进**：帮助改进文档
4. **示例分享**：分享使用示例和最佳实践

### 学习资源

1. **官方文档**：完整的 API 文档和教程
2. **示例项目**：实际的使用示例
3. **社区讨论**：GitHub Issues 和 Discussions
4. **博客文章**：深入的技术文章和教程
