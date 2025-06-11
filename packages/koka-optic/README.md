# koka-optic - Type-Safe Data Accessors

koka-optic provides composable, type-safe data access patterns built on algebraic effects. It enables:

-   **Bidirectional transformations**: Get and set values with type safety
-   **Optics patterns**: Lenses, prisms, and traversals for structured data
-   **Effect integration**: Works seamlessly with Koka effects

## Installation

```bash
npm install koka-optic
# or
yarn add koka-optic
# or
pnpm add koka-optic
```

## Core Concepts

### Root Optic

```typescript
import { Optic } from 'koka-optic'

// Create root optic for a type
const numberOptic = Optic.root<number>()

// Get value
const result = Eff.runResult(numberOptic.get(42))
// { type: 'ok', value: 42 }

// Set value
const setter = numberOptic.set(function* (n) {
    return n + 1
})
Eff.runResult(setter(42)) // 43
```

### Property Access

```typescript
const userOptic = Optic.root<{ name: string }>().prop('name')

// Get property
Eff.runResult(userOptic.get({ name: 'Alice' })) // 'Alice'

// Set property
const setName = userOptic.set(function* () {
    return 'Bob'
})
Eff.runResult(setName({ name: 'Alice' })) // { name: 'Bob' }
```

### Array Operations

```typescript
const todosOptic = Optic.root<Todo[]>()

// Access by index
const firstTodo = todosOptic.index(0)

// Find item
const importantTodo = todosOptic.find((todo) => todo.priority === 'high')

// Filter items
const completedTodos = todosOptic.filter((todo) => todo.completed)

// Map items
const todoTitles = todosOptic.map((todo) => todo.title)
```

### Type Refinement

```typescript
const numberOptic = Optic.root<string | number>().match((v): v is number => typeof v === 'number')

Eff.runResult(numberOptic.get(42)) // 42
Eff.runResult(numberOptic.get('test')) // Error
```

### Object Composition

```typescript
const userOptic = Optic.object({
    name: Optic.root<{ name: string }>().prop('name'),
    age: Optic.root<{ age: number }>().prop('age'),
})

Eff.runResult(userOptic.get({ name: 'Alice', age: 30 }))
// { name: 'Alice', age: 30 }
```

## Advanced Usage

### Complex Transformations

```typescript
const complexOptic = Optic.root<{ users: User[] }>()
    .prop('users')
    .filter((user) => user.active)
    .map({
        get: (user) => ({
            ...user,
            name: user.name.toUpperCase(),
        }),
        set: (user) => ({
            ...user,
            name: user.name.toLowerCase(),
        }),
    })

const result = Eff.runResult(
    complexOptic.get({
        users: [
            { name: 'Alice', active: true },
            { name: 'Bob', active: false },
        ],
    }),
)
// [{ name: 'ALICE', active: true }]
```

## API Reference

### Core Methods

-   `Optic.root<T>()`: Create root optic for type T
-   `prop(key)`: Access object property
-   `index(n)`: Access array index
-   `find(predicate)`: Find array item
-   `filter(predicate)`: Filter array
-   `map(transform)`: Transform values
-   `match(predicate)`: Type refinement
-   `refine(predicate)`: Value validation
-   `Optic.object(fields)`: Compose object optics
-   `Optic.optional(optic)`: Handle optional values

## Best Practices

1. **Compose optics** for complex data structures
2. **Combine with Koka effects** for async operations
3. **Leverage type system** for safety

## Contributing

1. Write tests for new features
2. Maintain type safety
3. Document changes
4. Follow existing patterns

## License

MIT
