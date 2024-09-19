let socket = io();

// Update the initial view to match the image
const map = L.map("map").setView([33.1, -78.9], 9);  // Centered near Myrtle Beach, zoomed out to level 8

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "OpenStreetMap"
}).addTo(map);

let markers = {};
let circles = {};
const anomalyMarkers = [];
let bounds = L.latLngBounds();
let isFirstMarker = true;
let currentBlueMarkerId = null;
let firstPointCoordinates = null;
let userInteracted = false;

// Add event listeners for user interaction
map.on('zoomstart', function() {
    userInteracted = true;
});

map.on('movestart', function() {
    userInteracted = true;
});

// Function to update or create a marker
function updateMarker(data) {
    const { LAT, LON, BaseDateTime, SOG, COG, Change, anomaly, oil_spill } = data;
    const id = `${LAT}-${LON}`;
    const currentCoordinates = `${LAT},${LON}`;

    let info = `
        Location:<br>
        Latitude: ${LAT}<br>
        Longitude: ${LON}<br>
        Time: ${BaseDateTime}<br>
        Speed: ${SOG} knots<br>
        Course: ${COG}°<br>
        Speed Change: ${Change.toFixed(2)} knots<br>
        Anomaly: ${anomaly ? 'Yes' : 'No'}<br>
        Oil Spill: ${oil_spill ? 'Detected' : 'Not Detected'}
    `;

    // Check if this is the start of a new loop
    if (firstPointCoordinates === currentCoordinates && !isFirstMarker) {
        console.log('Loop restart detected. Clearing all markers.');
        clearAllMarkers();
        isFirstMarker = true;
    }

    // Change the previous blue marker to a small black circle
    if (currentBlueMarkerId && markers[currentBlueMarkerId]) {
        map.removeLayer(markers[currentBlueMarkerId]);
        markers[currentBlueMarkerId] = L.circleMarker(markers[currentBlueMarkerId].getLatLng(), {
            radius: 5,
            fillColor: 'black',
            color: 'black',
            weight: 1,
            opacity: 1,
            fillOpacity: 1
        }).addTo(map).bindPopup(markers[currentBlueMarkerId].getPopup());
    }

    if (isFirstMarker) {
        // First marker (green)
        markers[id] = L.marker([LAT, LON], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: `<div style='background-color:green;' class='marker-pin'></div>`,
                iconSize: [30, 42],
                iconAnchor: [15, 42]
            })
        }).addTo(map).bindPopup(info);
        isFirstMarker = false;
        firstPointCoordinates = currentCoordinates;
    } else if (anomaly === 1) {
        // Anomaly marker (red)
        markers[id] = L.marker([LAT, LON], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: `<div style='background-color:red;' class='marker-pin'></div>`,
                iconSize: [30, 42],
                iconAnchor: [15, 42]
            })
        }).addTo(map).bindPopup(info);
        anomalyMarkers.push(markers[id]);

        // Yellow circle for anomaly
        circles[id] = L.circle([LAT, LON], {
            color: 'yellow',
            fillColor: 'yellow',
            fillOpacity: 0.3,
            radius: 20
        }).addTo(map);

        // Add oil spill visualization if detected
        if (oil_spill === 1) {
            L.circle([LAT, LON], {
                color: 'purple',
                fillColor: '#f03',
                fillOpacity: 0.5,
                radius: 500  // Adjust based on your needs
            }).addTo(map).bindPopup('Potential Oil Spill Detected');

            // Update the image box
            updateImageBox(data);
        }
    } else {
        // Current position (blue marker)
        markers[id] = L.marker([LAT, LON], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: `<div style='background-color:blue;' class='marker-pin'></div>`,
                iconSize: [30, 42],
                iconAnchor: [15, 42]
            })
        }).addTo(map).bindPopup(info);
        currentBlueMarkerId = id;
    }

    bounds.extend([LAT, LON]);
    
    // Only fit bounds if user hasn't interacted with the map
    if (!userInteracted) {
        map.fitBounds(bounds, { maxZoom: 10, padding: [50, 50] });  // Added maxZoom and padding
    }
}

// Function to clear all markers and reset the map
function clearAllMarkers() {
    console.log('Clearing all markers');
    for (let id in markers) {
        map.removeLayer(markers[id]);
    }
    for (let id in circles) {
        map.removeLayer(circles[id]);
    }
    markers = {};
    circles = {};
    anomalyMarkers.length = 0;
    bounds = L.latLngBounds();
    currentBlueMarkerId = null;
    userInteracted = false;
    map.setView([33.1, -78.9], 9);  // Reset to initial zoomed-out view

    // Clear the image box
    document.getElementById('oil-spill-image').style.display = 'none';
    document.getElementById('image-data').innerHTML = '';
}

// ... (rest of the code remains the same)

