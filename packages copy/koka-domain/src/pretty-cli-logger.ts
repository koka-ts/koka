import { ExecutionTree, CommandExecutionTree, QueryExecutionTree, Store, EventExecutionTree } from './koka-domain.ts'
import chalk from 'chalk'

type LoggerOptions = {
    colors?: boolean
    timestamp?: boolean
    showArgs?: boolean
    showReturn?: boolean
    showStates?: boolean
    showChanges?: boolean
    maxDepth?: number
    compactMode?: boolean
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
}

// 树状结构字符
const TREE_CHARS = {
    VERTICAL: '│',
    HORIZONTAL: '─',
    BRANCH: '├',
    LAST_BRANCH: '└',
    CORNER: '└',
    TEE: '├',
    CROSS: '┼',
    SPACE: '  ',
}

// 图标
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
}

export const PrettyLogger = (options: Partial<LoggerOptions> = {}) => {
    const config = { ...defaultOptions, ...options }

    return <State>(store: Store<State>) => {
        store.subscribeExecution((tree) => {
            const output = formatExecutionTree(tree, config)
            console.log(output)
        })
    }
}

// 格式化值，智能处理不同类型
const formatValue = (value: unknown, maxLength: number = 80): string => {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'

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
}

// 通用格式化辅助函数
const applyColor = (text: string, colorFn: chalk.Chalk, options: LoggerOptions) =>
    options.colors ? colorFn(text) : text

// 命令头部格式化
const formatCommandHeader = (
    tree: CommandExecutionTree,
    options: LoggerOptions,
    currentPrefix: string,
    depth: number,
): string => {
    let header = currentPrefix

    if (options.timestamp && depth === 0) {
        header += applyColor(`[${new Date().toISOString()}] `, chalk.gray, options)
    }

    header += applyColor(`${ICONS.COMMAND} CMD`, chalk.green.bold, options)
    if (tree.async) {
        header += applyColor(` ${ICONS.ASYNC}`, chalk.yellow, options)
    }
    header += ' '
    header += applyColor(`${tree.domainName}.${tree.name}`, chalk.green, options)

    return header
}

// 查询头部格式化
const formatQueryHeader = (
    tree: QueryExecutionTree,
    options: LoggerOptions,
    currentPrefix: string,
    depth: number,
): string => {
    let header = currentPrefix

    if (options.timestamp && depth === 0) {
        header += applyColor(`[${new Date().toISOString()}] `, chalk.gray, options)
    }

    header += applyColor(`${ICONS.QUERY} QRY`, chalk.cyan.bold, options)
    if (tree.async) {
        header += applyColor(` ${ICONS.ASYNC}`, chalk.yellow, options)
    }
    header += ' '
    header += applyColor(`${tree.domainName}.${tree.name}`, chalk.cyan, options)

    return header
}

// 事件头部格式化
const formatEventHeader = (
    tree: EventExecutionTree,
    options: LoggerOptions,
    currentPrefix: string,
    depth: number,
): string => {
    let header = currentPrefix

    if (options.timestamp && depth === 0) {
        header += applyColor(`[${new Date().toISOString()}] `, chalk.gray, options)
    }

    header += applyColor(`${ICONS.EVENT} EVT`, chalk.yellow.bold, options)
    // 事件总是异步的
    header += applyColor(` ${ICONS.ASYNC}`, chalk.yellow, options)
    header += ' '
    header += applyColor(`${tree.domainName}.${tree.name}`, chalk.yellow, options)

    return header
}

const formatArgs = (args: unknown[], options: LoggerOptions, childPrefix: string): string[] => {
    const lines: string[] = []

    if (options.showArgs && args.length > 0) {
        const argsLine = childPrefix + applyColor(`  ${ICONS.ARROW} Args: `, chalk.gray, options)
        if (options.compactMode) {
            lines.push(argsLine + applyColor(args.map((arg) => formatValue(arg, 40)).join(', '), chalk.white, options))
        } else {
            lines.push(argsLine)
            args.forEach((arg, index) => {
                lines.push(childPrefix + applyColor(`    [${index}]: `, chalk.gray, options) + formatValue(arg))
            })
        }
    }

    return lines
}

const formatResult = (result: any, options: LoggerOptions, childPrefix: string): string[] => {
    const lines: string[] = []

    if (options.showReturn && result !== undefined) {
        if (result.type === 'ok') {
            lines.push(
                childPrefix + applyColor(`  ${ICONS.ARROW} Result: `, chalk.green, options) + formatValue(result.value),
            )
        } else {
            lines.push(
                childPrefix + applyColor(`  ${ICONS.ARROW} Result: `, chalk.red, options) + formatValue(result.error),
            )
        }
    }

    return lines
}

const formatStates = (states: unknown[], options: LoggerOptions, childPrefix: string): string[] => {
    const lines: string[] = []

    if (options.showStates && states.length > 0) {
        lines.push(childPrefix + applyColor(`  ${ICONS.STATE} States:`, chalk.magenta, options))
        states.forEach((state, index) => {
            lines.push(childPrefix + applyColor(`    [${index}]: `, chalk.gray, options) + formatValue(state, 60))
        })
    }

    return lines
}

