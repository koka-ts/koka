# koka-accessor - Get/Set Immutable Data Made Easy

**Warning: This library is in early development and may change significantly. Do not use in production yet.**

koka-accessor makes working with immutable data structures effortless, providing a simple and type-safe way to:

-   **Get** deeply nested values
-   **Set** values without mutating original data
-   **Transform** complex data structures with ease

Built on composable accessors with full TypeScript type safety and seamless Koka effects integration.

## Motivation

Working with immutable data in JavaScript/TypeScript often leads to verbose code like:

```typescript
const newState = {
    ...state,
    user: {
        ...state.user,
        profile: {
            ...state.user.profile,
            name: 'New Name',
        },
    },
}
```

koka-accessor simplifies this to:

```typescript
const nameAccessor = Accessor.root<User>().prop('user').prop('profile').prop('name')

const updateName = Accessor.set(state, nameAccessor, 'New Name')

const result = Eff.runResult(updateName) // { user: { profile: { name: 'New Name' } } }
```

### Why koka-accessor?

-   🚀 **Simpler immutable updates** - No more spread operator hell
-   🔍 **Type-safe access** - Catch errors at compile time
-   🧩 **Composable operations** - Build complex transformations from simple parts
-   ⚡ **Performance optimized** - Automatic caching for repeated accesses

## Features

-   **Effortless immutable updates**: Modify nested data without mutation
-   **Type-safe accessors**: Compile-time checking for all operations
-   **Composable API**: Chain operations naturally
-   **Smart caching**: Optimized performance for repeated accesses
-   **Koka integration**: Works seamlessly with effects system
-   **Proxy syntax**: Access nested properties with native dot/array notation

## Installation

```bash
npm install koka koka-accessor
# or
yarn add koka koka-accessor
# or
pnpm add koka koka-accessor
```

## Getting Started

### Core Concepts

An **Accessor** is a bidirectional path into your data structure that lets you:

1. **Get** values (like a getter)
2. **Set** values (like a setter)
3. **Transform** values (like a mapper)

All while preserving immutability and type safety.

```typescript
import { Eff } from 'koka'
import { Accessor } from 'koka-accessor'

// Create root accessor
const root = Accessor.root<number>()

// Create object property accessor
const nameAccessor = Accessor.root<{ name: string }>().prop('name')

// Create array index accessor
const firstItemAccessor = Accessor.root<number[]>().index(0)
```

## Basic Usage

### Getting Values

```typescript
const valueResult = Eff.runResult(Accessor.get({ name: 'Alice' }, nameAccessor))
if (valueResult.type === 'ok') {
    const value = valueResult.value // 'Alice'
}

const firstResult = Eff.runResult(Accessor.get([1, 2, 3], firstItemAccessor))
if (firstResult.type === 'ok') {
    const first = firstResult.value // 1
}
```

### Setting Values

```typescript
// Set with value
const updatedResult = Eff.runResult(Accessor.set({ name: 'Alice' }, nameAccessor, 'Bob'))
if (updatedResult.type === 'ok') {
    const updated = updatedResult.value // {name: 'Bob'}
}

// Set with updater function
const incrementedResult = Eff.runResult(Accessor.set([1, 2, 3], firstItemAccessor, (n) => n + 1))
if (incrementedResult.type === 'ok') {
    const incremented = incrementedResult.value // [2, 2, 3]
}
```

## Advanced Accessors

### Proxy Syntax

Access nested properties using familiar dot/array notation:

```typescript
// Simple property access
const simpleAccessor = Accessor.root<{ a: number }>().proxy(p => p.a)
const result = Eff.runResult(Accessor.get({ a: 42 }, simpleAccessor))
// result.value === 42

// Array index access
const arrayAccessor = Accessor.root<number[]>().proxy(p => p[0])
const result = Eff.runResult(Accessor.get([42], arrayAccessor))
// result.value === 42

// Chained operations
const chainedAccessor = Accessor.root<{ items: { value: number }[] }>()
  .proxy(p => p.items[0].value)
const result = Eff.runResult(Accessor.get({ items: [{ value: 42 }] }, chainedAccessor))
// result.value === 42

// Deeply nested access
type ComplexState = {
  a: {
    b: {
      c: {
        e: {
          f: {
            g: { h: string }[]
          }
        }
      }[]
    }
  }
}

const deepAccessor = Accessor.root<ComplexState>().proxy(p => p.a.b.c[1].e.f.g[2].h)

const state = {
  a: {
    b: {
      c: [
        { e: { f: { g: [{ h: 'first' }] } },
        { e: { f: { g: [{ h: 'second' }, { h: 'third' }, { h: 'target' }] } }
      ]
    }
  }
}

const result = Eff.runResult(Accessor.get(state, deepAccessor))
// result.value === 'target'
```

