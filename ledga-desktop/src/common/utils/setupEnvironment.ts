import * as path from "path"
import dotenv from "dotenv"
import { app } from "electron"

export function setupEnvironment() {
    const envPath = app.isPackaged ? path.join(process.resourcesPath, ".env") : path.join(app.getAppPath(), ".env")
    dotenv.config({ path: envPath })
}
