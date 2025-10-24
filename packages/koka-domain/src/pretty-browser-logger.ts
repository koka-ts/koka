import { ExecutionTree, CommandExecutionTree, QueryExecutionTree, Store, EventExecutionTree } from './koka-domain.ts'

type LoggerOptions = {
    colors?: boolean
    timestamp?: boolean
    showArgs?: boolean
    showReturn?: boolean
    showStates?: boolean
    showChanges?: boolean
    maxDepth?: number
    compactMode?: boolean
    groupOutput?: boolean
}

const defaultOptions: LoggerOptions = {
    colors: true,
    timestamp: true,
    showArgs: true,
    showReturn: true,
    showStates: true,
    showChanges: true,
    maxDepth: 10,
    compactMode: false,
    groupOutput: true,
}

// 图标（使用 emoji 在浏览器中显示效果更好）
const ICONS = {
    COMMAND: '⚡',
    QUERY: '🔍',
    EVENT: '🔔',
    ASYNC: '⏳',
    SUCCESS: '✓',
    ERROR: '✗',
    ARROW: '→',
    CHANGE: '∆',
    STATE: '📊',
    FOLDER: '📁',
    SEARCH: '🔎',
}

// 颜色定义
const COLORS = {
    command: '#4CAF50',
    query: '#2196F3',
    event: '#FFC107',
    async: '#FF9800',
    success: '#4CAF50',
    error: '#F44336',
    gray: '#9E9E9E',
    magenta: '#9C27B0',
    blue: '#03A9F4',
}

