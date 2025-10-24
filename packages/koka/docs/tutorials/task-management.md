# Task Management: Concurrent Operations with Algebraic Effects

Koka's Task module provides powerful tools for managing concurrent operations. This tutorial shows you how to use algebraic effects for parallel execution, task coordination, and resource management.

## What Are Task Effects?

Task effects in Koka allow you to:

-   **Run operations in parallel**: Execute multiple tasks simultaneously
-   **Control concurrency**: Limit the number of concurrent operations
-   **Handle task results**: Process results as they complete
-   **Coordinate tasks**: Manage dependencies between operations
-   **Resource management**: Efficiently use system resources

## Task API Overview

Koka provides different Task APIs for different use cases:

-   **`Task.all()`**: For array-based parallel execution
-   **`Task.tuple()`**: For tuple-based parallel execution
-   **`Task.object()`**: For object-based parallel execution (recommended)
-   **`Task.race()`**: For getting the first result
-   **`Task.concurrent()`**: For controlled concurrency

## Basic Task Operations

Let's start with simple parallel execution:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

// Simple async operations
function* fetchUser(id: string) {
    return yield* Async.await(fetch(`/api/users/${id}`).then((res) => res.json()))
}

function* fetchPosts(userId: string) {
    return yield* Async.await(fetch(`/api/users/${userId}/posts`).then((res) => res.json()))
}

function* fetchComments(postId: string) {
    return yield* Async.await(fetch(`/api/posts/${postId}/comments`).then((res) => res.json()))
}

// Run operations in parallel using Task.object (recommended)
function* getUserProfile(userId: string) {
    const result = yield* Task.object({
        user: () => fetchUser(userId),
        posts: () => fetchPosts(userId),
    })

    return {
        ...result,
        postCount: result.posts.length,
    }
}

const result = await Koka.run(getUserProfile('123'))
console.log(result)
```

## Task Execution Patterns

### 1. Array-based Parallel Execution (Task.all)

Use `Task.all()` for simple array-based operations:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* fetchData(urls: string[]) {
    const tasks = urls.map((url) => () => Async.await(fetch(url).then((res) => res.json())))

    const results = yield* Task.all(tasks)
    return results
}

const urls = ['https://api.example.com/users', 'https://api.example.com/posts', 'https://api.example.com/comments']

const data = await Koka.run(fetchData(urls))
console.log('Fetched data:', data)
```

### 2. Object-based Parallel Execution (Task.object) - Recommended

Use `Task.object()` for structured parallel operations:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* fetchUserData(userId: string) {
    const result = yield* Task.object({
        user: () => Async.await(fetch(`/api/users/${userId}`).then((res) => res.json())),
        posts: () => Async.await(fetch(`/api/users/${userId}/posts`).then((res) => res.json())),
        comments: () => Async.await(fetch(`/api/users/${userId}/comments`).then((res) => res.json())),
        preferences: () => Async.await(fetch(`/api/users/${userId}/preferences`).then((res) => res.json())),
    })

    return result
}

const userData = await Koka.run(fetchUserData('123'))
console.log('User data:', userData)
// Result: { user: {...}, posts: [...], comments: [...], preferences: {...} }
```

### 3. Tuple-based Parallel Execution (Task.tuple)

Use `Task.tuple()` for fixed-length parallel operations:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* fetchUserAndPosts(userId: string) {
    const [user, posts] = yield* Task.tuple([
        () => Async.await(fetch(`/api/users/${userId}`).then((res) => res.json())),
        () => Async.await(fetch(`/api/users/${userId}/posts`).then((res) => res.json())),
    ])

    return { user, posts }
}

const result = await Koka.run(fetchUserAndPosts('123'))
console.log(result)
```

### 4. Race Conditions (Task.race)

Get the first result from multiple tasks:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* fetchFromMultipleSources(id: string) {
    const sources = [
        () => Async.await(fetch(`/api/users/${id}`).then((res) => res.json())),
        () => Async.await(fetch(`/api/v2/users/${id}`).then((res) => res.json())),
        () => Async.await(fetch(`/api/legacy/users/${id}`).then((res) => res.json())),
    ]

    const result = yield* Task.race(sources)
    return result
}

