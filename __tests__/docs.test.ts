import { AnyEff, Eff } from '../src/koka'

describe('Koka Documentation Examples - Tutorial Section', () => {
    it('Your First Koka Program', () => {
        function* greet(name: string) {
            if (!name) {
                yield* Eff.err('ValidationError').throw('Name is required')
            }
            return `Hello, ${name}!`
        }
        const result = Eff.run(
            Eff.try(greet('World')).handle({
                ValidationError: (error) => `Error: ${error}`,
            }),
        )
        expect(result).toBe('Hello, World!')
        const result2 = Eff.run(
            Eff.try(greet('')).handle({
                ValidationError: (error) => `Error: ${error}`,
            }),
        )
        expect(result2).toBe('Error: Name is required')
    })

    it('Error Handling Basics', () => {
        function* divide(a: number, b: number) {
            if (b === 0) {
                yield* Eff.err('DivisionByZero').throw('Cannot divide by zero')
            }
            return a / b
        }
        const result = Eff.run(
            Eff.try(divide(10, 0)).handle({
                DivisionByZero: (error) => {
                    return null
                },
            }),
        )
        expect(result).toBe(null)
    })

    it('Error Propagation', () => {
        function* divide(a: number, b: number) {
            if (b === 0) {
                yield* Eff.err('DivisionByZero').throw('Cannot divide by zero')
            }
            return a / b
        }
        function* calculate(a: number, b: number) {
            const result = yield* divide(a, b)
            return result * 2
        }
        function* main() {
            const result = yield* calculate(10, 0)
            return result
        }
        const result = Eff.run(
            Eff.try(main()).handle({
                DivisionByZero: (error) => `Handled: ${error}`,
            }),
        )
        expect(result).toBe('Handled: Cannot divide by zero')
    })

    it('Context Management', () => {
        function* getUserInfo() {
            const userId = yield* Eff.ctx('UserId').get<string>()
            const apiKey = yield* Eff.ctx('ApiKey').get<string>()
            return `User ${userId} with API key ${apiKey.slice(0, 5)}...`
        }
        const result = Eff.run(
            Eff.try(getUserInfo()).handle({
                UserId: '12345',
                ApiKey: 'secret-api-key-123',
            }),
        )
        expect(result).toBe('User 12345 with API key secre...')
    })

    it('Optional Context', () => {
        function* getUserPreferences() {
            const theme = yield* Eff.ctx('Theme').opt<string>()
            const fontSize = yield* Eff.ctx('FontSize').opt<number>()
            return {
                theme: theme ?? 'light',
                fontSize: fontSize ?? 14,
            }
        }
        const result = Eff.run(getUserPreferences())
        expect(result).toEqual({ theme: 'light', fontSize: 14 })
        const result2 = Eff.run(
            Eff.try(getUserPreferences()).handle({
                Theme: 'dark',
            }),
        )
        expect(result2).toEqual({ theme: 'dark', fontSize: 14 })
    })
})