// 格式化值，智能处理不同类型
const formatValue = (value: unknown, maxLength: number = 80): string => {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'

    try {
        const stringified = JSON.stringify(value)
        if (stringified.length <= maxLength) {
            return stringified
        }

        // 对于长字符串，进行截断
        if (typeof value === 'string') {
            return `"${value.substring(0, maxLength - 5)}..."`
        }

        // 对于对象和数组，显示摘要
        if (Array.isArray(value)) {
            return `[Array(${value.length})]`
        }

        if (typeof value === 'object') {
            const keys = Object.keys(value)
            return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}`
        }

        return stringified.substring(0, maxLength - 3) + '...'
    } catch {
        return String(value)
    }
}

// 命令执行树格式化函数
const formatCommandTree = (tree: CommandExecutionTree, options: LoggerOptions, depth: number): void => {
    // 构建头部
    let header = `${ICONS.COMMAND} CMD: ${tree.domainName}.${tree.name}`
    if (tree.async) {
        header += ` ${ICONS.ASYNC}`
    }

    const headerStyle = `color: ${COLORS.command}; font-weight: bold; font-size: ${depth === 0 ? '14px' : '12px'}`

    // 创建分组
    if (options.groupOutput) {
        if (depth === 0) {
            console.groupCollapsed(
                `%c${header}${options.timestamp ? ` [${new Date().toISOString()}]` : ''}`,
                headerStyle,
            )
        } else {
            console.group(`%c${header}`, headerStyle)
        }
    } else {
        console.log(`%c${header}`, headerStyle)
    }

    // 参数
    if (options.showArgs && tree.args.length > 0) {
        if (options.compactMode) {
            console.log(
                `%c  ${ICONS.ARROW} Args:`,
                `color: ${COLORS.gray}; font-weight: bold`,
                tree.args.map((arg) => formatValue(arg, 40)).join(', '),
            )
        } else {
            console.group(`%c  ${ICONS.ARROW} Args:`, `color: ${COLORS.gray}; font-weight: bold`)
            tree.args.forEach((arg, index) => {
                console.log(`[${index}]:`, arg)
            })
            console.groupEnd()
        }
    }

    // 结果
    if (options.showReturn && tree.result !== undefined) {
        if (tree.result.type === 'ok') {
            console.log(`%c  ${ICONS.ARROW} Result:`, `color: ${COLORS.success}; font-weight: bold`, tree.result.value)
        } else {
            console.log(`%c  ${ICONS.ERROR} Error:`, `color: ${COLORS.error}; font-weight: bold`, tree.result.error)
        }
    }

    // 状态
    if (options.showStates && tree.states.length > 0) {
        console.group(`%c  ${ICONS.STATE} States:`, `color: ${COLORS.magenta}; font-weight: bold`)
        tree.states.forEach((state, index) => {
            console.log(`[${index}]:`, state)
        })
        console.groupEnd()
    }

    // 变更
    if (options.showChanges && tree.changes.length > 0) {
        console.group(`%c  ${ICONS.CHANGE} Changes:`, `color: ${COLORS.event}; font-weight: bold`)
        tree.changes.forEach((change, index) => {
            if (options.compactMode) {
                console.log(
                    `[${index}]: %c${formatValue(change.previous, 30)}%c → %c${formatValue(change.next, 30)}`,
                    `color: ${COLORS.error}`,
                    `color: ${COLORS.gray}`,
                    `color: ${COLORS.success}`,
                )
            } else {
                console.group(`Change [${index}]:`)
                console.log(`%cBefore:`, `color: ${COLORS.error}; font-weight: bold`, change.previous)
                console.log(`%cAfter:`, `color: ${COLORS.success}; font-weight: bold`, change.next)
                console.groupEnd()
            }
        })
        console.groupEnd()
    }

    // 子执行树
    if (tree.commands.length > 0) {
        console.group(
            `%c  ${ICONS.FOLDER} Sub-Commands (${tree.commands.length}):`,
            `color: ${COLORS.blue}; font-weight: bold`,
        )
        tree.commands.forEach((cmd) => formatExecutionTree(cmd, options, depth + 1))
        console.groupEnd()
    }

    if (tree.queries.length > 0) {
        console.group(
            `%c  ${ICONS.SEARCH} Queries (${tree.queries.length}):`,
            `color: ${COLORS.blue}; font-weight: bold`,
        )
        tree.queries.forEach((query) => formatExecutionTree(query, options, depth + 1))
        console.groupEnd()
    }

    if (tree.events.length > 0) {
        console.group(`%c  ${ICONS.EVENT} Events (${tree.events.length}):`, `color: ${COLORS.blue}; font-weight: bold`)
        tree.events.forEach((event) => formatExecutionTree(event, options, depth + 1))
        console.groupEnd()
    }

    if (options.groupOutput) {
        console.groupEnd()
    }
}

// 查询执行树格式化函数
const formatQueryTree = (tree: QueryExecutionTree, options: LoggerOptions, depth: number): void => {
    // 构建头部
    let header = `${ICONS.QUERY} QRY: ${tree.domainName}.${tree.name}`
    if (tree.async) {
        header += ` ${ICONS.ASYNC}`
    }

    const headerStyle = `color: ${COLORS.query}; font-weight: bold; font-size: ${depth === 0 ? '14px' : '12px'}`

    // 创建分组
    if (options.groupOutput) {
        if (depth === 0) {
            console.groupCollapsed(
                `%c${header}${options.timestamp ? ` [${new Date().toISOString()}]` : ''}`,
                headerStyle,
            )
        } else {
            console.group(`%c${header}`, headerStyle)
        }
    } else {
        console.log(`%c${header}`, headerStyle)
    }

    // 参数
    if (options.showArgs && tree.args.length > 0) {
        if (options.compactMode) {
            console.log(
                `%c  ${ICONS.ARROW} Args:`,
                `color: ${COLORS.gray}; font-weight: bold`,
                tree.args.map((arg) => formatValue(arg, 40)).join(', '),
            )
        } else {
            console.group(`%c  ${ICONS.ARROW} Args:`, `color: ${COLORS.gray}; font-weight: bold`)
            tree.args.forEach((arg, index) => {
                console.log(`[${index}]:`, arg)
            })
            console.groupEnd()
        }
    }

    // 结果
    if (options.showReturn && tree.result !== undefined) {
        if (tree.result.type === 'ok') {
            console.log(`%c  ${ICONS.ARROW} Result:`, `color: ${COLORS.success}; font-weight: bold`, tree.result.value)
        } else {
            console.log(`%c  ${ICONS.ERROR} Error:`, `color: ${COLORS.error}; font-weight: bold`, tree.result.error)
        }
    }

    // 状态
    if (options.showStates && tree.states.length > 0) {
        console.group(`%c  ${ICONS.STATE} States:`, `color: ${COLORS.magenta}; font-weight: bold`)
        tree.states.forEach((state, index) => {
            console.log(`[${index}]:`, state)
        })
        console.groupEnd()
    }

    // 子查询
    if (tree.queries.length > 0) {
        console.group(
            `%c  ${ICONS.SEARCH} Sub-Queries (${tree.queries.length}):`,
            `color: ${COLORS.blue}; font-weight: bold`,
        )
        tree.queries.forEach((query) => formatExecutionTree(query, options, depth + 1))
        console.groupEnd()
    }

    if (options.groupOutput) {
        console.groupEnd()
    }
}

// 事件执行树格式化函数
const formatEventTree = (tree: EventExecutionTree, options: LoggerOptions, depth: number): void => {
    // 构建头部（事件总是异步的）
    const header = `${ICONS.EVENT} EVT: ${tree.domainName}.${tree.name} ${ICONS.ASYNC}`
    const headerStyle = `color: ${COLORS.event}; font-weight: bold; font-size: ${depth === 0 ? '14px' : '12px'}`

    // 创建分组
    if (options.groupOutput) {
        if (depth === 0) {
            console.groupCollapsed(
                `%c${header}${options.timestamp ? ` [${new Date().toISOString()}]` : ''}`,
                headerStyle,
            )
        } else {
            console.group(`%c${header}`, headerStyle)
        }
    } else {
        console.log(`%c${header}`, headerStyle)
    }

    // Payload（事件特有的）
    if (options.showArgs && tree.payload !== undefined) {
        console.log(`%c  ${ICONS.ARROW} Payload:`, `color: ${COLORS.gray}; font-weight: bold`, tree.payload)
    }

    // 触发的命令
    if (tree.commands.length > 0) {
        console.group(
            `%c  ${ICONS.FOLDER} Commands (${tree.commands.length}):`,
            `color: ${COLORS.blue}; font-weight: bold`,
        )
        tree.commands.forEach((cmd) => formatExecutionTree(cmd, options, depth + 1))
        console.groupEnd()
    }

    if (options.groupOutput) {
        console.groupEnd()
    }
}

// 主格式化函数
const formatExecutionTree = (tree: ExecutionTree, options: LoggerOptions, depth: number = 0): void => {
    // 超过最大深度时，显示省略
    if (options.maxDepth && depth > options.maxDepth) {
        console.log(`%c...`, `color: ${COLORS.gray}`)
        return
    }

    // 根据类型调用对应的格式化函数
    switch (tree.type) {
        case 'command':
            formatCommandTree(tree as CommandExecutionTree, options, depth)
            break
        case 'query':
            formatQueryTree(tree as QueryExecutionTree, options, depth)
            break
        case 'event':
            formatEventTree(tree as EventExecutionTree, options, depth)
            break
        default:
            // 兜底处理
            console.warn('Unknown execution tree type:', tree)
    }
}

export const PrettyLogger = (options: Partial<LoggerOptions> = {}) => {
    const config = { ...defaultOptions, ...options }

    return <State>(store: Store<State>) => {
        store.subscribeExecution((tree) => {
            formatExecutionTree(tree, config)
        })
    }
}
