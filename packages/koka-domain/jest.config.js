module.exports = {
    ...require('../../jest.config'),
    displayName: {
        name: 'koka-domain',
        color: 'blue',
    },
    collectCoverageFrom: ['src/**/*.{ts,tsx}'],
    rootDir: __dirname,
}
