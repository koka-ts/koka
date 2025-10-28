import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Domain from 'koka-domain'
import { PrettyLogger } from 'koka-domain/pretty-browser-logger'
import { useDomainState } from 'koka-react'
import { type TodoApp, TodoAppDomain } from './domain'
import './index.css'
import App from './App.tsx'

type AppState = {
    todoApp: TodoApp
    todoAppList: TodoApp[]
}

type MainProps = {
    domain: Domain.Domain<AppState, AppState>
}

function Main(props: MainProps) {
    const count = useDomainState(props.domain.select((app) => app.todoAppList.length))
    const [mode, setMode] = useState<'todo-app' | 'todo-app-list'>('todo-app')

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
                            const todoApp$ = new TodoAppDomain(props.domain.select((app) => app.todoAppList[index]))

                            return (
                                <div
                                    key={index}
                                    className="w-full max-w-sm transform transition-all duration-300 hover:scale-105 hover:shadow-2xl"
                                >
                                    <div className="relative">
                                        <div className="absolute -top-2 -right-2 bg-linear-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                                            #{index + 1}
                                        </div>
                                        <App todoApp$={todoApp$} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="flex justify-center">
                        <div className="transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
                            <App todoApp$={new TodoAppDomain(props.domain.prop('todoApp'))} />
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

const initialState: AppState = {
    todoApp: {
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

const store = new Domain.Store<AppState>({
    state: initialState,
    plugins: [PrettyLogger()],
})

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Main domain={store.domain} />
    </StrictMode>,
)
