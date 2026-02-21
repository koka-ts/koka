import {
    Domain,
    set,
    get,
    emit,
    Event,
    event,
    query,
    command,
    effect,
    waitFor,
    all,
    type EffectContext,
} from 'koka-domain'
import * as Err from 'koka/err'

export class TextDomain<Root = any> extends Domain<string, Root> {
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

export class BoolDomain<Root = any> extends Domain<boolean, Root> {
    @command()
    *toggle() {
        yield* set(this, (v: boolean) => !v)
        return 'bool toggled'
    }
}

/** Emitted by TodoDomain when animation ends; TodoListDomain performs actual remove. */
export class RemoveTodoEvent extends Event('RemoveTodo')<{ todoId: number }> {}

// ---------------------------------------------------------------------------
// Animation: reusable single-animation state (key inside state), start/end events
// ---------------------------------------------------------------------------

export type AnimationKind = 'enter' | 'exit'

export type AnimationState = {
    kind: AnimationKind
    startedAt: number
    durationMs: number
    progress: number
}

export function rafThenDelay(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            resolve()
        })
    })
}

/**
 * Reusable animation domain: single AnimationState | undefined per instance.
 * animate(initialState) sets state and runs a while-true loop with waitFor(rafThenDelay),
 * advancing progress each frame until progress >= 1, then clears state and returns.
 */
export class AnimationDomain<Root = any> extends Domain<AnimationState | undefined, Root> {
    @command()
    *animate(initialState: AnimationState) {
        yield* set(this, initialState)
        while (true) {
            yield* waitFor(rafThenDelay())
            const anim = yield* get(this)
            if (anim == undefined) {
                return
            }
            const progress = Math.min(1, (Date.now() - anim.startedAt) / anim.durationMs)
            if (progress >= 1) {
                yield* set(this, undefined)
                return
            }
            yield* set(this, { ...anim, progress })
        }
    }
}

export const REMOVE_ANIMATION_MS = 3200

// ---------------------------------------------------------------------------
// Todo: extends with optional animation state
// ---------------------------------------------------------------------------

export type Todo = {
    id: number
    text: string
    done: boolean
    animation?: AnimationState
}

export class TodoDomain<Root = any> extends Domain<Todo, Root> {
    text = this.select('text').use(TextDomain)
    done = this.select('done').use(BoolDomain)
    animation = this.select('animation').use(AnimationDomain);

    @command()
    *updateTodoText(text: string) {
        yield* set(this.text, text)
        return 'todo updated'
    }

    @command()
    *toggleTodo() {
        yield* set(this.done, (v: boolean) => !v)
        return 'todo toggled'
    }

    @command()
    *removeTodo() {
        const todo = yield* get(this)
        yield* this.animation.animate({
            kind: 'exit',
            startedAt: Date.now(),
            durationMs: REMOVE_ANIMATION_MS,
            progress: 0,
        })
        yield* emit(new RemoveTodoEvent({ todoId: todo.id }))
        return 'todo removed'
    }
}

let todoUid = 6000

export class TodoListDomain<Root = any> extends Domain<Todo[], Root> {
    @command()
    *addTodo(text: string) {
        const newTodo: Todo = { id: todoUid++, text, done: false }
        yield* set(this, (todos: Todo[]) => [...todos, newTodo])
        return 'todo added'
    }

    @event(RemoveTodoEvent)
    *handleRemoveTodo(payload: { todoId: number }) {
        yield* set(this, (todos: Todo[]) => todos.filter((t) => t.id !== payload.todoId))
    }

    @command()
    *toggleAll() {
        const todos = yield* get(this)
        const allDone = todos.every((todo) => todo.done)
        yield* set(this, (todos: Todo[]) => todos.map((todo) => ({ ...todo, done: !allDone })))
        return 'all todos toggled'
    }