// Function to update the image box
function updateImageBox(data) {
    const imgElement = document.getElementById('oil-spill-image');
    const dataElement = document.getElementById('image-data');

    if (data.oil_spill === 1 && data.image_path) {
        imgElement.src = `/oil_spill_images/${data.image_path.split('/').pop()}`;
        imgElement.style.display = 'block';

        dataElement.innerHTML = `
            <h3>Anomaly Details</h3>
            <p>Date/Time: ${data.BaseDateTime}</p>
            <p>Speed: ${data.SOG} knots</p>
            <p>Course: ${data.COG}°</p>
            <p>Latitude: ${data.LAT}</p>
            <p>Longitude: ${data.LON}</p>
            <p>Speed Change: ${data.Change.toFixed(2)} knots</p>
            <p>Anomaly: ${data.anomaly ? 'Yes' : 'No'}</p>
            <p>Oil Spill: ${data.oil_spill ? 'Detected' : 'Not Detected'}</p>
        `;
    } else {
        imgElement.style.display = 'none';
        dataElement.innerHTML = '<p>No oil spill detected</p>';
    }
}

// Listen for anomaly data from the server
socket.on('anomaly-data', (data) => {
    console.log('Received data:', data);
    updateMarker(data);
});

// Add a button to focus on anomalies
const anomalyButton = L.control({position: 'topright'});
anomalyButton.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'anomaly-button');
    div.innerHTML = '<button onclick="focusOnAnomalies()">Focus on Anomalies</button>';
    return div;
};
anomalyButton.addTo(map);

function focusOnAnomalies() {
    if (anomalyMarkers.length > 0) {
        const anomalyBounds = L.latLngBounds(anomalyMarkers.map(marker => marker.getLatLng()));
        map.fitBounds(anomalyBounds);
    } else {
        alert('No anomalies detected yet.');
    }
}




// let socket = io();

// const map = L.map("map").setView([0, 0], 2);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//     attribution: "OpenStreetMap"
// }).addTo(map);

// let markers = {};
// let circles = {};
// const anomalyMarkers = [];
// let bounds = L.latLngBounds();
// let isFirstMarker = true;
// let currentBlueMarkerId = null;
// let firstPointCoordinates = null;

// // Function to update or create a marker
// function updateMarker(data) {
//     const { LAT, LON, BaseDateTime, SOG, COG, Change, anomaly, oil_spill } = data;
//     const id = `${LAT}-${LON}`;
//     const currentCoordinates = `${LAT},${LON}`;

//     let info = `
//         Location:<br>
//         Latitude: ${LAT}<br>
//         Longitude: ${LON}<br>
//         Time: ${BaseDateTime}<br>
//         Speed: ${SOG} knots<br>
//         Course: ${COG}°<br>
//         Speed Change: ${Change.toFixed(2)} knots<br>
//         Anomaly: ${anomaly ? 'Yes' : 'No'}<br>
//         Oil Spill: ${oil_spill ? 'Detected' : 'Not Detected'}
//     `;

//     // Check if this is the start of a new loop
//     if (firstPointCoordinates === currentCoordinates && !isFirstMarker) {
//         console.log('Loop restart detected. Clearing all markers.');
//         clearAllMarkers();
//         isFirstMarker = true;
//     }

//     // Change the previous blue marker to a small black circle
//     if (currentBlueMarkerId && markers[currentBlueMarkerId]) {
//         map.removeLayer(markers[currentBlueMarkerId]);
//         markers[currentBlueMarkerId] = L.circleMarker(markers[currentBlueMarkerId].getLatLng(), {
//             radius: 5,
//             fillColor: 'black',
//             color: 'black',
//             weight: 1,
//             opacity: 1,
//             fillOpacity: 1
//         }).addTo(map).bindPopup(markers[currentBlueMarkerId].getPopup());
//     }

//     if (isFirstMarker) {
//         // First marker (green)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:green;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         isFirstMarker = false;
//         firstPointCoordinates = currentCoordinates;
//     } else if (anomaly === 1) {
//         // Anomaly marker (red)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:red;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         anomalyMarkers.push(markers[id]);

//         // Yellow circle for anomaly
//         circles[id] = L.circle([LAT, LON], {
//             color: 'yellow',
//             fillColor: 'yellow',
//             fillOpacity: 0.3,
//             radius: 20
//         }).addTo(map);

//         // Add oil spill visualization if detected
//         if (oil_spill === 1) {
//             L.circle([LAT, LON], {
//                 color: 'purple',
//                 fillColor: '#f03',
//                 fillOpacity: 0.5,
//                 radius: 500  // Adjust based on your needs
//             }).addTo(map).bindPopup('Potential Oil Spill Detected');

//             // Update the image box
//             updateImageBox(data);
//         }
//     } else {
//         // Current position (blue marker)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:blue;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         currentBlueMarkerId = id;
//     }

//     bounds.extend([LAT, LON]);
//     map.fitBounds(bounds);
// }

// // Function to clear all markers and reset the map
// function clearAllMarkers() {
//     console.log('Clearing all markers');
//     for (let id in markers) {
//         map.removeLayer(markers[id]);
//     }
//     for (let id in circles) {
//         map.removeLayer(circles[id]);
//     }
//     markers = {};
//     circles = {};
//     anomalyMarkers.length = 0;
//     bounds = L.latLngBounds();
//     currentBlueMarkerId = null;
//     map.setView([0, 0], 2);

//     // Clear the image box
//     document.getElementById('oil-spill-image').style.display = 'none';
//     document.getElementById('image-data').innerHTML = '';
// }

// // Function to update the image box
// function updateImageBox(data) {
//     const imgElement = document.getElementById('oil-spill-image');
//     const dataElement = document.getElementById('image-data');

//     if (data.oil_spill === 1 && data.image_path) {
//         imgElement.src = data.image_path;
//         imgElement.style.display = 'block';

