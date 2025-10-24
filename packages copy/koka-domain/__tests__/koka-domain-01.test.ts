import * as Accessor from 'koka-accessor'
import * as Async from 'koka/async'
import * as Koka from 'koka'
import * as Result from 'koka/result'
import * as Err from 'koka/err'
import { Domain, Store, get, set } from '../src/koka-domain.ts'

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

class TextDomain<Root> extends Domain<string, Root> {
    *updateText(text: string) {
        yield* set(this, text)
        return 'text updated'
    }
    *clearText() {
        yield* set(this, '')
        return 'text cleared'
    }
}

class BoolDomain<Root> extends Domain<boolean, Root> {
    *toggle() {
        yield* set(this, (value) => !value)
        return 'bool toggled'
    }
}

class TodoDomain<Root> extends Domain<Todo, Root> {
    text$ = new TextDomain(this.prop('text'))
    done$ = new BoolDomain(this.prop('done'));

    *updateTodoText(text: string) {
        const done = yield* get(this.done$)
        yield* this.text$.updateText(text)
        return 'todo updated'
    }

    *toggleTodo() {
        yield* this.done$.toggle()
        return 'todo toggled'
    }
}

let todoUid = 0

class TodoListDomain<Root> extends Domain<Todo[], Root> {
    *addTodo(text: string) {
        const newTodo = {
            id: todoUid++,
            text,
            done: false,
        }
        yield* set(this, (todos) => [...todos, newTodo])

        return 'todo added'
    }

    todo(id: number) {
        return new TodoDomain(this.find((todo) => todo.id === id))
    }

    getKey = (todo: Todo) => {
        return todo.id
    }

    completedTodoList$ = this.filter((todo) => todo.done)
    activeTodoList$ = this.filter((todo) => !todo.done)
    activeTodoTextList$ = this.activeTodoList$.map((todo$) => todo$.prop('text'))
    completedTodoTextList$ = this.completedTodoList$.map((todo$) => todo$.prop('text'))
}

class TodoInputErr extends Err.Err('TodoInputErr')<string> {}

class TodoAppDomain<Root> extends Domain<TodoApp, Root> {
    todos$ = new TodoListDomain(this.prop('todos'))
    input$ = new TextDomain(this.prop('input'));

    *addTodo() {
        const todoApp = yield* get(this)

        if (todoApp.input === '') {
            throw yield* Err.throw(new TodoInputErr('Input is empty'))
        }

        yield* this.todos$.addTodo(todoApp.input)
        yield* this.updateInput('')
        return 'Todo added'
    }

    *updateInput(input: string) {
        yield* Async.await(Promise.resolve('test async'))
        yield* this.input$.updateText(input)
        return 'Input updated'
    }
}

describe('TodoAppStore', () => {
    let store: Store<TodoApp>

    beforeEach(() => {
        const state: TodoApp = {
            todos: [],
            filter: 'all',
            input: '',
        }

        store = new Store({
            state,
        })
    })

    it('should add a todo', async () => {
        const todoAppDomain = new TodoAppDomain(store.domain)
        const result: Promise<Result.Result<string, Err.AnyErr>> = Result.runAsync(todoAppDomain.addTodo())

        expect(await result).toEqual({
            type: 'err',
            name: 'TodoInputErr',
            error: 'Input is empty',
        })

        const result2: Promise<Result.Result<string, Err.AnyErr>> = Result.runAsync(todoAppDomain.updateInput('test'))
        expect(await result2).toEqual({
            type: 'ok',
            value: 'Input updated',
        })

        const result3: Promise<Result.Result<string, Err.AnyErr>> = Result.runAsync(todoAppDomain.addTodo())

        expect(await result3).toEqual({
            type: 'ok',
            value: 'Todo added',
        })

        const todos: Result.Result<Todo[], Accessor.AccessorErr> = Result.runSync(get(todoAppDomain.todos$))

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