const formatChanges = (changes: any[], options: LoggerOptions, childPrefix: string): string[] => {
    const lines: string[] = []

    if (options.showChanges && changes.length > 0) {
        lines.push(childPrefix + applyColor(`  ${ICONS.CHANGE} Changes:`, chalk.yellow.bold, options))
        changes.forEach((change, index) => {
            if (options.compactMode) {
                lines.push(
                    childPrefix +
                        applyColor(`    [${index}]: `, chalk.gray, options) +
                        applyColor(formatValue(change.previous, 30), chalk.red, options) +
                        applyColor(' → ', chalk.yellow, options) +
                        applyColor(formatValue(change.next, 30), chalk.green, options),
                )
            } else {
                lines.push(childPrefix + applyColor(`    Change [${index}]:`, chalk.gray, options))
                lines.push(
                    childPrefix + applyColor('      Before: ', chalk.red, options) + formatValue(change.previous),
                )
                lines.push(childPrefix + applyColor('      After:  ', chalk.green, options) + formatValue(change.next))
            }
        })
    }

    return lines
}

const formatChildren = (
    children: ExecutionTree[],
    label: string,
    icon: string,
    options: LoggerOptions,
    depth: number,
    childPrefix: string,
): string[] => {
    const lines: string[] = []

    if (children.length > 0) {
        lines.push(childPrefix + applyColor(`  ${icon} ${label} (${children.length}):`, chalk.blue, options))
        children.forEach((child, index) => {
            const isLastChild = index === children.length - 1
            const childLines = formatExecutionTree(child, options, depth + 1, isLastChild, childPrefix + '  ')
            lines.push(childLines)
        })
    }

    return lines
}

// 命令执行树格式化函数
const formatCommandTree = (
    tree: CommandExecutionTree,
    options: LoggerOptions,
    depth: number,
    isLast: boolean,
    prefix: string,
): string => {
    const lines: string[] = []

    const currentPrefix =
        depth === 0 ? '' : prefix + (isLast ? TREE_CHARS.LAST_BRANCH : TREE_CHARS.BRANCH) + TREE_CHARS.HORIZONTAL
    const childPrefix = depth === 0 ? '' : prefix + (isLast ? TREE_CHARS.SPACE : TREE_CHARS.VERTICAL) + ' '

    // 头部
    lines.push(formatCommandHeader(tree, options, currentPrefix, depth))

    // 参数
    lines.push(...formatArgs(tree.args, options, childPrefix))

    // 结果
    if (tree.result) {
        lines.push(...formatResult(tree.result, options, childPrefix))
    }

    // 状态
    lines.push(...formatStates(tree.states, options, childPrefix))

    // 变更
    lines.push(...formatChanges(tree.changes, options, childPrefix))

    // 子执行树
    lines.push(...formatChildren(tree.commands, 'Sub-Commands', '📁', options, depth, childPrefix))
    lines.push(...formatChildren(tree.queries, 'Queries', '🔎', options, depth, childPrefix))
    lines.push(...formatChildren(tree.events, 'Events', '🔔', options, depth, childPrefix))

    return lines.join('\n')
}

// 查询执行树格式化函数
const formatQueryTree = (
    tree: QueryExecutionTree,
    options: LoggerOptions,
    depth: number,
    isLast: boolean,
    prefix: string,
): string => {
    const lines: string[] = []

    const currentPrefix =
        depth === 0 ? '' : prefix + (isLast ? TREE_CHARS.LAST_BRANCH : TREE_CHARS.BRANCH) + TREE_CHARS.HORIZONTAL
    const childPrefix = depth === 0 ? '' : prefix + (isLast ? TREE_CHARS.SPACE : TREE_CHARS.VERTICAL) + ' '

    // 头部
    lines.push(formatQueryHeader(tree, options, currentPrefix, depth))

    // 参数
    lines.push(...formatArgs(tree.args, options, childPrefix))

    // 结果
    if (tree.result) {
        lines.push(...formatResult(tree.result, options, childPrefix))
    }

    // 状态
    lines.push(...formatStates(tree.states, options, childPrefix))

    // 子查询
    lines.push(...formatChildren(tree.queries, 'Sub-Queries', '🔎', options, depth, childPrefix))

    return lines.join('\n')
}

// 事件执行树格式化函数
const formatEventTree = (
    tree: EventExecutionTree,
    options: LoggerOptions,
    depth: number,
    isLast: boolean,
    prefix: string,
): string => {
    const lines: string[] = []

    const currentPrefix =
        depth === 0 ? '' : prefix + (isLast ? TREE_CHARS.LAST_BRANCH : TREE_CHARS.BRANCH) + TREE_CHARS.HORIZONTAL
    const childPrefix = depth === 0 ? '' : prefix + (isLast ? TREE_CHARS.SPACE : TREE_CHARS.VERTICAL) + ' '

    // 头部
    lines.push(formatEventHeader(tree, options, currentPrefix, depth))

    // Payload（事件特有的）
    if (options.showArgs && tree.payload !== undefined) {
        const payloadLine = childPrefix + applyColor(`  ${ICONS.ARROW} Payload: `, chalk.gray, options)
        lines.push(payloadLine + formatValue(tree.payload))
    }

    // 触发的命令
    lines.push(...formatChildren(tree.commands, 'Commands', '📁', options, depth, childPrefix))

    return lines.join('\n')
}

// 主格式化函数
const formatExecutionTree = (
    tree: ExecutionTree,
    options: LoggerOptions,
    depth: number = 0,
    isLast: boolean = true,
    prefix: string = '',
): string => {
    // 超过最大深度时，显示省略
    if (options.maxDepth && depth > options.maxDepth) {
        return options.colors ? chalk.gray('...') : '...'
    }

    // 根据类型调用对应的格式化函数
    switch (tree.type) {
        case 'command':
            return formatCommandTree(tree as CommandExecutionTree, options, depth, isLast, prefix)
        case 'query':
            return formatQueryTree(tree as QueryExecutionTree, options, depth, isLast, prefix)
        case 'event':
            return formatEventTree(tree as EventExecutionTree, options, depth, isLast, prefix)
        default:
            // 兜底处理，理论上不应该到这里
            return ''
    }
}
