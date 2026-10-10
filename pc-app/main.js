const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const chokidar = require('chokidar');
const axios = require('axios');
const FormData = require('form-data');

let mainWindow;
let jwtToken = null;
let watcher = null;

// The backend URL (should match your AWS setup, using localhost for dev)
const BACKEND_URL = process.env.BACKEND_URL || 'http://ec2-13-127-248-142.ap-south-1.compute.amazonaws.com:3001';

const inboxDir = path.join(os.homedir(), '2ndyr/hackathon_TRG/ss_folder');
const defaultScreenshotsDir = path.join(os.homedir(), 'Pictures/Screenshots');
const defaultPicturesDir = path.join(os.homedir(), 'Pictures');

// Create the custom directory if it doesn't exist
if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
}

// Watch array of folders
const watchFolders = [inboxDir];
if (fs.existsSync(defaultScreenshotsDir)) watchFolders.push(defaultScreenshotsDir);
else if (fs.existsSync(defaultPicturesDir)) watchFolders.push(defaultPicturesDir);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        autoHideMenuBar: true,
        title: "Screenshot Graveyard Solver"
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    startWatcher();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handler to receive the JWT token from the UI
ipcMain.on('set-token', (event, token) => {
    jwtToken = token;
    console.log("Main process received JWT token. Auto-upload enabled.");
});

// IPC: Manual re-scan trigger from renderer
ipcMain.on('manual-rescan', async () => {
    console.log("[RESCAN] Manual rescan triggered by user.");
    if (!jwtToken) {
        sendStatus('error', 'Not logged in.');
        return;
    }
    for (const folder of watchFolders) {
        try {
            const files = fs.readdirSync(folder).filter(f => /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(f));
            // Upload the most recent file (last modified)
            if (files.length > 0) {
                const sorted = files
                    .map(f => ({ name: f, time: fs.statSync(path.join(folder, f)).mtimeMs }))
                    .sort((a, b) => b.time - a.time);
                const latest = sorted[0];
                const age = Date.now() - latest.time;
                // Only upload files from the last 5 minutes
                if (age < 5 * 60 * 1000) {
                    console.log(`[RESCAN] Found recent file: ${latest.name} (${Math.round(age/1000)}s ago)`);
                    await uploadFile(path.join(folder, latest.name));
                    return;
                }
            }
        } catch (e) {
            console.error(`[RESCAN] Error scanning ${folder}:`, e.message);
        }
    }
    sendStatus('info', 'No recent screenshots found to upload.');
});

function sendStatus(status, message) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('upload-status', { status, message });
    }
}

function startWatcher() {
    console.log(`Watching folders: ${watchFolders.join(', ')}`);
    
    watcher = chokidar.watch(watchFolders, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true, // IMPORTANT: Do not upload old existing screenshots
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    });

    watcher.on('add', async (filePath) => {
        console.log(`New file detected: ${filePath}`);
        
        if (!jwtToken) {
            console.log("No JWT token. Cannot upload yet.");
            sendStatus('error', 'Not logged in. File pending.');
            return;
        }

        try {
            await uploadFile(filePath);
        } catch (error) {
            console.error("Upload failed:", error.message);
        }
    });
}

async function uploadFile(filePath) {
    const fileName = path.basename(filePath);
    sendStatus('uploading', `Uploading ${fileName}...`);

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
        const response = await axios.post(`${BACKEND_URL}/api/upload`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${jwtToken}`
            },
            timeout: 60000, // 60 second timeout
            maxContentLength: 50 * 1024 * 1024,
            maxBodyLength: 50 * 1024 * 1024,
        });

        console.log("Upload successful:", response.data);
        sendStatus('success', `Upload complete! AI extracted ${response.data?.imported_count || '?'} tasks.`);
        
    } catch (error) {
        const msg = error.code === 'ECONNABORTED' 
            ? 'Upload timed out (slow network?)' 
            : (error.response?.data?.error || error.message || 'Upload failed');
        console.error("Error uploading file:", msg);
        sendStatus('error', msg);
        throw error;
    }
}
