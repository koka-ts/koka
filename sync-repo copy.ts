import { globby } from 'globby'
import prompts from 'prompts'
import ghPages from 'gh-pages'
import path from 'path'
import fs from 'fs'

type Options = {
    all?: boolean
}

async function publish(pkg: { name: string; path: string }, message?: string) {
    const defaultMessage = `Publish ${pkg.name} from koka-stack repository`

    // 4. Publish using gh-pages
    const repo = `https://github.com/koka-ts/${pkg.name}.git`

    console.log(`Publishing ${pkg.name}...`, {
        path: pkg.path,
        repo,
    })

    ghPages.clean()

    await ghPages.publish(
        pkg.path,
        {
            repo: repo,
            branch: 'main',
            message: message || defaultMessage,
            dotfiles: true,
        },
        (err) => {
            if (err) {
                console.error('Publish failed:', err)
                process.exit(1)
            }
            console.log(`${pkg.name} published successfully!`)
        },
    )
}

async function main(options?: Options) {
    // 1. Find all package.json files in packages/*
    const packageJsonPaths = await globby('packages/*/package.json')

    // 2. Extract package names
    const packages = packageJsonPaths.map((pkgPath) => {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        return {
            name: pkg.name,
            path: path.dirname(pkgPath),
        }
    })

    if (packages.length === 0) {
        console.error('No packages found in packages/* directory')
        process.exit(1)
    }

    if (options?.all) {
        // If --all option is provided, publish all packages
        console.log('Publishing all packages...')
        await Promise.all(packages.map((pkg) => publish(pkg)))
        console.log('All packages published successfully!')
        return
    }

    // 3. Prompt user to select package
    const { package: pkg } = await prompts({
        type: 'select',
        name: 'package',
        message: 'Select package to publish:',
        choices: packages.map((pkg) => ({
            title: pkg.name,
            value: pkg,
        })),
    })

    if (!pkg) {
        console.log('No package selected')
        process.exit(0)
    }

    const defaultMessage = `Publish ${pkg.name} from koka-stack repository`

    const { message } = await prompts({
        type: 'text',
        name: 'message',
        message: `Enter commit message for ${pkg.name}:`,
        initial: defaultMessage,
    })

    await publish(pkg, message)
}

const args = process.argv.slice(2)

const options: Options = {
    all: args.includes('--all'),
}

main(options).catch((err) => {
    console.error('Error:', err)
    process.exit(1)
})
