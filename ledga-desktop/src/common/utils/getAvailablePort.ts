import { createServer } from "net"

export async function getAvailablePort(defaultPort = 9999, minPort = 9000, maxPort = 65535): Promise<number> {
    const isAvailable = (port: number): Promise<boolean> => {
        return new Promise(resolve => {
            const server = createServer()
            server.once("error", () => resolve(false))
            server.once("listening", () => {
                server.close(() => resolve(true))
            })
            server.listen(port, "127.0.0.1")
        })
    }

    if (await isAvailable(defaultPort)) {
        return defaultPort
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        const port = Math.floor(Math.random() * (maxPort - minPort + 1)) + minPort
        if (await isAvailable(port)) {
            return port
        }
    }
    throw new Error("Could not find available port after 3 attempts")
}