describe('Koka Documentation Examples - How-to Guides Section', () => {
    it('Handle Specific Error Types', () => {
        // Define custom error types
        class UserNotFound extends Eff.Err('UserNotFound')<string> {}
        class ValidationError extends Eff.Err('ValidationError')<{ field: string; message: string }> {}
        class DatabaseError extends Eff.Err('DatabaseError')<{ code: string; details: string }> {}

        // Mock fetchUserFromDatabase function
        const fetchUserFromDatabase = (userId: string) => {
            if (userId === '999') return null
            if (userId === 'error') throw new Error('Database connection failed')
            return { id: userId, name: 'John Doe' }
        }

        // Use in functions
        function* getUser(userId: string) {
            if (!userId) {
                yield* Eff.throw(new ValidationError({ field: 'userId', message: 'Required' }))
            }

            try {
                const user = fetchUserFromDatabase(userId)
                if (!user) {
                    yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
                }
                return user
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                yield* Eff.throw(new DatabaseError({ code: 'FETCH_FAILED', details: errorMessage }))
            }
        }

        // Handle specific errors
        const result = Eff.run(
            Eff.try(getUser('123')).handle({
                UserNotFound: (error: string) => ({ status: 404, message: error }),
                ValidationError: (error: { field: string; message: string }) => ({
                    status: 400,
                    message: `${error.field}: ${error.message}`,
                }),
                DatabaseError: (error: { code: string; details: string }) => ({
                    status: 500,
                    message: `Database error: ${error.code}`,
                }),
            }),
        )

        expect(result).toEqual({ id: '123', name: 'John Doe' })

        // Test user not found
        const result2 = Eff.run(
            Eff.try(getUser('999')).handle({
                UserNotFound: (error: string) => ({ status: 404, message: error }),
                ValidationError: (error: { field: string; message: string }) => ({
                    status: 400,
                    message: `${error.field}: ${error.message}`,
                }),
                DatabaseError: (error: { code: string; details: string }) => ({
                    status: 500,
                    message: `Database error: ${error.code}`,
                }),
            }),
        )

        expect(result2).toEqual({ status: 404, message: 'User 999 not found' })
    })

    it('Create Error Handling Middleware', () => {
        // Create generic error handling function
        function createErrorHandler<T>(handlers: {
            UserNotFound?: (error: string) => T
            ValidationError?: (error: { field: string; message: string }) => T
            DatabaseError?: (error: { code: string; details: string }) => T
        }) {
            return handlers
        }

        // Use middleware
        const errorHandler = createErrorHandler({
            UserNotFound: (error) => ({ type: 'not_found', message: error }),
            ValidationError: (error) => ({ type: 'validation_error', field: error.field, message: error.message }),
            DatabaseError: (error) => ({ type: 'database_error', message: error.code }),
        })

        class UserNotFound extends Eff.Err('UserNotFound')<string> {}

        function* testUser() {
            yield* Eff.throw(new UserNotFound('User not found'))
        }

        const result = Eff.run(Eff.try(testUser()).handle(errorHandler))
        expect(result).toEqual({ type: 'not_found', message: 'User not found' })
    })

    it('Execute Multiple Effects in Parallel', async () => {
        // Fetch user and orders data in parallel
        function* getUserAndOrders(userId: string) {
            const [user, orders] = yield* Eff.combine([
                function* () {
                    yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 10)))
                    return { id: userId, name: 'John Doe' }
                },
                function* () {
                    yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 15)))
                    return [{ id: '1', userId }]
                },
            ])
            return { user, orders }
        }

        const result = await Eff.run(getUserAndOrders('123'))

        expect(result).toEqual({
            user: { id: '123', name: 'John Doe' },
            orders: [{ id: '1', userId: '123' }],
        })
    })

    it('Combine Object Effects', async () => {
        // Combine multiple effects in an object
        function* createUserProfile(userData: any) {
            const result = yield* Eff.combine({
                user: function* () {
                    yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 10)))
                    return { id: '123', ...userData }
                },
                profile: function* () {
                    yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 10)))
                    return { profileId: '456', ...userData.profile }
                },
                settings: function* () {
                    yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 10)))
                    return { theme: 'light', fontSize: 14 }
                },
                avatar: function* () {
                    yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 10)))
                    return { avatarUrl: 'https://example.com/avatar.jpg' }
                },
            })
            return result
        }

        // Run combined effects
        const profile = await Eff.run(
            createUserProfile({ name: 'John', profile: { bio: 'Hello' }, avatar: 'data:image/jpeg' }),
        )

        expect(profile).toEqual({
            user: { id: '123', name: 'John', profile: { bio: 'Hello' }, avatar: 'data:image/jpeg' },
            profile: { profileId: '456', bio: 'Hello' },
            settings: { theme: 'light', fontSize: 14 },
            avatar: { avatarUrl: 'https://example.com/avatar.jpg' },
        })
    })

    it('Design-First Approach - Predefined Effect Types', () => {
        // Predefine error effects
        class UserNotFound extends Eff.Err('UserNotFound')<string> {}
        class ValidationError extends Eff.Err('ValidationError')<{ field: string; message: string }> {}

        // Predefine context effects
        class DatabaseConnection extends Eff.Ctx('Database')<{ query: (sql: string) => any }> {}
        class Logger extends Eff.Opt('Logger')<(level: string, message: string) => void> {}

        // Use predefined effects
        function* getUser(userId: string) {
            const logger = yield* Eff.get(Logger)
            const db = yield* Eff.get(DatabaseConnection)

            logger?.('info', `Fetching user ${userId}`)

            if (!userId) {
                yield* Eff.throw(new ValidationError({ field: 'userId', message: 'Required' }))
            }

            const user = db.query(`SELECT * FROM users WHERE id = '${userId}'`)

            if (!user) {
                yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
            }

            logger?.('info', `User ${userId} found`)
            return user
        }

        const logs = [] as string[]

        // Run the program
        const result = Eff.run(
            Eff.try(getUser('123')).handle({
                UserNotFound: (error) => ({ error }),
                ValidationError: (error) => ({ error }),
                Database: { query: (sql) => ({ id: '123', name: 'John' }) },
                Logger: (level, message) => {
                    logs.push(`[${level}] ${message}`)
                },
            }),
        )

        expect(result).toEqual({ id: '123', name: 'John' })
        expect(logs).toEqual(['[info] Fetching user 123', '[info] User 123 found'])
    })

    it('Effect Composition - Create User', () => {
        type User = {
            id: string
            name: string
            email: string
        }

        class ValidationError extends Eff.Err('ValidationError')<{ field: string; message: string }> {}
        class DatabaseConnection extends Eff.Ctx('Database')<{ query: (sql: string) => User | null }> {}
        class Logger extends Eff.Opt('Logger')<(level: string, message: string) => void> {}

        function* createUser(userData: { name: string; email: string }) {
            const db = yield* Eff.get(DatabaseConnection)
            const logger = yield* Eff.get(Logger)

            // Validate user data
            if (!userData.name) {
                yield* Eff.throw(new ValidationError({ field: 'name', message: 'Required' }))
            }

            if (!userData.email) {
                yield* Eff.throw(new ValidationError({ field: 'email', message: 'Required' }))
            }

            logger?.('info', `Creating user ${userData.name}`)

            // Check if email already exists
            const existingUser = db.query(`SELECT id FROM users WHERE email = '${userData.email}'`)

            if (existingUser) {
                yield* Eff.throw(new ValidationError({ field: 'email', message: 'Already exists' }))
            }

            // Create user
            const newUser = db.query(
                `INSERT INTO users (name, email) VALUES ('${userData.name}', '${userData.email}') RETURNING *`,
            )

            if (!newUser) {
                throw yield* Eff.throw(new ValidationError({ field: 'email', message: 'Failed to create user' }))
            }

            logger?.('info', `User ${newUser.id} created successfully`)
            return newUser
        }

        const logs = [] as string[]

        // Run user creation program
        const result = Eff.run(
            Eff.try(createUser({ name: 'Jane Doe', email: 'jane@example.com' })).handle({
                ValidationError: (error) => ({ error }),
                Database: {
                    query: (sql) => ({ id: '456', name: 'Jane Doe', email: 'jane@example.com' } as User),
                },
                Logger: (level, message) => {
                    logs.push(`[${level}] ${message}`)
                },
            }),
        )

        expect(result).toEqual({
            error: {
                field: 'email',
                message: 'Already exists',
            },
        })
        expect(logs).toEqual(['[info] Creating user Jane Doe'])
    })

    it('Message Passing - Inter-Generator Communication', () => {
        // Define message types
        class UserRequest extends Eff.Msg('UserRequest')<{ userId: string }> {}
        class UserResponse extends Eff.Msg('UserResponse')<{ user: any }> {}
        class LogMessage extends Eff.Msg('Log')<string> {}

        // Client generator
        function* userClient() {
            yield* Eff.send(new UserRequest({ userId: '123' }))
            const response = yield* Eff.wait(UserResponse)
            yield* Eff.msg('Log').send(`Received user: ${response.user.name}`)
            return `Client: ${response.user.name}`
        }

        // Server generator
        function* userServer() {
            const request = yield* Eff.wait(UserRequest)
            yield* Eff.msg('Log').send(`Processing request for user: ${request.userId}`)

            const user = { id: request.userId, name: 'John Doe' }
            yield* Eff.send(new UserResponse({ user }))

            return `Server: processed ${request.userId}`
        }

        // Logger generator
        function* logger() {
            const log1 = yield* Eff.msg('Log').wait<string>()
            const log2 = yield* Eff.msg('Log').wait<string>()
            return `Logger: ${log1}, ${log2}`
        }

        // Run communication program
        const result = Eff.runSync(
            Eff.communicate({
                client: userClient,
                server: userServer,
                logger,
            }),
        )

        expect(result).toEqual({
            client: 'Client: John Doe',
            server: 'Server: processed 123',
            logger: 'Logger: Processing request for user: 123, Received user: John Doe',
        })
    })

    it('Message Passing - Request-Response Pattern', () => {
        // Define request-response messages
        class ApiRequest extends Eff.Msg('ApiRequest')<{ method: string; url: string; data?: any }> {}
        class ApiResponse extends Eff.Msg('ApiResponse')<{ status: number; data: any }> {}

        // API client
        function* apiClient() {
            yield* Eff.send(new ApiRequest({ method: 'GET', url: '/users/123' }))
            const response = yield* Eff.wait(ApiResponse)
            return response.data
        }

        // API server
        function* apiServer() {
            const request = yield* Eff.wait(ApiRequest)

            // Mock API processing
            const data = { id: '123', name: 'John Doe' }
            yield* Eff.send(new ApiResponse({ status: 200, data }))

            return `Processed ${request.method} ${request.url}`
        }

        // Run API communication
        const result = Eff.runSync(
            Eff.communicate({
                client: apiClient,
                server: apiServer,
            }),
        )

        expect(result).toEqual({
            client: { id: '123', name: 'John Doe' },
            server: 'Processed GET /users/123',
        })
    })

    it('Error Recovery and Retry Mechanism', async () => {
        // Retry function
        function* withRetry<E extends AnyEff, T>(
            effect: () => Generator<E, T>,
            maxRetries: number = 3,
            delay: number = 1000,
        ) {
            let lastError: any

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    return yield* effect()
                } catch (error) {
                    lastError = error

                    if (attempt < maxRetries) {
                        // Mock delay
                        yield* Eff.await(new Promise((resolve) => setTimeout(resolve, delay * attempt)))
                    }
                }
            }

            throw lastError
        }

        // Mock operation that might fail
        let attemptCount = 0
        function* fetchUser(userId: string) {
            attemptCount++
            if (attemptCount < 3) {
                throw new Error('Network error')
            }
            return { id: userId, name: 'John Doe' }
        }

        // Use retry mechanism
        function* fetchUserWithRetry(userId: string) {
            return yield* withRetry(() => fetchUser(userId), 3, 10)
        }

        const result = await Eff.run(fetchUserWithRetry('123'))
        expect(result).toEqual({ id: '123', name: 'John Doe' })
        expect(attemptCount).toBe(3)
    })

    it('Test Effects - User Service Test', async () => {
        type User = {
            id: string
            name: string
        }

        class UserNotFound extends Eff.Err('UserNotFound')<string> {}
        class UserValidationError extends Eff.Err('UserValidationError')<{ field: string; message: string }> {}
        class UserDatabase extends Eff.Ctx('UserDatabase')<{
            findById: (id: string) => Promise<User | null>
            create: (data: any) => Promise<any>
            update: (id: string, data: any) => Promise<any>
        }> {}
        class UserLogger extends Eff.Opt('UserLogger')<(level: string, message: string) => void> {}

        function* getUserService(userId: string) {
            const db = yield* Eff.get(UserDatabase)
            const logger = yield* Eff.get(UserLogger)

            logger?.('info', `Fetching user ${userId}`)

            if (!userId) {
                yield* Eff.throw(new UserValidationError({ field: 'userId', message: 'Required' }))
            }

            const user = yield* Eff.await(db.findById(userId))

            if (!user) {
                yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
            }

            logger?.('info', `User ${userId} found`)
            return user
        }

        // Test success case
        const mockUser = { id: '123', name: 'John Doe' }
        const logs = [] as string[]

        const result = await Eff.run(
            Eff.try(getUserService('123')).handle({
                UserNotFound: (error) => ({ error }),
                UserValidationError: (error) => ({ error }),
                UserDatabase: {
                    findById: async (id) => mockUser,
                    create: async (data) => data,
                    update: async (id, data) => data,
                },
                UserLogger: (level, message) => {
                    logs.push(`[${level}] ${message}`)
                },
            }),
        )

        expect(result).toEqual(mockUser)
        expect(logs).toEqual(['[info] Fetching user 123', '[info] User 123 found'])

        logs.length = 0

        // Test user not found case
        const result2 = await Eff.run(
            Eff.try(getUserService('999')).handle({
                UserNotFound: (error) => ({ error }),
                UserValidationError: (error) => ({ error }),
                UserDatabase: {
                    findById: async (id) => null,
                    create: async (data) => data,
                    update: async (id, data) => data,
                },
                UserLogger: (level, message) => {
                    logs.push(`[${level}] ${message}`)
                },
            }),
        )

        expect(result2).toEqual({ error: 'User 999 not found' })
        expect(logs).toEqual(['[info] Fetching user 999'])
    })

    it('Test Effects - Mock Effects for Testing', async () => {
        type User = {
            id: string
            name: string
        }

        class UserNotFound extends Eff.Err('UserNotFound')<string> {}
        class UserValidationError extends Eff.Err('UserValidationError')<{ field: string; message: string }> {}
        class UserDatabase extends Eff.Ctx('UserDatabase')<{
            findById: (id: string) => Promise<User>
            create: (data: any) => Promise<any>
            update: (id: string, data: any) => Promise<any>
        }> {}
        class UserLogger extends Eff.Opt('UserLogger')<(level: string, message: string) => void> {}

        function* getUserService(userId: string) {
            const db = yield* Eff.get(UserDatabase)
            const logger = yield* Eff.get(UserLogger)

            logger?.('info', `Fetching user ${userId}`)

            if (!userId) {
                yield* Eff.throw(new UserValidationError({ field: 'userId', message: 'Required' }))
            }

            const user = yield* Eff.await(db.findById(userId))

            if (!user) {
                logger?.('info', `User ${userId} not found`)
                throw yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
            }

            logger?.('info', `User ${userId} found`)
            return user
        }

        type TestContext = {
            UserNotFound: (error: string) => { error: string }
            UserValidationError: (error: { field: string; message: string }) => {
                error: { field: string; message: string }
            }
            UserDatabase: {
                findById: (id: string) => Promise<{ id: string; name: string }>
                create: (data: any) => Promise<any>
                update: (id: string, data: any) => Promise<any>
            }
            UserLogger: (level: string, message: string) => void
        }

        const logs = [] as string[]

        // Create test utility
        function createTestContext(overrides: any = {}): TestContext {
            return {
                UserNotFound: (error: string) => ({ error }),
                UserValidationError: (error: { field: string; message: string }) => ({ error }),
                UserDatabase: {
                    findById: async (id: string) => ({ id, name: 'Test User' }),
                    create: async (data: any) => data,
                    update: async (id: string, data: any) => data,
                    ...overrides.UserDatabase,
                },
                UserLogger: (level: string, message: string) => {
                    logs.push(`[${level}] ${message}`)
                },
                ...overrides,
            }
        }

        // Use test utility
        const testContext = createTestContext({
            UserDatabase: {
                findById: async (id: string) => {
                    throw new Error('Database connection failed')
                },
            },
        })

        await expect(Eff.run(Eff.try(getUserService('123')).handle(testContext))).rejects.toThrow()
        expect(logs).toEqual(['[info] Fetching user 123'])
    })
})