const user = await Koka.run(fetchFromMultipleSources('123'))
console.log('First result:', user)
```

### 5. Controlled Concurrency (Task.concurrent)

Limit the number of concurrent operations:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* processItems(items: string[], maxConcurrency = 3) {
    const tasks = items.map((item) => () => processItem(item))

    const results = yield* Task.concurrent(
        tasks,
        async (stream) => {
            const results = []
            for await (const { value } of stream) {
                results.push(value)
            }
            return results
        },
        { maxConcurrency },
    )

    return results
}

async function processItem(item: string) {
    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 100))
    return `Processed: ${item}`
}

const items = Array.from({ length: 10 }, (_, i) => `item-${i}`)
const results = await Koka.run(processItems(items, 3))
console.log(results)
```

## Advanced Task Patterns

### 1. Task Composition with Objects

Compose complex task workflows using `Task.object()`:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'
import * as Err from 'koka/err'

class ProcessingError extends Err.Err('ProcessingError')<string> {}

function* complexWorkflow(userIds: string[]) {
    // Step 1: Fetch all users in parallel
    const userTasks = userIds.map((id) => () => fetchUser(id))
    const users = yield* Task.all(userTasks)

    // Step 2: For each user, fetch their data in parallel using objects
    const userDataTasks = users.map((user) => () => getUserData(user.id))

    const userData = yield* Task.all(userDataTasks)

    // Step 3: Process all data
    const processedData = userData.map((data) => ({
        ...data,
        totalInteractions: data.posts.length + data.comments.length,
    }))

    return processedData
}

async function fetchUser(id: string) {
    const response = await fetch(`/api/users/${id}`)
    if (!response.ok) {
        throw new ProcessingError(`Failed to fetch user ${id}`)
    }
    return response.json()
}

async function getUserData(userId: string) {
    const result = await Promise.all([
        fetch(`/api/users/${userId}/posts`).then((res) => res.json()),
        fetch(`/api/users/${userId}/comments`).then((res) => res.json()),
    ])

    return { userId, posts: result[0], comments: result[1] }
}

const program = Koka.try(complexWorkflow(['1', '2', '3'])).handle({
    ProcessingError: (error) => ({ error, status: 'error' }),
})

const result = await Koka.run(program)
console.log(result)
```

### 2. Task Dependencies with Objects

Handle tasks with dependencies using `Task.object()`:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* buildProject(projectId: string) {
    // Step 1: Get project configuration
    const config = yield* Async.await(fetchProjectConfig(projectId))

    // Step 2: Build dependencies in parallel
    const dependencyTasks = config.dependencies.map((dep) => () => buildDependency(dep))

    const dependencies = yield* Task.all(dependencyTasks)

    // Step 3: Build the main project (depends on dependencies)
    const mainBuild = yield* Async.await(buildMainProject(config, dependencies))

    // Step 4: Run tests in parallel using objects
    const testResult = yield* Task.object({
        unitTests: () => runTestSuite('unit', mainBuild),
        integrationTests: () => runTestSuite('integration', mainBuild),
        e2eTests: () => runTestSuite('e2e', mainBuild),
    })

    return {
        projectId,
        dependencies,
        mainBuild,
        testResult,
    }
}

async function fetchProjectConfig(projectId: string) {
    return { dependencies: ['dep1', 'dep2'], testSuites: ['unit', 'integration'] }
}

async function buildDependency(dep: string) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { name: dep, built: true }
}

async function buildMainProject(config: any, dependencies: any[]) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    return { built: true, dependencies }
}

async function runTestSuite(suite: string, build: any) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    return { suite, passed: true }
}

const result = await Koka.run(buildProject('my-project'))
console.log(result)
```

### 3. Error Handling in Tasks

Handle errors in concurrent operations:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'
import * as Err from 'koka/err'

class TaskError extends Err.Err('TaskError')<{ taskId: string; error: string }> {}

function* resilientTaskExecution(tasks: Array<() => Promise<any>>) {
    const results = yield* Task.concurrent(
        tasks,
        async (stream) => {
            const results = []
            const errors = []

            for await (const { index, value } of stream) {
                try {
                    results[index] = value
                } catch (error) {
                    errors.push({ index, error: error.message })
                }
            }

            return { results, errors }
        },
        { maxConcurrency: 5 },
    )

    return results
}

// Example with error handling
const tasks = [
    () => Promise.resolve('success 1'),
    () => Promise.reject(new Error('task 2 failed')),
    () => Promise.resolve('success 3'),
    () => Promise.reject(new Error('task 4 failed')),
]

