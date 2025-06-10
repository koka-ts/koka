# koka-domain - Type-Safe Data Accessors

koka-domain provides composable, type-safe data access patterns built on algebraic effects. It enables:

-   **Bidirectional transformations**: Get and set values with type safety
-   **Optics patterns**: Lenses, prisms, and traversals for structured data
-   **Domain modeling**: Structured data access patterns
-   **Effect integration**: Works seamlessly with Koka effects

## Installation

```bash
npm install koka-domain
# or
yarn add koka-domain
# or
pnpm add koka-domain
```

## Core Concepts

### Root Domain

```typescript
import { Domain } from 'koka-domain'

// Create root domain for a type
const numberDomain = Domain.root<number>()

// Get value
const result = Eff.runResult(numberDomain.get(42))
// { type: 'ok', value: 42 }

// Set value
const setter = numberDomain.set(function* (n) {
    return n + 1
})
Eff.runResult(setter(42)) // 43
```

### Property Access

```typescript
const userDomain = Domain.root<{ name: string }>().$prop('name')

// Get property
Eff.runResult(userDomain.get({ name: 'Alice' })) // 'Alice'

// Set property
const setName = userDomain.set(function* () {
    return 'Bob'
})
Eff.runResult(setName({ name: 'Alice' })) // { name: 'Bob' }
```

### Array Operations

```typescript
const todosDomain = Domain.root<Todo[]>()

// Access by index
const firstTodo = todosDomain.$index(0)

// Find item
const importantTodo = todosDomain.$find((todo) => todo.priority === 'high')

// Filter items
const completedTodos = todosDomain.$filter((todo) => todo.completed)

// Map items
const todoTitles = todosDomain.$map((todo) => todo.title)
```

### Type Refinement

```typescript
const numberDomain = Domain.root<string | number>().$match((v): v is number => typeof v === 'number')

Eff.runResult(numberDomain.get(42)) // 42
Eff.runResult(numberDomain.get('test')) // Error
```

### Object Composition

```typescript
const userDomain = Domain.object({
    name: Domain.root<{ name: string }>().$prop('name'),
    age: Domain.root<{ age: number }>().$prop('age'),
})

Eff.runResult(userDomain.get({ name: 'Alice', age: 30 }))
// { name: 'Alice', age: 30 }
```

## Advanced Usage

### Complex Transformations

```typescript
const complexDomain = Domain.root<{ users: User[] }>()
    .$prop('users')
    .$filter((user) => user.active)
    .$map({
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
    complexDomain.get({
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

-   `Domain.root<T>()`: Create root domain for type T
-   `$prop(key)`: Access object property
-   `$index(n)`: Access array index
-   `$find(predicate)`: Find array item
-   `$filter(predicate)`: Filter array
-   `$map(transform)`: Transform values
-   `$match(predicate)`: Type refinement
-   `$refine(predicate)`: Value validation
-   `Domain.object(fields)`: Compose object domains
-   `Domain.optional(domain)`: Handle optional values

## Best Practices

1. **Compose domains** for complex data structures
2. **Combine with Koka effects** for async operations
3. **Leverage type system** for safety

## Contributing

1. Write tests for new features
2. Maintain type safety
3. Document changes
4. Follow existing patterns

## License

MIT
