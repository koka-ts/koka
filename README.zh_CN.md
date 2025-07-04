# Koka - 基于代数效应的轻量级 TypeScript 效果管理库

**警告：此库处于早期开发阶段，可能会发生重大变化。请勿在生产环境中使用。**

Koka 是一个基于代数效应的轻量级 TypeScript 效果管理库，提供结构化错误处理、上下文管理和异步操作，具有可组合性和类型安全性。

## 📚 文档导航

-   **[文档首页](./docs/README.zh_CN.md)** - 完整的文档导航
-   **[教程](./docs/tutorials.zh_CN.md)** - 从零开始学习 Koka
-   **[操作指南](./docs/how-to-guides.zh_CN.md)** - 解决具体问题的步骤
-   **[API 参考](./docs/reference.zh_CN.md)** - 完整的 API 文档
-   **[概念解释](./docs/explanations.zh_CN.md)** - 深入理解 Koka 的设计理念

## 📋 快速导航

-   [🚀 快速开始](#-快速开始)
-   [✨ 核心特性](#-核心特性)
-   [🔄 与 Effect-TS 对比](#-与-effect-ts-对比)
-   [📖 文档结构](#-文档结构)
-   [🤝 贡献](#-贡献)

## 🚀 快速开始

### 安装

```bash
npm install koka
# 或
yarn add koka
# 或
pnpm add koka
```

### 基本使用

```typescript
import { Eff } from 'koka'

// 错误处理
function* getUser(id: string) {
    if (!id) {
        yield* Eff.err('ValidationError').throw('ID is required')
    }
    return { id, name: 'John Doe' }
}

// 上下文管理
function* calculateTotal() {
    const discount = yield* Eff.ctx('Discount').get<number>()
    return 100 * (1 - discount)
}

// 异步操作
async function* fetchData() {
    const response = yield* Eff.await(fetch('/api/data'))
    return response.json()
}

// 运行效果
const result = await Eff.run(
    Eff.try(getUser('123')).catch({
        ValidationError: (error) => ({ error }),
    }),
)
```

## ✨ 核心特性

-   **类型安全** - 完整的 TypeScript 支持
-   **轻量级** - 仅 ~3kB gzipped
-   **可组合** - 效果自然组合
-   **异步就绪** - 无缝 Promise 集成
-   **设计优先** - 支持预定义效果类型

## 🔄 与 Effect-TS 对比

| 特性       | Koka | Effect-TS |
| ---------- | ---- | --------- |
| 错误效果   | ✅   | ✅        |
| 上下文效果 | ✅   | ✅        |
| 异步效果   | ✅   | ✅        |
| 可组合性   | ✅   | ✅        |
| 类型安全   | ✅   | ✅        |
| 最小 API   | ✅   | ❌        |
| 完整生态   | ❌   | ✅        |
| 学习曲线   | 低   | 高        |
| 包大小     | ~3kB | ~50kB     |

Koka 是 Effect-TS 的轻量级替代方案，专注于提供核心的效果管理功能，而无需完整的生态系统。

## 📖 文档结构

### 教程 (Tutorials)

-   [从零开始](./docs/tutorials.zh_CN.md#getting-started) - 创建你的第一个 Koka 程序
-   [错误处理基础](./docs/tutorials.zh_CN.md#error-handling) - 学习如何处理错误效果
-   [上下文管理](./docs/tutorials.zh_CN.md#context-management) - 理解上下文效果的使用
-   [异步编程](./docs/tutorials.zh_CN.md#async-programming) - 掌握异步效果的处理

### 操作指南 (How-to Guides)

-   [处理特定错误类型](./docs/how-to-guides.zh_CN.md#handle-specific-errors)
-   [组合多个效果](./docs/how-to-guides.zh_CN.md#combine-multiple-effects)
-   [使用设计优先方法](./docs/how-to-guides.zh_CN.md#design-first-approach)
-   [消息传递](./docs/how-to-guides.zh_CN.md#message-passing)
-   [流式处理](./docs/how-to-guides.zh_CN.md#stream-processing)

### 参考文档 (Reference)

-   [Eff API](./docs/reference.zh_CN.md#eff-api) - 完整的 Eff 类 API
-   [效果类型](./docs/reference.zh_CN.md#effect-types) - 所有效果类型的定义
-   [工具函数](./docs/reference.zh_CN.md#utility-functions) - 辅助函数和类型

### 解释文档 (Explanations)

-   [代数效应](./docs/explanations.zh_CN.md#algebraic-effects) - 代数效应的概念
-   [效果系统设计](./docs/explanations.zh_CN.md#effect-system-design) - Koka 的设计理念
-   [与 Effect-TS 的详细对比](./docs/explanations.zh_CN.md#comparison-with-effect-ts)

## 🤝 贡献

欢迎提交 PR！请确保测试通过，新功能包含适当的测试覆盖。

## 📄 许可证

MIT
