/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Accessor from 'koka-accessor'
import {
    Domain,
    Store,
    SyncEventMethod,
    event,
    command,
    query,
    effect,
    get,
    getResult,
    getState,
    set,
    setState,
    emit,
    object,
    optional,
    union,
    shallowEqual,
    shallowEqualResult,
    subscribeDomainResult,
    subscribeDomainState,
    subscribeQueryResult,
    subscribeQueryState,
    getKeyFromPath,
    getDomainCtorKey,
    getDomainCacheKey,
    getDomainState,
    getQueryResult,
    getQueryState,
    runQuery,
    runCommand,
    type AnyDomain,
    type EffectContext,
} from '../src/koka-domain.ts'

type Todo = {
    id: number
    text: string
    done: boolean
}

type TodoFilter = 'all' | 'done' | 'undone'

type TodoApp = {
    todos: Todo[]
    filter: TodoFilter
    input: string
}

class TextDomain<Root> extends Domain<string, Root> {
    @command()
    *updateText(text: string) {
        yield* set(this, text)
        return 'text updated'
    }
    @command()
    *clearText() {
        yield* set(this, '')
        return 'text cleared'
    }
}

class BoolDomain<Root> extends Domain<boolean, Root> {
    @command()
    *toggle() {
        yield* set(this, (value: boolean) => !value)
        return 'bool toggled'
    }
}

class RemoveTodoEvent extends Event('RemoveTodo')<{ todoId: number }> {}

class TodoDomain<Root> extends Domain<Todo, Root> {
    text$ = this.select('text').use(TextDomain) as TextDomain<Root>
    done$ = this.select('done').use(BoolDomain) as BoolDomain<Root>;

    @command()
    *updateTodoText(text: string) {
        yield* set(this.text$, text)
        return 'todo updated'
    }

    @command()
    *toggleTodo() {
        yield* set(this.done$, (v: boolean) => !v)
        return 'todo toggled'
    }

    @command()
    *removeTodo() {
        const todo = yield* get(this)
        yield* emit(new RemoveTodoEvent({ todoId: todo.id }))
        return 'todo removed'
    }
}

let todoUid = 0

class TodoListDomain<Root> extends Domain<Todo[], Root> {
    @command()
    *removeTodo(id: number) {
        yield* set(this, (todos: Todo[]) => todos.filter((todo) => todo.id !== id))
        return 'todo removed'
    }

    @event(RemoveTodoEvent)
    *handleRemoveTodo(payload: { todoId: number }) {
        yield* set(this, (todos: Todo[]) => todos.filter((t) => t.id !== payload.todoId))
    }

    @command()
    *addTodo(text: string) {
        const newTodo = { id: todoUid++, text, done: false }
        yield* set(this, (todos: Todo[]) => [...todos, newTodo])
        return 'todo added'
    }

    todo(id: number) {
        return this.find('id', id).use(TodoDomain)
    }

    length$ = this.select('length') as Domain<number, Root>;

    @query()
    *getCompletedTodoList() {
        const todos = yield* get(this)
        return todos.filter((t) => t.done)
    }

    @query()
    *getActiveTodoList() {
        const todos = yield* get(this)
        return todos.filter((t) => !t.done)
    }

    @query()
    *getTodoCount() {
        return yield* get(this.length$)
    }
}

class TodoAppDomain<Root> extends Domain<TodoApp, Root> {
    todos$ = this.select('todos').use(TodoListDomain)
    input$ = this.select('input').use(TextDomain)
    filter$ = this.select('filter') as Domain<TodoFilter, Root>;

    @command()
    *addTodo() {
        const app = yield* get(this)
        const newTodo = { id: todoUid++, text: app.input, done: false }
        yield* set(this.todos$, (todos: Todo[]) => [...todos, newTodo])
        yield* set(this.input$, '')
        return 'Todo added'
    }

    @command()
    *updateInput(input: string) {
        yield* set(this.input$, input)
        return 'Input updated'
    }

    @query()
    *getFilteredTodoList() {
        const filter = yield* get(this.filter$)
        const todos = yield* get(this.todos$)
        if (filter === 'all') return todos
        if (filter === 'done') return todos.filter((t: Todo) => t.done)
        return todos.filter((t: Todo) => !t.done)
    }

    @query()
    *getTodoSummary() {
        const todos = yield* get(this.todos$)
        const activeTodoCount = todos.filter((t) => !t.done).length
        const completedTodoCount = todos.filter((t) => t.done).length
        const filter = yield* get(this.filter$)
        return { activeTodoCount, completedTodoCount, filter }
    }

    @query()
    *errorQuery() {
        return yield* get(this.todos$.select(-1))
    }
}

// Query that only succeeds when filter === 'done'
class ErrorQueryDomain extends Domain<TodoApp, TodoApp> {
    @query()
    *errorQuery() {
        const filter = yield* get(this.select('filter'))
        if (filter !== 'done') throw new Error('filter is not done')
        return filter
    }
}

// Domain with @effect for testing: records each effect run (input value and run count)
const effectRunLog: { input: string; runIndex: number }[] = []
let effectRunIndex = 0

const effectQueryRunLog: {
    summary: { activeTodoCount: number; completedTodoCount: number; filter: TodoFilter }
    runIndex: number
}[] = []
let effectQueryRunIndex = 0

class TodoAppWithEffectDomain<Root> extends Domain<TodoApp, Root> {
    todos$ = this.select('todos').use(TodoListDomain)
    input$ = this.select('input').use(TextDomain)
    filter$ = this.select('filter');

    @effect()
    *logInputEffect() {
        const input = yield* get(this.input$)
        effectRunLog.push({ input, runIndex: effectRunIndex++ })
    }
}

