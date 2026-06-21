#!/usr/bin/env node

/**
 * Centralized Version and Channel Management for Ledga
 *
 * This script handles all version/channel logic for builds:
 * - Validates git tag format and base version consistency
 * - Updates package.json with correct version and channel
 * - Unified logic regardless of current package.json state
 */

const fs = require('fs');
const path = require('path');
const semver = require('semver');

class VersionManager {
  constructor() {
    this.packageJsonPath = path.join(__dirname, '..', 'package.json');
    this.originalPackageJson = null;
    this.gitTag = process.env.GITHUB_REF_NAME || process.env.GIT_TAG;
    this.isTaggedBuild = !!this.gitTag && this.gitTag.startsWith('v');
  }

  /**
   * Main entry point - prepares version for build
   */
  async prepare() {
    console.log('🔧 Ledga Version Manager');

    if (!this.isTaggedBuild) {
      console.log('🛠️  No git tag detected - skipping version management for development build');
      return;
    }

    // Load and backup original package.json
    this.originalPackageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
    console.log(`📦 Current package.json version: ${this.originalPackageJson.version}`);
    console.log(`🏷️  Git tag: ${this.gitTag}`);

    const versionInfo = this.parseGitTag(this.gitTag);
    this.validateBaseVersionConsistency(versionInfo);

    await this.updatePackageJson(versionInfo);

    console.log(`📋 Release channel: ${versionInfo.channel}`);
    console.log(`🔢 Release version: ${versionInfo.version}`);
    console.log('✅ Version management complete');
  }

  /**
   * Parse git tag into version info
   */
  parseGitTag(tag) {
    // Strict validation: only accept x.y.z, x.y.z-alpha.N, x.y.z-beta.N formats
    const tagRegex = /^v([0-9]+\.[0-9]+\.[0-9]+)(-(alpha|beta)\.([0-9]+))?$/;
    const match = tag.match(tagRegex);

    if (!match) {
      throw new Error(
        `Invalid tag format: ${tag}\n` +
        `Accepted formats:\n` +
        `  - v1.2.3 (stable release)\n` +
        `  - v1.2.3-alpha.N (alpha release)\n` +
        `  - v1.2.3-beta.N (beta release)\n` +
        `Where 1, 2, 3, N are integers`
      );
    }

    const [, baseVersion, , preReleaseType, preReleaseNumber] = match;
    const version = preReleaseType ?
      `${baseVersion}-${preReleaseType}.${preReleaseNumber}` :
      baseVersion;

    const channel = preReleaseType || 'latest';

    return {
      version,
      baseVersion,
      preReleaseType,
      preReleaseNumber,
      channel,
      gitTag: tag
    };
  }

  /**
   * Validate that base versions match between package.json and git tag
   */
  validateBaseVersionConsistency(versionInfo) {
    const currentVersion = this.originalPackageJson.version;

    // Extract base version from current package.json (strip any pre-release)
    const packageBaseVersion = `${semver.major(currentVersion)}.${semver.minor(currentVersion)}.${semver.patch(currentVersion)}`;
    const tagBaseVersion = versionInfo.baseVersion;

    if (packageBaseVersion !== tagBaseVersion) {
      throw new Error(
        `🚨 Base version mismatch!\n` +
        `   package.json base version: ${packageBaseVersion}\n` +
        `   Git tag base version: ${tagBaseVersion}\n` +
        `   The stable version part must match between package.json and git tag.\n` +
        `   Update package.json to ${tagBaseVersion} (or appropriate pre-release) before tagging.`
      );
    }

    console.log(`✅ Base version validation passed: ${packageBaseVersion}`);
  }

  /**
   * Update package.json with correct version and channel
   */
  async updatePackageJson(versionInfo) {
    const packageJson = { ...this.originalPackageJson };

    // Update version
    packageJson.version = versionInfo.version;

    // Update S3 publish channel
    if (packageJson.build && packageJson.build.publish) {
      for (let publisher of packageJson.build.publish) {
        if (publisher.provider === 's3') {
          publisher.channel = versionInfo.channel;
          console.log(`📤 Updated S3 publish channel to: ${versionInfo.channel}`);
        }
      }
    }

    // Write updated package.json
    fs.writeFileSync(this.packageJsonPath, JSON.stringify(packageJson, null, 4));
    console.log(`📝 Updated package.json version to: ${versionInfo.version}`);

    // Update package-lock.json to maintain sync with package.json
    this.updatePackageLockJson(versionInfo);
  }

  /**
   * Update package-lock.json to match the new package.json version
   */
  updatePackageLockJson(versionInfo) {
    const packageLockPath = path.join(__dirname, '..', 'package-lock.json');

    if (!fs.existsSync(packageLockPath)) {
      console.log('⚠️  No package-lock.json found, skipping lock file update');
      return;
    }

    try {
      const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

      // Update version in package-lock.json
      if (packageLock.version) {
        packageLock.version = versionInfo.version;
      }

      // Update version in packages section (npm v7+ format)
      if (packageLock.packages && packageLock.packages[""]) {
        packageLock.packages[""].version = versionInfo.version;
      }

      // Write updated package-lock.json
      fs.writeFileSync(packageLockPath, JSON.stringify(packageLock, null, 2));
      console.log(`🔒 Updated package-lock.json version to: ${versionInfo.version}`);
    } catch (error) {
      console.error('⚠️  Warning: Could not update package-lock.json:', error.message);
      console.log('This may cause npm ci to fail in subsequent build steps');
    }
  }

  /**
   * Restore original package.json (for cleanup)
   */
  restore() {
    if (this.originalPackageJson) {
      fs.writeFileSync(this.packageJsonPath, JSON.stringify(this.originalPackageJson, null, 2));
      console.log('🔄 Restored original package.json');

      // Note: We don't restore package-lock.json since it should be regenerated with npm install
      console.log('💡 Run `npm install` to regenerate package-lock.json if needed');
    }
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const versionManager = new VersionManager();

  if (command === 'prepare') {
    versionManager.prepare().catch(error => {
      console.error('❌ Version management failed:', error.message);
      process.exit(1);
    });
  } else if (command === 'restore') {
    versionManager.restore();
  } else {
    console.log('Usage: node scripts/version-manager.js [prepare|restore]');
    process.exit(1);
  }
}

module.exports = VersionManager;