//         dataElement.innerHTML = `
//             <h3>Anomaly Details</h3>
//             <p>Date/Time: ${data.BaseDateTime}</p>
//             <p>Speed: ${data.SOG} knots</p>
//             <p>Course: ${data.COG}°</p>
//             <p>Latitude: ${data.LAT}</p>
//             <p>Longitude: ${data.LON}</p>
//             <p>Speed Change: ${data.Change.toFixed(2)} knots</p>
//             <p>Anomaly: ${data.anomaly ? 'Yes' : 'No'}</p>
//             <p>Oil Spill: ${data.oil_spill ? 'Detected' : 'Not Detected'}</p>
//         `;
//     } else {
//         imgElement.style.display = 'none';
//         dataElement.innerHTML = '<p>No oil spill detected</p>';
//     }
// }

// // Listen for anomaly data from the server
// socket.on('anomaly-data', (data) => {
//     console.log('Received data:', data);
//     updateMarker(data);
// });

// // Add a button to focus on anomalies
// const anomalyButton = L.control({position: 'topright'});
// anomalyButton.onAdd = function(map) {
//     const div = L.DomUtil.create('div', 'anomaly-button');
//     div.innerHTML = '<button onclick="focusOnAnomalies()">Focus on Anomalies</button>';
//     return div;
// };
// anomalyButton.addTo(map);

// function focusOnAnomalies() {
//     if (anomalyMarkers.length > 0) {
//         const anomalyBounds = L.latLngBounds(anomalyMarkers.map(marker => marker.getLatLng()));
//         map.fitBounds(anomalyBounds);
//     } else {
//         alert('No anomalies detected yet.');
//     }
// }



// let socket = io();

// const map = L.map("map").setView([0, 0], 2);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//     attribution: "OpenStreetMap"
// }).addTo(map);

// let markers = {};
// let circles = {};
// const anomalyMarkers = [];
// let bounds = L.latLngBounds();
// let isFirstMarker = true;
// let currentBlueMarkerId = null;
// let firstPointCoordinates = null;

// // Function to update or create a marker
// function updateMarker(data) {
//     const { LAT, LON, BaseDateTime, SOG, COG, Change, anomaly, oil_spill } = data;
//     const id = `${LAT}-${LON}`;
//     const currentCoordinates = `${LAT},${LON}`;

//     let info = `
//         Location:<br>
//         Latitude: ${LAT}<br>
//         Longitude: ${LON}<br>
//         Time: ${BaseDateTime}<br>
//         Speed: ${SOG} knots<br>
//         Course: ${COG}°<br>
//         Speed Change: ${Change.toFixed(2)} knots<br>
//         Anomaly: ${anomaly ? 'Yes' : 'No'}<br>
//         Oil Spill: ${oil_spill ? 'Detected' : 'Not Detected'}
//     `;

//     // Check if this is the start of a new loop
//     if (firstPointCoordinates === currentCoordinates && !isFirstMarker) {
//         console.log('Loop restart detected. Clearing all markers.');
//         clearAllMarkers();
//         isFirstMarker = true;
//     }

//     // Change the previous blue marker to a small black circle
//     if (currentBlueMarkerId && markers[currentBlueMarkerId]) {
//         map.removeLayer(markers[currentBlueMarkerId]);
//         markers[currentBlueMarkerId] = L.circleMarker(markers[currentBlueMarkerId].getLatLng(), {
//             radius: 5,
//             fillColor: 'black',
//             color: 'black',
//             weight: 1,
//             opacity: 1,
//             fillOpacity: 1
//         }).addTo(map).bindPopup(markers[currentBlueMarkerId].getPopup());
//     }

//     if (isFirstMarker) {
//         // First marker (green)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:green;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         isFirstMarker = false;
//         firstPointCoordinates = currentCoordinates;
//     } else if (anomaly === 1) {
//         // Anomaly marker (red)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:red;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         anomalyMarkers.push(markers[id]);

//         // Yellow circle for anomaly
//         circles[id] = L.circle([LAT, LON], {
//             color: 'yellow',
//             fillColor: 'yellow',
//             fillOpacity: 0.3,
//             radius: 20
//         }).addTo(map);

//         // Add oil spill visualization if detected
//         if (oil_spill === 1) {
//             L.circle([LAT, LON], {
//                 color: 'purple',
//                 fillColor: '#f03',
//                 fillOpacity: 0.5,
//                 radius: 500  // Adjust based on your needs
//             }).addTo(map).bindPopup('Potential Oil Spill Detected');
//         }
//     } else {
//         // Current position (blue marker)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:blue;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         currentBlueMarkerId = id;
//     }

//     bounds.extend([LAT, LON]);
//     map.fitBounds(bounds);
// }

// // Function to clear all markers and reset the map
// function clearAllMarkers() {
//     console.log('Clearing all markers');
//     for (let id in markers) {
//         map.removeLayer(markers[id]);
//     }
//     for (let id in circles) {
//         map.removeLayer(circles[id]);
//     }
//     markers = {};
//     circles = {};
//     anomalyMarkers.length = 0;
//     bounds = L.latLngBounds();
//     currentBlueMarkerId = null;
//     map.setView([0, 0], 2);
// }

