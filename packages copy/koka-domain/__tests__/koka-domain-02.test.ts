import * as Err from 'koka/err'
import * as Result from 'koka/result'
import { Domain, Store, get, set } from '../src/koka-domain.ts'

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

class DomainErr extends Err.Err('DomainErr')<string> {}

class UserStorageDomain<Root extends RootState> extends Domain<Root['users'], Root> {
    *getUser(id: string) {
        const users = yield* get(this)
        if (id in users) {
            return users[id]
        }

        throw yield* Err.throw(new DomainErr(`User ${id} not found`))
    }
    *addUser(user: UserEntity) {
        const users = yield* get(this)
        if (user.id in users) {
            throw yield* Err.throw(new DomainErr(`User ${user.id} exists`))
        }
        yield* set(this, { ...users, [user.id]: user })
    }
    *addOrder(userId: string, orderId: string) {
        const user = yield* this.getUser(userId)
        yield* set(this, {
            ...(yield* get(this)),
            [userId]: {
                ...user,
                orderIds: [...user.orderIds, orderId],
            },
        })
    }
}

class OrderStorageDomain<Root extends RootState> extends Domain<Root['orders'], Root> {
    *getOrder(id: string) {
        const orders = yield* get(this)
        if (id in orders) {
            return orders[id]
        }
        throw yield* Err.throw(new DomainErr(`Order ${id} not found`))
    }
    *addOrder(order: OrderEntity) {
        const orders = yield* get(this)
        if (order.id in orders) {
            throw yield* Err.throw(new DomainErr(`Order ${order.id} exists`))
        }
        yield* set(this, { ...orders, [order.id]: order })
    }
    *addProduct(orderId: string, productId: string) {
        const order = yield* this.getOrder(orderId)
        yield* set(this, {
            ...(yield* get(this)),
            [orderId]: {
                ...order,
                productIds: [...order.productIds, productId],
            },
        })
    }
}

class ProductStorageDomain<Root extends RootState> extends Domain<Root['products'], Root> {
    *getProduct(id: string) {
        const products = yield* get(this)
        if (id in products) {
            return products[id]
        }
        throw yield* Err.throw(new DomainErr(`Product ${id} not found`))
    }
    *addProduct(product: ProductEntity) {
        const products = yield* get(this)
        if (product.id in products) {
            throw yield* Err.throw(new DomainErr(`Product ${product.id} exists`))
        }
        yield* set(this, { ...products, [product.id]: product })
    }
    *getCollectors(productId: string) {
        const product = yield* this.getProduct(productId)
        const users = [] as UserEntity[]
        for (const collectorId of product.collectorIds) {
            const user = yield* new UserStorageDomain(this.store.domain.prop('users')).getUser(collectorId)
            users.push(user)
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

        userStorage = new UserStorageDomain(store.domain.prop('users'))
        orderStorage = new OrderStorageDomain(store.domain.prop('orders'))
        productStorage = new ProductStorageDomain(store.domain.prop('products'))
    })

    describe('User Operations', () => {
        it('should get user', () => {
            const result = Result.runSync(userStorage.getUser('user1'))
            if (result.type === 'err') throw new Error('Expected user but got error')
            expect(result.value.name).toBe('John Doe')
        })

        it('should add user', () => {
            const newUser = {
                id: 'user2',
                name: 'Jane Doe',
                orderIds: [],
            }
            Result.runSync(userStorage.addUser(newUser))

            const result = Result.runSync(userStorage.getUser('user2'))
            if (result.type === 'err') throw new Error('Expected user but got error')
            expect(result.value.name).toBe('Jane Doe')
        })
    })

    describe('Order Operations', () => {
        it('should get order', () => {
            const result = Result.runSync(orderStorage.getOrder('order1'))
            if (result.type === 'err') throw new Error('Expected order but got error')
            expect(result.value.userId).toBe('user1')
        })

        it('should add product to order', () => {
            Result.runSync(
                productStorage.addProduct({
                    id: 'product2',
                    name: 'MacBook',
                    price: 1999,
                    collectorIds: [],
                }),
            )

            Result.runSync(orderStorage.addProduct('order1', 'product2'))

            const result = Result.runSync(orderStorage.getOrder('order1'))
            if (result.type === 'err') throw new Error('Expected order but got error')
            expect(result.value.productIds).toEqual(['product1', 'product2'])
        })
    })

    describe('Product Operations', () => {
        it('should get product', () => {
            const result = Result.runSync(productStorage.getProduct('product1'))
            if (result.type === 'err') throw new Error('Expected product but got error')
            expect(result.value.name).toBe('iPhone')
        })

        it('should get collectors', () => {
            const result = Result.runSync(productStorage.getCollectors('product1'))
            if (result.type === 'err') throw new Error('Expected collectors but got error')
            expect(result.value.length).toBe(1)
            expect(result.value[0].name).toBe('John Doe')
        })
    })

    describe('Graph Relationships', () => {
        it('should maintain user-order relationship', () => {
            Result.runSync(
                orderStorage.addOrder({
                    id: 'order2',
                    userId: 'user1',
                    productIds: [],
                }),
            )

            Result.runSync(userStorage.addOrder('user1', 'order2'))

            const userResult = Result.runSync(userStorage.getUser('user1'))
            if (userResult.type === 'err') throw new Error('Expected user but got error')
            expect(userResult.value.orderIds).toEqual(['order1', 'order2'])
        })
    })
})
