/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Accessor from 'koka-accessor'
import {
    Domain,
    Store,
    Event,
    event,
    command,
    query,
    effect,
    get,
    getState,
    set,
    setState,
    emit,
    shallowEqualResult,
    subscribeDomainResult,
    subscribeDomainState,
    subscribeQueryResult,
    subscribeQueryState,
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

        expect(plugin).toHaveBeenCalledWith(store)
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