describe('Koka Documentation Examples - Reference Section', () => {
    it('Eff.err().throw() Example', () => {
        function* validateUser(userId: string) {
            if (!userId) {
                yield* Eff.err('ValidationError').throw('User ID is required')
            }
            return { id: userId, name: 'John Doe' }
        }

        const result = Eff.run(
            Eff.try(validateUser('123')).handle({
                ValidationError: (error) => ({ error }),
            }),
        )

        expect(result).toEqual({ id: '123', name: 'John Doe' })
    })

    it('Eff.ctx().get() Example', () => {
        function* getUserInfo() {
            const userId = yield* Eff.ctx('UserId').get<string>()
            const apiKey = yield* Eff.ctx('ApiKey').get<string>()
            return { userId, apiKey }
        }

        const result = Eff.run(
            Eff.try(getUserInfo()).handle({
                UserId: '12345',
                ApiKey: 'secret-key',
            }),
        )

        expect(result).toEqual({ userId: '12345', apiKey: 'secret-key' })
    })

    it('Eff.ctx().opt() Example', () => {
        function* getUserPreferences() {
            const theme = yield* Eff.ctx('Theme').opt<string>()
            const fontSize = yield* Eff.ctx('FontSize').opt<number>()
            return { theme: theme ?? 'light', fontSize: fontSize ?? 14 }
        }

        const result = Eff.run(getUserPreferences())
        expect(result).toEqual({ theme: 'light', fontSize: 14 })
    })

    it('Eff.await() Example', async () => {
        function* fetchData() {
            const response = yield* Eff.await(Promise.resolve({ data: 'test data' }))
            return response.data
        }

        const result = await Eff.run(fetchData())
        expect(result).toBe('test data')
    })

    it('Eff.try().handle() Example', () => {
        function* getUser(id: string) {
            if (!id) {
                yield* Eff.err('ValidationError').throw('ID required')
            }
            return { id, name: 'John Doe' }
        }

        const result = Eff.run(
            Eff.try(getUser('123')).handle({
                ValidationError: (error) => ({ error }),
                UserId: '123',
            }),
        )

        expect(result).toEqual({ id: '123', name: 'John Doe' })
    })

    it('Eff.run() Example', () => {
        function* getUserPreferences() {
            const theme = yield* Eff.ctx('Theme').opt<string>()
            return { theme: theme ?? 'light' }
        }

        const result = Eff.run(getUserPreferences())
        expect(result).toEqual({ theme: 'light' })
    })

    it('Eff.runSync() Example', () => {
        function* getUserPreferences() {
            const theme = yield* Eff.ctx('Theme').opt<string>()
            return { theme: theme ?? 'light' }
        }

        const result = Eff.runSync(getUserPreferences())
        expect(result).toEqual({ theme: 'light' })
    })

    it('Eff.combine() Array Form Example', async () => {
        function* fetchUser(userId: string) {
            return { id: userId, name: 'John Doe' }
        }

        function* fetchOrders(userId: string) {
            return [{ id: '1', userId }]
        }

        function* getUserAndOrders(userId: string) {
            const [user, orders] = yield* Eff.combine([fetchUser(userId), fetchOrders(userId)])
            return { user, orders }
        }

        const result = await Eff.run(getUserAndOrders('123'))
        expect(result).toEqual({
            user: { id: '123', name: 'John Doe' },
            orders: [{ id: '1', userId: '123' }],
        })
    })

    it('Eff.combine() Object Form Example', async () => {
        function* fetchUser(userId: string) {
            return { id: userId, name: 'John Doe' }
        }

        function* fetchProfile(userId: string) {
            return { userId, bio: 'User bio' }
        }

        function* getDefaultSettings() {
            return { theme: 'light', fontSize: 14 }
        }

        function* getUserData(userId: string) {
            const result = yield* Eff.combine({
                user: fetchUser(userId),
                profile: fetchProfile(userId),
                settings: getDefaultSettings(),
            })
            return result
        }

        const result = await Eff.run(getUserData('123'))
        expect(result).toEqual({
            user: { id: '123', name: 'John Doe' },
            profile: { userId: '123', bio: 'User bio' },
            settings: { theme: 'light', fontSize: 14 },
        })
    })

    it('Eff.all() Example', async () => {
        type User = {
            id: string
            name: string
        }

        type Profile = {
            userId: string
            bio: string
        }

        type Order = {
            id: string
            userId: string
        }

        type FetchData = User | Profile | Order[]

        function* fetchUser(userId: string) {
            return { id: userId, name: 'John Doe' } as FetchData
        }

        function* fetchProfile(userId: string) {
            return { userId, bio: 'User bio' } as FetchData
        }

        function* fetchOrders(userId: string) {
            return [{ id: '1', userId }] as FetchData
        }

        function* getAllUserData(userId: string) {
            const results = yield* Eff.all([fetchUser(userId), fetchProfile(userId), fetchOrders(userId)])
            return {
                user: results[0],
                profile: results[1],
                orders: results[2],
            }
        }

        const result = await Eff.run(getAllUserData('123'))
        expect(result).toEqual({
            user: { id: '123', name: 'John Doe' },
            profile: { userId: '123', bio: 'User bio' },
            orders: [{ id: '1', userId: '123' }],
        })
    })

    it('Eff.race() Example', async () => {
        function* fetchFromCache(userId: string) {
            yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 30)))
            return { source: 'cache', data: { id: userId } }
        }

        function* fetchFromDatabase(userId: string) {
            yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 40)))
            return { source: 'database', data: { id: userId } }
        }

        function* fetchFromAPI(userId: string) {
            yield* Eff.await(new Promise((resolve) => setTimeout(resolve, 10)))
            return { source: 'api', data: { id: userId } }
        }

        function* getFastestData(userId: string) {
            const result = yield* Eff.race([fetchFromCache(userId), fetchFromDatabase(userId), fetchFromAPI(userId)])
            return result
        }

        const result = await Eff.run(getFastestData('123'))
        expect(result.source).toBe('api')
        expect(result.data).toEqual({ id: '123' })
    })

    it('Eff.communicate() Example', () => {
        function* senderGenerator() {
            yield* Eff.msg('Greeting').send('Hello, World!')
            return 'Sender completed'
        }

        function* receiverGenerator() {
            const message = yield* Eff.msg('Greeting').wait<string>()
            return `Receiver got: ${message}`
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender: senderGenerator,
                receiver: receiverGenerator,
            }),
        )

        expect(result).toEqual({
            sender: 'Sender completed',
            receiver: 'Receiver got: Hello, World!',
        })
    })

    it('Eff.msg().send() and Eff.msg().wait() Example', () => {
        function* sender() {
            yield* Eff.msg('Greeting').send('Hello, World!')
        }

        function* receiver() {
            const message = yield* Eff.msg('Greeting').wait<string>()
            return message
        }

        const result = Eff.runSync(
            Eff.communicate({
                sender,
                receiver,
            }),
        )

        expect(result.receiver).toBe('Hello, World!')
    })

    it('Eff.result() Example', () => {
        function* getUser(userId: string) {
            if (!userId) {
                yield* Eff.err('ValidationError').throw('User ID is required')
            }
            return { id: userId, name: 'John Doe' }
        }

        const result = Eff.run(Eff.result(getUser('123')))

        expect(result).toEqual({
            type: 'ok',
            value: { id: '123', name: 'John Doe' },
        })

        const errorResult = Eff.run(Eff.result(getUser('')))

        expect(errorResult).toEqual({
            type: 'err',
            name: 'ValidationError',
            error: 'User ID is required',
        })
    })

    it('Eff.ok() Example', () => {
        function* getUser(userId: string) {
            if (!userId) {
                yield* Eff.err('ValidationError').throw('User ID is required')
            }
            return { id: userId, name: 'John Doe' }
        }

        function* processUser(userId: string) {
            const user = yield* Eff.ok(Eff.result(getUser(userId)))
            return `Processed: ${user.name}`
        }

        const result = Eff.run(
            Eff.try(processUser('123')).handle({
                ValidationError: (error) => ({ error }),
            }),
        )
        expect(result).toBe('Processed: John Doe')

        const errorResult = Eff.run(
            Eff.try(processUser('')).handle({
                ValidationError: (error) => ({ error }),
            }),
        )
        expect(errorResult).toEqual({ error: 'User ID is required' })
    })

    it('Eff.runResult() Example', () => {
        function* getUser(userId: string) {
            if (!userId) {
                yield* Eff.err('ValidationError').throw('User ID is required')
            }
            return { id: userId, name: 'John Doe' }
        }

        const result = Eff.runResult(getUser('123'))
        expect(result).toEqual({
            type: 'ok',
            value: { id: '123', name: 'John Doe' },
        })

        const errorResult = Eff.runResult(getUser(''))
        expect(errorResult).toEqual({
            type: 'err',
            name: 'ValidationError',
            error: 'User ID is required',
        })
    })

    it('Predefined Effect Classes Example', () => {
        class UserNotFound extends Eff.Err('UserNotFound')<string> {}
        class ValidationError extends Eff.Err('ValidationError')<{ field: string; message: string }> {}
        class DatabaseConnection extends Eff.Ctx('Database')<{ query: (sql: string) => any }> {}
        class Logger extends Eff.Opt('Logger')<(level: string, message: string) => void> {}
        class UserRequest extends Eff.Msg('UserRequest')<{ userId: string }> {}

        const error = new UserNotFound('User not found')
        expect(error.name).toBe('UserNotFound')
        expect(error.error).toBe('User not found')

        const db = new DatabaseConnection()
        expect(db).toBeInstanceOf(DatabaseConnection)

        const request = new UserRequest({ userId: '123' })
        expect(request.message).toEqual({ userId: '123' })
    })

    it('Eff.throw() Example', () => {
        class UserNotFound extends Eff.Err('UserNotFound')<string> {}

        function* getUser(userId: string) {
            if (!userId) {
                yield* Eff.throw(new UserNotFound('User ID is required'))
            }
            return { id: userId, name: 'John Doe' }
        }

        const result = Eff.run(
            Eff.try(getUser('')).handle({
                UserNotFound: (error) => ({ error }),
            }),
        )

        expect(result).toEqual({ error: 'User ID is required' })
    })

    it('Eff.get() Example', async () => {
        type User = {
            id: string
            name: string
        }

        class DatabaseConnection extends Eff.Ctx('Database')<{ query: (sql: string) => Promise<User> }> {}

        function* getUser(userId: string) {
            const db = yield* Eff.get(DatabaseConnection)
            return yield* Eff.await(db.query(`SELECT * FROM users WHERE id = '${userId}'`))
        }

        const result = await Eff.run(
            Eff.try(getUser('123')).handle({
                Database: { query: async (sql) => ({ id: '123', name: 'John Doe' } as User) },
            }),
        )

        expect(result).toEqual({ id: '123', name: 'John Doe' })
    })
})