// // Listen for anomaly data from the server
// socket.on('anomaly-data', (data) => {
//     console.log('Received data:', data);
//     updateMarker(data);
// });

// // Add a button to focus on anomalies
// const anomalyButton = L.control({position: 'topright'});
// anomalyButton.onAdd = function(map) {
//     const div = L.DomUtil.create('div', 'anomaly-button');
//     div.innerHTML = '<button onclick="focusOnAnomalies()">Focus on Anomalies</button>';
//     return div;
// };
// anomalyButton.addTo(map);

// function focusOnAnomalies() {
//     if (anomalyMarkers.length > 0) {
//         const anomalyBounds = L.latLngBounds(anomalyMarkers.map(marker => marker.getLatLng()));
//         map.fitBounds(anomalyBounds);
//     } else {
//         alert('No anomalies detected yet.');
//     }
// }


// let socket = io();

// const map = L.map("map").setView([0, 0], 2);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//     attribution: "OpenStreetMap"
// }).addTo(map);

// let markers = {};
// let circles = {};
// const anomalyMarkers = [];
// let bounds = L.latLngBounds();
// let isFirstMarker = true;
// let currentBlueMarkerId = null;
// let firstPointCoordinates = null;

// // Function to update or create a marker
// function updateMarker(data) {
//     const { LAT, LON, BaseDateTime, SOG, COG, Change, anomaly } = data;
//     const id = `${LAT}-${LON}`;
//     const currentCoordinates = `${LAT},${LON}`;

//     let info = `
//         Location:<br>
//         Latitude: ${LAT}<br>
//         Longitude: ${LON}<br>
//         Time: ${BaseDateTime}<br>
//         Speed: ${SOG} knots<br>
//         Course: ${COG}°<br>
//         Speed Change: ${Change.toFixed(2)} knots
//     `;

//     // Check if this is the start of a new loop
//     if (firstPointCoordinates === currentCoordinates && !isFirstMarker) {
//         console.log('Loop restart detected. Clearing all markers.');
//         clearAllMarkers();
//         isFirstMarker = true;
//     }

//     // Change the previous blue marker to a small black circle
//     if (currentBlueMarkerId && markers[currentBlueMarkerId]) {
//         map.removeLayer(markers[currentBlueMarkerId]);
//         markers[currentBlueMarkerId] = L.circleMarker(markers[currentBlueMarkerId].getLatLng(), {
//             radius: 5,
//             fillColor: 'black',
//             color: 'black',
//             weight: 1,
//             opacity: 1,
//             fillOpacity: 1
//         }).addTo(map).bindPopup(markers[currentBlueMarkerId].getPopup());
//     }

//     if (isFirstMarker) {
//         // First marker (green)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:green;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         isFirstMarker = false;
//         firstPointCoordinates = currentCoordinates;
//     } else if (anomaly === 1) {
//         // Anomaly marker (red)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:red;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         anomalyMarkers.push(markers[id]);

//         // Yellow circle for anomaly
//         circles[id] = L.circle([LAT, LON], {
//             color: 'yellow',
//             fillColor: 'yellow',
//             fillOpacity: 0.3,
//             radius: 20
//         }).addTo(map);
//     } else {
//         // Current position (blue marker)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:blue;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         currentBlueMarkerId = id;
//     }

//     bounds.extend([LAT, LON]);
//     map.fitBounds(bounds);
// }

// // Function to clear all markers and reset the map
// function clearAllMarkers() {
//     console.log('Clearing all markers');
//     for (let id in markers) {
//         map.removeLayer(markers[id]);
//     }
//     for (let id in circles) {
//         map.removeLayer(circles[id]);
//     }
//     markers = {};
//     circles = {};
//     anomalyMarkers.length = 0;
//     bounds = L.latLngBounds();
//     currentBlueMarkerId = null;
//     map.setView([0, 0], 2);
// }

// // Listen for anomaly data from the server
// socket.on('anomaly-data', (data) => {
//     console.log('Received data:', data);
//     updateMarker(data);
// });

// // Add a button to focus on anomalies
// const anomalyButton = L.control({position: 'topright'});
// anomalyButton.onAdd = function(map) {
//     const div = L.DomUtil.create('div', 'anomaly-button');
//     div.innerHTML = '<button onclick="focusOnAnomalies()">Focus on Anomalies</button>';
//     return div;
// };
// anomalyButton.addTo(map);

// function focusOnAnomalies() {
//     if (anomalyMarkers.length > 0) {
//         const anomalyBounds = L.latLngBounds(anomalyMarkers.map(marker => marker.getLatLng()));
//         map.fitBounds(anomalyBounds);
//     } else {
//         alert('No anomalies detected yet.');
//     }
// }

// let socket = io();

// const map = L.map("map").setView([0, 0], 2);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//     attribution: "OpenStreetMap"
// }).addTo(map);

// let markers = {};
// let circles = {};
// const anomalyMarkers = [];
// let bounds = L.latLngBounds();
// let isFirstMarker = true;
// let currentBlueMarkerId = null;
// let currentDatasetId = null;

// // Function to update or create a marker
// function updateMarker(data) {
//     const { LAT, LON, BaseDateTime, SOG, COG, Change, anomaly } = data;
//     const id = `${LAT}-${LON}`;

