import * as Koka from './koka.ts'
import * as Async from './async.ts'
import * as Task from './task.ts'

const executionOrder: string[] = []
const controller = new AbortController()

function* longRunningSubTask(index: number) {
    return yield* Koka.try(function* () {
        executionOrder.push(`sub-task-${index}-start`)
        yield* Async.await(new Promise(() => {})) // Never resolves
        executionOrder.push(`sub-task-${index}-end`) // Should not reach here
        return `task-${index}`
    }).finally(function* () {
        console.log(`sub-task-${index}-finally`)
        executionOrder.push(`sub-task-${index}-finally`)
    })
}

function* program() {
    return yield* Koka.try(function* () {
        executionOrder.push('program-start')
        return yield* Task.all([longRunningSubTask(0), longRunningSubTask(1)])
    }).finally(function* () {
        executionOrder.push('program-finally')
    })
}

const promise = Koka.runAsync(program(), { abortSignal: controller.signal })

// Abort after a short delay to allow tasks to start
setTimeout(() => controller.abort(), 10)

setTimeout(() => {}, 1000000)

promise.finally(() => {
    console.log(executionOrder)
    debugger
})
