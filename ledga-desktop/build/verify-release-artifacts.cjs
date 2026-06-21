#!/usr/bin/env node

/**
 * Quality Control - Release Artifact Verification
 *
 * Verifies that all expected artifacts are present at the public release URL.
 * Follows electron-builder naming conventions and flat structure.
 */

const https = require("https")
const fs = require("fs")
const path = require("path")

class QualityControl {
    constructor() {
        this.gitTag = process.env.GITHUB_REF_NAME
        this.publicUrl = "https://releases.ledga.com/releases"
    }

    /**
     * Main entry point
     */
    async run() {
        console.log("🔍 Ledga Quality Control")
        console.log(`📦 Verifying artifacts for release: ${this.gitTag}`)
        console.log("")

        try {
            const versionInfo = this.parseGitTag(this.gitTag)
            const expectedFiles = this.generateExpectedFiles(versionInfo.version)

            console.log(`📦 Version: ${versionInfo.version}`)
            console.log(`📋 Channel: ${versionInfo.channel}`)
            console.log("")

            await this.verifyPublicAssets(expectedFiles)

            this.logSuccess(versionInfo, expectedFiles)
            process.exit(0)
        } catch (error) {
            console.error(`❌ Quality Control failed: ${error.message}`)
            process.exit(1)
        }
    }

    /**
     * Parse git tag to extract version and channel information
     */
    parseGitTag(tag) {
        const tagRegex = /^v([0-9]+\.[0-9]+\.[0-9]+)(-(alpha|beta)\.([0-9]+))?$/
        const match = tag.match(tagRegex)

        if (!match) {
            throw new Error(`Invalid tag format: ${tag}\n` + "Expected: v1.2.3, v1.2.3-alpha.1, or v1.2.3-beta.1")
        }

        const [, baseVersion, , preReleaseType] = match
        const version = tag.slice(1) // Remove 'v' prefix
        const channel = preReleaseType || "latest"

        return { version, baseVersion, channel, gitTag: tag }
    }

    /**
     * Generate expected filenames based on version
     */
    generateExpectedFiles(version) {
        const versionInfo = this.parseGitTag(this.gitTag)
        const files = [
            // macOS artifacts (ARM64 only)
            `Ledga-${version}-arm64-mac.zip`,
            `Ledga-${version}-arm64-mac.zip.blockmap`,
            `Ledga-${version}-arm64.dmg`,
            `Ledga-${version}-arm64.dmg.blockmap`,

            // Windows artifacts (x64 only)
            `Ledga-${version}-win.zip`,
            `Ledga-Setup-${version}.exe`,
            `Ledga-Setup-${version}.exe.blockmap`
        ]

        // Only expect latest.yml files for stable releases
        if (versionInfo.channel === "latest") {
            files.unshift("latest-mac.yml", "latest.yml")
        } else {
            // For alpha/beta releases, expect channel-specific yml files
            files.unshift(`${versionInfo.channel}-mac.yml`, `${versionInfo.channel}.yml`)
        }

        return files
    }

    /**
     * Check if a file exists at the public URL using HTTP HEAD request
     */
    async checkUrlExists(url) {
        return new Promise(resolve => {
            const urlObj = new URL(url)
            const options = {
                method: "HEAD",
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
                path: urlObj.pathname,
                headers: {
                    "User-Agent": "Ledga-Release-Verifier"
                }
            }

            const protocol = urlObj.protocol === "https:" ? https : require("http")
            const req = protocol.request(options, res => {
                // Consider 200 and 304 as success
                resolve(res.statusCode === 200 || res.statusCode === 304)
            })

            req.on("error", () => resolve(false))
            req.on("timeout", () => resolve(false))
            req.setTimeout(10000) // 10 second timeout
            req.end()
        })
    }

    /**
     * Verify all artifacts exist at the public release URL
     */
    async verifyPublicAssets(expectedFiles) {
        console.log("🔍 Checking public release artifacts...")
        console.log(`📍 Public URL: ${this.publicUrl}`)
        console.log("")

        const missing = []

        for (const expectedFile of expectedFiles) {
            const fileUrl = `${this.publicUrl}/${expectedFile}`

            try {
                const exists = await this.checkUrlExists(fileUrl)
                if (exists) {
                    console.log(`✅ Found public artifact: ${expectedFile}`)
                } else {
                    console.log(`❌ Missing public artifact: ${expectedFile}`)
                    console.log(`   URL: ${fileUrl}`)
                    missing.push(expectedFile)
                }
            } catch (error) {
                console.log(`❌ Error checking public artifact: ${expectedFile}`)
                console.log(`   URL: ${fileUrl}`)
                console.log(`   Error: ${error.message}`)
                missing.push(expectedFile)
            }
        }

        if (missing.length > 0) {
            console.log("")
            console.log("❌ Missing public artifacts:")
            missing.forEach(file => console.log(`  ${file}`))
            console.log("")
            console.log("💡 Troubleshooting tips:")
            console.log("   - Verify electron-builder channel configuration in package.json")
            console.log("   - Check artifact upload logs in build-macos and build-windows jobs")
            console.log("   - Ensure the release server is accessible and configured correctly")
            throw new Error(`${missing.length} public artifacts missing`)
        }

        console.log("")
    }

    /**
     * Log success summary
     */
    logSuccess(versionInfo, expectedFiles) {
        console.log("✅ All expected artifacts verified successfully!")
        console.log("🎉 Quality Control passed - release is complete.")
        console.log("")
        console.log("📋 Summary:")
        console.log(`   - Version: ${versionInfo.version}`)
        console.log(`   - Channel: ${versionInfo.channel}`)
        console.log(`   - Public artifacts: ${expectedFiles.length}/${expectedFiles.length} ✅`)
    }
}

if (require.main === module) {
    const qc = new QualityControl()
    qc.run().catch(error => {
        console.error(`Fatal error: ${error.message}`)
        process.exit(1)
    })
}

module.exports = QualityControl