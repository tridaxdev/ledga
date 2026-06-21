import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react-swc'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import type { Plugin, TransformResult } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const sqlImportPlugin = (): Plugin => {
    return {
        name: 'sql-import',
        transform(_, id: string): TransformResult | null {
            if (id.endsWith('.sql')) {
                try {
                    const sql = readFileSync(id, 'utf-8')
                    return {
                        code: `export default ${JSON.stringify(sql)};`,
                        map: null
                    }
                } catch (error) {
                    console.error(`Failed to load SQL file: ${id}`, error)
                    throw error
                }
            }
            return null
        }
    }
}

export default defineConfig({
    main: {
        build: {
            sourcemap: process.env.NODE_ENV === 'development' || !!process.env.VSCODE_DEBUG,
            minify: process.env.NODE_ENV === 'production',
            outDir: 'dist/main',
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, 'src/main/index.ts')
                }
            }
        },
        resolve: {
            alias: {
                '@/common': path.join(__dirname, 'src/common')
            }
        },
        plugins: [externalizeDepsPlugin(), sqlImportPlugin()]
    },
    preload: {
        build: {
            sourcemap:
                process.env.NODE_ENV === 'development' || !!process.env.VSCODE_DEBUG
                    ? 'inline'
                    : undefined,
            minify: process.env.NODE_ENV === 'production',
            outDir: 'dist/preload',
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, 'src/main/preload.ts')
                },
                output: {
                    format: 'cjs',
                    entryFileNames: '[name].js'
                }
            }
        },
        resolve: {
            alias: {
                '@': path.join(__dirname, 'src')
            }
        },
        plugins: [externalizeDepsPlugin()]
    },
    renderer: {
        build: {
            outDir: 'dist/renderer',
            sourcemap: process.env.NODE_ENV === 'development' || !!process.env.VSCODE_DEBUG,
            minify: process.env.NODE_ENV === 'production',
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, 'src/renderer/index.html')
                }
            }
        },
        resolve: {
            alias: {
                '@': path.join(__dirname, 'src')
            }
        },
        plugins: [
            tanstackRouter({
                target: 'react',
                autoCodeSplitting: true,
                routesDirectory: path.resolve(__dirname, 'src/renderer/routes'),
                generatedRouteTree: path.resolve(__dirname, 'src/renderer/routeTree.gen.ts')
            }),
            react(),
            tailwindcss(),
            visualizer({
                filename: 'dist/renderer-bundle-analysis.html',
                open: false,
                gzipSize: true,
                brotliSize: true
            })
        ],
        server: process.env.VSCODE_DEBUG
            ? (() => {
                  const url = new URL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:7777/')
                  return {
                      host: url.hostname,
                      port: Number(url.port)
                  }
              })()
            : undefined,
        clearScreen: false,
    }
})