const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// Path to store the JSON data file safely on the user's computer
const dataFilePath = path.join(app.getPath('userData'), 'graves.json');

let mainWindow;
let splashWindow;

// Helper function to read all grave records from the JSON file
function readDatabase() {
  if (!fs.existsSync(dataFilePath)) {
    return {}; // Return empty object if file doesn't exist yet
  }
  try {
    const rawData = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    return {};
  }
}

// Helper function to save grave records to the JSON file
function saveDatabase(data) {
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,       // Removes standard OS window borders for a clean look
    transparent: true,
    center: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  splashWindow.loadFile('splash.html');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,        // Kept hidden until the splash screen finishes animation
    icon: path.join(__dirname, 'logo.ico'), // Adds app window icon
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // This opens the Console automatically when the app launches
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createSplashWindow();
  createMainWindow();

  // Check for updates after launch (only runs in production packaged app)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

// When an update is found and downloaded, ask the user if they want to install it
autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version of Church Graveyard Manager has been downloaded. Restart the app to apply the update?',
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

// Listen for the signal from splash.html when the video animation ends
ipcMain.on('splash-complete', () => {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// IPC listeners for data management
ipcMain.on('fetch-grave-record', (event, plotId) => {
  const db = readDatabase();
  const record = db[plotId] || { 
    plot_id: plotId, 
    first_name: '', 
    middle_name: '', 
    surname: '', 
    birth_date: '', 
    dod: '', 
    notes: '' 
  };
  event.reply('grave-record-data', record);
});

ipcMain.on('check-initial-grave-name', (event, plotId) => {
  const db = readDatabase();
  if (db[plotId]) {
    event.reply('initial-grave-name', { 
      plotId, 
      first_name: db[plotId].first_name 
    });
  }
});

ipcMain.on('save-grave-record', (event, payload) => {
  const db = readDatabase();
  db[payload.plot_id] = payload;
  saveDatabase(db);
  event.reply('save-grave-response', { success: true });
});

ipcMain.on('clear-grave-record', (event, plotId) => {
  const db = readDatabase();
  if (db[plotId]) {
    delete db[plotId];
    saveDatabase(db);
  }
  event.reply('clear-grave-response', { success: true });
});

// Export/Backup Database with an App Signature Stamp
ipcMain.handle('export-backup', async () => {
  const db = readDatabase();

  const { filePath } = await dialog.showSaveDialog({
    title: 'Backup Cemetery Database',
    defaultPath: 'cemetery-backup.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });

  if (filePath) {
    try {
      // Wrap the database with an official app identifier and timestamp
      const backupPayload = {
        app: "church-graveyard-manager",
        version: "1.1.0",
        timestamp: new Date().toISOString(),
        records: db
      };

      fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2), 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  return { success: false, message: 'Cancelled' };
});

// Import/Restore Database with Strict Signature Validation
ipcMain.handle('import-backup', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Restore Cemetery Database',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (!canceled && filePaths.length > 0) {
    try {
      const rawData = fs.readFileSync(filePaths[0], 'utf8');
      const parsedData = JSON.parse(rawData);

      // 1. Verify it's our app's file format
      if (!parsedData || parsedData.app !== "church-graveyard-manager" || !parsedData.records) {
        return { success: false, message: 'This file is not a valid Church Graveyard Manager backup.' };
      }

      // 2. Compare versions (Current app version is 1.1.0)
      const currentVersion = "1.1.0";
      if (parsedData.version && parsedData.version > currentVersion) {
        return { success: false, message: `This backup was created in version ${parsedData.version}. Please update your app to restore it.` };
      }

      // Safe to restore!
      fs.writeFileSync(dataFilePath, JSON.stringify(parsedData.records, null, 2), 'utf8');
      return { success: true };

    } catch (error) {
      return { success: false, message: 'The file is corrupted or unreadable.' };
    }
  }
  return { success: false, message: 'Cancelled' };
});
