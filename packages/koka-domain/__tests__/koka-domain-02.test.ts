import { Domain, Store, command, query, get, set } from '../src/koka-domain.ts'

type UserEntity = {
    id: string
    name: string
    orderIds: string[]
}

type OrderEntity = {
    id: string
    userId: string
    productIds: string[]
}

type ProductEntity = {
    id: string
    name: string
    price: number
    collectorIds: string[]
}

type RootState = {
    users: Record<string, UserEntity>
    orders: Record<string, OrderEntity>
    products: Record<string, ProductEntity>
}

type DomainErrResult = { type: 'err'; name: 'DomainErr'; error: string }

class UserStorageDomain<Root extends RootState> extends Domain<Root['users'], Root> {
    @query()
    *getUser(id: string): Generator<unknown, UserEntity | DomainErrResult, unknown> {
        const users = yield* get(this)
        if (id in users) return users[id]
        return { type: 'err', name: 'DomainErr', error: `User ${id} not found` }
    }

    @command()
    *addUser(user: UserEntity): Generator<unknown, void | DomainErrResult, unknown> {
        const users = yield* get(this)
        if (user.id in users) {
            return { type: 'err', name: 'DomainErr', error: `User ${user.id} exists` }
        }
        yield* set(this as Domain<Root['users'], Root>, { ...users, [user.id]: user })
    }

    @command()
    *addOrder(userId: string, orderId: string): Generator<unknown, void | DomainErrResult, unknown> {
        const userResult = (yield* (this as any).getUser(userId)) as UserEntity | DomainErrResult
        if (typeof userResult === 'object' && 'type' in userResult && userResult.type === 'err') return userResult
        const user = userResult as UserEntity
        const users = yield* get(this)
        yield* set(this as Domain<Root['users'], Root>, {
            ...users,
            [userId]: { ...user, orderIds: [...user.orderIds, orderId] },
        })
    }
}

class OrderStorageDomain<Root extends RootState> extends Domain<Root['orders'], Root> {
    @query()
    *getOrder(id: string): Generator<unknown, OrderEntity | DomainErrResult, unknown> {
        const orders = yield* get(this)
        if (id in orders) return orders[id]
        return { type: 'err', name: 'DomainErr', error: `Order ${id} not found` }
    }

    @command()
    *addOrder(order: OrderEntity): Generator<unknown, void | DomainErrResult, unknown> {
        const orders = yield* get(this)
        if (order.id in orders) {
            return { type: 'err', name: 'DomainErr', error: `Order ${order.id} exists` }
        }
        yield* set(this as Domain<Root['orders'], Root>, { ...orders, [order.id]: order })
    }

    @command()
    *addProduct(orderId: string, productId: string): Generator<unknown, void | DomainErrResult, unknown> {
        const orderResult = (yield* (this as any).getOrder(orderId)) as OrderEntity | DomainErrResult
        if (typeof orderResult === 'object' && 'type' in orderResult && orderResult.type === 'err') return orderResult
        const order = orderResult as OrderEntity
        const orders = yield* get(this)
        yield* set(this as Domain<Root['orders'], Root>, {
            ...orders,
            [orderId]: { ...order, productIds: [...order.productIds, productId] },
        })
    }
}

class ProductStorageDomain<Root extends RootState> extends Domain<Root['products'], Root> {
    @query()
    *getProduct(id: string): Generator<unknown, ProductEntity | DomainErrResult, unknown> {
        const products = yield* get(this)
        if (id in products) return products[id]
        return { type: 'err', name: 'DomainErr', error: `Product ${id} not found` }
    }

    @command()
    *addProduct(product: ProductEntity): Generator<unknown, void | DomainErrResult, unknown> {
        const products = yield* get(this)
        if (product.id in products) {
            return { type: 'err', name: 'DomainErr', error: `Product ${product.id} exists` }
        }
        yield* set(this as Domain<Root['products'], Root>, { ...products, [product.id]: product })
    }

    @query()
    *getCollectors(productId: string): Generator<unknown, UserEntity[] | DomainErrResult, unknown> {
        const productResult = (yield* (this as any).getProduct(productId)) as ProductEntity | DomainErrResult
        if (typeof productResult === 'object' && 'type' in productResult && productResult.type === 'err')
            return productResult
        const product = productResult as ProductEntity
        const userStorage = this.store.domain.select('users').use(UserStorageDomain)
        const users: UserEntity[] = []
        for (const collectorId of product.collectorIds) {
            const u = (yield* (userStorage as any).getUser(collectorId)) as UserEntity | DomainErrResult
            if (typeof u === 'object' && 'type' in u && u.type === 'err') return u
            users.push(u as UserEntity)
        }
        return users
    }
}