//     let info = `
//         Location:<br>
//         Latitude: ${LAT}<br>
//         Longitude: ${LON}<br>
//         Time: ${BaseDateTime}<br>
//         Speed: ${SOG} knots<br>
//         Course: ${COG}°<br>
//         Speed Change: ${Change.toFixed(2)} knots
//     `;

//     // Change the previous blue marker to a small black circle
//     if (currentBlueMarkerId && markers[currentBlueMarkerId]) {
//         map.removeLayer(markers[currentBlueMarkerId]);
//         markers[currentBlueMarkerId] = L.circleMarker(markers[currentBlueMarkerId].getLatLng(), {
//             radius: 5,
//             fillColor: 'black',
//             color: 'black',
//             weight: 1,
//             opacity: 1,
//             fillOpacity: 1
//         }).addTo(map).bindPopup(markers[currentBlueMarkerId].getPopup());
//     }

//     if (isFirstMarker) {
//         // First marker (green)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:green;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         isFirstMarker = false;
//     } else if (anomaly === -1) {
//         // Anomaly marker (red)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:red;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         anomalyMarkers.push(markers[id]);

//         // Yellow circle for anomaly
//         circles[id] = L.circle([LAT, LON], {
//             color: 'yellow',
//             fillColor: 'yellow',
//             fillOpacity: 0.3,
//             radius: 20
//         }).addTo(map);
//     } else {
//         // Current position (blue marker)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:blue;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         currentBlueMarkerId = id;
//     }

//     bounds.extend([LAT, LON]);
//     map.fitBounds(bounds);
// }

// // Function to clear all markers and reset the map
// function clearAllMarkers() {
//     for (let id in markers) {
//         map.removeLayer(markers[id]);
//     }
//     for (let id in circles) {
//         map.removeLayer(circles[id]);
//     }
//     markers = {};
//     circles = {};
//     anomalyMarkers.length = 0;
//     bounds = L.latLngBounds();
//     isFirstMarker = true;
//     currentBlueMarkerId = null;
//     map.setView([0, 0], 2);
// }

// // Listen for anomaly data from the server
// socket.on('anomaly-data', (data) => {
//     console.log('Received data:', data);
    
//     // Check if this is the start of a new dataset
//     if (data.datasetId !== currentDatasetId) {
//         console.log('New dataset detected. Clearing all markers.');
//         clearAllMarkers();
//         currentDatasetId = data.datasetId;
//         isFirstMarker = true;
//     }
    
//     updateMarker(data);
// });

// // Add a button to focus on anomalies
// const anomalyButton = L.control({position: 'topright'});
// anomalyButton.onAdd = function(map) {
//     const div = L.DomUtil.create('div', 'anomaly-button');
//     div.innerHTML = '<button onclick="focusOnAnomalies()">Focus on Anomalies</button>';
//     return div;
// };
// anomalyButton.addTo(map);

// function focusOnAnomalies() {
//     if (anomalyMarkers.length > 0) {
//         const anomalyBounds = L.latLngBounds(anomalyMarkers.map(marker => marker.getLatLng()));
//         map.fitBounds(anomalyBounds);
//     } else {
//         alert('No anomalies detected yet.');
//     }
// }

// let socket = io();

// const map = L.map("map").setView([0, 0], 2);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//     attribution: "OpenStreetMap"
// }).addTo(map);

// let markers = {};
// let circles = {};
// const anomalyMarkers = [];
// let bounds = L.latLngBounds();
// let isFirstMarker = true;
// let currentBlueMarkerId = null;

// // Function to update or create a marker
// function updateMarker(data) {
//     const { LAT, LON, BaseDateTime, SOG, COG, Change, anomaly } = data;
//     const id = `${LAT}-${LON}`;

//     let info = `
//         Location:<br>
//         Latitude: ${LAT}<br>
//         Longitude: ${LON}<br>
//         Time: ${BaseDateTime}<br>
//         Speed: ${SOG} knots<br>
//         Course: ${COG}°<br>
//         Speed Change: ${Change.toFixed(2)} knots
//     `;

//     // Change the previous blue marker to a small black circle
//     if (currentBlueMarkerId && markers[currentBlueMarkerId]) {
//         map.removeLayer(markers[currentBlueMarkerId]);
//         markers[currentBlueMarkerId] = L.circleMarker(markers[currentBlueMarkerId].getLatLng(), {
//             radius: 5,
//             fillColor: 'black',
//             color: 'black',
//             weight: 1,
//             opacity: 1,
//             fillOpacity: 1
//         }).addTo(map).bindPopup(markers[currentBlueMarkerId].getPopup());
//     }

//     if (isFirstMarker) {
//         // First marker (green)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:green;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         isFirstMarker = false;
//     } else if (anomaly === -1) {
//         // Anomaly marker (red)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:red;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         anomalyMarkers.push(markers[id]);

//         // Yellow circle for anomaly
//         circles[id] = L.circle([LAT, LON], {
//             color: 'yellow',
//             fillColor: 'yellow',
//             fillOpacity: 0.3,
//             radius: 20
//         }).addTo(map);
//     } else {
//         // Current position (blue marker)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:blue;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         currentBlueMarkerId = id;
//     }

//     bounds.extend([LAT, LON]);
//     map.fitBounds(bounds);
// }