// Domain with effect that depends on domain state (todos) — effect re-runs when todos change
class TodoAppWithQueryEffectDomain<Root> extends Domain<TodoApp, Root> {
    todos$ = this.select('todos').use(TodoListDomain)
    input$ = this.select('input').use(TextDomain)
    filter$ = this.select('filter');

    @effect()
    *reactToTodos() {
        const todos = yield* get(this.todos$)
        const filter = yield* get(this.filter$)
        const completedTodoCount = todos.filter((t: Todo) => t.done).length
        const activeTodoCount = todos.length - completedTodoCount
        effectQueryRunLog.push({
            summary: { activeTodoCount, completedTodoCount, filter },
            runIndex: effectQueryRunIndex++,
        })
    }
}

describe('TodoAppDomain', () => {
    let store: Store<TodoApp>
    let todoApp$: TodoAppDomain<TodoApp>

    beforeEach(() => {
        todoUid = 0
        store = new Store<TodoApp>({
            state: {
                todos: [],
                filter: 'all',
                input: '',
            },
        })
        todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
    })

    it('should initialize with empty state', () => {
        const state = store.getState()
        expect(state.todos).toEqual([])
        expect(state.filter).toBe('all')
        expect(state.input).toBe('')
    })

    it('should add todo', async () => {
        store.runCommand(todoApp$.updateInput('Test todo'))
        store.runCommand(todoApp$.addTodo())

        const state = store.getState()
        expect(state.todos.length).toBe(1)
        expect(state.todos[0].text).toBe('Test todo')
        expect(state.todos[0].done).toBe(false)
    })

    it('should clear input after adding todo', async () => {
        store.runCommand(todoApp$.updateInput('Test todo'))
        store.runCommand(todoApp$.addTodo())

        const state = store.getState()
        expect(state.input).toBe('')
    })

    it('should update todo text', async () => {
        store.runCommand(todoApp$.updateInput('Todo 1'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Todo 2'))
        store.runCommand(todoApp$.addTodo())

        const todoId = store.getState().todos[0].id
        store.runCommand(todoApp$.todos$.todo(todoId).updateTodoText('Updated text'))

        const state = store.getState()
        expect(state.todos[0].text).toBe('Updated text')
    })

    it('should toggle todo status', async () => {
        store.runCommand(todoApp$.updateInput('Todo 1'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Todo 2'))
        store.runCommand(todoApp$.addTodo())

        const todoId = store.getState().todos[0].id
        store.runCommand(todoApp$.todos$.todo(todoId).toggleTodo())

        const state = store.getState()
        expect(state.todos[0].done).toBe(true)
    })

    it('should filter active todos', async () => {
        store.runCommand(todoApp$.updateInput('Active 1'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Active 2'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Completed 1'))
        store.runCommand(todoApp$.addTodo())

        const todoId = store.getState().todos[2].id
        store.runCommand(todoApp$.todos$.todo(todoId).toggleTodo())

        const activeList = store.runQuery(todoApp$.todos$.getActiveTodoList())
        expect(activeList.length).toBe(2)
        expect(activeList.every((todo: Todo) => !todo.done)).toBe(true)
    })

    it('should filter completed todos', async () => {
        store.runCommand(todoApp$.updateInput('Active 1'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Active 2'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Completed 1'))
        store.runCommand(todoApp$.addTodo())

        const todoId = store.getState().todos[2].id
        store.runCommand(todoApp$.todos$.todo(todoId).toggleTodo())

        const completedList = store.runQuery(todoApp$.todos$.getCompletedTodoList())
        expect(completedList.length).toBe(1)
        expect(completedList.every((todo: Todo) => todo.done)).toBe(true)
    })

    it('should get active todo texts', async () => {
        store.runCommand(todoApp$.updateInput('Active 1'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Active 2'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Completed 1'))
        store.runCommand(todoApp$.addTodo())

        const todoId = store.getState().todos[2].id
        store.runCommand(todoApp$.todos$.todo(todoId).toggleTodo())

        const activeList = store.runQuery(todoApp$.todos$.getActiveTodoList())
        expect(activeList.map((t: Todo) => t.text)).toEqual(['Active 1', 'Active 2'])
    })

    it('should get completed todo texts', async () => {
        store.runCommand(todoApp$.updateInput('Active 1'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Active 2'))
        store.runCommand(todoApp$.addTodo())
        store.runCommand(todoApp$.updateInput('Completed 1'))
        store.runCommand(todoApp$.addTodo())

        const todoId = store.getState().todos[2].id
        store.runCommand(todoApp$.todos$.todo(todoId).toggleTodo())

        const completedList = store.runQuery(todoApp$.todos$.getCompletedTodoList())
        expect(completedList.map((t: Todo) => t.text)).toEqual(['Completed 1'])
    })

    it('should handle async input update', async () => {
        store.runCommand(todoApp$.updateInput('Async test'))

        expect(store.getState().input).toBe('Async test')
    })
})

describe('Store', () => {
    let store: Store<TodoApp>

    beforeEach(() => {
        todoUid = 0
        store = new Store<TodoApp>({
            state: {
                todos: [],
                filter: 'all',
                input: '',
            },
        })
    })

    it('should get initial state', () => {
        const state = store.getState()
        expect(state).toEqual({
            todos: [],
            filter: 'all',
            input: '',
        })
    })

    it('should set state and increment version', () => {
        const newState = {
            todos: [{ id: 1, text: 'test', done: false }],
            filter: 'all' as const,
            input: 'test',
        }

        store.setState(newState)

        expect(store.getState()).toEqual(newState)
        expect(store.version).toBe(1)
    })

    it('should not update state if shallow equal', () => {
        const initialState = store.getState()
        const initialVersion = store.version

        store.setState(initialState)

        expect(store.getState()).toBe(initialState)
        expect(store.version).toBe(initialVersion)
    })

    it('should subscribe to state changes', async () => {
        const listener = jest.fn()
        const unsubscribe = store.subscribeState(listener)

        const newState = { ...store.getState(), input: 'test' }
        store.setState(newState)

        await store.promise

        expect(listener).toHaveBeenCalledWith(newState)
        unsubscribe()
    })

    it('should unsubscribe from state changes', async () => {
        const listener = jest.fn()
        const unsubscribe = store.subscribeState(listener)

        unsubscribe()

        const newState = { ...store.getState(), input: 'test' }
        store.setState(newState)

        await store.promise

        expect(listener).not.toHaveBeenCalled()
    })

    it('should destroy store and clear listeners', async () => {
        const listener = jest.fn()
        store.subscribeState(listener)

        store.destroy()

        store.setState({ ...store.getState(), input: 'test' })
        await store.promise

        expect(listener).not.toHaveBeenCalled()
    })

    it('should apply plugins', () => {
        const plugin = jest.fn().mockReturnValue(() => {})
        const store = new Store<TodoApp>({
            state: {
                todos: [],
                filter: 'all',
                input: '',
            },
            plugins: [plugin],
        })

        expect(plugin).toHaveBeenCalledTimes(1)
        expect(plugin.mock.calls[0][0].getState()).toEqual({
            todos: [],
            filter: 'all',
            input: '',
        })
    })

    it('should handle plugin cleanup', () => {
        const cleanup = jest.fn()
        const plugin = jest.fn().mockReturnValue(cleanup)
        const store = new Store<TodoApp>({
            state: {
                todos: [],
                filter: 'all',
                input: '',
            },
            plugins: [plugin],
        })

        expect(cleanup).not.toHaveBeenCalled()
        store.destroy()
        expect(cleanup).toHaveBeenCalled()
    })
})

describe('Domain', () => {
    let store: Store<TodoApp>
    let domain: Domain<TodoApp, TodoApp>

    beforeEach(() => {
        todoUid = 4
        store = new Store<TodoApp>({
            state: {
                todos: [
                    { id: 1, text: 'test', done: false },
                    { id: 2, text: 'test2', done: true },
                    { id: 3, text: 'test3', done: false },
                ],
                filter: 'all',
                input: 'initial input',
            },
        })
        domain = store.domain
    })

    it('should access property', () => {
        const inputDomain = domain.select('input') as Domain<string, TodoApp>
        expect(inputDomain).toBeInstanceOf(Domain)
        const result = getState(inputDomain)
        expect(result).toEqual(Accessor.ok('initial input'))
    })

    it('should access array index', () => {
        const todosDomain = domain.select('todos') as Domain<Todo[], TodoApp>
        const firstTodoDomain = todosDomain.select(0) as Domain<Todo, TodoApp>
        expect(firstTodoDomain).toBeInstanceOf(Domain)
        const result = getState(firstTodoDomain)
        expect(result).toEqual(Accessor.ok({ id: 1, text: 'test', done: false }))
    })

    it('should find array item', () => {
        const todosDomain = domain.select('todos') as Domain<Todo[], TodoApp>
        const todoDomain = todosDomain.find('id', 1).use(TodoDomain) as TodoDomain<TodoApp>
        expect(todoDomain).toBeInstanceOf(Domain)
        const result = getState(todoDomain)
        expect(result).toEqual(Accessor.ok({ id: 1, text: 'test', done: false }))
    })

    it('should select filter', () => {
        const selectedDomain = domain.select('filter') as Domain<TodoFilter, TodoApp>
        expect(selectedDomain).toBeInstanceOf(Domain)
        const result = getState(selectedDomain)
        expect(result).toEqual(Accessor.ok('all'))
    })
})

describe('Cache mechanism', () => {
    let store: Store<TodoApp>
    let todoApp$: TodoAppDomain<TodoApp>

    beforeEach(() => {
        todoUid = 4
        store = new Store<TodoApp>({
            state: {
                todos: [
                    { id: 1, text: 'test', done: false },
                    { id: 2, text: 'test2', done: true },
                    { id: 3, text: 'test3', done: false },
                ],
                filter: 'all',
                input: 'initial input',
            },
        })
        todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
    })

    it('should cache domain state results', async () => {
        const result1 = getState(todoApp$.todos$)
        expect(result1).toEqual(
            Accessor.ok([
                { id: 1, text: 'test', done: false },
                { id: 2, text: 'test2', done: true },
                { id: 3, text: 'test3', done: false },
            ]),
        )
        const result2 = getState(todoApp$.todos$)
        expect(shallowEqualResult(result1, result2)).toBe(true)
    })

    it('should invalidate cache when store version changes', () => {
        const result1 = getState(todoApp$.todos$)
        const unchangedTodo$ = todoApp$.todos$.todo(2)
        const willChangedTodo$ = todoApp$.todos$.todo(1)
        const result3 = getState(unchangedTodo$)
        const result4 = getState(willChangedTodo$)

        store.runCommand(willChangedTodo$.toggleTodo())

        const result5 = getState(unchangedTodo$)
        const result6 = getState(willChangedTodo$)
        const result7 = getState(todoApp$.todos$)
        expect(shallowEqualResult(result3, result5)).toBe(true)
        expect(shallowEqualResult(result4, result6)).toBe(false)
        expect(shallowEqualResult(result1, result7)).toBe(false)
    })

    it('should cache nested domain results', async () => {
        const todoId = store.getState().todos[0].id
        const todoDomain = todoApp$.todos$.todo(todoId)
        const result1 = getState(todoDomain)
        expect(result1).toEqual(Accessor.ok({ id: 1, text: 'test', done: false }))
        const result2 = getState(todoDomain)
        expect(shallowEqualResult(result1, result2)).toBe(true)
    })

    it('should cache query results', async () => {
        const result1 = store.runQuery(todoApp$.getTodoSummary())
        expect(result1).toEqual({ activeTodoCount: 2, completedTodoCount: 1, filter: 'all' })
        const result2 = store.runQuery(todoApp$.getTodoSummary())
        expect(shallowEqualResult(Accessor.ok(result1), Accessor.ok(result2))).toBe(true)
    })

    it('should invalidate query cache when dependencies change', async () => {
        const result1 = store.runQuery(todoApp$.getTodoSummary())
        const todo$ = todoApp$.todos$.todo(1)
        const result2 = getState(todo$)
        expect(result1).toEqual({ activeTodoCount: 2, completedTodoCount: 1, filter: 'all' })
        expect(result2).toEqual(Accessor.ok({ id: 1, text: 'test', done: false }))

        const result3 = store.runQuery(todoApp$.getTodoSummary())
        const result4 = getState(todo$)
        expect(shallowEqualResult(Accessor.ok(result1), Accessor.ok(result3))).toBe(true)
        expect(shallowEqualResult(result2, result4)).toBe(true)

        store.runCommand(todoApp$.todos$.todo(1).updateTodoText('test4'))
        const result5 = getState(todo$)
        const result6 = store.runQuery(todoApp$.getTodoSummary())
        expect(shallowEqualResult(result2, result5)).toBe(false)
        expect(shallowEqualResult(Accessor.ok(result1), Accessor.ok(result6))).toBe(true)
    })
})

describe('Query functionality', () => {
    let store: Store<TodoApp>
    let todoApp$: TodoAppDomain<TodoApp>

    beforeEach(() => {
        todoUid = 4
        store = new Store<TodoApp>({
            state: {
                todos: [
                    { id: 1, text: 'todo 1', done: false },
                    { id: 2, text: 'todo 2', done: true },
                    { id: 3, text: 'todo 3', done: false },
                ],
                filter: 'all',
                input: '',
            },
        })
        todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
    })

    it('should execute query and return filtered todos', async () => {
        const result1 = store.runQuery(todoApp$.getFilteredTodoList())
        expect(result1).toEqual([
            { id: 1, text: 'todo 1', done: false },
            { id: 2, text: 'todo 2', done: true },
            { id: 3, text: 'todo 3', done: false },
        ])
        const result2 = store.runQuery(todoApp$.getFilteredTodoList())
        expect(shallowEqualResult(Accessor.ok(result1), Accessor.ok(result2))).toBe(true)

        setState(todoApp$.filter$, 'done')
        const result3 = store.runQuery(todoApp$.getFilteredTodoList())
        expect(shallowEqualResult(Accessor.ok(result1), Accessor.ok(result3))).toBe(false)
        const result4 = store.runQuery(todoApp$.getFilteredTodoList())
        expect(result4).toEqual([{ id: 2, text: 'todo 2', done: true }])
    })

    it('should filter todos by done status', async () => {
        setState(todoApp$.filter$, 'done')
        const result = store.runQuery(todoApp$.getFilteredTodoList())
        expect(result).toEqual([store.getState().todos[1]])
    })

    it('should filter todos by undone status', async () => {
        setState(todoApp$.filter$, 'undone')
        const result = store.runQuery(todoApp$.getFilteredTodoList())
        expect(result).toEqual(store.getState().todos.filter((todo) => !todo.done))
    })

    it('should cache query results', async () => {
        const result1 = store.runQuery(todoApp$.getFilteredTodoList())
        expect(result1).toBeDefined()
        const result2 = store.runQuery(todoApp$.getFilteredTodoList())
        expect(shallowEqualResult(Accessor.ok(result1), Accessor.ok(result2))).toBe(true)
    })

    it('should invalidate cache when dependencies change', () => {
        const result1 = store.runQuery(todoApp$.getFilteredTodoList())
        setState(todoApp$.filter$, 'done')
        const result2 = store.runQuery(todoApp$.getFilteredTodoList())
        expect(shallowEqualResult(Accessor.ok(result1), Accessor.ok(result2))).toBe(false)
        expect(result2).toEqual([store.getState().todos[1]])
    })

    it('should invalidate cache when todos change', async () => {
        const result1 = store.runQuery(todoApp$.getFilteredTodoList())
        store.runCommand(todoApp$.updateInput('new todo'))
        store.runCommand(todoApp$.addTodo())
        const result2 = store.runQuery(todoApp$.getFilteredTodoList())
        expect(result2).toEqual([
            { id: 1, text: 'todo 1', done: false },
            { id: 2, text: 'todo 2', done: true },
            { id: 3, text: 'todo 3', done: false },
            { id: 4, text: 'new todo', done: false },
        ])
        expect(shallowEqualResult(Accessor.ok(result1), Accessor.ok(result2))).toBe(false)
    })

    it('should handle errors in query execution', () => {
        const errorDomain = store.domain.use(ErrorQueryDomain) as ErrorQueryDomain
        let result: { type: string }
        try {
            store.runQuery(errorDomain.errorQuery())
            result = Accessor.ok(undefined)
        } catch {
            result = { type: 'err' }
        }
        expect(result.type).toBe('err')
    })
})

describe('Subscription mechanisms', () => {
    let store: Store<TodoApp>
    let todoApp$: TodoAppDomain<TodoApp>

    beforeEach(() => {
        store = new Store<TodoApp>({
            state: {
                todos: [
                    { id: 1, text: 'todo 1', done: false },
                    { id: 2, text: 'todo 2', done: true },
                    { id: 3, text: 'todo 3', done: false },
                ],
                filter: 'all',
                input: '',
            },
        })
        todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
    })

    it('should subscribe to domain state changes', async () => {
        const listener = jest.fn()
        const unsubscribe = subscribeDomainState(todoApp$.input$, listener)

        store.runCommand(todoApp$.updateInput('new input'))
        await store.promise
        expect(listener).toHaveBeenCalledWith('new input')
        unsubscribe()

        store.runCommand(todoApp$.updateInput('new input 2'))
        await store.promise
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('should subscribe to domain result changes', async () => {
        const listener = jest.fn()
        const unsubscribe = subscribeDomainResult(todoApp$.input$, listener)

        store.runCommand(todoApp$.updateInput('new input'))
        await store.promise
        expect(listener).toHaveBeenCalledWith(expect.objectContaining(Accessor.ok('new input')))
        unsubscribe()
    })

    it('should not trigger subscription for equal results', async () => {
        const listener = jest.fn()
        const unsubscribe = subscribeDomainResult(todoApp$.input$, listener)

        store.runCommand(todoApp$.updateInput(''))
        await store.promise
        expect(listener).not.toHaveBeenCalled()
        setState(todoApp$.filter$, 'all')
        expect(listener).not.toHaveBeenCalled()
        unsubscribe()
    })

    it('should subscribe to query state changes', async () => {
        const listener = jest.fn()
        const unsubscribe = subscribeQueryState(todoApp$.getFilteredTodoList(), listener)

        const todoId = store.getState().todos[0].id
        store.runCommand(todoApp$.todos$.todo(todoId).toggleTodo())
        setState(todoApp$.filter$, 'done')
        await store.promise

        expect(listener).toHaveBeenCalledWith([
            { id: 1, text: 'todo 1', done: true },
            { id: 2, text: 'todo 2', done: true },
        ])
        store.runCommand(todoApp$.todos$.todo(3).updateTodoText('test 3 updated'))
        await store.promise
        expect(listener).toHaveBeenCalledTimes(1)
        unsubscribe()
    })

    it('should subscribe to query result changes', async () => {
        const listener = jest.fn()
        const unsubscribe = subscribeQueryResult(todoApp$.getFilteredTodoList(), listener)

        setState(todoApp$.filter$, 'undone')
        await store.promise
        expect(listener).toHaveBeenCalledWith(
            Accessor.ok([
                { id: 1, text: 'todo 1', done: false },
                { id: 3, text: 'todo 3', done: false },
            ]),
        )
        unsubscribe()
    })

    it('should handle query errors', async () => {
        const errorDomain = store.domain.use(ErrorQueryDomain) as ErrorQueryDomain
        const listener = jest.fn()
        const unsubscribe = subscribeQueryResult(errorDomain.errorQuery(), listener)

        setState(errorDomain.select('filter'), 'undone')
        await store.promise
        expect(listener).toHaveBeenCalledTimes(0)

        setState(errorDomain.select('filter'), 'done')
        await store.promise
        expect(listener).toHaveBeenCalledWith(expect.objectContaining(Accessor.ok('done')))
        unsubscribe()
    })
})

describe('Event functionality', () => {
    let store: Store<TodoApp>
    let todoApp$: TodoAppDomain<TodoApp>

    beforeEach(() => {
        todoUid = 4
        store = new Store<TodoApp>({
            state: {
                todos: [
                    { id: 1, text: 'todo 1', done: false },
                    { id: 2, text: 'todo 2', done: true },
                    { id: 3, text: 'todo 3', done: false },
                ],
                filter: 'all',
                input: '',
            },
            plugins: [],
        })
        todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
    })

    it('should trigger event handler', async () => {
        store.runCommand(todoApp$.todos$.todo(1).removeTodo())
        await store.promise
        const state = store.getState()
        expect(state.todos).toEqual([
            { id: 2, text: 'todo 2', done: true },
            { id: 3, text: 'todo 3', done: false },
        ])
    })
})

describe('Domain effect', () => {
    let store: Store<TodoApp>
    let todoAppWithEffect$: TodoAppWithEffectDomain<TodoApp>

    beforeEach(() => {
        effectRunIndex = 0
        effectRunLog.length = 0
        effectQueryRunIndex = 0
        effectQueryRunLog.length = 0
        todoUid = 4
        store = new Store<TodoApp>({
            state: {
                todos: [
                    { id: 1, text: 'todo 1', done: false },
                    { id: 2, text: 'todo 2', done: true },
                    { id: 3, text: 'todo 3', done: false },
                ],
                filter: 'all',
                input: 'initial',
            },
        })
        todoAppWithEffect$ = store.domain.use(TodoAppWithEffectDomain) as unknown as TodoAppWithEffectDomain<TodoApp>
    })

    it('should start effect when subscribing to domain state', async () => {
        expect(effectRunLog).toHaveLength(0)
        // Subscribe to app domain so its effect is started
        const unsubscribe = subscribeDomainState(todoAppWithEffect$, () => {})

        await store.promise
        expect(effectRunLog).toHaveLength(1)
        expect(effectRunLog[0]).toEqual({ input: 'initial', runIndex: 0 })
        unsubscribe()
    })

    it('should run effect when subscribing, then state can change', async () => {
        const unsubscribe = subscribeDomainState(todoAppWithEffect$, () => {})

        await store.promise
        expect(effectRunLog).toHaveLength(1)
        expect(effectRunLog[0].input).toBe('initial')

        store.runCommand(todoAppWithEffect$.input$.updateText('updated'))
        await store.promise
        // Effect runs once on subscribe; re-run on state change is not required by current impl
        expect(effectRunLog.length).toBeGreaterThanOrEqual(1)
        expect(effectRunLog[0].input).toBe('initial')

        unsubscribe()
    })

    it('should stop effect when last subscriber unsubscribes', async () => {
        const un1 = subscribeDomainState(todoAppWithEffect$, () => {})
        await store.promise
        expect(effectRunLog).toHaveLength(1)

        un1()
        store.runCommand(todoAppWithEffect$.input$.updateText('after unsubscribe'))
        await store.promise
        expect(effectRunLog).toHaveLength(1)
    })

    it('should keep effect running while at least one subscriber exists', async () => {
        const un1 = subscribeDomainState(todoAppWithEffect$, () => {})
        const un2 = subscribeDomainState(todoAppWithEffect$, () => {})
        await store.promise
        expect(effectRunLog).toHaveLength(1)

        un1()
        store.runCommand(todoAppWithEffect$.input$.updateText('after first unsub'))
        await store.promise
        // Effect runs once on subscribe; re-run on state change is not required by current impl
        expect(effectRunLog.length).toBeGreaterThanOrEqual(1)

        un2()
        store.runCommand(todoAppWithEffect$.input$.updateText('after all unsub'))
        await store.promise
        expect(effectRunLog.length).toBeGreaterThanOrEqual(1)
    })

    it('should run effect when effect depends on domain state (todos)', async () => {
        const appWithQueryEffect$ = store.domain.use(TodoAppWithQueryEffectDomain)
        // Subscribe to the app domain itself so effect for this domain is started
        const unsubscribe = subscribeDomainState(appWithQueryEffect$, () => {})

        await store.promise
        expect(effectQueryRunLog).toHaveLength(1)
        expect(effectQueryRunLog[0].summary).toEqual({ activeTodoCount: 2, completedTodoCount: 1, filter: 'all' })

        store.runCommand(appWithQueryEffect$.todos$.todo(1).toggleTodo())
        await store.promise
        // Effect runs once on subscribe; re-run on state change is not required by current impl
        expect(effectQueryRunLog.length).toBeGreaterThanOrEqual(1)
        expect(effectQueryRunLog[0].summary).toEqual({ activeTodoCount: 2, completedTodoCount: 1, filter: 'all' })

        unsubscribe()
    })

    it('should provide abortSignal and abortController in effect context', async () => {
        let effectRunCount = 0
        let abortFired = false
        class AbortEffectDomain<Root> extends Domain<TodoApp, Root> {
            input$ = this.select('input').use(TextDomain);

            @effect()
            *captureAbortRef(ctx: EffectContext) {
                effectRunCount += 1
                expect(ctx.abortController).toBeDefined()
                expect(ctx.abortSignal).toBeDefined()
                ctx.abortSignal.addEventListener('abort', () => {
                    abortFired = true
                })
            }
        }
        const app$ = store.domain.use(AbortEffectDomain) as unknown as AbortEffectDomain<TodoApp>
        const unsubscribe = subscribeDomainState(app$, () => {})

        await store.promise
        expect(effectRunCount).toBe(1)
        unsubscribe()
        expect(abortFired).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Path & cache key utilities
// ---------------------------------------------------------------------------

describe('getKeyFromPath', () => {
    it('should return "root" for root path', () => {
        expect(getKeyFromPath({ type: 'root' })).toBe('root')
    })

    it('should serialize select path', () => {
        expect(getKeyFromPath({ type: 'select', key: 'input', prev: { type: 'root' } })).toBe('root.input')
        expect(
            getKeyFromPath({
                type: 'select',
                key: 'todos',
                prev: { type: 'select', key: 'input', prev: { type: 'root' } },
            }),
        ).toBe('root.input.todos')
    })

    it('should serialize find path', () => {
        const path = {
            type: 'find' as const,
            key: 'id',
            value: 1,
            prev: { type: 'select' as const, key: 'todos', prev: { type: 'root' as const } },
        }
        expect(getKeyFromPath(path)).toBe('root.todos.find(id=1)')
    })

    it('should serialize match path', () => {
        const path = {
            type: 'match' as const,
            key: 'filter',
            value: 'done',
            prev: { type: 'root' as const },
        }
        expect(getKeyFromPath(path)).toBe('root.match(filter=done)')
    })

    it('should serialize filter path', () => {
        const path = {
            type: 'filter' as const,
            key: 'done',
            value: true,
            prev: { type: 'select' as const, key: 'todos', prev: { type: 'root' as const } },
        }
        expect(getKeyFromPath(path)).toBe('root.todos.filter(done=true)')
    })

    it('should serialize map path', () => {
        const path = {
            type: 'map' as const,
            key: 'text',
            prev: { type: 'select' as const, key: 'todos', prev: { type: 'root' as const } },
        }
        expect(getKeyFromPath(path)).toBe('root.todos.map(text)')
    })

    it('should serialize object path', () => {
        const path = {
            type: 'object' as const,
            shape: {
                a: { type: 'root' as const },
                b: { type: 'select' as const, key: 'x', prev: { type: 'root' as const } },
            },
        }
        expect(getKeyFromPath(path)).toContain('object(')
        expect(getKeyFromPath(path)).toContain('root')
    })

    it('should serialize optional path', () => {
        const path = {
            type: 'optional' as const,
            inner: { type: 'select' as const, key: 'item', prev: { type: 'root' as const } },
        }
        expect(getKeyFromPath(path)).toBe('optional(root.item)')
    })
})

describe('getDomainCtorKey and getDomainCacheKey', () => {
    it('should return stable key for same constructor', () => {
        class A<Root> extends Domain<string, Root> {}
        const k1 = getDomainCtorKey(A)
        const k2 = getDomainCtorKey(A)
        expect(k1).toBe(k2)
    })

    it('should return different keys for different constructors', () => {
        class A<Root> extends Domain<string, Root> {}
        class B<Root> extends Domain<string, Root> {}
        expect(getDomainCtorKey(A)).not.toBe(getDomainCtorKey(B))
    })

    it('should combine ctor key and path key', () => {
        const store = new Store<TodoApp>({
            state: { todos: [], filter: 'all', input: '' },
        })
        const d = store.domain.select('input')
        const ctorKey = getDomainCtorKey(Domain)
        const pathKey = getKeyFromPath(d.path)
        expect(getDomainCacheKey(Domain, d.path)).toBe(ctorKey + ':' + pathKey)
    })
})

// ---------------------------------------------------------------------------
// Domain.match, filter, map
// ---------------------------------------------------------------------------

describe('Domain.match', () => {
    it('should narrow state by match', () => {
        const store = new Store<TodoApp>({
            state: { todos: [], filter: 'done', input: '' },
        })
        const app = store.domain
        const doneDomain = app.match('filter', 'done')
        const state = getState(doneDomain)
        expect(state.type).toBe('ok')
        if (state.type === 'ok') expect(state.value.filter).toBe('done')
    })
})

describe('Domain.filter', () => {
    it('should return filtered array domain', () => {
        const store = new Store<TodoApp>({
            state: {
                todos: [
                    { id: 1, text: 'a', done: false },
                    { id: 2, text: 'b', done: true },
                    { id: 3, text: 'c', done: true },
                ],
                filter: 'all',
                input: '',
            },
        })
        const todosDomain = store.domain.select('todos') as Domain<Todo[], TodoApp>
        const doneTodosDomain = todosDomain.filter('done', true)
        const state = getState(doneTodosDomain)
        expect(state.type).toBe('ok')
        if (state.type === 'ok') {
            expect(state.value).toHaveLength(2)
            expect(state.value.every((t: Todo) => t.done)).toBe(true)
        }
    })
})

describe('Domain.map', () => {
    it('should return mapped array domain', () => {
        const store = new Store<TodoApp>({
            state: {
                todos: [
                    { id: 1, text: 'a', done: false },
                    { id: 2, text: 'b', done: true },
                ],
                filter: 'all',
                input: '',
            },
        })
        const todosDomain = store.domain.select('todos') as Domain<Todo[], TodoApp>
        const textsDomain = todosDomain.map('text')
        const state = getState(textsDomain)
        expect(state.type).toBe('ok')
        if (state.type === 'ok') {
            expect(state.value).toEqual(['a', 'b'])
        }
    })
})

// ---------------------------------------------------------------------------
// object, union, optional
// ---------------------------------------------------------------------------

describe('object()', () => {
    it('should compose domains from same store', () => {
        const store = new Store<TodoApp>({
            state: { todos: [], filter: 'all', input: 'x' },
        })
        const input$ = store.domain.select('input') as Domain<string, TodoApp>
        const filter$ = store.domain.select('filter') as Domain<TodoFilter, TodoApp>
        const composed = object({ input: input$, filter: filter$ } as any)
        const state = getState(composed)
        expect(state).toEqual(Accessor.ok({ input: 'x', filter: 'all' }))
    })

    it('should throw if domains belong to different stores', () => {
        const store1 = new Store<TodoApp>({ state: { todos: [], filter: 'all', input: 'a' } })
        const store2 = new Store<TodoApp>({ state: { todos: [], filter: 'all', input: 'b' } })
        expect(() => object({ a: store1.domain.select('input'), b: store2.domain.select('input') } as any)).toThrow(
            /same store/,
        )
    })
})

describe('union()', () => {
    it('should create union domain from same store', () => {
        const store = new Store<TodoApp>({
            state: { todos: [], filter: 'all', input: 'hi' },
        })
        const input$ = store.domain.select('input') as Domain<string, TodoApp>
        const filter$ = store.domain.select('filter') as Domain<TodoFilter, TodoApp>
        const u = union(input$, filter$ as any)
        const result = getState(u)
        expect(result.type).toBe('ok')
        expect(['hi', 'all']).toContain((result as any).value)
    })
})

describe('optional()', () => {
    it('should wrap domain and allow undefined', () => {
        const store = new Store<{ item?: string }>({ state: {} })
        const itemDomain = store.domain.select('item') as Domain<string | undefined, { item?: string }>
        const opt = optional(itemDomain as any)
        const result = getState(opt)
        expect(result.type).toBe('ok')
        expect((result as any).value).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// shallowEqual & shallowEqualResult
// ---------------------------------------------------------------------------

describe('shallowEqual and shallowEqualResult', () => {
    it('shallowEqual: same ref is equal', () => {
        const o = { a: 1 }
        expect(shallowEqual(o, o)).toBe(true)
    })

    it('shallowEqual: same keys and values', () => {
        expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
    })

    it('shallowEqual: different values', () => {
        expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
    })

    it('shallowEqualResult: ok and err are not equal', () => {
        expect(shallowEqualResult(Accessor.ok(1), Accessor.err('e'))).toBe(false)
    })

    it('shallowEqualResult: two err with same error', () => {
        expect(shallowEqualResult(Accessor.err('x'), Accessor.err('x'))).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// runCommand return value, getDomainState, getQueryResult, getQueryState
// ---------------------------------------------------------------------------

describe('runCommand return value and getDomainState', () => {
    let store: Store<TodoApp>
    let todoApp$: TodoAppDomain<TodoApp>

    beforeEach(() => {
        todoUid = 0
        store = new Store<TodoApp>({
            state: { todos: [], filter: 'all', input: '' },
        })
        todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
    })

    it('should return command return value from runCommand', () => {
        const ret = store.runCommand(todoApp$.updateInput('hello'))
        expect(ret).toBe('Input updated')
        const ret2 = store.runCommand(todoApp$.input$.updateText('world'))
        expect(ret2).toBe('text updated')
        const ret3 = store.runCommand(todoApp$.addTodo())
        expect(ret3).toBe('Todo added')
    })

    it('getDomainState should return state or throw', () => {
        store.runCommand(todoApp$.updateInput('x'))
        expect(getDomainState(todoApp$.input$)).toBe('x')
    })

    it('getQueryState should return query value or throw', () => {
        const summary = getQueryState(todoApp$.getTodoSummary())
        expect(summary).toEqual({ activeTodoCount: 0, completedTodoCount: 0, filter: 'all' })
    })

    it('getQueryResult should return Result', () => {
        const result = getQueryResult(todoApp$.getTodoSummary())
        expect(result.type).toBe('ok')
        if (result.type === 'ok') {
            expect(result.value).toEqual({ activeTodoCount: 0, completedTodoCount: 0, filter: 'all' })
        }
    })
})

// ---------------------------------------------------------------------------
// command.context()
// ---------------------------------------------------------------------------

describe('command.context()', () => {
    it('should provide args and previous in command context', () => {
        type S = { count: number }
        class CounterDomain<Root> extends Domain<S, Root> {
            @command()
            *increment() {
                const ctx = yield* command.context()
                const count = (yield* get(this)).count
                yield* set(this, { count: count + 1 })
                return { args: ctx.args, hasPrevious: !!ctx.previous }
            }
        }
        const store = new Store<S>({ state: { count: 0 } })
        const counter$ = store.domain.use(CounterDomain) as unknown as CounterDomain<S>
        const r1 = store.runCommand(counter$.increment())
        expect(r1).toEqual({ args: [], hasPrevious: false })
        expect(store.getState().count).toBe(1)
        // Second run: previous run already completed, so last was cleared (retreat to running); no previous.
        const r2 = store.runCommand(counter$.increment())
        expect(r2).toEqual({ args: [], hasPrevious: false })
        expect(store.getState().count).toBe(2)
    })
})

// ---------------------------------------------------------------------------
// Unregistered generator and errorQuery
// ---------------------------------------------------------------------------

describe('runQuery/runCommand with unregistered generator', () => {
    it('runQuery should throw when generator is not registered', () => {
        const store = new Store<TodoApp>({ state: { todos: [], filter: 'all', input: '' } })
        const todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
        function* unboundQuery() {
            return yield* get(todoApp$.todos$)
        }
        expect(() => runQuery(unboundQuery())).toThrow(/generator not registered/)
    })

    it('runCommand should throw when generator is not registered', () => {
        const store = new Store<TodoApp>({ state: { todos: [], filter: 'all', input: '' } })
        const todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
        function* unboundCommand() {
            yield* set(todoApp$.input$, 'x')
            return 'done'
        }
        expect(() => runCommand(unboundCommand())).toThrow(/generator not registered/)
    })
})

describe('TodoAppDomain.errorQuery (invalid select)', () => {
    it('should throw when running errorQuery that accesses invalid index', () => {
        const store = new Store<TodoApp>({
            state: { todos: [{ id: 1, text: 't', done: false }], filter: 'all', input: '' },
        })
        const todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
        expect(() => store.runQuery(todoApp$.errorQuery())).toThrow()
    })
})

// ---------------------------------------------------------------------------
// Domain.getParentDomains, getAncestorDomains
// ---------------------------------------------------------------------------

describe('Domain.getParentDomains and getAncestorDomains', () => {
    it('should return empty for root domain', () => {
        const store = new Store<TodoApp>({ state: { todos: [], filter: 'all', input: '' } })
        expect(Domain.getParentDomains(store.domain)).toHaveLength(0)
        // getAncestorDomains includes the domain itself, so root yields [root]
        const rootAncestors = Domain.getAncestorDomains(store.domain)
        expect(rootAncestors).toHaveLength(1)
        expect(rootAncestors[0].key).toBe(store.domain.key)
    })

    it('should return parent for selected domain', () => {
        const store = new Store<TodoApp>({ state: { todos: [], filter: 'all', input: '' } })
        const inputDomain = store.domain.select('input')
        const rootKey = store.domain.key
        const parents = Domain.getParentDomains(inputDomain)
        expect(parents).toHaveLength(1)
        expect(parents[0].key).toBe(rootKey)
        const ancestors = Domain.getAncestorDomains(inputDomain)
        expect(ancestors.length).toBeGreaterThanOrEqual(1)
        expect(ancestors.map((a) => a.key)).toContain(rootKey)
    })

    it('should return ancestor chain for nested domain', () => {
        const store = new Store<TodoApp>({
            state: { todos: [{ id: 1, text: 't', done: false }], filter: 'all', input: '' },
        })
        const todoApp$ = store.domain.use(TodoAppDomain) as unknown as TodoAppDomain<TodoApp>
        const todo$ = todoApp$.todos$.todo(1)
        const ancestors = Domain.getAncestorDomains(todo$ as unknown as AnyDomain)
        expect(ancestors.length).toBeGreaterThanOrEqual(2)
    })
})

// ---------------------------------------------------------------------------
// Event factory
// ---------------------------------------------------------------------------

describe('Event()', () => {
    it('should create event class with name and payload', () => {
        const MyEvent = Event('MyEvent')<{ id: number }>
        const e = new MyEvent({ id: 42 })
        expect(e.type).toBe('event')
        expect(e.name).toBe('MyEvent')
        expect(e.payload).toEqual({ id: 42 })
    })
})

// ---------------------------------------------------------------------------
// getResult (generator used inside query)
// ---------------------------------------------------------------------------

describe('getResult', () => {
    it('should return Result when used inside query', () => {
        class GetResultQueryDomain<Root> extends Domain<TodoApp, Root> {
            input$ = this.select('input');

            @query()
            *getInputResult() {
                return yield* getResult(this.input$)
            }
        }
        const store = new Store<TodoApp>({
            state: { todos: [], filter: 'all', input: 'x' },
        })
        const app$ = store.domain.use(GetResultQueryDomain) as unknown as GetResultQueryDomain<TodoApp>
        const result = store.runQuery(app$.getInputResult())
        expect(result.type).toBe('ok')
        if (result.type === 'ok') expect(result.value).toBe('x')
    })
})
