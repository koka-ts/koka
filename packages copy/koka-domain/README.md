# koka-domain - Domain Modeling with Effects

**Warning: This library is in early development and may change significantly. Do not use in production yet.**

Koka DDD provides a domain modeling framework built on Koka's algebraic effects system, featuring:

-   **Domain Modeling**: Type-safe domain definitions
-   **Store Pattern**: Centralized state management
-   **Command/Query Separation**: Clear distinction between writes and reads
-   **Effect Integration**: Seamless Koka effects usage
-   **Accessors Support**: Composable data access patterns

## Installation

```bash
npm install koka-domain
# or
yarn add koka-domain
# or
pnpm add koka-domain
```

## Core Concepts

### Domain Modeling

Define your domain using the `Domain` base class:

```typescript
import { Domain } from 'koka-domain'

class TodoDomain extends Domain<Todo> {
  text = new TextDomain(this.$prop('text'))
  done = new BoolDomain(this.$prop('done'))

  *updateText(newText: string) {
    yield* this.text.updateText(newText)
  }
}
```

### Store Pattern

Manage application state with the `Store` class:

```typescript
import { Store } from 'koka-domain'

const store = new Store({
    state: {
        todos: [],
        filter: 'all',
    },
})
```

### Commands and Queries

```typescript
// Query example
const todos = store.get(todoListDomain)

// Command example
store.runCommand(todoDomain.addTodo('New task'))
```

## Complete Todo App Example

```typescript
import { Domain, Store } from 'koka-domain'

// Define domains
class TodoDomain extends Domain<Todo> {
  text = new TextDomain(this.$prop('text'))
  done = new BoolDomain(this.$prop('done'))

  *toggle() {
    yield* this.done.toggle()
  }
}

class TodoListDomain extends Domain<Todo[]> {
  *addTodo(text: string) {
    const newTodo = { id: Date.now(), text, done: false }
    yield* set(this, todos => [...todos, newTodo])
  }

  todo(id: number) {
    return new TodoDomain(this.$find(todo => todo.id === id))
  }
}

// Create store
const store = new Store({
  state: {
    todos: []
  }
})

// Usage
store.runCommand(todoListDomain.addTodo('Learn Koka DDD'))
store.runCommand(todoListDomain.todo(1).toggle())
```

## Advanced Patterns

### Nested Domains

```typescript
class AppDomain extends Domain<AppState> {
    todos = new TodoListDomain(this.$prop('todos'))
    user = new UserDomain(this.$prop('user'))
}
```

### Async Operations

```typescript
*loadTodos() {
  const response = yield* Eff.await(fetch('/todos'))
  const todos = yield* Eff.await(response.json())
  yield* set(this, todos)
}
```

## Testing

Tests follow the same patterns as production code:

```typescript
test('should add todo', async () => {
    await store.runCommand(todos.addTodo('Test'))
    expect(store.getState().todos.length).toBe(1)
})
```

## API Reference

### Domain

-   `$prop()`: Create property accessor
-   `$find()`: Find item in collection
-   `$filter()`: Filter collection
-   `$map()`: Transform values

### Store

-   `get(domain)`: Query state
-   `runCommand(command)`: Execute state mutation
-   `subscribe(listener)`: React to changes

## Contributing

1. Ensure tests pass (`npm test`)
2. Update documentation
3. Follow existing patterns

## License

MIT