// // Function to clear all markers and reset the map
// function clearAllMarkers() {
//     for (let id in markers) {
//         map.removeLayer(markers[id]);
//     }
//     for (let id in circles) {
//         map.removeLayer(circles[id]);
//     }
//     markers = {};
//     circles = {};
//     anomalyMarkers.length = 0;
//     bounds = L.latLngBounds();
//     isFirstMarker = true;
//     currentBlueMarkerId = null;
//     map.setView([0, 0], 2);
// }

// // Listen for anomaly data from the server
// socket.on('anomaly-data', (data) => {
//     console.log('Received data:', data);
//     // Check if this is the start of a new dataset
//     if (data.isNewDataset) {
//         clearAllMarkers();
//         isFirstMarker = true;
//     }
//     updateMarker(data);
// });

// // Add a button to focus on anomalies
// const anomalyButton = L.control({position: 'topright'});
// anomalyButton.onAdd = function(map) {
//     const div = L.DomUtil.create('div', 'anomaly-button');
//     div.innerHTML = '<button onclick="focusOnAnomalies()">Focus on Anomalies</button>';
//     return div;
// };
// anomalyButton.addTo(map);

// function focusOnAnomalies() {
//     if (anomalyMarkers.length > 0) {
//         const anomalyBounds = L.latLngBounds(anomalyMarkers.map(marker => marker.getLatLng()));
//         map.fitBounds(anomalyBounds);
//     } else {
//         alert('No anomalies detected yet.');
//     }
// }


// let socket = io();

// const map = L.map("map").setView([0, 0], 2);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//     attribution: "OpenStreetMap"
// }).addTo(map);

// let markers = {};
// let circles = {};
// const anomalyMarkers = [];
// let bounds = L.latLngBounds();
// let isFirstMarker = true;
// let currentBlueMarkerId = null;

// // Function to update or create a marker
// function updateMarker(data) {
//     const { LAT, LON, BaseDateTime, SOG, COG, Change, anomaly } = data;
//     const id = `${LAT}-${LON}`;

//     let info = `
//         Location:<br>
//         Latitude: ${LAT}<br>
//         Longitude: ${LON}<br>
//         Time: ${BaseDateTime}<br>
//         Speed: ${SOG} knots<br>
//         Course: ${COG}°<br>
//         Speed Change: ${Change.toFixed(2)} knots
//     `;

//     // Change the previous blue marker to a small black circle
//     if (currentBlueMarkerId && markers[currentBlueMarkerId]) {
//         map.removeLayer(markers[currentBlueMarkerId]);
//         markers[currentBlueMarkerId] = L.circleMarker(markers[currentBlueMarkerId].getLatLng(), {
//             radius: 5,
//             fillColor: 'black',
//             color: 'black',
//             weight: 1,
//             opacity: 1,
//             fillOpacity: 1
//         }).addTo(map).bindPopup(markers[currentBlueMarkerId].getPopup());
//     }

//     if (isFirstMarker) {
//         // First marker (green)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:green;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         isFirstMarker = false;
//     } else if (anomaly === -1) {
//         // Anomaly marker (red)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:red;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         anomalyMarkers.push(markers[id]);

//         // Yellow circle for anomaly
//         circles[id] = L.circle([LAT, LON], {
//             color: 'yellow',
//             fillColor: 'yellow',
//             fillOpacity: 0.3,
//             radius: 20
//         }).addTo(map);
//     } else {
//         // Current position (blue marker)
//         markers[id] = L.marker([LAT, LON], {
//             icon: L.divIcon({
//                 className: 'custom-div-icon',
//                 html: `<div style='background-color:blue;' class='marker-pin'></div>`,
//                 iconSize: [30, 42],
//                 iconAnchor: [15, 42]
//             })
//         }).addTo(map).bindPopup(info);
//         currentBlueMarkerId = id;
//     }

//     bounds.extend([LAT, LON]);
//     map.fitBounds(bounds);
// }

// // Function to clear all markers and reset the map
// function clearAllMarkers() {
//     for (let id in markers) {
//         map.removeLayer(markers[id]);
//     }
//     for (let id in circles) {
//         map.removeLayer(circles[id]);
//     }
//     markers = {};
//     circles = {};
//     anomalyMarkers.length = 0;
//     bounds = L.latLngBounds();
//     isFirstMarker = true;
//     currentBlueMarkerId = null;
//     map.setView([0, 0], 2);
// }

// // Listen for anomaly data from the server
// socket.on('anomaly-data', (data) => {
//     console.log('Received data:', data);
//     // Check if this is the start of a new loop
//     if (isFirstMarker) {
//         clearAllMarkers();
//     }
//     updateMarker(data);
// });

// // Function to clear old markers and circles (e.g., keep only the last 100 points)
// function clearOldMarkers() {
//     const markerIds = Object.keys(markers);
//     if (markerIds.length > 100) {
//         const markersToRemove = markerIds.slice(0, markerIds.length - 100);
//         markersToRemove.forEach(id => {
//             if (id !== currentBlueMarkerId) {
//                 map.removeLayer(markers[id]);
//                 delete markers[id];
//                 if (circles[id]) {
//                     map.removeLayer(circles[id]);
//                     delete circles[id];
//                 }
//             }
//         });
//     }
// }

// // Clear old markers every minute
// setInterval(clearOldMarkers, 60000);