describe('Koka Documentation Examples - Explanations Section', () => {
    it('Algebraic Effects vs Traditional Error Handling', () => {
        // Traditional exception handling
        function getUser(id: string) {
            if (!id) {
                throw new Error('ID is required')
            }
            return { id, name: 'John Doe' }
        }

        let traditionalResult: any
        try {
            traditionalResult = getUser('')
        } catch (error) {
            traditionalResult = `Caught: ${error instanceof Error ? error.message : String(error)}`
        }

        expect(traditionalResult).toBe('Caught: ID is required')

        // Algebraic effect handling
        function* getUserEffect(id: string) {
            if (!id) {
                yield* Eff.err('ValidationError').throw('ID is required')
            }
            return { id, name: 'John Doe' }
        }

        const effectResult = Eff.run(
            Eff.try(getUserEffect('')).handle({
                ValidationError: (error) => ({ error }),
            }),
        )

        expect(effectResult).toEqual({ error: 'ID is required' })
    })

    it('Effect Propagation Example', () => {
        function* inner() {
            yield* Eff.err('InnerError').throw('inner error')
            return 'should not reach here'
        }

        function* outer() {
            return yield* inner()
        }

        const result = Eff.run(
            Eff.try(outer()).handle({
                InnerError: (error) => `Handled: ${error}`,
            }),
        )

        expect(result).toBe('Handled: inner error')
    })

    it('Effect Handling Example', () => {
        function* getUser(userId: string) {
            if (!userId) {
                yield* Eff.err('ValidationError').throw('User ID is required')
            }
            return { id: userId, name: 'John Doe' }
        }

        const result = Eff.run(
            Eff.try(getUser('123')).handle({
                ValidationError: (error) => ({ error }),
            }),
        )

        expect(result).toEqual({ id: '123', name: 'John Doe' })
    })

    it('Generator Effect Pattern Example', () => {
        function* effectFunction() {
            // 1. Yield effects
            const value = yield* Eff.ctx('SomeContext').get<number>()

            // 2. Handle effect results
            if (value === null) {
                yield* Eff.err('SomeError').throw('Context value is null')
            }

            // 3. Return final result
            return `Processed: ${value}`
        }

        const result = Eff.run(
            Eff.try(effectFunction()).handle({
                SomeContext: 42,
                SomeError: (error) => ({ error }),
            }),
        )

        expect(result).toBe('Processed: 42')
    })

    it('Type Inference Example', async () => {
        function* getUser(userId: string) {
            if (!userId) {
                yield* Eff.err('ValidationError').throw('ID required')
            }

            const user = yield* Eff.await(Promise.resolve({ id: userId, name: 'John Doe' }))
            return user
        }

        const result = await Eff.run(
            Eff.try(getUser('123')).handle({
                ValidationError: (error: string) => ({ error }),
            }),
        )

        expect(result).toEqual({ id: '123', name: 'John Doe' })
    })

    it('Comparison with Effect-TS Example', async () => {
        // Koka approach
        function* getUserKoka(id: string) {
            if (!id) {
                yield* Eff.err('ValidationError').throw('ID required')
            }
            return yield* Eff.await(Promise.resolve({ id, name: 'John Doe' }))
        }

        const kokaResult = await Eff.run(
            Eff.try(getUserKoka('123')).handle({
                ValidationError: (error) => console.error(error),
            }),
        )

        expect(kokaResult).toEqual({ id: '123', name: 'John Doe' })

        // Mock Effect-TS approach (simplified)
        const effectTsResult = { id: '123', name: 'John Doe' }
        expect(effectTsResult).toEqual({ id: '123', name: 'John Doe' })
    })

    it('Context Management Comparison Example', () => {
        // Koka approach
        function* program() {
            const getRandom = yield* Eff.ctx('MyRandom').get<() => number>()
            return getRandom()
        }

        const result = Eff.run(
            Eff.try(program()).handle({
                MyRandom: () => Math.random(),
            }),
        )

        expect(typeof result).toBe('number')
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThan(1)
    })

    it('Best Practices - Effect Design Principles', async () => {
        // Single responsibility
        type User = {
            id: string
            name: string
        }

        class UserNotFound extends Eff.Err('UserNotFound')<string> {}
        class DatabaseConnection extends Eff.Ctx('Database')<{ query: (sql: string) => Promise<User> }> {}

        // Type safety
        function* getUserService(userId: string) {
            const db = yield* Eff.get(DatabaseConnection)
            const user = yield* Eff.await(db.query(`SELECT * FROM users WHERE id = '${userId}'`))

            if (!user) {
                yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
            }

            return user
        }

        // Composability
        function* getUserWithProfile(userId: string) {
            const user = yield* getUserService(userId)
            const profile = yield* Eff.await(Promise.resolve({ userId, bio: 'User bio' }))
            return { user, profile }
        }

        const result = await Eff.run(
            Eff.try(getUserWithProfile('123')).handle({
                UserNotFound: (error) => ({ error }),
                Database: { query: async (sql) => ({ id: '123', name: 'John Doe' }) },
            }),
        )

        expect(result).toEqual({
            user: { id: '123', name: 'John Doe' },
            profile: { userId: '123', bio: 'User bio' },
        })
    })

    it('Code Organization Example', async () => {
        // effects/user.ts - Define effect types
        type User = {
            id: string
            name: string
        }

        class UserNotFound extends Eff.Err('UserNotFound')<string> {}
        class UserDatabase extends Eff.Ctx('UserDatabase')<{
            findById: (id: string) => Promise<User>
        }> {}

        // services/user-service.ts - Implement business logic
        function* getUserService(userId: string) {
            const db = yield* Eff.get(UserDatabase)
            const user = yield* Eff.await(db.findById(userId))

            if (!user) {
                yield* Eff.throw(new UserNotFound(`User ${userId} not found`))
            }

            return user
        }

        // main.ts - Compose and run
        const mockDatabase = {
            findById: async (id: string) => ({ id, name: 'John Doe' }),
        }

        const result = await Eff.run(
            Eff.try(getUserService('123')).handle({
                UserNotFound: (error) => ({ error }),
                UserDatabase: mockDatabase,
            }),
        )

        expect(result).toEqual({ id: '123', name: 'John Doe' })
    })
})
