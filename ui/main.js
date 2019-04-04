const {app, BrowserWindow} = require('electron');
const minimist = require('minimist');
const path = require('path');
const process = require('process');
const url = require('url');

// For development, include the context menu that provides
// the Inspect Element feature.
require('electron-context-menu')();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function run(opts) {
    // Create the browser window.
    if(opts.headless) {
        console.log(`Running DART in command-line mode with pid ${process.pid}`);
        console.log(opts.job);
    }
    win = new BrowserWindow({
        width: 1200,
        height: 900,
        webPreferences: { nodeIntegration: true },
        icon: path.join(__dirname, 'include/img/dart.png'),
        show: opts.headless ? false : true
    });

    // and load the index.html of the app.
    win.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }))

    // Open the DevTools.
    // win.webContents.openDevTools()

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
    let opts = minimist(process.argv.slice(2), {
        string: ['j', 'job'],
        boolean: ['d', 'debug', 'h', 'help', 'headless'],
        default: { D: false, debug: false, h: false, help: false, headless: false},
        alias: { D: ['debug'], v: ['version'], h: ['help']}
    });
    run(opts);
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
});