// // Add a button to focus on anomalies
// const anomalyButton = L.control({position: 'topright'});
// anomalyButton.onAdd = function(map) {
//     const div = L.DomUtil.create('div', 'anomaly-button');
//     div.innerHTML = '<button onclick="focusOnAnomalies()">Focus on Anomalies</button>';
//     return div;
// };
// anomalyButton.addTo(map);

// function focusOnAnomalies() {
//     if (anomalyMarkers.length > 0) {
//         const anomalyBounds = L.latLngBounds(anomalyMarkers.map(marker => marker.getLatLng()));
//         map.fitBounds(anomalyBounds);
//     } else {
//         alert('No anomalies detected yet.');
//     }
// }





// let socket = io();

// const map = L.map("map").setView([0, 0], 2);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//     attribution: "OpenStreetMap"
// }).addTo(map);

// const markers = {};
// const circles = {};
// const anomalyMarkers = [];
// const bounds = L.latLngBounds();
// let isFirstMarker = true;

// // Function to update or create a marker
// function updateMarker(data) {
//     const { LAT, LON, BaseDateTime, SOG, COG, Change, anomaly } = data;
//     const id = `${LAT}-${LON}`;

//     let info = `
//         Location:<br>
//         Latitude: ${LAT}<br>
//         Longitude: ${LON}<br>
//         Time: ${BaseDateTime}<br>
//         Speed: ${SOG} knots<br>
//         Course: ${COG}°<br>
//         Speed Change: ${Change.toFixed(2)} knots
//     `;

//     let markerColor = 'blue';
//     if (isFirstMarker) {
//         markerColor = 'green';
//         isFirstMarker = false;
//     } else if (anomaly === -1) {
//         markerColor = 'red';
//     }

//     let markerOptions = {
//         icon: L.divIcon({
//             className: 'custom-div-icon',
//             html: `<div style='background-color:${markerColor};' class='marker-pin'></div>`,
//             iconSize: [30, 42],
//             iconAnchor: [15, 42]
//         })
//     };

//     if (markers[id]) {
//         console.log('Updating existing marker:', id);
        
//         markers[id].setLatLng([LAT, LON]);
//         markers[id].setIcon(markerOptions.icon);
//         markers[id].getPopup().setContent(info);
//     } else {
//         console.log('Creating new marker:', id);
        
//         markers[id] = L.marker([LAT, LON], markerOptions).addTo(map).bindPopup(info);
//     }

//     // Add or update yellow circle for anomaly
//     if (anomaly === -1) {
//         if (circles[id]) {
//             circles[id].setLatLng([LAT, LON]);
//         } else {
//             circles[id] = L.circle([LAT, LON], {
//                 color: 'yellow',
//                 fillColor: 'yellow',
//                 fillOpacity: 0.3,
//                 radius: 10
//             }).addTo(map);
//         }
//         anomalyMarkers.push(markers[id]);
//     } else if (circles[id]) {
//         // Remove circle if it's no longer an anomaly
//         map.removeLayer(circles[id]);
//         delete circles[id];
//     }

//     bounds.extend([LAT, LON]);
//     map.fitBounds(bounds);
// }

// // Listen for anomaly data from the server
// socket.on('anomaly-data', (data) => {
//     console.log('Received data:', data);
//     updateMarker(data);
// });

// // Function to clear old markers and circles (e.g., keep only the last 100 points)
// function clearOldMarkers() {
//     const markerIds = Object.keys(markers);
//     if (markerIds.length > 100) {
//         const markersToRemove = markerIds.slice(0, markerIds.length - 100);
//         markersToRemove.forEach(id => {
//             map.removeLayer(markers[id]);
//             delete markers[id];
//             if (circles[id]) {
//                 map.removeLayer(circles[id]);
//                 delete circles[id];
//             }
//         });
//     }
// }

// // Clear old markers every minute
// setInterval(clearOldMarkers, 60000);

// // Add a button to focus on anomalies
// const anomalyButton = L.control({position: 'topright'});
// anomalyButton.onAdd = function(map) {
//     const div = L.DomUtil.create('div', 'anomaly-button');
//     div.innerHTML = '<button onclick="focusOnAnomalies()">Focus on Anomalies</button>';
//     return div;
// };
// anomalyButton.addTo(map);

// function focusOnAnomalies() {
//     if (anomalyMarkers.length > 0) {
//         const anomalyBounds = L.latLngBounds(anomalyMarkers.map(marker => marker.getLatLng()));
//         map.fitBounds(anomalyBounds);
//     } else {
//         alert('No anomalies detected yet.');
//     }
// }






// let socket = io();

// const map = L.map("map").setView([0, 0], 2);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//     attribution: "OpenStreetMap"
// }).addTo(map);

// const markers = {};
// const circle = {};
// const anomalyMarkers = [];
// const bounds = L.latLngBounds();

// // Function to update or create a marker
// function updateMarker(data) {
//     const { LAT, LON, BaseDateTime, SOG, COG, Change, anomaly } = data;
//     const id = `${LAT}-${LON}`;

//     let info = `
//         Location:<br>
//         Latitude: ${LAT}<br>
//         Longitude: ${LON}<br>
//         Time: ${BaseDateTime}<br>
//         Speed: ${SOG} knots<br>
//         Course: ${COG}°<br>
//         Speed Change: ${Change.toFixed(2)} knots
//     `;

