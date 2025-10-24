import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Domain from 'koka-domain'
import { PrettyLogger } from 'koka-domain/pretty-browser-logger'
import { useDomainState } from 'koka-react'
import {
    type TodoApp,
    TodoAppDomain,
    type CoreDomain,
    type TodoStorage,
    type Todo,
    type TextLoggerEnhancer,
} from './domain'
import './index.css'
import App from './App.tsx'

type AppState = {
    todoAppList: TodoApp[]
}

type MainProps = {
    domain: CoreDomain<AppState, AppState>
}

function Main(props: MainProps) {
    const count = useDomainState(props.domain.select((app) => app.todoAppList.length))

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-wrap justify-center gap-8">
                    {Array.from({ length: count }).map((_, index) => {
                        const todoApp$ = new TodoAppDomain(props.domain.select((app) => app.todoAppList[index]))

                        return (
                            <div key={index} className="mb-8">
                                <App todoApp$={todoApp$} />
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

const initialState: AppState = {
    todoAppList: [
        {
            todos: [
                { id: 101, text: 'Learn koka-domain framework', done: true },
                { id: 102, text: 'Build React todo app', done: true },
                { id: 103, text: 'Write comprehensive documentation', done: false },
                { id: 104, text: 'Add unit tests', done: false },
                { id: 105, text: 'Optimize performance', done: false },
                { id: 106, text: 'Deploy to production', done: false },
            ],
            input: '',
            filter: 'all',
        },
        {
            todos: [
                { id: 201, text: 'Buy groceries', done: false },
                { id: 202, text: 'Cook dinner', done: false },
                { id: 203, text: 'Clean the house', done: true },
                { id: 204, text: 'Do laundry', done: false },
                { id: 205, text: 'Take out trash', done: true },
            ],
            input: '',
            filter: 'undone',
        },
        {
            todos: [
                { id: 301, text: 'Read "Clean Code" book', done: true },
                { id: 302, text: 'Practice coding challenges', done: false },
                { id: 303, text: 'Learn TypeScript advanced features', done: false },
                { id: 304, text: 'Study design patterns', done: true },
                { id: 305, text: 'Contribute to open source', done: false },
                { id: 306, text: 'Attend tech meetup', done: false },
                { id: 307, text: 'Update portfolio', done: true },
            ],
            input: '',
            filter: 'done',
        },
        {
            todos: [
                { id: 401, text: 'Morning workout', done: true },
                { id: 402, text: 'Meditation session', done: false },
                { id: 403, text: 'Drink 8 glasses of water', done: false },
                { id: 404, text: 'Take vitamins', done: true },
                { id: 405, text: 'Go for a walk', done: false },
                { id: 406, text: 'Get 8 hours of sleep', done: false },
            ],
            input: '',
            filter: 'all',
        },
        {
            todos: [
                { id: 501, text: 'Plan weekend trip', done: false },
                { id: 502, text: 'Book flight tickets', done: false },
                { id: 503, text: 'Reserve hotel room', done: false },
                { id: 504, text: 'Create travel itinerary', done: false },
                { id: 505, text: 'Pack luggage', done: false },
            ],
            input: '',
            filter: 'all',
        },
    ],
}

export type UseTodoStorageOptions = {
    todoStorageKey: string
}

export function useTodoStorage(options: UseTodoStorageOptions): TodoStorage {
    return {
        async saveTodoList(todoList: Todo[]): Promise<void> {
            localStorage.setItem(options.todoStorageKey, JSON.stringify(todoList))
        },
        async loadTodoList(): Promise<Todo[]> {
            return JSON.parse(localStorage.getItem(options.todoStorageKey) || '[]')
        },
    }
}

export const logText: TextLoggerEnhancer['logText'] = (text) => {
    console.log('[logText]', text)
}

export interface StoreWithTodoStorageOptions<Root> extends Domain.StoreOptions<Root> {
    todoStorageKey?: string
}

export class StoreWithTodoStorage<Root> extends Domain.Store<Root> {
    todoStorage: TodoStorage
    constructor(options: StoreWithTodoStorageOptions<Root>) {
        super(options)
        this.todoStorage = useTodoStorage({
            todoStorageKey: options.todoStorageKey ?? 'todoList',
        })
    }
    logText = logText
}
const store = new StoreWithTodoStorage<AppState>({
    state: initialState,
    plugins: [PrettyLogger()],
})

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Main domain={store.domain} />
    </StrictMode>,
)
