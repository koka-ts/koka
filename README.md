# Koka - AI-Oriented TypeScript Framework

Koka is a monorepo containing several packages that provide algebraic effects and domain-driven development capabilities for TypeScript applications.

## Packages

### [koka](packages/koka/) - Core Effects Library

A lightweight 3kB alternative to Effect-TS based on Algebraic Effects

-   Typed error handling
-   Context management
-   Async operations
-   Minimal API surface

### [koka-ddd](packages/koka-ddd/) - DDD Framework

An AI-Oriented Domain-Driven Design framework built on Koka

-   Algebraic effects for domain modeling
-   Optics integration
-   CQRS patterns

### [koka-domain](packages/koka-domain) - Data Accessors

Bidirectional data accessors with optics

-   Type-safe data transformations
-   Lens/prism support
-   Effectful data operations
-   Composable access patterns

## Documentation

-   [Koka Core Documentation](packages/koka/README.md)
-   [Koka DDD Documentation](packages/koka-ddd/README.md)
-   [Koka Domain Documentation](packages/koka-domain/README.md)

## Contributing

We welcome contributions! Please see our [Contribution Guidelines](CONTRIBUTING.md).

## License

MIT
