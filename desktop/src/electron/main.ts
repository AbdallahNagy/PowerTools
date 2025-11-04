import { app, BrowserWindow } from 'electron'
import { isDev } from './utils.js';

app.whenReady().then(() => {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600
    })

    if(isDev()) {
        mainWindow.loadURL('http://localhost:5123');
    } else {
        mainWindow.loadFile('dist-react/index.html');
    }
})