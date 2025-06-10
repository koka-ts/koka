module.exports = {
    ...require('../../jest.config'),
    displayName: {
        name: 'koka-ddd',
        color: 'magenta',
    },
    collectCoverageFrom: ['src/**/*.{ts,tsx}'],
    rootDir: __dirname,
}