const result = await Koka.run(resilientTaskExecution(tasks))
console.log('Results:', result.results)
console.log('Errors:', result.errors)
```

## Task Coordination

### 1. Task Synchronization with Objects

Coordinate tasks that need to wait for each other:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* coordinatedWorkflow() {
    // Phase 1: Initialize systems in parallel using objects
    const systems = yield* Task.object({
        db: () => initializeDatabase(),
        cache: () => initializeCache(),
        api: () => initializeAPI(),
    })

    // Phase 2: Load data in parallel (depends on systems being ready)
    const data = yield* Task.object({
        users: () => loadUsers(systems.db),
        posts: () => loadPosts(systems.db),
        comments: () => loadComments(systems.db),
    })

    // Phase 3: Process data in parallel
    const processed = yield* Task.object({
        users: () => processUsers(data.users, systems.cache),
        posts: () => processPosts(data.posts, systems.cache),
    })

    return {
        systems,
        data: { ...data, ...processed },
    }
}

async function initializeDatabase() {
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { status: 'ready' }
}

async function initializeCache() {
    await new Promise((resolve) => setTimeout(resolve, 50))
    return { status: 'ready' }
}

async function initializeAPI() {
    await new Promise((resolve) => setTimeout(resolve, 75))
    return { status: 'ready' }
}

async function loadUsers(db: any) {
    return [
        { id: '1', name: 'John' },
        { id: '2', name: 'Jane' },
    ]
}

async function loadPosts(db: any) {
    return [
        { id: '1', title: 'Post 1' },
        { id: '2', title: 'Post 2' },
    ]
}

async function loadComments(db: any) {
    return [{ id: '1', text: 'Comment 1' }]
}

async function processUsers(users: any[], cache: any) {
    return users.map((user) => ({ ...user, processed: true }))
}

async function processPosts(posts: any[], cache: any) {
    return posts.map((post) => ({ ...post, processed: true }))
}

const result = await Koka.run(coordinatedWorkflow())
console.log(result)
```

### 2. Task Pipelines with Objects

Create processing pipelines using objects:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* dataPipeline(data: any[]) {
    // Stage 1: Validate data in parallel
    const validationTasks = data.map((item) => () => validateItem(item))
    const validatedData = yield* Task.all(validationTasks)

    // Stage 2: Transform data in parallel using objects
    const transformResult = yield* Task.object({
        items: () => Promise.all(validatedData.map((item) => transformItem(item))),
        metadata: () => generateMetadata(validatedData),
    })

    // Stage 3: Save data in parallel
    const saveTasks = transformResult.items.map((item) => () => saveItem(item))
    const savedData = yield* Task.all(saveTasks)

    return {
        items: savedData,
        metadata: transformResult.metadata,
    }
}

async function validateItem(item: any) {
    if (!item.id) throw new Error('Missing ID')
    return item
}

async function transformItem(item: any) {
    return { ...item, processed: true, timestamp: new Date() }
}

async function generateMetadata(data: any[]) {
    return {
        count: data.length,
        timestamp: new Date(),
        version: '1.0',
    }
}

async function saveItem(item: any) {
    // Simulate database save
    await new Promise((resolve) => setTimeout(resolve, 10))
    return { ...item, saved: true }
}

const data = [
    { id: '1', name: 'Item 1' },
    { id: '2', name: 'Item 2' },
    { id: '3', name: 'Item 3' },
]

const result = await Koka.run(dataPipeline(data))
console.log(result)
```

## Performance Considerations

### 1. Batch Processing with Objects

Process large datasets in batches:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* batchProcess(items: any[], batchSize = 10, maxConcurrency = 3) {
    const batches = []

    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize))
    }

    const batchTasks = batches.map((batch) => () => processBatch(batch))

    const results = yield* Task.concurrent(
        batchTasks,
        async (stream) => {
            const results = []
            for await (const { value } of stream) {
                results.push(...value)
            }
            return results
        },
        { maxConcurrency },
    )

    return results
}

async function processBatch(batch: any[]) {
    const result =
        yield *
        Task.object({
            items: () => Promise.all(batch.map((item) => processItem(item))),
            summary: () => generateBatchSummary(batch),
        })

    return result.items
}

async function processItem(item: any) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return { ...item, processed: true }
}

async function generateBatchSummary(batch: any[]) {
    return {
        count: batch.length,
        timestamp: new Date(),
    }
}

const largeDataset = Array.from({ length: 1000 }, (_, i) => ({ id: i, data: `item-${i}` }))
const result = await Koka.run(batchProcess(largeDataset, 50, 5))
console.log(`Processed ${result.length} items`)
```

