import * as path from "path"
import { app, protocol } from "electron"
import { FILE_PROTOCOL_SCHEME } from "@/common/utils/getFileProtocolUrl"
import { setupEnvironment } from "@/common/utils/setupEnvironment"
import { getAvailablePort } from "@/common/utils/getAvailablePort"

// In a bundled application the browser automation child process is started through this entry point.
// This ensures that the child process does not load all the main app dependencies.
if (process.argv.includes("--browser-automation")) {
    app.setPath("userData", path.join(app.getPath("userData"), "..", "PyleHound-Helper"))

    const debugPort = await getAvailablePort()
    app.commandLine.appendSwitch("remote-debugging-port", String(debugPort))
    app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled")
    process.env.BROWSER_AUTOMATION_DEBUG_PORT = String(debugPort)

    import("../browser-automation/browser-automation")
} else {
    setupEnvironment()

    protocol.registerSchemesAsPrivileged([
        {
            scheme: FILE_PROTOCOL_SCHEME,
            privileges: {
                standard: true,
                supportFetchAPI: true,
                stream: true
            }
        }
    ])

    import("./main")
}