describe('Graph Domain Operations', () => {
    let store: Store<RootState>
    let userStorage: UserStorageDomain<RootState>
    let orderStorage: OrderStorageDomain<RootState>
    let productStorage: ProductStorageDomain<RootState>

    beforeEach(() => {
        const initialState: RootState = {
            users: {
                user1: {
                    id: 'user1',
                    name: 'John Doe',
                    orderIds: ['order1'],
                },
            },
            orders: {
                order1: {
                    id: 'order1',
                    userId: 'user1',
                    productIds: ['product1'],
                },
            },
            products: {
                product1: {
                    id: 'product1',
                    name: 'iPhone',
                    price: 999,
                    collectorIds: ['user1'],
                },
            },
        }
        store = new Store<RootState>({ state: initialState })
        userStorage = store.domain.select('users').use(UserStorageDomain) as UserStorageDomain<RootState>
        orderStorage = store.domain.select('orders').use(OrderStorageDomain) as OrderStorageDomain<RootState>
        productStorage = store.domain.select('products').use(ProductStorageDomain) as ProductStorageDomain<RootState>
    })

    describe('User Operations', () => {
        it('should get user', () => {
            const result = store.runQuery((userStorage as any).getUser('user1'))
            if (
                result != null &&
                typeof result === 'object' &&
                'type' in result &&
                (result as DomainErrResult).type === 'err'
            )
                throw new Error('Expected user but got error')
            expect((result as UserEntity).name).toBe('John Doe')
        })

        it('should add user', () => {
            const newUser = { id: 'user2', name: 'Jane Doe', orderIds: [] }
            store.runCommand((userStorage as any).addUser(newUser))

            const result = store.runQuery((userStorage as any).getUser('user2'))
            if (
                result != null &&
                typeof result === 'object' &&
                'type' in result &&
                (result as DomainErrResult).type === 'err'
            )
                throw new Error('Expected user but got error')
            expect((result as UserEntity).name).toBe('Jane Doe')
        })
    })

    describe('Order Operations', () => {
        it('should get order', () => {
            const result = store.runQuery((orderStorage as any).getOrder('order1'))
            if (
                result != null &&
                typeof result === 'object' &&
                'type' in result &&
                (result as DomainErrResult).type === 'err'
            )
                throw new Error('Expected order but got error')
            expect((result as OrderEntity).userId).toBe('user1')
        })

        it('should add product to order', () => {
            store.runCommand(
                (productStorage as any).addProduct({
                    id: 'product2',
                    name: 'MacBook',
                    price: 1999,
                    collectorIds: [],
                }),
            )

            store.runCommand((orderStorage as any).addProduct('order1', 'product2'))

            const result = store.runQuery((orderStorage as any).getOrder('order1'))
            if (
                result != null &&
                typeof result === 'object' &&
                'type' in result &&
                (result as DomainErrResult).type === 'err'
            )
                throw new Error('Expected order but got error')
            expect((result as OrderEntity).productIds).toEqual(['product1', 'product2'])
        })
    })

    describe('Product Operations', () => {
        it('should get product', () => {
            const result = store.runQuery((productStorage as any).getProduct('product1'))
            if (
                result != null &&
                typeof result === 'object' &&
                'type' in result &&
                (result as DomainErrResult).type === 'err'
            )
                throw new Error('Expected product but got error')
            expect((result as ProductEntity).name).toBe('iPhone')
        })

        it('should get collectors', () => {
            const result = store.runQuery((productStorage as any).getCollectors('product1'))
            if (
                result != null &&
                typeof result === 'object' &&
                'type' in result &&
                (result as DomainErrResult).type === 'err'
            )
                throw new Error('Expected collectors but got error')
            expect((result as UserEntity[]).length).toBe(1)
            expect((result as UserEntity[])[0].name).toBe('John Doe')
        })
    })

    describe('Graph Relationships', () => {
        it('should maintain user-order relationship', () => {
            store.runCommand(
                (orderStorage as any).addOrder({
                    id: 'order2',
                    userId: 'user1',
                    productIds: [],
                }),
            )

            store.runCommand((userStorage as any).addOrder('user1', 'order2'))

            const userResult = store.runQuery((userStorage as any).getUser('user1'))
            if (
                userResult != null &&
                typeof userResult === 'object' &&
                'type' in userResult &&
                (userResult as DomainErrResult).type === 'err'
            )
                throw new Error('Expected user but got error')
            expect((userResult as UserEntity).orderIds).toEqual(['order1', 'order2'])
        })
    })
})
