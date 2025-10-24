import { ExecutionTree, Store } from './koka-domain.ts'

export const PrettyPrinter = () => {
    return <State>(store: Store<State>) => {
        store.subscribeExecution((tree) => {
            const output = prettyPrintExecutionTree(tree)
            console.log(output)
        })
    }
}

export const prettyPrintExecutionTree = (tree: ExecutionTree) => {
    const treeLines: string[] = []

    const formatTree = (node: ExecutionTree, indent = 0) => {
        const spaces = ' '.repeat(indent * 2)

        treeLines.push(`${spaces}${node.type === 'command' ? 'Command' : 'Query'}: ${node.commandName}`)

        if (node.args.length > 0) {
            treeLines.push(`${spaces}Args: ${JSON.stringify(node.args)}`)
        }

        if (node.return !== undefined) {
            treeLines.push(`${spaces}Return: ${JSON.stringify(node.return)}`)
        }

        if (node.type === 'query' && node.states.length > 0) {
            treeLines.push(`${spaces}States:`)
            for (const state of node.states) {
                treeLines.push(`${spaces}  State: ${JSON.stringify(state)}`)
            }
        }

        if (node.type === 'command' && node.changes.length > 0) {
            treeLines.push(`${spaces}State Changes:`)
            for (const change of node.changes) {
                treeLines.push(`${spaces}  Previous: ${JSON.stringify(change.previous)}`)
                treeLines.push(`${spaces}  Next: ${JSON.stringify(change.next)}`)
            }
        }

        if (node.type === 'command') {
            if (node.commands.length > 0) {
                treeLines.push(`${spaces}Sub-Commands:`)
                for (const subCmd of node.commands) {
                    formatTree(subCmd, indent + 1)
                }
            }
            if (node.queries.length > 0) {
                treeLines.push(`${spaces}Queries:`)
                for (const query of node.queries) {
                    formatTree(query, indent + 1)
                }
            }
        } else {
            if (node.queries.length > 0) {
                treeLines.push(`${spaces}Sub-Queries:`)
                for (const subQuery of node.queries) {
                    formatTree(subQuery, indent + 1)
                }
            }
        }
    }

    formatTree(tree)
    return treeLines.join('\n')
}
