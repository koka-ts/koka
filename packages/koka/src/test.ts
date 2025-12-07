import * as Koka from './koka.ts'
import * as Async from './async.ts'
import * as Task from './task.ts'
const executionOrder: string[] = []
const controller = new AbortController()

function* innerTask(index: number) {
    return yield* Koka.try(function* () {
        executionOrder.push(`inner-task-${index}-start`)
        yield* Async.await(new Promise(() => { })) // Never resolves
        executionOrder.push(`inner-task-${index}-end`) // Should not reach here
        return `inner-${index}`
    }).finally(function* () {
        executionOrder.push(`inner-task-${index}-finally`)
    })
}

function* middleTask() {
    return yield* Koka.try(function* () {
        executionOrder.push('middle-task-start')
        return yield* Task.all([innerTask(0), innerTask(1)])
    }).finally(function* () {
        executionOrder.push('middle-task-finally')
    })
}

function* program() {
    return yield* Koka.try(function* () {
        executionOrder.push('program-start')
        return yield* middleTask()
    }).finally(function* () {
        executionOrder.push('program-finally')
    })
}

const promise = Koka.runAsync(program(), { abortSignal: controller.signal })

// Abort after a short delay to allow tasks to start
setTimeout(() => controller.abort(), 10)

promise.then(
    (result) => {
        console.log('Result:', result)
        console.log('Execution Order:', executionOrder)
    },
    (error) => {
        console.log('Error:', error)
        console.log('Execution Order:', executionOrder)
    },
)