#!/usr/bin/env node

/**
 * Translation Key Validation Script
 * Validates translation keys without cleanup functionality
 */

const fs = require('fs').promises
const path = require('path')
const { glob } = require('glob')

const CONFIG = require('./translation.config.cjs')

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

const getBaseKey = key => {
    for (const suffix of PLURAL_SUFFIXES) {
        if (key.endsWith(suffix)) {
            return key.slice(0, -suffix.length)
        }
    }
    return key
}

// Regex to match translation function calls like t('key') or t("key") or t(`key`)
const TRANSLATION_CALL_REGEX = /\bt\(\s*(['"`])([^'"`]+)\1/g

function flattenObject(obj, prefix = '') {
    const flattened = {}

    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(flattened, flattenObject(value, newKey))
        } else {
            flattened[newKey] = value
        }
    }

    return flattened
}

async function loadTranslationFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8')
        const translations = JSON.parse(content)
        return flattenObject(translations)
    } catch (error) {
        console.error(`Error loading translation file ${filePath}:`, error.message)
        process.exit(3)
    }
}

function extractTranslationKeys(content) {
    const keys = new Set()
    let match

    TRANSLATION_CALL_REGEX.lastIndex = 0

    while ((match = TRANSLATION_CALL_REGEX.exec(content)) !== null) {
        keys.add(match[2])
    }

    return keys
}

async function scanSourceFiles(config, processName) {
    const allKeys = new Set()

    try {
        const sourceFiles = []
        for (const pattern of config.sourceFilePatterns) {
            const files = await glob(pattern, {
                cwd: config.sourceDir,
                absolute: true
            })
            sourceFiles.push(...files)
        }

        const uniqueFiles = [...new Set(sourceFiles)]

        console.log(`  Scanning ${uniqueFiles.length} ${processName} source files...`)

        for (const file of uniqueFiles) {
            try {
                const content = await fs.readFile(file, 'utf8')
                const keys = extractTranslationKeys(content)

                if (keys.size > 0) {
                    console.log(`    ${path.relative(config.sourceDir, file)}: ${keys.size} keys`)
                    keys.forEach(key => allKeys.add(key))
                }
            } catch (error) {
                console.warn(`  Warning: Could not read file ${file}:`, error.message)
            }
        }

        return allKeys
    } catch (error) {
        console.error('Error scanning source files:', error.message)
        process.exit(3)
    }
}

function validateTranslations(translations, usedKeys, excludeFromUnusedCheck = []) {
    const results = {
        missingKeys: {},
        unusedKeys: {},
        totalUsedKeys: usedKeys.size,
        allLanguagesValid: true
    }

    for (const [language, langKeys] of Object.entries(translations)) {
        results.missingKeys[language] = []

        for (const key of usedKeys) {
            if (!langKeys.hasOwnProperty(key)) {
                results.missingKeys[language].push(key)
                results.allLanguagesValid = false
            }
        }
    }

    for (const [language, langKeys] of Object.entries(translations)) {
        results.unusedKeys[language] = []

        for (const key of Object.keys(langKeys)) {
            const baseKey = getBaseKey(key)
            if (!usedKeys.has(key) && !usedKeys.has(baseKey) && !excludeFromUnusedCheck.includes(key)) {
                results.unusedKeys[language].push(key)
            }
        }
    }

    return results
}

function printResults(results, processName) {
    console.log(`\n=== ${processName} Translation Validation Results ===\n`)

    console.log(`Total translation keys used in ${processName}: ${results.totalUsedKeys}`)

    let hasMissingKeys = false
    for (const [language, missingKeys] of Object.entries(results.missingKeys)) {
        if (missingKeys.length > 0) {
            hasMissingKeys = true
            console.log(`\n❌ Missing keys in ${language}.json (${missingKeys.length}):`)
            missingKeys.forEach(key => console.log(`  - ${key}`))
        }
    }

    if (!hasMissingKeys) {
        console.log('\n✅ All translation keys are present in all language files')
    }

    let hasUnusedKeys = false
    for (const [language, unusedKeys] of Object.entries(results.unusedKeys)) {
        if (unusedKeys.length > 0) {
            hasUnusedKeys = true
            console.log(`\n⚠️  Unused keys in ${language}.json (${unusedKeys.length}):`)
            unusedKeys.slice(0, 10).forEach(key => console.log(`  - ${key}`))
            if (unusedKeys.length > 10) {
                console.log(`  ... and ${unusedKeys.length - 10} more`)
            }
        }
    }

    if (!hasUnusedKeys) {
        console.log('\n✅ No unused translation keys found')
    }

    return { hasMissingKeys, hasUnusedKeys }
}

async function validateProcess(config, processName) {
    console.log(`\n📂 Validating ${processName} translations...`)

    const translations = {}
    for (const file of config.translationFiles) {
        const filePath = path.join(config.translationsDir, file)
        const language = file.replace('.json', '')

        console.log(`  Loading ${file}...`)
        translations[language] = await loadTranslationFile(filePath)
        console.log(`    Found ${Object.keys(translations[language]).length} keys`)
    }

    const usedKeys = await scanSourceFiles(config, processName)
    console.log(`  Total unique translation keys found: ${usedKeys.size}`)

    const results = validateTranslations(translations, usedKeys)
    const { hasMissingKeys, hasUnusedKeys } = printResults(results, processName)

    return { 
        allValid: results.allLanguagesValid, 
        hasUnusedKeys,
        hasMissingKeys 
    }
}

async function main() {
    console.log('🔍 Translation Key Validation')

    // Validate renderer translations
    const rendererResult = await validateProcess(CONFIG.renderer, 'Renderer')
    
    // Validate main translations
    const mainResult = await validateProcess(CONFIG.main, 'Main')

    console.log('\n=== Overall Summary ===')
    
    const allValid = rendererResult.allValid && mainResult.allValid
    const hasAnyUnusedKeys = rendererResult.hasUnusedKeys || mainResult.hasUnusedKeys
    const hasAnyMissingKeys = rendererResult.hasMissingKeys || mainResult.hasMissingKeys

    if (allValid && !hasAnyUnusedKeys) {
        console.log('✅ All validations passed for both renderer and main!')
    } else if (allValid && hasAnyUnusedKeys) {
        console.log('⚠️  All required keys present, but unused keys found')
        console.log('💡 Run `npm run fix:i18n` to remove unused keys')
    } else {
        console.log('❌ Validation failed - missing translation keys found')
    }
    
    if (!allValid) {
        process.exit(1)
    } else if (hasAnyUnusedKeys) {
        process.exit(2)
    } else {
        process.exit(0)
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Validation failed:', error)
        process.exit(3)
    })
}

module.exports = { flattenObject, extractTranslationKeys, validateTranslations, CONFIG }
