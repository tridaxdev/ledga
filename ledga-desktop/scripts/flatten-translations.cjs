#!/usr/bin/env node

/**
 * Translation Flattening and Cleanup Script
 * Converts nested JSON translation files to flat structure with sorted keys
 * Optionally removes unused translation keys
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

function sortKeys(obj) {
    const sortedKeys = Object.keys(obj).sort()
    const sortedObj = {}

    for (const key of sortedKeys) {
        sortedObj[key] = obj[key]
    }

    return sortedObj
}

async function loadTranslationFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8')
        return JSON.parse(content)
    } catch (error) {
        console.error(`Error loading translation file ${filePath}:`, error.message)
        process.exit(1)
    }
}

async function saveTranslationFile(filePath, data) {
    try {
        const content = JSON.stringify(data, null, 4) + '\n'
        await fs.writeFile(filePath, content, 'utf8')
        console.log(`✅ Flattened and sorted ${path.basename(filePath)}`)
    } catch (error) {
        console.error(`Error saving translation file ${filePath}:`, error.message)
        process.exit(1)
    }
}

// Regex to match translation function calls like t('key') or t("key") or t(`key`)
const TRANSLATION_CALL_REGEX = /\bt\(\s*(['"`])([^'"`]+)\1/g

function extractTranslationKeys(content) {
    const keys = new Set()
    let match

    TRANSLATION_CALL_REGEX.lastIndex = 0

    while ((match = TRANSLATION_CALL_REGEX.exec(content)) !== null) {
        keys.add(match[2])
    }

    return keys
}

async function scanSourceFiles(config) {
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

        console.log(
            `  Scanning ${uniqueFiles.length} source files in ${path.basename(config.sourceDir)}...`
        )

        for (const file of uniqueFiles) {
            try {
                const content = await fs.readFile(file, 'utf8')
                const keys = extractTranslationKeys(content)
                keys.forEach(key => allKeys.add(key))
            } catch (error) {
                console.warn(`  Warning: Could not read file ${file}:`, error.message)
            }
        }

        return allKeys
    } catch (error) {
        console.error('Error scanning source files:', error.message)
        process.exit(1)
    }
}

function findUnusedKeys(flatTranslations, usedKeys, excludeFromUnusedCheck = []) {
    const unusedKeys = []

    for (const key of Object.keys(flatTranslations)) {
        const baseKey = getBaseKey(key)
        if (!usedKeys.has(key) && !usedKeys.has(baseKey) && !excludeFromUnusedCheck.includes(key)) {
            unusedKeys.push(key)
        }
    }

    return unusedKeys
}

async function processTranslations(config, processName) {
    console.log(`\n📂 Processing ${processName} translations...`)

    const usedKeys = await scanSourceFiles(config)
    console.log(`  Found ${usedKeys.size} unique translation keys in ${processName} source code`)

    for (const file of config.translationFiles) {
        const filePath = path.join(config.translationsDir, file)

        console.log(`\n  Processing ${file}...`)

        const translations = await loadTranslationFile(filePath)
        const flatTranslations = flattenObject(translations)

        const unusedKeys = findUnusedKeys(flatTranslations, usedKeys)
        let processedTranslations = flatTranslations

        if (unusedKeys.length > 0) {
            console.log(`    Removing ${unusedKeys.length} unused keys...`)
            processedTranslations = { ...flatTranslations }
            unusedKeys.forEach(key => {
                delete processedTranslations[key]
            })
        } else {
            console.log(`    No unused keys found`)
        }

        const sortedTranslations = sortKeys(processedTranslations)

        console.log(`    Original: ${Object.keys(translations).length} top-level keys`)
        console.log(`    Final: ${Object.keys(sortedTranslations).length} flat keys`)

        await saveTranslationFile(filePath, sortedTranslations)
    }
}

async function main() {
    console.log('🔄 Flattening and Cleaning Translation Files')
    await processTranslations(CONFIG.renderer, 'renderer')
    await processTranslations(CONFIG.main, 'main')

    console.log('\n✅ All translation files have been flattened, cleaned, and sorted!')
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Processing failed:', error)
        process.exit(1)
    })
}
