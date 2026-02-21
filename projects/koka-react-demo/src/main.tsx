import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Domain, Store } from 'koka-domain'
import { useDomainState } from 'koka-react'
import { type Todo, type TodoApp, TodoAppDomain, TODOS_STORAGE_KEY } from './domain'
import './index.css'
import App from './App.tsx'

const TAB_MODE_STORAGE_KEY = 'koka-demo-tab-mode'
type TabMode = 'todo-app' | 'todo-app-list'

function loadTabMode(): TabMode {
    try {
        const raw = localStorage.getItem(TAB_MODE_STORAGE_KEY)
        if (raw === 'todo-app' || raw === 'todo-app-list') return raw
    } catch {}
    return 'todo-app'
}

function saveTabMode(mode: TabMode) {
    try {
        localStorage.setItem(TAB_MODE_STORAGE_KEY, mode)
    } catch {}
}

type AppState = {
    todoApp: TodoApp
    todoAppList: TodoApp[]
}

type MainProps = {
    domain: Domain<AppState, AppState>
}

function Main(props: MainProps) {
    const count = useDomainState(props.domain.select('todoAppList').select('length'))
    const [mode, setMode] = useState<TabMode>(loadTabMode)

    useEffect(() => {
        saveTabMode(mode)
    }, [mode])

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
            {/* Header Section */}
            <div className="max-w-7xl mx-auto mb-8">
                <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4">
                        Koka Todo Demo
                    </h1>
                    <p className="text-gray-600 text-lg max-w-2xl mx-auto">
                        Experience a modern Todo application built with Koka framework, supporting both single and
                        multiple Todo list management
                    </p>
                </div>

                {/* Mode Toggle Buttons */}
                <div className="flex justify-center mb-8">
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-2 shadow-lg border border-white/20">
                        <button
                            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 ${
                                mode === 'todo-app'
                                    ? 'bg-linear-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                            }`}
                            onClick={() => setMode('todo-app')}
                        >
                            <span className="flex items-center gap-2">
                                <span className="text-lg">📝</span>
                                Single Todo
                            </span>
                        </button>
                        <button
                            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 ${
                                mode === 'todo-app-list'
                                    ? 'bg-linear-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                            }`}
                            onClick={() => setMode('todo-app-list')}
                        >
                            <span className="flex items-center gap-2">
                                <span className="text-lg">📋</span>
                                Multiple Todos ({count})
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="max-w-7xl mx-auto">
                {mode === 'todo-app-list' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 justify-items-center">
                        {Array.from({ length: count }).map((_, index) => {
                            const todoApp = props.domain.select('todoAppList').select(index).use(TodoAppDomain)
                            todoApp.storageKey = `${TODOS_STORAGE_KEY}-${index}`

                            return (
                                <div
                                    key={index}
                                    className="w-full max-w-sm transform transition-all duration-300 hover:scale-105 hover:shadow-2xl"
                                >
                                    <div className="relative">
                                        <div className="absolute -top-2 -right-2 bg-linear-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                                            #{index + 1}
                                        </div>
                                        <App todoApp={todoApp} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="flex justify-center">
                        <div className="transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                            {(() => {
                                const todoApp = props.domain.select('todoApp').use(TodoAppDomain)
                                todoApp.storageKey = TODOS_STORAGE_KEY
                                return <App todoApp={todoApp} />
                            })()}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="max-w-7xl mx-auto mt-12 text-center">
                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
                    <p className="text-gray-600 text-sm">
                        🚀 Built with <span className="font-semibold text-blue-600">Koka</span> framework | 💡 Powered
                        by <span className="font-semibold text-purple-600">React</span> +{' '}
                        <span className="font-semibold text-cyan-600">Tailwind CSS</span>
                    </p>
                </div>
            </div>
        </div>
    )
}

function loadTodosFromStorageKey(key: string): Todo[] | null {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Todo[]
        if (!Array.isArray(parsed)) return null
        return parsed.map((t) => ({ ...t, animation: t.animation }))
    } catch {
        return null
    }
}

const defaultSingleTodos: Todo[] = [
    { id: 101, text: 'Learn koka-domain framework', done: true },
    { id: 102, text: 'Build React todo app', done: true },
    { id: 103, text: 'Write comprehensive documentation', done: false },
    { id: 104, text: 'Add unit tests', done: false },
    { id: 105, text: 'Optimize performance', done: false },
    { id: 106, text: 'Deploy to production', done: false },
]

const defaultTodoAppList: TodoApp[] = [
    {
        todos: [
            { id: 1001, text: 'Learn koka-domain framework', done: true },
            { id: 1002, text: 'Build React todo app', done: true },
            { id: 1003, text: 'Write comprehensive documentation', done: false },
            { id: 1004, text: 'Add unit tests', done: false },
            { id: 1005, text: 'Optimize performance', done: false },
            { id: 1006, text: 'Deploy to production', done: false },
        ],
        input: '',
        filter: 'all',
        lastSavedAt: null,
    },
    {
        todos: [
            { id: 2001, text: 'Buy groceries', done: false },
            { id: 2002, text: 'Cook dinner', done: false },
            { id: 2003, text: 'Clean the house', done: true },
            { id: 2004, text: 'Do laundry', done: false },
            { id: 2005, text: 'Take out trash', done: true },
        ],
        input: '',
        filter: 'undone',
        lastSavedAt: null,
    },
    {
        todos: [
            { id: 3001, text: 'Read "Clean Code" book', done: true },
            { id: 3002, text: 'Practice coding challenges', done: false },
            { id: 3003, text: 'Learn TypeScript advanced features', done: false },
            { id: 3004, text: 'Study design patterns', done: true },
            { id: 3005, text: 'Contribute to open source', done: false },
            { id: 3006, text: 'Attend tech meetup', done: false },
            { id: 3007, text: 'Update portfolio', done: true },
        ],
        input: '',
        filter: 'done',
        lastSavedAt: null,
    },
    {
        todos: [
            { id: 4001, text: 'Morning workout', done: true },
            { id: 4002, text: 'Meditation session', done: false },
            { id: 4003, text: 'Drink 8 glasses of water', done: false },
            { id: 4004, text: 'Take vitamins', done: true },
            { id: 4005, text: 'Go for a walk', done: false },
            { id: 4006, text: 'Get 8 hours of sleep', done: false },
        ],
        input: '',
        filter: 'all',
        lastSavedAt: null,
    },
    {
        todos: [
            { id: 5001, text: 'Plan weekend trip', done: false },
            { id: 5002, text: 'Book flight tickets', done: false },
            { id: 5003, text: 'Reserve hotel room', done: false },
            { id: 5004, text: 'Create travel itinerary', done: false },
            { id: 5005, text: 'Pack luggage', done: false },
        ],
        input: '',
        filter: 'all',
        lastSavedAt: null,
    },
]

const initialState: AppState = {
    todoApp: {
        todos: loadTodosFromStorageKey(TODOS_STORAGE_KEY) ?? defaultSingleTodos,
        input: '',
        filter: 'all',
        lastSavedAt: null,
    },
    todoAppList: defaultTodoAppList.map((item, index) => ({
        ...item,
        todos: loadTodosFromStorageKey(`${TODOS_STORAGE_KEY}-${index}`) ?? item.todos,
    })),
}

const store = new Store<AppState>({
    state: initialState,
})

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Main domain={store.domain} />
    </StrictMode>,
)
