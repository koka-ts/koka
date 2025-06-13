module.exports = {
    ...require('../../jest.config'),
    displayName: {
        name: 'koka',
        color: 'green',
    },
    collectCoverageFrom: ['src/**/*.{ts,tsx}'],
    rootDir: __dirname,
}
