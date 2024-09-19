// Initialize Socket.IO
const socket = io();

// Function to update the SHIP001 row with new data
function updateShip001Data(data) {
    document.getElementById('ship001Lat').textContent = data.LAT.toFixed(3);
    document.getElementById('ship001Lon').textContent = data.LON.toFixed(3);
    document.getElementById('ship001Cog').textContent = data.COG.toFixed(1);
    document.getElementById('ship001Sog').textContent = data.SOG.toFixed(1);
    
    // Update status based on the anomaly
    const statusCell = document.getElementById('ship001Status');
    const anomalyCell = document.getElementById('ship001Anomaly');
    if (data.anomaly === -1) {
        statusCell.textContent = 'Anomaly Detected';
        statusCell.style.color = 'red';
        anomalyCell.textContent = 'Yes';
        anomalyCell.style.color = 'red';
    } else {
        statusCell.textContent = 'Normal';
        statusCell.style.color = 'green';
        anomalyCell.textContent = 'No';
        anomalyCell.style.color = 'green';
    }
    
}

// Listen for anomaly data from the server
socket.on('anomaly-data', (data) => {
    console.log('Received data:', data);
    updateShip001Data(data);
});

// You can add more functions here for additional dashboard functionality