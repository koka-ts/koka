module.exports = {
    ...require('../../jest.config'),
    displayName: {
        name: 'koka-optic',
        color: 'blue',
    },
    collectCoverageFrom: ['src/**/*.{ts,tsx}'],
    rootDir: __dirname,
}
