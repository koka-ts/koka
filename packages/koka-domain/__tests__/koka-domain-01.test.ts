import { Domain, Store, getState, command, get, set } from '../src/koka-domain.ts'

type Todo = {
    id: number
    text: string
    done: boolean
}

type TodoApp = {
    todos: Todo[]
    filter: 'all' | 'done' | 'undone'
    input: string
}

class TodoInputErr {
    readonly type = 'err' as const
    readonly name = 'TodoInputErr' as const
    error: string
    constructor(error: string) {
        this.error = error
    }
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

class TodoDomain<Root> extends Domain<Todo, Root> {
    text$ = this.select('text').use(TextDomain)
    done$ = this.select('done').use(BoolDomain);

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
}

let todoUid = 0

class TodoListDomain<Root> extends Domain<Todo[], Root> {
    @command()
    *addTodo(text: string) {
        const newTodo = { id: todoUid++, text, done: false }
        yield* set(this, (todos: Todo[]) => [...todos, newTodo])
        return 'todo added'
    }

    todo(id: number): TodoDomain<Root> {
        return this.find('id', id).use(TodoDomain) as unknown as TodoDomain<Root>
    }
}

class TodoAppDomain<Root> extends Domain<TodoApp, Root> {
    todos$ = this.select('todos').use(TodoListDomain)
    input$ = this.select('input').use(TextDomain);

    @command()
    *addTodo() {
        const app = yield* get(this)
        if (app.input === '') {
            return new TodoInputErr('Input is empty')
        }
        yield* this.todos$.addTodo(app.input)
        yield* (this.input$ as any).clearText()
        return { type: 'ok', value: 'Todo added' }
    }

    @command()
    *updateInput(input: string) {
        yield* set(this.input$, input)
        return 'Input updated'
    }
}

describe('TodoAppStore', () => {
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

    it('should add a todo', async () => {
        const todoAppDomain = store.domain.use(TodoAppDomain) as TodoAppDomain<TodoApp>

        const result1 = store.runCommand((todoAppDomain as any).addTodo())
        expect(result1).toMatchObject({ type: 'err', name: 'TodoInputErr', error: 'Input is empty' })

        const result2 = await store.runCommand((todoAppDomain as any).updateInput('test'))
        expect(result2).toBe('Input updated')

        const result3 = store.runCommand((todoAppDomain as any).addTodo())
        expect(result3).toEqual({ type: 'ok', value: 'Todo added' })

        const todos = getState(todoAppDomain.todos$)
        expect(todos).toEqual({
            type: 'ok',
            value: [
                {
                    id: 0,
                    text: 'test',
                    done: false,
                },
            ],
        })
    })
})