### Object Composition

```typescript
const userAccessor = Accessor.object({
    name: Accessor.root<User>().prop('name'),
    age: Accessor.root<User>().prop('age'),
})

const user = {
    name: 'Alice',
    age: 30,
    email: 'alice@example.com',
}

const result = Eff.runResult(Accessor.get(user, userAccessor))
if (result.type === 'ok') {
    const value = result.value // {name: 'Alice', age: 30}
}
```

### Array Operations

```typescript
// Find item
const foundResult = Eff.runResult(
    Accessor.get(
        [1, 2, 3, 4],
        Accessor.root<number[]>().find((n) => n > 2),
    ),
)
if (foundResult.type === 'ok') {
    const found = foundResult.value // 3
}

// Filter items
const filteredResult = Eff.runResult(
    Accessor.get(
        [1, 2, 3, 4],
        Accessor.root<number[]>().filter((n) => n % 2 === 0),
    ),
)
if (filteredResult.type === 'ok') {
    const filtered = filteredResult.value // [2, 4]
}

// Map items
const mappedResult = Eff.runResult(
    Accessor.get(
        [1, 2, 3],
        Accessor.root<number[]>().map((n) => n * 2),
    ),
)
if (mappedResult.type === 'ok') {
    const mapped = mappedResult.value // [2, 4, 6]
}
```

### Type Narrowing and Value Validation

#### Type Narrowing with `match`

```typescript
const numberAccessor = Accessor.root<string | number>().match((v): v is number => typeof v === 'number')

const numberResult = Eff.runResult(Accessor.get(42, numberAccessor))
if (numberResult.type === 'ok') {
    const value = numberResult.value // 42
}

const stringResult = Eff.runResult(Accessor.get('test', numberAccessor))
if (stringResult.type === 'err') {
    // throws AccessorErr
}
```

#### Value Validation with `refine`

```typescript
const refinedAccessor = Accessor.root<number>().refine((n) => n > 0)

const positiveResult = Eff.runResult(Accessor.get(42, refinedAccessor))

if (positiveResult.type === 'ok') {
    const value = positiveResult.value // 42
}

const negativeResult = Eff.runResult(Accessor.get(-1, refinedAccessor))

if (negativeResult.type === 'err') {
    // throws AccessorErr
}
```

## Caching Behavior

koka-accessor automatically caches accessor computations for better performance:

```typescript
const user = { name: 'Alice', age: 30 }
const nameAccessor = Accessor.root<User>().prop('name')

// First access - computes and caches
const name1Result = Eff.runResult(Accessor.get(user, nameAccessor))
const name2Result = Eff.runResult(Accessor.get(user, nameAccessor))

if (name1Result.type === 'ok' && name2Result.type === 'ok') {
    const name1 = name1Result.value
    const name2 = name2Result.value
    name1 === name2 // true
}
```

Caching works for all accessor types including:

-   Object properties
-   Array indices
-   Find operations
-   Filter operations
-   Map operations
-   Type refinements

## Error Handling

All operations can throw `AccessorErr`:

```typescript
const result = Eff.runResult(Accessor.get([], Accessor.root<number[]>().index(0)))
if (result.type === 'err') {
    console.error('Accessor error:', result.error.message)
}
```

Common error cases:

-   Accessing non-existent array indices
-   Failed find/filter operations
-   Type refinement failures
-   Invalid updates

## API Reference

### Static Methods

| Method                                         | Description                     |
| ---------------------------------------------- | ------------------------------- |
| `Accessor.root<T>()`                           | Create root accessor for type T |
| `Accessor.object(fields)`                      | Compose object accessors        |
| `Accessor.optional(accessor)`                  | Create optional accessor        |
| `Accessor.get(root, accessor)`                 | Get value through accessor      |
| `Accessor.set(root, accessor, valueOrUpdater)` | Set value through accessor      |

### Instance Methods

| Method              | Description            |
| ------------------- | ---------------------- |
| `prop(key)`         | Access object property |
| `index(n)`          | Access array index     |
| `find(predicate)`   | Find array item        |
| `filter(predicate)` | Filter array           |
| `map(transform)`    | Transform values       |
| `match(predicate)`  | Type narrow            |
| `refine(predicate)` | Value validation       |
| `select(selector)`  | Custom selector        |
| `proxy(selector)`   | Proxy access           |

## Best Practices

1. **Compose accessors** to build complex data access patterns
2. **Reuse accessors** to benefit from caching
3. **Combine with effects** for async operations
4. **Handle errors** for robust code
5. **Leverage TypeScript** for maximum type safety

## Examples

See the [test cases](packages/koka-accessor/__tests__/koka-accessor.test.ts) for more comprehensive usage examples.

## License

MIT

## Contributing

Contributions are welcome!
