// ph-app/build/notarize.js
exports.default = async function (context) {
    const { electronPlatformName, appOutDir } = context
    if (electronPlatformName !== 'darwin') {
        console.log('Skipping notarization: Not on macOS.')
        return
    }

    // Only require dependencies on macOS
    require('dotenv').config()
    const { notarize } = require('@electron/notarize')

    const appName = context.packager.appInfo.productFilename
    console.log('Starting notarization process for macOS.')

    const appPath = `${appOutDir}/${appName}.app`

    await notarize({
        appBundleId: 'com.ledga.app',
        appPath: appPath,
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER
    })

    console.log('Finished notarization.')
}