### 2. Resource Management with Objects

Manage limited resources efficiently:

```typescript
import * as Koka from 'koka'
import * as Task from 'koka/task'
import * as Async from 'koka/async'

function* resourceAwareProcessing(tasks: Array<() => Promise<any>>, maxConcurrency = 5) {
    const results = yield* Task.concurrent(
        tasks,
        async (stream) => {
            const results = []
            for await (const { index, value } of stream) {
                results[index] = value
            }
            return results
        },
        { maxConcurrency },
    )

    return results
}

// Example with resource-intensive tasks
const resourceTasks = [
    () => heavyComputation('task-1'),
    () => heavyComputation('task-2'),
    () => heavyComputation('task-3'),
    () => heavyComputation('task-4'),
    () => heavyComputation('task-5'),
    () => heavyComputation('task-6'),
    () => heavyComputation('task-7'),
    () => heavyComputation('task-8'),
]

async function heavyComputation(taskId: string) {
    console.log(`Starting ${taskId}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    console.log(`Completed ${taskId}`)
    return { taskId, result: 'completed' }
}

const results = await Koka.run(resourceAwareProcessing(resourceTasks, 3))
console.log('All tasks completed:', results.length)
```

## Best Practices

### 1. Choose the Right Task API

```typescript
// ✅ Good: Use Task.object for structured data
const result =
    yield *
    Task.object({
        user: () => fetchUser(id),
        posts: () => fetchPosts(id),
        comments: () => fetchComments(id),
    })

// ✅ Good: Use Task.all for simple arrays
const results = yield * Task.all([() => fetchUser(id), () => fetchPosts(id)])

// ✅ Good: Use Task.tuple for fixed-length operations
const [user, posts] = yield * Task.tuple([() => fetchUser(id), () => fetchPosts(id)])

// ❌ Bad: Don't use Task.all for objects
const result =
    yield *
    Task.all({
        user: () => fetchUser(id),
        posts: () => fetchPosts(id),
    })
```

### 2. Handle Errors Gracefully

```typescript
// ✅ Good: Handle errors in task streams
const results =
    yield *
    Task.concurrent(tasks, async (stream) => {
        const results = []
        const errors = []

        for await (const { index, value } of stream) {
            try {
                results[index] = value
            } catch (error) {
                errors.push({ index, error })
            }
        }

        return { results, errors }
    })

// ❌ Bad: Let errors crash the entire operation
const results =
    yield *
    Task.concurrent(tasks, async (stream) => {
        const results = []
        for await (const { index, value } of stream) {
            results[index] = value // Will crash on first error
        }
        return results
    })
```

### 3. Use Appropriate Concurrency Levels

```typescript
// ✅ Good: Appropriate concurrency for the task type
const ioBoundTasks = yield * Task.concurrent(tasks, handler, { maxConcurrency: 10 })
const cpuBoundTasks = yield * Task.concurrent(tasks, handler, { maxConcurrency: 4 })

// ❌ Bad: Too much concurrency can overwhelm the system
const tooManyTasks = yield * Task.concurrent(tasks, handler, { maxConcurrency: 100 })
```

### 4. Prefer Task.object for Structured Data

```typescript
// ✅ Good: Use Task.object for named, structured data
const userProfile =
    yield *
    Task.object({
        user: () => fetchUser(id),
        posts: () => fetchPosts(id),
        comments: () => fetchComments(id),
        preferences: () => fetchPreferences(id),
    })

// ❌ Less ideal: Using Task.all for structured data
const [user, posts, comments, preferences] =
    yield * Task.all([() => fetchUser(id), () => fetchPosts(id), () => fetchComments(id), () => fetchPreferences(id)])
```

## Next Steps

Now that you understand task management, explore:

-   [Error Handling](./error-handling.md) - Combining tasks with error handling
-   [Context Management](./context-management.md) - Using context with concurrent operations
-   [Async Operations](./async-operations.md) - Advanced async patterns

Task effects provide powerful tools for managing concurrent operations with algebraic effects!
