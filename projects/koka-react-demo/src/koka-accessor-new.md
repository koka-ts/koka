# Koka Accessor Architecture Design Document

## 目录

1. [核心设计](#1-核心设计)
2. [Key Design 论证](#2-key-design-论证)
3. [已实现部分](#3-已实现部分)
4. [待实现部分](#4-待实现部分)
    - [4.7 Component 子组件管理机制完善](#47-component-子组件管理机制完善-)
5. [使用示例和最佳实践](#5-使用示例和最佳实践)
6. [性能考虑](#6-性能考虑)
7. [测试策略](#7-测试策略)
8. [常见问题](#8-常见问题)
9. [未来规划](#9-未来规划)

---

## 1. 核心设计

### 1.1 架构概览

Koka Accessor 是一个基于**Key-Based Reactive Framework**的响应式状态管理架构，核心思想是：

-   **写入时精确归因**：通过 Tagged Linked List 路径结构追踪数据变更，提取逻辑 Key
-   **更新时自顶向下调度**：ComponentStore 统一管理组件依赖和更新
-   **解耦的 Effect 生命周期**：Effect 挂载到 Store 层面，独立于 Domain 实例
-   **Key-Based 响应式**：所有响应式机制都基于 Key 的精确匹配和追踪

### 1.2 核心数据结构

#### PathNode: Tagged Linked List

```typescript
type PathNode =
    | { type: 'root' }
    | { type: 'field'; segment: string; prev?: PathNode }
    | { type: 'index'; segment: number; entity?: { name: string; id: string }; prev?: PathNode }
    | { type: 'error'; msg: string; segment: string; prev?: PathNode } // segment 是 UUID
```

**设计原则**：

-   `result path` 用于 debug/devtools，包含完整路径信息
-   `entity` 信息作为 `index` 节点的可选字段，而非独立节点类型
-   `error` 节点携带错误消息和 UUID segment，用于错误路径标识
-   分离路径表示和 Key 提取逻辑

**关键改进**：

-   Entity Identity 信息内嵌在 `index` 节点中，简化路径结构
-   Error 路径使用明确的 `error` 类型，携带结构化错误信息

#### Result 类型

```typescript
type Result<T> = { ok: true; value: T; path: PathNode } | { ok: false; error: string; path: PathNode }
```

-   成功时包含 `value` 和 `path`（PathNode 结构）
-   失败时包含 `error` 和 `path`（使用 error 类型的 PathNode）

### 1.3 Key 提取函数

#### getStructureKey(pathNode: PathNode): string

返回从 root -> local 的**结构路径**，用于表示数据在状态树中的物理位置。

**规则**：

-   从 root 开始，按顺序拼接所有 segment
-   field: 使用字段名
-   index: 使用索引数字
-   entity: 使用 `entity.name:entity.id` 格式
-   error: 使用 UUID segment
-   格式：`$ field1 0 field2 entity:name:id field3`

**用途**：

-   精确标识数据在状态树中的位置
-   用于结构化的数据访问和调试

#### getLogicalKey(pathNode: PathNode): string

返回 **closest entity as root** 的逻辑 Key，如无 entity 则降级为 structureKey。

**规则**：

1. 从 path 向上查找最近的 `index` 节点，且该节点包含 `entity` 字段
2. 如果找到 entity，使用 `entity.name:entity.id` 作为逻辑根
3. 从 entity 节点开始，向下拼接后续路径段
4. 如果未找到 entity，降级为 `getStructureKey(pathNode)`

**格式示例**：

-   有 entity: `todo:123 text`（从 entity 开始的路径）
-   无 entity: `$ todos 0 text`（降级为结构路径）

**用途**：

-   标识逻辑实体，而非物理位置
-   同一实体在不同位置共享相同的逻辑 Key
-   用于 Effect 管理和组件依赖追踪

### 1.4 核心类设计

#### Accessor<Local, Root>

提供对嵌套状态的类型安全访问，通过组合方式构建访问路径。

**核心方法**：

-   `field(key)`: 访问对象字段
-   `index(targetIndex)`: 访问数组索引
-   `match(key, value)`: 通过字段值匹配缩小类型
-   `find(predicate, getKey?)`: 查找数组元素，支持 Entity Identity

**Entity Identity 机制**：

-   `find` 方法支持可选的 `getKey` 参数
-   当提供 `getKey` 时，在 `index` 节点中设置 `entity` 字段
-   同一 entity 在不同位置共享相同的逻辑 Key

#### Domain<Local, Root>

将 Accessor 提升到 Store 层面，提供状态访问和副作用管理。

**核心方法**：

-   `get()`: 获取当前局部状态，返回 `Result<Local>`
-   `set(newValue)`: 设置当前局部状态
-   `update(updater)`: 使用更新函数修改状态
-   `field/index/match/find`: 导航方法
-   `use(DomainCtor)`: 实例化 Domain 子类
-   `subscribe(onNext)`: 订阅状态变更（用于 effect）

**静态方法**：

-   `getKey?(item)`: 可选的 entity key 提取方法，返回 `{ name: string; id: string }`

#### Store<Root>

状态管理容器，提供状态存储、变更通知和 effect 管理。

**核心功能**：

-   `state`: 根状态存储
-   `commit(newState, path)`: 提交新状态，触发组件更新和 effect 检查
-   `startEffects()/stopEffects()`: 显式控制 effects 开关
-   `manageEffect()`: 在 Store 层面管理 effect 生命周期
-   `checkAndUpdateEffects()`: 检查并更新所有 effectful domains

#### ComponentStore

中心化组件调度器，管理组件依赖和更新。

**核心功能**：

-   `register(comp)`: 注册组件实例
-   `getComponent(compId)`: 获取组件实例（用于缓存查找）
-   `track(logicalKey, compId)`: 追踪依赖关系（使用 logicalKey）
-   `triggerUpdate(path)`: 触发组件更新
-   `setGlobalRender(renderFn)`: 设置全局渲染函数
-   `unregister(compId)`: 注销组件实例

**设计特点**：

-   作为 Component 的第一个参数，通过 `component.use()` 隐式传递给子组件
-   维护组件实例缓存，支持基于组件 ID 的复用

#### Component<Input, Out, Context>

通用组件基类，提供显式依赖订阅机制。

**构造函数签名**：

```typescript
Component(compStore: ComponentStore, input: Input, context: Context)
```

**设计特点**：

-   **ComponentStore 作为第一个参数**：类似 Domain 的 Store 参数，通过 `component.use()` 内部隐式传递
-   **组件 ID 生成**：由 `ComponentCtor.uid + inputKey` 构造，用于组件身份识别和缓存优化
    -   `ComponentCtor.uid`：组件构造函数的唯一标识（类似 Domain.uniqueName）
    -   `inputKey`：从 input 中提取的 key（优先使用 `key`、`id` 或从 Domain props 推导）

**核心方法**：

-   `get(domain)`: 显式订阅 Domain，注册依赖关系（使用 logicalKey）
-   `use(Child, input)`: 使用子组件（隔离机制，不追踪子组件依赖）
    -   内部隐式传递 `this.compStore` 给子组件
-   `run()`: 重新执行组件（由 ComponentStore 调度）

**子组件管理机制**：

-   **复用策略**：每次 `run()` 时，比较当前子组件列表与上次的子组件列表
    -   如果子组件的 `Child` 类型和 `input` 相同（通过 key 函数判断），则复用现有实例
    -   如果不同，则创建新实例或卸载旧实例
-   **卸载策略**：当条件分支改变时，不再需要的子组件会被卸载
    -   卸载时会调用 `ComponentStore.unregister()` 注销组件
    -   清除该组件的所有依赖关系
    -   触发组件的清理逻辑（如果有 `onUnmount` 钩子）

### 1.5 数据流

#### 写入流

```
domain.set(value)
  → accessor.set(value, root, path)
  → Result { ok: true, path: PathNode }
  → store.commit(newState, path)
  → ComponentStore.triggerUpdate(path)
  → getLogicalKey(path)
  → dirty dep components
  → top-down re-run
```

#### 读取流

```
component.get(domain)
  → domain.get()
  → accessor.get(root, path)
  → Result { ok: true, value, path: PathNode }
  → getLogicalKey(path)
  → component.compStore.track(logicalKey, componentId)
  → 注册依赖关系
```

#### 子组件创建流

```
component.use(Child, input)
  → getComponentId(Child, input)  // ComponentCtor.uid + inputKey
  → compStore.getComponent(compId)  // 检查缓存
  → (如果不存在) new Child(compStore, input, context)  // ComponentStore 作为第一个参数
  → compStore.register(child)  // 注册到缓存
  → child.impl()  // 执行子组件
```

#### Effect 流

```
domain.subscribe()
  → manageEffects()
  → store.manageEffect(effectId, effectFn, result, domainInstance, true)
  → (如果 enabledEffects) 启动 effect
  → store state changed
  → checkAndUpdateEffects()
  → 检查 result.ok 和 state changed
  → 切换/中断 effect
```

---

## 2. Key Design 论证

作为 **Key-Based Reactive Framework**，核心设计最重要的是梳理各个核心概念里的 Key Design，确保所有响应式机制都基于精确的 Key 匹配。

### 2.1 Key 的层次结构

#### Structure Key vs Logical Key

**Structure Key** (`getStructureKey`):

-   **定义**：从 root 到 local 的完整结构路径
-   **特点**：精确反映数据在状态树中的物理位置
-   **用途**：数据访问、调试、错误定位
-   **示例**：`$ todos 0 text`

**Logical Key** (`getLogicalKey`):

-   **定义**：以 closest entity 为根的逻辑路径，无 entity 则降级为 structure key
-   **特点**：标识逻辑实体，而非物理位置
-   **用途**：Effect 管理、组件依赖追踪、响应式更新
-   **示例**：`todo:123 text`（有 entity）或 `$ todos 0 text`（无 entity）

**设计原则**：

-   Structure Key 用于**精确访问**和**调试**
-   Logical Key 用于**响应式机制**（Effect、Component 依赖）
-   同一逻辑实体在不同位置共享相同的 Logical Key

### 2.2 Result Key

**Result Key**：从 `Result.path` 中提取的 Key。

**函数抽象**：

```typescript
// 从 Result 提取 Structure Key
getResultStructureKey(result: Result<any>): string {
    return getStructureKey(result.path)
}

// 从 Result 提取 Logical Key
getResultLogicalKey(result: Result<any>): string {
    return getLogicalKey(result.path)
}
```

**用途**：

-   Component 依赖追踪：使用 `getResultLogicalKey(result)`
-   错误定位：使用 `getResultStructureKey(result)`
-   Effect 管理：使用 `getResultLogicalKey(result)`

### 2.3 State Key

**State Key**：标识状态树中的特定位置。

**函数抽象**：

```typescript
// 从 state 和 path 构造 State Key
getStateKey(state: any, path: PathNode): string {
    // 如果 path 指向的 value 有 entity 信息，使用 logical key
    // 否则使用 structure key
    return getLogicalKey(path)
}
```

**用途**：

-   状态快照和恢复
-   状态比较和变更检测
-   状态持久化

### 2.4 Domain Key

**Domain Key**：标识 Domain 实例的逻辑位置。

**函数抽象**：

```typescript
// 从 Domain 提取 Key
getDomainKey(domain: Domain<any, any>): string {
    const result = domain.get()
    if (result.ok) {
        return getLogicalKey(result.path)
    }
    // err 情况：使用 structure key 或特殊标记
    return getStructureKey(result.path) + ':err'
}

// 从 Domain 和 DomainCtor 构造唯一标识
getDomainInstanceKey(domain: Domain<any, any>, DomainCtor: typeof Domain): string {
    const logicalKey = getDomainKey(domain)
    const ctorId = getDomainCtorId(DomainCtor)
    return `${ctorId}:${logicalKey}`
}
```

**用途**：

-   Domain Instance 等价性判断
-   Effect 注册和管理
-   Domain 实例缓存

**DomainCtorId**：

```typescript
// 获取或创建 Domain 构造函数的唯一 ID
getDomainCtorId(DomainCtor: typeof Domain): string {
    // 使用 Domain.uniqueName 或生成唯一 ID
    return (DomainCtor as any).uniqueName || DomainCtor.name
}
```

### 2.5 Effect Key

**Effect Key**：标识 Effect 的唯一标识。

**函数抽象**：

```typescript
// 从 Domain 和 methodName 构造 Effect Key
getEffectKey(domain: Domain<any, any>, methodName: string): string {
    const domainKey = getDomainKey(domain)
    const ctorId = getDomainCtorId(domain.constructor as typeof Domain)
    return `${ctorId}:${domainKey}:${methodName}`
}

// 从 Result 和 methodName 构造 Effect Key（用于注册）
getEffectKeyFromResult(result: Result<any>, DomainCtor: typeof Domain, methodName: string): string {
    const logicalKey = getResultLogicalKey(result)
    const ctorId = getDomainCtorId(DomainCtor)
    return `${ctorId}:${logicalKey}:${methodName}`
}
```

**用途**：

-   Effect 注册和查找
-   Effect 生命周期管理
-   Effect 状态存储的键

**设计原则**：

-   Effect Key = `DomainCtorId:LogicalKey:MethodName`
-   使用 Logical Key 确保同一实体在不同位置的 Effect 共享
-   DomainCtorId 确保不同 Domain 类的 Effect 隔离

### 2.6 Component Key

**Component Key**：标识 Component 实例。

**函数抽象**：

```typescript
// Component 实例的唯一 ID（已实现）
getComponentId(comp: Component<any, any, any>): string {
    return comp.id
}

// Component 依赖的 Key（用于追踪）
getComponentDependencyKey(domain: Domain<any, any>): string {
    const result = domain.get()
    return getResultLogicalKey(result)
}
```

**用途**：

-   Component 注册和查找
-   依赖关系追踪
-   组件更新调度

**设计原则**：

-   Component 使用 Logical Key 追踪依赖
-   确保同一逻辑实体的变更触发所有相关组件更新

### 2.7 Key 提取函数总结

| 函数                                       | 输入               | 输出   | 用途                         |
| ------------------------------------------ | ------------------ | ------ | ---------------------------- |
| `getStructureKey(path)`                    | PathNode           | string | 结构路径，用于调试和精确访问 |
| `getLogicalKey(path)`                      | PathNode           | string | 逻辑路径，用于响应式机制     |
| `getResultStructureKey(result)`            | Result             | string | 从 Result 提取结构路径       |
| `getResultLogicalKey(result)`              | Result             | string | 从 Result 提取逻辑路径       |
| `getDomainKey(domain)`                     | Domain             | string | Domain 的逻辑位置            |
| `getDomainInstanceKey(domain, DomainCtor)` | Domain, DomainCtor | string | Domain 实例的唯一标识        |
| `getEffectKey(domain, methodName)`         | Domain, string     | string | Effect 的唯一标识            |
| `getComponentDependencyKey(domain)`        | Domain             | string | Component 依赖的 Key         |

### 2.8 Key Design 原则

1. **分离 Structure 和 Logical**：

    - Structure Key 用于精确访问和调试
    - Logical Key 用于响应式机制

2. **Entity 作为逻辑根**：

    - 有 entity 时，以 entity 为逻辑根
    - 无 entity 时，降级为 structure key

3. **Key 的唯一性**：

    - 同一逻辑实体在不同位置共享相同的 Logical Key
    - 不同 Domain 类通过 DomainCtorId 隔离

4. **Key 的可组合性**：
    - Effect Key = DomainCtorId + LogicalKey + MethodName
    - Domain Instance Key = DomainCtorId + LogicalKey

---

## 3. 已实现部分

### 3.1 基础数据结构 ✅

-   [x] **PathNode**: Tagged Linked List 结构（当前实现为旧版本，需更新）

    -   `createRootPath()`, `createFieldPath()`, `createIndexPath()`
    -   `pathNodeToString()`: 路径转字符串（用于 debug）
    -   `getEffectKeyFromResultPath()`: 提取 effect key（需更新为 `getLogicalKey`）

-   [x] **Result 类型**: 使用 PathNode 的完整实现
    -   `Ok<T>(value, path)`: 创建成功结果
    -   `Err(error, path)`: 创建失败结果

### 3.2 Accessor 层 ✅

-   [x] **Accessor 类**: 完整实现

    -   `field(key)`: 对象字段访问
    -   `index(targetIndex)`: 数组索引访问
    -   `match(key, value)`: 字段值匹配
    -   `find(predicate, getKey?)`: 数组查找，支持 Entity Identity

-   [x] **Entity Identity 支持**: 在 `find` 方法中实现
    -   支持可选的 `getKey` 参数
    -   当前使用 entity path，需更新为 index 节点的 entity 字段

### 3.3 Domain 层 ✅

-   [x] **Domain 类**: 核心功能实现

    -   `get()`: 获取状态
    -   `set(newValue)`: 设置状态
    -   `update(updater)`: 更新状态
    -   `field/index/match/find`: 导航方法
    -   `use(DomainCtor)`: 子 Domain 实例化
    -   `subscribe(onNext)`: 状态订阅

-   [x] **静态方法支持**: `getKey?` 可选方法声明

### 3.4 Store 层 ✅

-   [x] **Store 基础功能**:

    -   `state`: 状态存储
    -   `subscribe(listener)`: 状态变更订阅
    -   `commit(newState, path)`: 提交新状态，触发更新

-   [x] **Effect 管理基础**:
    -   `enabledEffects`: Effects 开关标志
    -   `startEffects()/stopEffects()`: 开关控制
    -   `manageEffect()`: Effect 生命周期管理（部分实现）
    -   `effectStates`: Effect 状态存储
    -   `effectfulDomains`: Effectful domains 注册表（结构已定义）

### 3.5 ComponentStore 层 ✅

-   [x] **ComponentStore 类**: 完整实现
    -   `register(comp)`: 注册组件
    -   `track(effectKey, compId)`: 追踪依赖（需更新为使用 logicalKey）
    -   `triggerUpdate(path)`: 触发更新
    -   `setGlobalRender(renderFn)`: 设置全局渲染
    -   `clearDependencies(compId)`: 清除依赖

### 3.6 Component 层 ✅

-   [x] **Component 基类**: 完整实现

    -   `get(domain)`: 显式订阅机制（需更新为使用 logicalKey）
    -   `use(Child, input)`: 隔离的子组件使用
    -   `run()`: 重新执行组件
    -   子组件管理：每次运行时管理子组件的复用和卸载（待完善）

-   [x] **HtmlView 基类**: 完整实现
    -   `handler(fn)`: 事件处理器注册
    -   `catch(error)`: 错误处理

### 3.7 Effect 装饰器 ✅

-   [x] **@effect() 装饰器**: 完整实现

    -   存储 effect 方法到 `effectMethodsStorage`
    -   支持 `EffectContext` 签名

-   [x] **EffectContext 类型**: 完整定义
    -   `abortSignal`: AbortSignal
    -   `abort()`: 主动中断
    -   `get/set`: 引用管理

---

## 4. 待实现部分

### 4.1 PathNode 结构优化 🔲

**待实现功能**：

1. **更新 PathNode 类型定义**

    ```typescript
    type PathNode =
        | { type: 'root' }
        | { type: 'field'; segment: string; prev?: PathNode }
        | { type: 'index'; segment: number; entity?: { name: string; id: string }; prev?: PathNode }
        | { type: 'error'; msg: string; segment: string; prev?: PathNode }
    ```

2. **更新创建函数**

    - `createIndexPath(segment, entity?, prev?)`: 支持 entity 参数
    - `createErrorPath(msg, prev?)`: 创建 error 路径节点

3. **删除 entity 类型**
    - 移除 `createEntityPath()` 函数
    - 更新所有使用 entity path 的代码

### 4.2 Key 提取函数实现 🔲

**待实现功能**：

1. **getStructureKey(pathNode: PathNode): string**

    ```typescript
    // 从 root -> local 的结构路径
    // 格式: $ field1 0 field2 entity:name:id field3
    ```

2. **getLogicalKey(pathNode: PathNode): string**

    ```typescript
    // 以 closest entity 为根的逻辑路径
    // 有 entity: entity:name:id field1 field2
    // 无 entity: 降级为 getStructureKey(pathNode)
    ```

3. **更新现有函数**
    - 将 `getEffectKeyFromResultPath` 替换为 `getLogicalKey`
    - 更新所有使用 effect key 的地方

### 4.3 Key Design 函数实现 🔲

**待实现功能**：

1. **Result Key 函数**

    - `getResultStructureKey(result: Result<any>): string`
    - `getResultLogicalKey(result: Result<any>): string`

2. **Domain Key 函数**

    - `getDomainKey(domain: Domain<any, any>): string`
    - `getDomainInstanceKey(domain: Domain<any, any>, DomainCtor: typeof Domain): string`
    - `getDomainCtorId(DomainCtor: typeof Domain): string`

3. **Effect Key 函数**

    - `getEffectKey(domain: Domain<any, any>, methodName: string): string`
    - `getEffectKeyFromResult(result: Result<any>, DomainCtor: typeof Domain, methodName: string): string`

4. **Component Key 函数**
    - `getComponentDependencyKey(domain: Domain<any, any>): string`

### 4.4 Store Effect 管理完善 🔲

**待实现功能**：

1. **checkAndUpdateEffects() 完整实现**

    - 遍历所有 effectfulDomains
    - 使用 `getDomainKey()` 获取 domain key
    - 检查每个 domain 的 accessor result 是否 ok
    - 如果不 ok：中断并删除对应的 effects
    - 如果 ok：检查 domain state 是否 changed
    - 如果 changed：切换 effect 调用

2. **effectfulDomains 注册机制**

    - 在 `domain.get()` 时注册到 `effectfulDomains`
    - 使用 `getDomainInstanceKey()` 作为 key
    - 检查 domain instance 等价性

3. **Effect 状态检查优化**
    - 使用 `getDomainKey()` 比较 path 是否变化
    - 比较 result state (ok/err) 是否变化
    - 比较 value 是否变化（引用相等性检查）

### 4.5 Domain Effect 注册机制完善 🔲

**待实现功能**：

1. **domain.get() 时的 Effect 注册**

    - 不在 `domain.get()` 时马上发生副作用
    - 使用 `getDomainInstanceKey()` 注册到 `store.effectfulDomains`
    - 等待 `store.startEffects()` 时再启动

2. **Domain Instance 等价性判断**

    - 使用 `getDomainInstanceKey()` 判断等价性
    - 复用第一次注册的 domain instance 的 effect methods

3. **Effect ID 构建优化**
    - 使用 `getEffectKeyFromResult()` 构建 effect id
    - effectKey 从 `getResultLogicalKey(result)` 获取

### 4.6 Component 依赖追踪更新 🔲

**待实现功能**：

1. **Component.get() 更新**

    - 使用 `getResultLogicalKey(result)` 替代 `getEffectKeyFromResultPath(path)`
    - 确保使用 Logical Key 追踪依赖

2. **ComponentStore.track() 更新**
    - 参数名从 `effectKey` 改为 `logicalKey`
    - 使用 Logical Key 存储依赖关系

### 4.7 Component 子组件管理机制完善 🔲

**设计目标**：

-   Component 每次运行时需要管理子组件的生命周期
-   支持子组件复用（当条件分支改变但子组件可以复用时）
-   支持子组件卸载（当条件分支改变导致子组件不再需要时）
-   ComponentStore 作为第一个参数，通过 `component.use()` 内部隐式传递
-   组件 ID 由 `ComponentCtor.uid + inputKey` 构造，用于组件身份识别和缓存优化

**待实现功能**：

1. **ComponentCtor UID 机制**

    ```typescript
    // 为每个 Component 构造函数生成唯一 ID
    interface ComponentCtorStatic {
        uid?: string // 组件构造函数的唯一标识
    }

    // 获取或创建 ComponentCtor 的 UID
    function getComponentCtorUid(Child: ComponentCtor): string {
        if (!Child.uid) {
            // 生成唯一 ID（可以使用 Symbol 或 UUID）
            Child.uid = `comp_${Math.random().toString(36).substring(2, 15)}`
        }
        return Child.uid
    }
    ```

2. **Input Key 提取机制（从 Domain Props 推导）**

    ```typescript
    // 从 input 中提取 key，优先从 Domain props 推导
    function getInputKey(input: any): string {
        // 1. 如果 input 有 key 属性，直接使用
        if (input && typeof input === 'object' && 'key' in input) {
            return String(input.key)
        }

        // 2. 如果 input 有 id 属性，使用它
        if (input && typeof input === 'object' && 'id' in input) {
            return String(input.id)
        }

        // 3. 如果 input 是 Domain，使用 domain 的 logical key
        if (input instanceof Domain) {
            const result = input.get()
            if (result.ok) {
                return getResultLogicalKey(result)
            }
            // 如果 domain 无效，使用 structure key
            return getResultStructureKey(result)
        }

        // 4. 如果 input 包含 domain 属性（常见模式）
        if (input && typeof input === 'object' && 'domain' in input) {
            const domain = input.domain
            if (domain instanceof Domain) {
                const result = domain.get()
                if (result.ok) {
                    return getResultLogicalKey(result)
                }
            }
        }

        // 5. 否则使用 JSON.stringify（性能较差，但作为后备）
        return JSON.stringify(input)
    }
    ```

3. **组件 ID 生成机制**

    ```typescript
    // 生成稳固的组件 ID：ComponentCtor.uid + inputKey
    function getComponentId(Child: ComponentCtor, input: any): string {
        const ctorUid = getComponentCtorUid(Child)
        const inputKey = getInputKey(input)
        return `${ctorUid}:${inputKey}`
    }
    ```

4. **Component 构造函数更新**

    ```typescript
    abstract class Component<Input, Out, Context = any> {
        protected readonly compStore: ComponentStore // ComponentStore 作为第一个参数
        protected readonly context: Context
        protected readonly input: Input
        /** 组件唯一 ID，由 ComponentCtor.uid + inputKey 构造 */
        readonly id: string

        constructor(
            compStore: ComponentStore, // 第一个参数：ComponentStore
            input: Input,
            context: Context,
        ) {
            this.compStore = compStore
            this.context = context
            this.input = input

            // 生成稳固的组件 ID
            this.id = getComponentId(this.constructor as ComponentCtor, input)

            // 注册到 ComponentStore（如果不存在则注册，如果存在则复用）
            const existing = compStore.getComponent(this.id)
            if (!existing) {
                compStore.register(this)
            } else {
                // 复用现有实例，更新 input 和 context
                // 注意：这里可能需要处理实例复用的逻辑
            }
        }
    }
    ```

5. **Component.use() 方法更新（隐式传递 ComponentStore）**

    ```typescript
    abstract class Component<Input, Out, Context = any> {
        // 追踪当前运行时的子组件列表（key -> Component 实例）
        private currentSubComponents = new Map<string, Component<any, any, Context>>()

        use<SubInput, SubOut>(Child: ComponentCtor<SubInput, SubOut, Context>, input: SubInput): SubOut {
            // 生成子组件的 key（用于判断是否复用）
            const subKey = getSubComponentKey(Child, input)

            // 检查是否已存在该子组件
            let child = this.currentSubComponents.get(subKey)

            if (!child) {
                // 创建新子组件实例，隐式传递 this.compStore
                child = new Child(this.compStore, input, this.context)
                this.currentSubComponents.set(subKey, child)
            } else {
                // 复用现有实例
                // 注意：如果 input 引用变化，子组件会通过自己的响应式机制更新
                // 这里不需要手动更新，因为子组件通过 get(domain) 获取最新状态
            }

            try {
                return child.impl()
            } catch (error) {
                return child.catch(error instanceof Error ? error : new Error(String(error)))
            }
        }

        run(): Out {
            // 清除旧依赖
            this.compStore.clearDependencies(this.id)

            // 保存上次的子组件列表
            const previousSubComponents = new Map(this.currentSubComponents)

            // 清空当前列表（impl() 会重新填充）
            this.currentSubComponents.clear()

            try {
                const output = this.impl()

                // 卸载不再需要的子组件
                previousSubComponents.forEach((child, key) => {
                    if (!this.currentSubComponents.has(key)) {
                        // 调用卸载钩子（如果有）
                        child.onUnmount?.()
                        // 从 ComponentStore 注销
                        this.compStore.unregister(child.id)
                    }
                })

                return output
            } catch (error) {
                return this.catch(error instanceof Error ? error : new Error(String(error)))
            }
        }

        // 可选的卸载钩子
        onUnmount?(): void
    }
    ```

6. **ComponentStore 更新（支持组件缓存）**

    ```typescript
    class ComponentStore {
        /** 组件实例缓存：ComponentId -> Component */
        private components = new Map<string, Component<any, any, any>>()

        /**
         * 获取组件实例（用于缓存查找）
         */
        getComponent(compId: string): Component<any, any, any> | undefined {
            return this.components.get(compId)
        }

        /**
         * 注册组件实例
         */
        register(comp: Component<any, any, any>): void {
            this.components.set(comp.id, comp)
        }
    }
    ```

7. **Component.run() 静态方法更新**

    ```typescript
    abstract class Component<Input, Out, Context = any> {
        /**
         * 运行组件（静态方法）
         * @param compStore ComponentStore 实例
         * @param input 组件输入
         * @param context 组件上下文
         */
        static run<Input, Out, Context>(
            this: ComponentCtor<Input, Out, Context>,
            compStore: ComponentStore, // 第一个参数：ComponentStore
            input: Input,
            context: Context,
        ): Out {
            const Ctor = this
            const instance = new Ctor(compStore, input, context)
            try {
                return instance.impl()
            } catch (error) {
                return instance.catch(error instanceof Error ? error : new Error(String(error)))
            }
        }
    }
    ```

8. **组件 ID 生成和缓存优化说明**

    **组件 ID 格式**：`ComponentCtor.uid:inputKey`

    **示例**：

    ```typescript
    // 场景 1：input 包含 Domain
    const todoDomain = todosDomain.find(/* ... */)  // logical key: "todo:123"
    const component = new TodoItemComponent(compStore, { todoDomain }, context)
    // component.id = "TodoItemComponent_abc123:todo:123"

    // 场景 2：input 包含 key 属性
    const component = new TodoItemComponent(compStore, { key: "item-1", ... }, context)
    // component.id = "TodoItemComponent_abc123:item-1"

    // 场景 3：input 包含 id 属性
    const component = new TodoItemComponent(compStore, { id: "todo-123", ... }, context)
    // component.id = "TodoItemComponent_abc123:todo-123"
    ```

    **缓存优化**：

    - 相同 `ComponentCtor.uid` 和 `inputKey` 的组件会复用同一个实例
    - 当条件分支改变时，如果组件 ID 相同，则复用现有实例
    - 如果组件 ID 不同，则创建新实例或卸载旧实例
    - 这确保了组件实例的稳定性和性能优化

    **与 Domain 的类比**：

    - Domain 通过 `store` 参数传递，Component 通过 `compStore` 参数传递
    - Domain 的 `use()` 方法隐式传递 `store`，Component 的 `use()` 方法隐式传递 `compStore`
    - Domain 的 identity 由 `DomainCtor.uniqueName + logicalKey` 决定
    - Component 的 identity 由 `ComponentCtor.uid + inputKey` 决定

9. **使用示例**

    **条件分支场景**：

    ```typescript
    class ConditionalComponent extends HtmlView<{ showDetail: boolean }, void, AppContext> {
        run() {
            const { showDetail } = this.input

            if (showDetail) {
                // 当 showDetail 为 true 时，使用 DetailComponent
                // 如果之前已经创建过，会复用实例
                return this.use(DetailComponent, {
                    /* ... */
                })
            } else {
                // 当 showDetail 为 false 时，DetailComponent 会被卸载
                return this.use(SummaryComponent, {
                    /* ... */
                })
            }
        }
    }
    ```

    **列表渲染场景**：

    ```typescript
    class TodoListComponent extends HtmlView<{ todos: Todo[] }, void, AppContext> {
        run() {
            const { todos } = this.input

            // 渲染列表，每个 todo 对应一个子组件
            return todos.map((todo) => {
                // 使用 todo.id 作为 key，相同 id 的 todo 会复用组件实例
                return this.use(TodoItemComponent, {
                    key: todo.id, // 显式指定 key
                    todo,
                })
            })
        }
    }
    ```

10. **优化策略**

    - **Key 生成优化**：优先使用 input 中的 `key` 或 `id` 属性
    - **引用相等性检查**：复用相同 key 的组件实例，避免不必要的重新创建
    - **批量卸载**：在 `run()` 结束时统一处理卸载，避免中间状态不一致
    - **内存管理**：卸载时自动清理依赖关系，防止内存泄漏

11. **实现注意事项**
    - 子组件的 `input` 更新不会自动触发重新渲染，需要依赖子组件自己的响应式机制
    - 卸载钩子 `onUnmount()` 是可选的，用于清理副作用（如定时器、订阅等）
    - Key 生成函数应该稳定，相同输入总是产生相同 key

---

## 5. 使用示例和最佳实践

### 5.1 基础使用模式

#### 定义 Domain 类

```typescript
// 定义状态类型
type Todo = {
    id: string
    text: string
    completed: boolean
}

type AppState = {
    todos: Todo[]
    filter: 'all' | 'active' | 'completed'
}

// 定义 Domain 类
class TodoDomain extends Domain<Todo, AppState> {
    // 可选：定义 Entity Identity
    static getKey(item: Todo): { name: string; id: string } {
        return { name: 'todo', id: item.id }
    }
}

class AppDomain extends Domain<AppState, AppState> {
    todos() {
        return this.field('todos')
    }

    filter() {
        return this.field('filter')
    }
}
```

#### 在 Component 中使用

```typescript
// ComponentStore 作为第一个参数，通过 component.use() 隐式传递
class TodoListComponent extends HtmlView<{}, void, AppContext> {
    // 构造函数：ComponentStore 作为第一个参数
    constructor(
        compStore: ComponentStore, // 第一个参数
        input: {},
        context: AppContext,
    ) {
        super(compStore, input, context)
    }

    run() {
        const appDomain = this.get(this.context.appDomain)
        const todosDomain = appDomain.todos()

        // 获取 todos 数组
        const todosResult = todosDomain.get()
        if (!todosResult.ok) {
            return this.catch(todosResult.error)
        }

        const todos = todosResult.value

        // 渲染列表
        // component.use() 内部会隐式传递 this.compStore 给子组件
        return this.html`
            <ul>
                ${todos.map((_, index) => {
                    const todoDomain = todosDomain.index(index)
                    // 使用 Domain 作为 input，组件 ID 会从 Domain 的 logical key 推导
                    return this.use(TodoItemComponent, { todoDomain })
                })}
            </ul>
        `
    }
}

class TodoItemComponent extends HtmlView<{ todoDomain: Domain<Todo, AppState> }, void, AppContext> {
    // 构造函数：ComponentStore 作为第一个参数
    constructor(
        compStore: ComponentStore, // 第一个参数，由父组件的 use() 隐式传递
        input: { todoDomain: Domain<Todo, AppState> },
        context: AppContext,
    ) {
        super(compStore, input, context)
        // 组件 ID 会自动生成：ComponentCtor.uid + getInputKey(input)
        // 由于 input 包含 Domain，会使用 Domain 的 logical key 作为 inputKey
    }

    run() {
        const { todoDomain } = this.input
        const todoResult = this.get(todoDomain)

        if (!todoResult.ok) {
            return this.catch(todoResult.error)
        }

        const todo = todoResult.value

        return this.html`
            <li>
                <input 
                    type="checkbox" 
                    checked=${todo.completed}
                    onchange=${this.handler((e) => {
                        todoDomain.field('completed').set(e.target.checked)
                    })}
                />
                <span>${todo.text}</span>
            </li>
        `
    }
}

// 使用 Component.run() 静态方法（需要传入 ComponentStore）
const compStore = new ComponentStore()
const appContext = createAppContext()
const html = TodoListComponent.run(compStore, {}, appContext)
```

### 5.2 Entity Identity 使用

#### 使用 find 方法查找实体

```typescript
class TodoDetailComponent extends HtmlView<{ todoId: string }, void, AppContext> {
    run() {
        const { todoId } = this.input
        const appDomain = this.get(this.context.appDomain)
        const todosDomain = appDomain.todos()

        // 使用 find 方法查找 todo，提供 getKey 以启用 Entity Identity
        const todoDomain = todosDomain.find(
            (todo) => todo.id === todoId,
            (todo) => ({ name: 'todo', id: todo.id }),
        )

        const todoResult = this.get(todoDomain)
        if (!todoResult.ok) {
            return this.catch(todoResult.error)
        }

        const todo = todoResult.value

        // 此时 todoDomain 的逻辑 Key 为 "todo:123"（而非 "$ todos 0"）
        // 即使 todo 在数组中的位置改变，逻辑 Key 保持不变
        // 相关的 Effect 和 Component 依赖会自动追踪到正确的实体

        // 组件 ID 会从 Domain 的 logical key 推导
        // 例如：TodoDetailComponent.uid + "todo:123"
        // 这确保了相同 todo 的组件实例会被复用

        return this.html`
            <div>
                <h2>${todo.text}</h2>
                <p>Status: ${todo.completed ? 'Completed' : 'Active'}</p>
            </div>
        `
    }
}
```

### 5.3 Effect 使用模式

#### 定义 Effect 方法

```typescript
class TodoDomain extends Domain<Todo, AppState> {
    static getKey(item: Todo): { name: string; id: string } {
        return { name: 'todo', id: item.id }
    }

    // 使用 @effect 装饰器定义副作用
    @effect()
    async syncToServer(ctx: EffectContext) {
        const result = this.get()
        if (!result.ok) {
            return // 如果路径无效，不执行 effect
        }

        const todo = result.value

        // 使用 ctx.abortSignal 处理取消
        const response = await fetch(`/api/todos/${todo.id}`, {
            method: 'PUT',
            body: JSON.stringify(todo),
            signal: ctx.abortSignal,
        })

        if (!response.ok) {
            throw new Error('Failed to sync todo')
        }
    }

    // 多个 effect 方法
    @effect()
    async logChanges(ctx: EffectContext) {
        const result = this.get()
        if (!result.ok) return

        console.log('Todo changed:', result.value)
    }
}
```

#### 启动和管理 Effects

```typescript
// 在应用初始化时
const store = new Store(initialState)
const appDomain = new AppDomain(rootAccessor, store)

// 启动 effects（通常在组件挂载后）
store.startEffects()

// 停止 effects（通常在组件卸载前）
store.stopEffects()
```

### 5.4 错误处理模式

#### Result 类型错误处理

```typescript
class SafeComponent extends HtmlView<{}, void, AppContext> {
    run() {
        const domain = this.get(this.context.someDomain)
        const result = domain.get()

        // 方式 1: 使用 if 检查
        if (!result.ok) {
            return this.catch(result.error)
        }

        // 方式 2: 使用 Result 的 path 进行错误定位
        if (!result.ok) {
            const errorPath = getResultStructureKey(result)
            console.error(`Error at path: ${errorPath}`, result.error)
            return this.html`<div class="error">${result.error}</div>`
        }

        // 成功情况
        return this.html`<div>${result.value}</div>`
    }
}
```

### 5.5 最佳实践

#### 1. 使用 Entity Identity 处理动态列表

**推荐**：对于包含实体的数组，始终使用 `find` 方法并提供 `getKey`：

```typescript
// ✅ 推荐：使用 Entity Identity
const todoDomain = todosDomain.find(
    (todo) => todo.id === todoId,
    (todo) => ({ name: 'todo', id: todo.id }),
)

// ❌ 不推荐：使用 index（位置会变化）
const todoDomain = todosDomain.index(0)
```

#### 2. 合理使用 Structure Key 和 Logical Key

**推荐**：

-   调试和错误定位：使用 `getStructureKey()`
-   响应式机制（Effect、Component 依赖）：使用 `getLogicalKey()`

```typescript
// 调试时
const structureKey = getResultStructureKey(result)
console.log('Access path:', structureKey)

// 响应式追踪时
const logicalKey = getResultLogicalKey(result)
componentStore.track(logicalKey, componentId)
```

#### 3. Effect 生命周期管理

**推荐**：

-   在应用启动时统一调用 `store.startEffects()`
-   在应用关闭时统一调用 `store.stopEffects()`
-   避免在 `domain.get()` 时立即执行副作用

```typescript
// ✅ 推荐：延迟启动 effects
store.startEffects() // 在组件挂载后

// ❌ 不推荐：在 domain.get() 时立即执行副作用
domain.get() // 不应该在这里触发副作用
```

#### 4. Component 依赖追踪

**推荐**：

-   在 `component.get(domain)` 时自动追踪依赖
-   使用 Logical Key 确保同一实体的变更触发所有相关组件

```typescript
// ✅ 推荐：使用 get() 方法自动追踪
const result = this.get(domain) // 自动注册依赖

// ❌ 不推荐：手动管理依赖
const result = domain.get() // 不会自动追踪依赖
```

---

## 6. 性能考虑

### 6.1 Key 提取性能

**优化策略**：

-   Key 提取函数应该缓存结果（如果 path 未变化）
-   使用 WeakMap 缓存 path -> key 的映射
-   避免重复遍历 path 链表

**实现建议**：

```typescript
// 使用 WeakMap 缓存
const structureKeyCache = new WeakMap<PathNode, string>()
const logicalKeyCache = new WeakMap<PathNode, string>()

function getStructureKey(path: PathNode): string {
    if (structureKeyCache.has(path)) {
        return structureKeyCache.get(path)!
    }
    const key = computeStructureKey(path)
    structureKeyCache.set(path, key)
    return key
}
```

### 6.2 Component 更新性能

**优化策略**：

-   使用 Logical Key 减少不必要的组件更新
-   同一逻辑实体的变更只触发相关组件，而非所有组件
-   自顶向下的更新调度避免重复渲染

**实现建议**：

```typescript
// ComponentStore.triggerUpdate 应该：
// 1. 提取 logicalKey
// 2. 查找依赖该 logicalKey 的组件
// 3. 自顶向下调度更新（避免重复渲染）
```

### 6.3 Effect 管理性能

**优化策略**：

-   使用 `getDomainKey()` 快速比较 domain 状态变化
-   只在状态真正变化时切换 effect
-   使用引用相等性检查 value 变化

**实现建议**：

```typescript
// checkAndUpdateEffects 应该：
// 1. 遍历 effectfulDomains（O(n)）
// 2. 使用 getDomainKey() 比较（O(1)）
// 3. 只在 changed 时切换 effect（避免不必要的重启）
```

### 6.4 内存管理

**优化策略**：

-   PathNode 使用链表结构，共享前缀路径
-   使用 WeakMap 缓存，自动垃圾回收
-   Effect 使用 AbortSignal 及时清理资源

**实现建议**：

```typescript
// PathNode 共享前缀
const path1 = createFieldPath('todos', createRootPath())
const path2 = createIndexPath(0, path1) // 共享 path1

// WeakMap 自动清理
const cache = new WeakMap<PathNode, string>() // 不会阻止 GC
```

---

## 7. 测试策略

### 7.1 单元测试

#### PathNode 和 Key 提取函数测试

```typescript
describe('getStructureKey', () => {
    it('should extract structure key from path', () => {
        const path = createFieldPath('todos', createIndexPath(0, createFieldPath('text', createRootPath())))
        const key = getStructureKey(path)
        expect(key).toBe('$ text 0 todos')
    })

    it('should handle entity in index node', () => {
        const path = createIndexPath(0, createRootPath(), {
            name: 'todo',
            id: '123',
        })
        const key = getStructureKey(path)
        expect(key).toBe('$ todo:123')
    })
})

describe('getLogicalKey', () => {
    it('should use entity as root when available', () => {
        const path = createFieldPath(
            'text',
            createIndexPath(0, createRootPath(), {
                name: 'todo',
                id: '123',
            }),
        )
        const key = getLogicalKey(path)
        expect(key).toBe('todo:123 text')
    })

    it('should fallback to structure key when no entity', () => {
        const path = createFieldPath('text', createIndexPath(0, createRootPath()))
        const key = getLogicalKey(path)
        expect(key).toBe('$ 0 text')
    })
})
```

#### Accessor 和 Domain 测试

```typescript
describe('Accessor', () => {
    it('should access nested fields', () => {
        const state = { todos: [{ text: 'test' }] }
        const accessor = root<typeof state>().field('todos').index(0).field('text')

        const result = accessor.get(state, createRootPath())
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.value).toBe('test')
        }
    })

    it('should handle entity identity in find', () => {
        const state = { todos: [{ id: '123', text: 'test' }] }
        const accessor = root<typeof state>()
            .field('todos')
            .find(
                (todo) => todo.id === '123',
                (todo) => ({ name: 'todo', id: todo.id }),
            )

        const result = accessor.get(state, createRootPath())
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.path.type).toBe('index')
            if (result.path.type === 'index') {
                expect(result.path.entity).toEqual({ name: 'todo', id: '123' })
            }
        }
    })
})
```

### 7.2 集成测试

#### Component 依赖追踪测试

```typescript
describe('Component dependency tracking', () => {
    it('should track dependencies using logical key', () => {
        const store = new Store({ todos: [{ id: '123', text: 'test' }] })
        const component = new TestComponent()
        componentStore.register(component)

        const domain = new TodoDomain(/* ... */)
        const result = component.get(domain)

        const logicalKey = getResultLogicalKey(result)
        const dependencies = componentStore.getDependencies(component.id)

        expect(dependencies).toContain(logicalKey)
    })

    it('should trigger update when logical key changes', () => {
        // 设置初始状态
        // 注册组件
        // 修改状态
        // 验证组件更新
    })
})
```

#### Effect 生命周期测试

```typescript
describe('Effect lifecycle', () => {
    it('should start effect when store.startEffects() is called', () => {
        const store = new Store(initialState)
        const domain = new TodoDomain(/* ... */)

        // 注册 effectful domain
        domain.get() // 注册到 effectfulDomains

        // 启动 effects
        store.startEffects()

        // 验证 effect 已启动
        const effectKey = getEffectKey(domain, 'syncToServer')
        expect(store.effectStates.has(effectKey)).toBe(true)
    })

    it('should stop effect when domain path becomes invalid', () => {
        // 设置初始状态
        // 启动 effect
        // 修改状态使 path 无效
        // 验证 effect 已停止
    })
})
```

### 7.3 性能测试

#### Key 提取性能

```typescript
describe('Key extraction performance', () => {
    it('should cache key extraction results', () => {
        const path = createComplexPath()

        // 第一次提取
        const start1 = performance.now()
        const key1 = getStructureKey(path)
        const time1 = performance.now() - start1

        // 第二次提取（应该使用缓存）
        const start2 = performance.now()
        const key2 = getStructureKey(path)
        const time2 = performance.now() - start2

        expect(key1).toBe(key2)
        expect(time2).toBeLessThan(time1) // 缓存应该更快
    })
})
```

---

## 8. 常见问题

### 8.1 为什么需要 Structure Key 和 Logical Key 两种 Key？

**回答**：

-   **Structure Key** 用于精确访问和调试，反映数据在状态树中的物理位置
-   **Logical Key** 用于响应式机制，标识逻辑实体，确保同一实体在不同位置共享相同的 Key

**示例**：

```typescript
// 同一个 todo 在不同位置
// Structure Key: "$ todos 0 text" vs "$ todos 1 text"（不同）
// Logical Key: "todo:123 text" vs "todo:123 text"（相同）
```

### 8.2 Entity Identity 什么时候使用？

**回答**：

-   当数组中的元素代表**业务实体**（如 Todo、User 等）时使用
-   当元素的**位置可能变化**，但**逻辑身份不变**时使用
-   当需要**跨位置共享 Effect 和依赖**时使用

**示例**：

```typescript
// ✅ 适合使用 Entity Identity
todos.find(
    (todo) => todo.id === id,
    (todo) => ({ name: 'todo', id: todo.id }),
)

// ❌ 不适合使用 Entity Identity（位置固定的配置项）
config.items.index(0)
```

### 8.3 Effect 什么时候启动和停止？

**回答**：

-   **启动**：调用 `store.startEffects()` 时，所有已注册的 effectful domains 的 effects 会启动
-   **停止**：
    -   调用 `store.stopEffects()` 时，所有 effects 停止
    -   Domain 路径变为无效（`result.ok === false`）时，相关 effects 自动停止
    -   Effect 方法内部调用 `ctx.abort()` 时，该 effect 停止

### 8.4 Component 依赖如何更新？

**回答**：

-   Component 在 `get(domain)` 时自动注册依赖（使用 Logical Key）
-   当状态变更时，`ComponentStore.triggerUpdate(path)` 提取 Logical Key
-   查找所有依赖该 Logical Key 的组件，自顶向下调度更新

### 8.5 如何处理错误路径？

**回答**：

-   使用 `error` 类型的 PathNode 表示错误路径
-   `error` 节点包含 `msg`（错误消息）和 `segment`（UUID）
-   错误路径的 Structure Key 使用 UUID segment
-   错误路径的 Logical Key 降级为 Structure Key

---

## 9. 未来规划

### 9.1 开发工具支持

-   **DevTools 集成**：可视化显示状态树、路径、Key、依赖关系
-   **性能分析**：分析 Key 提取、组件更新、Effect 切换的性能
-   **调试工具**：断点调试、状态快照、时间旅行

### 9.2 类型系统增强

-   **更严格的类型检查**：确保 Accessor 路径的类型安全
-   **类型推导优化**：改进复杂嵌套类型的推导
-   **泛型约束**：增强 Domain 和 Component 的泛型约束

### 9.3 性能优化

-   **增量更新**：只更新变化的部分，而非整个组件树
-   **批量更新**：合并多个状态变更，减少更新次数
-   **懒加载**：延迟加载大型状态树的部分

### 9.4 生态系统

-   **React 集成**：提供 React Hooks 和组件
-   **Vue 集成**：提供 Vue Composition API 支持
-   **状态持久化**：支持状态序列化和恢复
-   **中间件系统**：支持日志、时间旅行、状态同步等中间件
