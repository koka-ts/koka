import { Eff } from 'koka'
import { Store, Domain, Optic, get, set } from '../src/koka-ddd'

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

class UserStorageDomain<Root extends RootState> extends Domain<Root['users'], Root> {
    constructor() {
        super(Optic.root<Root>().prop('users'))
    }
    *getUser(id: string) {
        const users = yield* get(this)
        if (id in users) {
            return users[id]
        }
        throw yield* Eff.err('DomainErr').throw(`User ${id} not found`)
    }
    *addUser(user: UserEntity) {
        const users = yield* get(this)
        if (user.id in users) {
            throw yield* Eff.err('DomainErr').throw(`User ${user.id} exists`)
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
    constructor() {
        super(Optic.root<Root>().prop('orders'))
    }
    *getOrder(id: string) {
        const orders = yield* get(this)
        if (id in orders) {
            return orders[id]
        }
        throw yield* Eff.err('DomainErr').throw(`Order ${id} not found`)
    }
    *addOrder(order: OrderEntity) {
        const orders = yield* get(this)
        if (order.id in orders) {
            throw yield* Eff.err('DomainErr').throw(`Order ${order.id} exists`)
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
    constructor() {
        super(Optic.root<Root>().prop('products'))
    }
    *getProduct(id: string) {
        const products = yield* get(this)
        if (id in products) {
            return products[id]
        }
        throw yield* Eff.err('DomainErr').throw(`Product ${id} not found`)
    }
    *addProduct(product: ProductEntity) {
        const products = yield* get(this)
        if (product.id in products) {
            throw yield* Eff.err('DomainErr').throw(`Product ${product.id} exists`)
        }
        yield* set(this, { ...products, [product.id]: product })
    }
    *getCollectors(productId: string) {
        const product = yield* this.getProduct(productId)
        const users = [] as UserEntity[]
        for (const collectorId of product.collectorIds) {
            const user = yield* new UserStorageDomain().getUser(collectorId)
            users.push(user)
        }
        return users
    }
}

const userStorage = new UserStorageDomain()
const orderStorage = new OrderStorageDomain()
const productStorage = new ProductStorageDomain()

describe('Graph Domain Operations', () => {
    let store: Store<RootState>

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
    })

    describe('User Operations', () => {
        it('should get user', () => {
            const result = store.runCommand(userStorage.getUser('user1'))
            if (result.type === 'err') throw new Error('Expected user but got error')
            expect(result.value.name).toBe('John Doe')
        })

        it('should add user', () => {
            const newUser = {
                id: 'user2',
                name: 'Jane Doe',
                orderIds: [],
            }
            store.runCommand(userStorage.addUser(newUser))

            const result = store.runCommand(userStorage.getUser('user2'))
            if (result.type === 'err') throw new Error('Expected user but got error')
            expect(result.value.name).toBe('Jane Doe')
        })
    })

    describe('Order Operations', () => {
        it('should get order', () => {
            const result = store.runCommand(orderStorage.getOrder('order1'))
            if (result.type === 'err') throw new Error('Expected order but got error')
            expect(result.value.userId).toBe('user1')
        })

        it('should add product to order', () => {
            store.runCommand(
                productStorage.addProduct({
                    id: 'product2',
                    name: 'MacBook',
                    price: 1999,
                    collectorIds: [],
                }),
            )

            store.runCommand(orderStorage.addProduct('order1', 'product2'))

            const result = store.runCommand(orderStorage.getOrder('order1'))
            if (result.type === 'err') throw new Error('Expected order but got error')
            expect(result.value.productIds).toEqual(['product1', 'product2'])
        })
    })

    describe('Product Operations', () => {
        it('should get product', () => {
            const result = store.runCommand(productStorage.getProduct('product1'))
            if (result.type === 'err') throw new Error('Expected product but got error')
            expect(result.value.name).toBe('iPhone')
        })

        it('should get collectors', () => {
            const result = store.runCommand(productStorage.getCollectors('product1'))
            if (result.type === 'err') throw new Error('Expected collectors but got error')
            expect(result.value.length).toBe(1)
            expect(result.value[0].name).toBe('John Doe')
        })
    })

    describe('Graph Relationships', () => {
        it('should maintain user-order relationship', () => {
            store.runCommand(
                orderStorage.addOrder({
                    id: 'order2',
                    userId: 'user1',
                    productIds: [],
                }),
            )

            store.runCommand(userStorage.addOrder('user1', 'order2'))

            const userResult = store.runCommand(userStorage.getUser('user1'))
            if (userResult.type === 'err') throw new Error('Expected user but got error')
            expect(userResult.value.orderIds).toEqual(['order1', 'order2'])
        })
    })
})
