const path = require('path');

const CONFIG = {
    renderer: {
        sourceDir: path.join(__dirname, '../src/renderer'),
        translationsDir: path.join(__dirname, '../src/renderer/translations'),
        translationFiles: ['en.json', 'de.json'],
        sourceFilePatterns: [
            '**/*.tsx',
            '**/*.ts',
            '!**/*.d.ts',
            '!**/*.test.ts',
            '!**/*.test.tsx',
            '!**/node_modules/**'
        ]
    },
    main: {
        sourceDir: path.join(__dirname, '../src/main'),
        translationsDir: path.join(__dirname, '../src/main/i18n/translations'),
        translationFiles: ['en.json', 'de.json'],
        sourceFilePatterns: [
            '**/*.ts',
            '!**/*.d.ts',
            '!**/*.test.ts',
            '!**/node_modules/**'
        ]
    }
};

module.exports = CONFIG;
