const express = require('express');
const app = express();
const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const { spawn } = require('child_process');
const server = http.createServer(app);
const io = socketio(server);
const fs = require('fs');

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

let pythonProcess = null;
let dataBuffer = '';

function runPythonScript() {
    if (pythonProcess) {
        pythonProcess.kill();
    }

    const pythonScriptPath = path.join(__dirname, 'python_scripts', 'final.py');
    console.log(`Executing Python script: ${pythonScriptPath}`);

    pythonProcess = spawn('python', ['final.py'], {
        cwd: path.join(__dirname, 'python_scripts'),
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
        dataBuffer += data.toString();
        processBuffer();
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python script finished with code ${code}`);
        // Restart the Python script after a short delay
        setTimeout(runPythonScript, 5000);
    });

    pythonProcess.on('error', (error) => {
        console.error(`Failed to start Python script: ${error}`);
    });
}

function processBuffer() {
    let startIndex = dataBuffer.indexOf('JSON_START');
    let endIndex = dataBuffer.indexOf('JSON_END');
    
    while (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
        const jsonStr = dataBuffer.substring(startIndex + 10, endIndex);
        try {
            const jsonData = JSON.parse(jsonStr);
            console.log('Parsed JSON data:', jsonData);  // Log the parsed data
            io.emit('anomaly-data', jsonData);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            console.error('Problematic JSON string:', jsonStr);
        }
        
        dataBuffer = dataBuffer.substring(endIndex + 8);
        startIndex = dataBuffer.indexOf('JSON_START');
        endIndex = dataBuffer.indexOf('JSON_END');
    }
}

io.on("connection", function(socket) {
    console.log("Client connected");
    if (!pythonProcess) {
        runPythonScript();
    }

    socket.on("disconnect", function() {
        console.log("Client disconnected");
    });
});

app.get('/map', function(req, res) {
    res.render('map');  // Renders index.ejs
});

app.get('/last', function(req, res) {
    res.render('last');  // Renders last.ejs
});


app.get("/", function(req, res) {
    res.render("index");
});

app.get('/oil_spill_images/:imageName', (req, res) => {
    const imageName = req.params.imageName;
    const imagePath = path.join(__dirname, 'python_scripts', 'oil_spill_images', imageName);
    
    console.log(`Attempting to serve image: ${imagePath}`);
    
    fs.access(imagePath, fs.constants.F_OK, (err) => {
        if (err) {
            console.error(`Image not found: ${imagePath}`);
            res.status(404).send('Image not found');
        } else {
            console.log(`Serving image: ${imagePath}`);
            res.sendFile(imagePath);
        }
    });
});

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});

process.on('SIGINT', () => {
    if (pythonProcess) {
        pythonProcess.kill();
    }
    process.exit();
});


// const express = require('express');
// const app = express();
// const path = require("path");
// const http = require("http");
// const socketio = require("socket.io");
// const { spawn } = require('child_process');
// const server = http.createServer(app);
// const io = socketio(server);

// app.set("view engine", "ejs");
// app.use(express.static(path.join(__dirname, "public")));

// let pythonProcess = null;
// let dataBuffer = '';

// function runPythonScript() {
//     if (pythonProcess) {
//         pythonProcess.kill();
//     }

//     pythonProcess = spawn('python', ['final.py'], {
//         cwd: path.join(__dirname, 'python_scripts')
//     });

//     pythonProcess.stdout.on('data', (data) => {
//         dataBuffer += data.toString();
//         processBuffer();
//     });

//     pythonProcess.stderr.on('data', (data) => {
//         console.error(`Python script error: ${data}`);
//     });

//     pythonProcess.on('close', (code) => {
//         console.log(`Python script finished with code ${code}`);
//         // Restart the Python script after a short delay
//         setTimeout(runPythonScript, 5000);
//     });
// }

// function processBuffer() {
//     let startIndex = dataBuffer.indexOf('JSON_START');
//     let endIndex = dataBuffer.indexOf('JSON_END');
    
//     while (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
//         const jsonStr = dataBuffer.substring(startIndex + 10, endIndex);
//         try {
//             const jsonData = JSON.parse(jsonStr);
//             io.emit('anomaly-data', jsonData);
//         } catch (error) {
//             console.error('Error parsing JSON:', error);
//         }
        
//         dataBuffer = dataBuffer.substring(endIndex + 8);
//         startIndex = dataBuffer.indexOf('JSON_START');
//         endIndex = dataBuffer.indexOf('JSON_END');
//     }
// }

// io.on("connection", function(socket) {
//     console.log("Client connected");
//     if (!pythonProcess) {
//         runPythonScript();
//     }

//     socket.on("disconnect", function() {
//         console.log("Client disconnected");
//     });
// });

// app.get('/index', function(req, res) {
//     res.render('index');  // Renders index.ejs
// });

// app.get('/last', function(req, res) {
//     res.render('last');  // Renders last.ejs
// });

// app.get("/", function(req, res) {
//     res.render("dash2");
// });

// server.listen(3000, () => {
//     console.log("Server is running on port 3000");
// });

// process.on('SIGINT', () => {
//     if (pythonProcess) {
//         pythonProcess.kill();
//     }
//     process.exit();
// });



// const express = require('express');
// const app = express();
// const path = require("path");
// const http = require("http");
// const socketio = require("socket.io");
// const { spawn } = require('child_process');
// const server = http.createServer(app);
// const io = socketio(server);

// app.set("view engine", "ejs");
// app.use(express.static(path.join(__dirname, "public")));

// let pythonProcess = null;

// function runPythonScript() {
//     if (pythonProcess) {
//         pythonProcess.kill();
//     }

//     pythonProcess = spawn('python', ['final.py'], {
//         cwd: path.join(__dirname, 'python_scripts')
//     });

//     pythonProcess.stdout.on('data', (data) => {
//         try {
//             const jsonData = JSON.parse(data.toString());
//             io.emit('anomaly-data', jsonData);
//         } catch (error) {
//             console.error('Error parsing Python output:', error);
//         }
//     });

//     pythonProcess.stderr.on('data', (data) => {
//         console.error(`Python script error: ${data}`);
//     });

//     pythonProcess.on('close', (code) => {
//         console.log(`Python script finished with code ${code}`);
//     });
// }

// io.on("connection", function(socket) {
//     console.log("Client connected");
//     if (!pythonProcess) {
//         runPythonScript();
//     }

//     socket.on("disconnect", function() {
//         console.log("Client disconnected");
//     });
// });


// app.get('/index', function(req, res) {
//     res.render('index');  // Renders index.ejs
// });

// app.get('/last', function(req, res) {
//     res.render('last');  // Renders last.ejs
// });

// app.get("/", function(req, res) {
//     res.render("dash2");
// });

// server.listen(3000, () => {
//     console.log("Server is running on port 3000");
// });

// process.on('SIGINT', () => {
//     if (pythonProcess) {
//         pythonProcess.kill();
//     }
//     process.exit();
// });



// const express = require('express');
// const app = express();
// const path = require("path");
// const http = require("http");
// const socketio = require("socket.io");
// const { spawn } = require('child_process');
// const server = http.createServer(app);
// const io = socketio(server);

// app.set("view engine", "ejs");
// app.use(express.static(path.join(__dirname, "public")));

// // Run the Python script and emit data through Socket.IO
// function runPythonScript() {
//     const python = spawn('python', ['./python_scripts/final.py']);

//     python.stdout.on('data', (data) => {
//         try {
//             const jsonData = JSON.parse(data.toString());
//             io.emit('anomaly-data', jsonData);
//         } catch (error) {
//             console.error('Error parsing Python output:', error);
//         }
//     });

//     python.stderr.on('data', (data) => {
//         console.error(`Python script error: ${data}`);
//     });

//     python.on('close', (code) => {
//         console.log(`Python script finished with code ${code}`);
//     });
// }

// io.on("connection", function(socket) {
//     console.log("Client connected");
//     //Start the python script when a client connects
//     runPythonScript();

//     // socket.on("send-location", function(data) {
//     //     io.emit("receive-location", {id: socket.id, ...data});
//     // });

//     socket.on("disconnect", function() {
//         console.log("Client disconnected");
//     });
// });

// app.use(express.static('public'));

// app.get('/index', function(req, res) {
//     res.render('index');  // Renders index.ejs
// });

// app.get('/last', function(req, res) {
//     res.render('last');  // Renders last.ejs
// });

// app.get("/", function(req, res) {
//     res.render("dash2");
// });

// // New route to start the anomaly detection
// // app.get("/start-detection", function(req, res) {
// //     runPythonScript();
// //     res.send("Anomaly detection started");
// // });y


// server.listen(3000, () => {
//     console.log("Server is running on port 3000");
// });








// const express = require('express');
// const app = express();
// const path = require("path");

// const http = require("http");

// const socketio = require("socket.io");
// const server = http.createServer(app)
// const io = socketio(server)

// app.set("view engine", "ejs");
// app.use(express.static(path.join(__dirname ,"public")));

// io.on("connection", function(socket){
//     socket.on("send-location", function(data){
//         io.emit("receive-location", {id: socket.id, ...data});
//     })
//     console.log("connected");
// });

// app.use(express.static('public'));


// app.get('/index', function(req, res) {
//     res.render('index');  // Renders index.ejs
// });

// app.get('/last', function(req, res) {
//     res.render('last');  // Renders last.ejs
// });


// app.get("/", function(req,res){
//     res.render("dash2");
// });

// server.listen(3000)  


