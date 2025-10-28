import * as Domain from 'koka-domain'
import * as Async from 'koka/async'
import * as Err from 'koka/err'

export class TextDomain extends Domain.Domain<string> {
    @Domain.command()
    *updateText(text: string) {
        yield* Domain.set(this, text)
        return 'text updated'
    }
    @Domain.command()
    *clearText() {
        yield* Domain.set(this, '')
        return 'text cleared'
    }
}

export class BoolDomain extends Domain.Domain<boolean> {
    @Domain.command()
    *toggle() {
        yield* Domain.set(this, (value) => !value)
        return 'bool toggled'
    }
}

// Event definition - only for operations that sub-domain cannot handle itself
export class RemoveTodoEvent extends Domain.Event('RemoveTodo')<{ todoId: number }> {}

export type Todo = {
    id: number
    text: string
    done: boolean
}

export class TodoDomain extends Domain.Domain<Todo> {
    text$ = new TextDomain(this.prop('text'))
    done$ = new BoolDomain(this.prop('done'));

    @Domain.command()
    *updateTodoText(text: string) {
        // Can be handled within the domain, no event needed
        yield* this.text$.updateText(text)
        return 'todo updated'
    }

    @Domain.command()
    *toggleTodo() {
        // Can be handled within the domain, no event needed
        yield* this.done$.toggle()
        return 'todo toggled'
    }

    @Domain.command()
    *removeTodo() {
        // Cannot remove itself from the list, needs to emit event to parent domain
        const todo = yield* Domain.get(this)
        yield* Domain.emit(this, new RemoveTodoEvent({ todoId: todo.id }))
        return 'todo remove requested'
    }
}

let todoUid = 100

export class TodoListDomain extends Domain.Domain<Todo[]> {
    @Domain.command()
    *addTodo(text: string) {
        const newTodo = {
            id: todoUid++,
            text,
            done: false,
        }
        yield* Domain.set(this, (todos) => [...todos, newTodo])

        return 'todo added'
    }

    @Domain.command()
    *toggleAll() {
        const todos = yield* Domain.get(this)
        const allDone = todos.every((todo) => todo.done)

        // Can be handled directly within this domain
        yield* Domain.set(this, (todos) => {
            return todos.map((todo) => ({ ...todo, done: !allDone }))
        })

        return 'all todos toggled'
    }

    @Domain.command()
    *clearCompleted() {
        // Can be handled directly within this domain
        yield* Domain.set(this, (todos) => todos.filter((todo) => !todo.done))
        return 'completed todos cleared'
    }

    @Domain.command()
    *removeTodo(id: number) {
        yield* Domain.set(this, (todos) => todos.filter((todo) => todo.id !== id))
        return 'todo removed'
    }

    // Event handler - only handle events from sub-domains that cannot be handled locally
    @Domain.event(RemoveTodoEvent)
    *handleRemoveTodo(event: RemoveTodoEvent) {
        yield* this.removeTodo(event.payload.todoId)
    }

    todo(id: number) {
        const options = this.find((todo) => todo.id === id)
        return new TodoDomain(options) as TodoDomain
    }

    getKey = (todo: Todo) => {
        return todo.id
    }

    completedTodoList$ = this.filter((todo) => todo.done)
    activeTodoList$ = this.filter((todo) => !todo.done)
    activeTodoTextList$ = this.activeTodoList$.map((todo$) => todo$.prop('text'))
    completedTodoTextList$ = this.completedTodoList$.map((todo$) => todo$.prop('text'));

    @Domain.query()
    *getCompletedTodoList() {
        const completedTodoList = yield* Domain.get(this.completedTodoList$)
        return completedTodoList
    }

    @Domain.query()
    *getActiveTodoList() {
        const activeTodoList = yield* Domain.get(this.activeTodoList$)
        return activeTodoList
    }

    @Domain.query()
    *getActiveTodoTextList() {
        const activeTodoTextList = yield* Domain.get(this.activeTodoTextList$)
        return activeTodoTextList
    }

    @Domain.query()
    *getCompletedTodoTextList() {
        const completedTodoTextList = yield* Domain.get(this.completedTodoTextList$)
        return completedTodoTextList
    }

    @Domain.query()
    *getTodoCount() {
        const todoList = yield* Domain.get(this)
        return todoList.length
    }

    @Domain.query()
    *getCompletedTodoCount() {
        const completedTodoList = yield* Domain.get(this.completedTodoList$)
        return completedTodoList.length
    }

    @Domain.query()
    *getActiveTodoCount() {
        const activeTodoList = yield* Domain.get(this.activeTodoList$)
        return activeTodoList.length
    }
}

export type TodoFilter = 'all' | 'done' | 'undone'

export class TodoFilterDomain extends Domain.Domain<TodoFilter> {
    @Domain.command()
    *setFilter(filter: TodoFilter) {
        yield* Domain.set(this, filter)
        return 'filter set'
    }
}

export class TodoInputErr extends Err.Err('TodoInputErr')<string> {}

export type TodoApp = {
    todos: Todo[]
    filter: TodoFilter
    input: string
}

export class TodoAppDomain extends Domain.Domain<TodoApp> {
    todos$ = new TodoListDomain(this.prop('todos'))
    filter$ = new TodoFilterDomain(this.prop('filter'))
    input$ = new TextDomain(this.prop('input'));

    @Domain.command()
    *addTodo() {
        const todoApp = yield* Domain.get(this)

        if (todoApp.input === '') {
            throw yield* Err.throw(new TodoInputErr('Input is empty'))
        }

        yield* this.todos$.addTodo(todoApp.input)
        yield* this.input$.clearText()
        return 'Todo added'
    }

    @Domain.command()
    *updateInput(input: string) {
        yield* Async.await(Promise.resolve('test async'))
        yield* this.input$.updateText(input)
        return 'Input updated'
    }

    @Domain.query()
    *getFilteredTodoList() {
        const todoList = yield* Domain.get(this.todos$)
        const filter = yield* Domain.get(this.filter$)

        if (filter === 'all') {
            return todoList
        }

        if (filter === 'done') {
            return todoList.filter((todo) => todo.done)
        }

        if (filter === 'undone') {
            return todoList.filter((todo) => !todo.done)
        }

        return todoList
    }

    @Domain.query()
    *getFilteredTodoIds() {
        const todoList = yield* this.getFilteredTodoList()
        return todoList.map((todo) => todo.id)
    }
}
