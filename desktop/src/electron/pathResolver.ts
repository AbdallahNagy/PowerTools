import path from 'path'
import { app } from 'electron'
import { isDev } from './utils.js'

export function getPreloadPath() {
    return path.join(
        app.getAppPath(),
        isDev() ? '.' : '..',
        'dist-electron/preload.bundle.cjs',
    )
}

export function getAppIconPath() {
    return isDev()
        ? path.join(app.getAppPath(), 'src/ui/assets/icons/power-tools-preview-256.png')
        : path.join(process.resourcesPath, 'power-tools-preview-256.png')
}