//     let markerColor = anomaly === -1 ? 'red' : 'blue';
//     let markerOptions = {
//         icon: L.divIcon({
//             className: 'custom-div-icon',
//             html: `<div style='background-color:${markerColor};' class='marker-pin'></div>`,
//             iconSize: [30, 42],
//             iconAnchor: [15, 42]
//         })
//     };

//     if (markers[id]) {
//         console.log('Updating existing marker:', id);
        
//         markers[id].setLatLng([LAT, LON]);
//         markers[id].setIcon(markerOptions.icon);
//         markers[id].getPopup().setContent(info);
//     } else {
//         console.log('Creating new marker:',id);
        
//         markers[id] = L.marker([LAT, LON], markerOptions).addTo(map).bindPopup(info);
//     }

//     if (anomaly === -1) {
//         anomalyMarkers.push(markers[id]);
//     }

//     bounds.extend([LAT, LON]);
//     map.fitBounds(bounds);
// }

// // Listen for anomaly data from the server
// socket.on('anomaly-data', (data) => {
//     console.log('Received data:' , data);
//     updateMarker(data);
// });

// // Function to clear old markers (e.g., keep only the last 100 points)
// function clearOldMarkers() {
//     const markerIds = Object.keys(markers);
//     if (markerIds.length > 100) {
//         const markersToRemove = markerIds.slice(0, markerIds.length - 100);
//         markersToRemove.forEach(id => {
//             map.removeLayer(markers[id]);
//             delete markers[id];
//         });
//     }
// }

// // Clear old markers every minute
// setInterval(clearOldMarkers, 60000);

// // Add a button to focus on anomalies
// const anomalyButton = L.control({position: 'topright'});
// anomalyButton.onAdd = function(map) {
//     const div = L.DomUtil.create('div', 'anomaly-button');
//     div.innerHTML = '<button onclick="focusOnAnomalies()">Focus on Anomalies</button>';
//     return div;
// };
// anomalyButton.addTo(map);

// function focusOnAnomalies() {
//     if (anomalyMarkers.length > 0) {
//         const anomalyBounds = L.latLngBounds(anomalyMarkers.map(marker => marker.getLatLng()));
//         map.fitBounds(anomalyBounds);
//     } else {
//         alert('No anomalies detected yet.');
//     }
// }





















// let socket = io();

// // Define the detected location (e.g., oil spill)
// const detectedLocation = {
//     latitude: 33.24,
//     longitude: -78.7148,
//     id: "detected"
// };

// // Define the current location (e.g., your current position)
// const currentLocation = {
//     latitude: 33.25,  // Replace with your actual latitude
//     longitude: -74.72, // Replace with your actual longitude1
//     id: "current"
// };

// // Emit the locations to the server
// socket.emit("send-location", detectedLocation);
// socket.emit("send-location", currentLocation);

// const map = L.map("map").setView([0, 0],1);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
//     attribution: "OpenStreetMap"
// }).addTo(map);

// const markers = {};
// const circles = {};
// const bounds = L.latLngBounds();

// socket.on("receive-location", (data) => {
//     const { id, latitude, longitude } = data;

//     let info = "";
//     let circleOptions = {};

//     // Check if this is the detected location or the current location
//     if (id === "detected") {
//         info = `Detected Location:<br>Latitude: ${latitude}<br>Longitude: ${longitude}<br>Oil spill detected<br>`;
//         circleOptions = {
//             color: 'red',
//             fillColor: 'red',
//             fillOpacity: 0.5,
//             radius: 5000  // Larger circle for the detected location
//         };
//     } else if (id === "current") {
//         info = `Current Location:<br>Latitude: ${latitude}<br>Longitude: ${longitude}<br>`;
//         circleOptions = {
//             color: 'blue',
//             fillColor: 'blue', 
//             fillOpacity: 0.5,
//             radius: 5000  // Smaller circle for the current location
//         };
//     }

//     map.setView([latitude, longitude], 10);
    
//     if (markers[id]) {
//         markers[id].setLatLng([latitude, longitude]);
//         circles[id].setLatLng([latitude, longitude]);
//     } else {
//         markers[id] = L.marker([latitude, longitude]).addTo(map).bindPopup(info).openPopup();
//         circles[id] = L.circle([latitude, longitude], circleOptions).addTo(map);
//     }

//     bounds.extend([latitude, longitude]);

//     // After processing both locations, fit the map to the bounds
//     if (Object.keys(markers).length === 2) {  // Check if both locations have been added
//         map.fitBounds(bounds);
//     }
// });


// // Function to update the current location's coordinates
// function updateCurrentLocation() {
//     // Slightly modify the latitude and longitude for each update
//     currentLocation.latitude += 0.5; // Increment latitude
//     currentLocation.longitude += 0.5; // Increment longitude
    
//     // Emit the updated location to the server
//     socket.emit("send-location", currentLocation);

//     // Simulate receiving the updated location from the server
//     socket.emit("receive-location", currentLocation);
// }

// // Start updating the current location every 5 seconds
// setInterval(updateCurrentLocation, 5000);

// // Mock receiving the detected location from the server (initial setup)
// socket.emit("receive-location", detectedLocation);




// // Mock receiving locations from the server (for testing without a real server)
// socket.emit("receive-location", detectedLocation);
// socket.emit("receive-location", currentLocation);



