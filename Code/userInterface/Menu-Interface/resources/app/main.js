const listOfVariablesData = require("./listOfVariablesData.json")
const pythonFlaskServerPortNumber = listOfVariablesData.pythonFlaskServerPortNumber
const windowStateKeeper = require('electron-window-state');
const {app, BrowserWindow, globalShortcut, screen, ipcMain} = require('electron');

const fetch = require('node-fetch');
const fs = require('fs');

let translationWindow  

const generateMenuWindow = () => {

  translationWindow = new BrowserWindow({
      title: "Menu Window",
      alwaysOnTop: false,
      webPreferences: {
          enableRemoteModule: true,
          nodeIntegration: true
      }
});
  // translationWindow.loadFile('./menuWindow/menuWindow.html')
  translationWindow.loadFile('./menuWindow/subarashii_main.html')

  translationWindow.maximize()
}


// ipcMain.on('asynchronous-message', (event, arg) => {
//   console.log(arg) // prints "ping"
//   event.reply('asynchronous-reply', 'pong')
// })

// ipcMain.on('synchronous-message', (event, arg) => {
//   console.log(arg) // prints "ping"
//   event.returnValue = 'pong'
// })


// This method will be called when Electron has finished
// initialization and is rea browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  generateMenuWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) generateMenuWindow()
  })
})

app.on('will-quit', () => {  
	// Unregister all shortcuts.
  globalShortcut.unregisterAll()
  
  sendMessageToServer(pythonFlaskServerPortNumber, "no content", "close server") //close python flask server
  //sendMessageToServer(httpServerPortNumber, "no content", "close server") //close node server
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

function sendMessageToServer(serverPort, thisContent, thisMessage) {  
	fetch(`http://localhost:${serverPort}/`, {
			method: 'post',
			body:    JSON.stringify({content: thisContent, message: thisMessage}),
			headers: { 'Content-Type': 'application/json' },
		})
		.then(res => res.json())
		.then(json => console.log(json));

}

ipcMain.on('close-me', (evt, arg) => {
  app.quit()
})

ipcMain.on('minimize-me', (evt, arg) => {
  translationWindow.minimize()
})