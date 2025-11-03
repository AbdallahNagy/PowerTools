import { app, BrowserWindow } from 'electron'

app.whenReady().then(() => {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600
    })

    mainWindow.loadFile('dist-react/index.html');

})