    @command()
    *clearCompleted() {
        const todos = yield* get(this)
        const completed = todos.filter((t) => t.done)
        if (completed.length === 0) return 'completed todos cleared'
        yield* all(completed.map((t) => this.todo(t.id).removeTodo()))
        return 'completed todos cleared'
    }

    @command()
    *removeTodo(id: number) {
        yield* set(this, (todos: Todo[]) => todos.filter((todo) => todo.id !== id))
        return 'todo removed'
    }

    todo(id: number): TodoDomain<Root> {
        return this.find('id', id).use(TodoDomain)
    }

    @query()
    *getCompletedTodoList() {
        const list = yield* get(this)
        return list.filter((t) => t.done)
    }

    @query()
    *getActiveTodoList() {
        const list = yield* get(this)
        return list.filter((t) => !t.done)
    }

    @query()
    *getTodoCount() {
        const list = yield* get(this)
        return list.length
    }

    @query()
    *getCompletedTodoCount() {
        const list = yield* get(this)
        return list.filter((t) => t.done).length
    }

    @query()
    *getActiveTodoCount() {
        const list = yield* get(this)
        return list.filter((t) => !t.done).length
    }

    @query()
    *getTodoDoneList() {
        const list = yield* get(this)
        return list.map((t) => t.done)
    }
}

export type TodoFilter = 'all' | 'done' | 'undone'

export class TodoFilterDomain<Root = any> extends Domain<TodoFilter, Root> {
    @command()
    *setFilter(filter: TodoFilter) {
        yield* set(this, filter)
        return 'filter set'
    }
}

export class TodoInputErr extends Err.Err('TodoInputErr')<string> {}

/** Domain for a single number (e.g. last-saved timestamp). */
class LastSavedAtDomain<Root = any> extends Domain<number | null, Root> {}

export type TodoApp = {
    todos: Todo[]
    filter: TodoFilter
    input: string
    lastSavedAt: number | null
}

export const TODOS_STORAGE_KEY = 'koka-demo-todos'

export class TodoAppDomain<Root = any> extends Domain<TodoApp, Root> {
    todos = this.select('todos').use(TodoListDomain)
    todoFilter = this.select('filter').use(TodoFilterDomain)
    input = this.select('input').use(TextDomain)
    lastSavedAt = this.select('lastSavedAt').use(LastSavedAtDomain)

    /**
     * Optional storage key for persisting this instance's todos to localStorage.
     * Set by the composition layer (e.g. main.tsx) so save/load use the same key.
     * Do not derive from domain path — upstream path is unpredictable with domain composition.
     */
    storageKey?: string

    /** Filtered todos domain by filter type (uses deriving .filter). */
    todosByFilter(filterType: TodoFilter): Domain<Todo[], Root> {
        const list = this.select('todos')
        if (filterType === 'all') return list
        if (filterType === 'done') return list.filter('done', true)
        return list.filter('done', false)
    }

    /** Persist todos to localStorage when the list changes. Only runs when storageKey is set by the composition layer. Do not set domain state here or effect re-run can cause an infinite loop. */
    @effect()
    *syncTodosToStorage(_ctx: EffectContext) {
        if (this.storageKey == null) return
        const todos = yield* get(this.todos)
        localStorage.setItem(this.storageKey, JSON.stringify(todos))
    }

    @command()
    *addTodo() {
        const todoApp = yield* get(this)
        if (todoApp.input === '') {
            throw new TodoInputErr('Input is empty')
        }
        yield* this.todos.addTodo(todoApp.input)
        yield* set(this.input, '')
        return 'Todo added'
    }

    @command()
    *updateInput(input: string) {
        yield* set(this.input, input)
        return 'Input updated'
    }

    @query()
    *getFilteredTodoList() {
        const filter = yield* get(this.todoFilter)
        return yield* get(this.todosByFilter(filter))
    }

    @query()
    *getFilteredTodoIds() {
        const filter = yield* get(this.todoFilter)
        return yield* get(this.todosByFilter(filter).map('id'))
    }
}
