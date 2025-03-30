/*
  * website for data logger data visualization
  * section breakdown: 
    * imports
    * random helper functions
    * threeJS section
    * chart.js section 
    * menu creation and control
*/

// threeJS imports
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// csv parser import
import Papa from 'papaparse';

// chart.js imports
import Chart from 'chart.js/auto';
import { getRelativePosition } from 'chart.js/helpers';

import {Colors} from 'chart.js'
Chart.register(Colors);

// :)
const planets = false;
let selectedChartSensors = new Set();

let xyCanvas = null;

/*---------- random helper functions ----------*/

/**
 * returns radians from degree value
 * @param {number} [degrees] - degrees value to be returned as radians
 * @return {number} 
 * @example degToRad(90) -> 1.5708
*/
function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * returns radians from degree value
 * @param {number} [r] - red value
 * @param {number} [g] - red value
 * @param {number} [b] - red value
 * @returns {string}
 * @example rgbToHex(255,255,255) -> #FFFFFF
*/
function rgbToHex(r, g, b) {
  return parseInt(r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0'), 16);
}

/*---------- ThreeJS section ----------*/
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
const gltfLoader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#bg") });

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
camera.position.set(20, 30, 20);
camera.lookAt(new THREE.Vector3(0, 0, 0));

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.update();

var prevClickedMesh = null;
const ambientLight = new THREE.AmbientLight(0xffffff);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
scene.add(directionalLight);

// SR-25 accumulator model
const accumulatorModel = 'accumulator.gltf';

/**
 * loads a gltf model into the scene
 * @param {string} [modelPath] - path to the gltf model
 * @param {number} [posX=0] - x position of 3d model
 * @param {number} [posY=0] - y position of 3d model
 * @param {number} [posZ=0] - z position of 3d model
 * @param {number} [scaleX=1] - x scale of 3d model
 * @param {number} [scaleY=1] - y scale of 3d model
 * @param {number} [scaleZ=1] - z scale of 3d model
*/
function load3D(modelPath, posX=0, posY=0, posZ=0, scaleX=1, scaleY=1, scaleZ=1) {
  gltfLoader.load(modelPath, gltf => {
    const model = gltf.scene;
    model.scale.set(scaleX, scaleY, scaleZ);
    model.position.set(posX, posY, posZ);
    scene.add(model);
  }, undefined, error => console.error(error));
}

const accPlanesArray = Array(20).fill().map(() => Array(5).fill(null));
const accTextSprites = Array(20).fill().map(() => Array(5).fill(null));

function createTextTexture(message) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  // Text
  ctx.fillStyle = "grey";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// :)
if (planets) {
  const planetTexture = new THREE.TextureLoader().load('planet.jpg');
  const planetMaterial = new THREE.MeshStandardMaterial({ map: planetTexture });

  const planetOrbit1 = new THREE.Object3D();
  const planetOrbit2 = new THREE.Object3D();
  scene.add(planetOrbit1);
  scene.add(planetOrbit2);

  const planetGeometry = new THREE.SphereGeometry(100, 32, 100);
  const planet1 = new THREE.Mesh(planetGeometry, planetMaterial);
  const planet2 = new THREE.Mesh(planetGeometry, planetMaterial);

  const orbitRadius1 = 200;
  planet1.position.set(orbitRadius1, 100, -1000);
  const orbitRadius2 = -50;
  planet2.position.set(orbitRadius2, 100, -1000);

  planetOrbit1.add(planet1);
  planetOrbit2.add(planet2);
}

function createPlanes() {
  const gridSquareSize = 20;
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 5; c++) {
      const planeGeometry = new THREE.PlaneGeometry(gridSquareSize * 3, gridSquareSize * 1);
      const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
      planeMesh.rotation.x = degToRad(-90);
      planeMesh.position.set((c * 70) + 30, 200, -(r * 32) - (10 + ((r + 1 % 2) * r / 50)));
      planeMesh.userData.index = { r, c };
      scene.add(planeMesh);
      accPlanesArray[r][c] = planeMesh;

      const spriteMaterial = new THREE.SpriteMaterial({ map: createTextTexture("...") });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(100, 40, 1); // scale up text
      sprite.position.set((c * 70) + 30, 202, -(r * 32) - (10 + ((r + 1 % 2) * r / 50)));
      scene.add(sprite);
      accTextSprites[r][c] = sprite;
    }
  }
}

function getColor(temp) {
  if (mode == "normal") {
    min = 23, max = document.getElementById("maxTempSlider").value;
  }
  
  const ratio = (Math.min(Math.max(temp, min), max) - min) / (max - min);
  // Match matplotlib's YlOrRd colormap approximation
  const colorStops = [
    [0, 0, 255], // blue
    [0,255,255],
    [0,255,0], // green
    [255,255,0],
    [255, 0, 0] // red
  ];
  const scaled = ratio * (colorStops.length - 1);
  const lowIndex = Math.floor(scaled);
  const highIndex = Math.min(lowIndex + 1, colorStops.length - 1);
  const t = scaled - lowIndex;
  const interpolate = (a, b) => Math.round((1 - t) * a + t * b);

  const r = interpolate(colorStops[lowIndex][0], colorStops[highIndex][0]);
  const g = interpolate(colorStops[lowIndex][1], colorStops[highIndex][1]);
  const b = interpolate(colorStops[lowIndex][2], colorStops[highIndex][2]);

  return new THREE.Color(`rgb(${r},${g},${b})`);
}

let heatmapData = [];
let currentFrame = 0;
let isPlaying = false;
let intervalId;

function loadCSVFromFile(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: results => {
      heatmapData = results.data.map(row => {
        const cleaned = {};
        Object.entries(row).forEach(([key, value]) => {
          cleaned[key.trim()] = value;
        });
        return cleaned;
      });
  
      // Defensive check
      if (!heatmapData[0]) {
        console.error("No rows in CSV");
        return;
      }
  
      const keys = Object.keys(heatmapData[0]);
      const sensorSelect = document.getElementById("sensorSelect");
      const xAxisSensor = document.getElementById("xAxisSensor");
      const yAxisSensor = document.getElementById("yAxisSensor");
  
      sensorSelect.innerHTML = '';
      xAxisSensor.innerHTML = '';
      yAxisSensor.innerHTML = '';
  
      keys.forEach(key => {
        if (key.toLowerCase().includes("time")) return;
        const option = new Option(key, key);
        sensorSelect.appendChild(option);
        xAxisSensor.appendChild(option.cloneNode(true));
        yAxisSensor.appendChild(option.cloneNode(true));
      });
  
      document.getElementById("timeSlider").max = heatmapData.length - 1;
      updateAccumulatorHeatmap();
    }
  });
  
  console.log("CSV Data:", heatmapData);
  console.log("CSV Keys:", Object.keys(heatmapData[0]));
}

let mode = "normal"
let min = 100;
let max = 0;
function updateAccumulatorHeatmap() {
  mode = document.getElementById("mode").value
  const row = heatmapData[currentFrame];
  if (!row) return;
  let flatKeys = Object.keys(row).filter(k => k.startsWith("seg"));

  const timeKey = Object.keys(row).find(k => k.toLowerCase().includes("time"));
  if (timeKey) {
    const minutes = (parseFloat(row[timeKey]) / 60).toFixed(2);
    const label = document.getElementById("timeLabel");
    if (label) label.innerText = `Time: ${minutes} min`;
  }

  if (mode == "scaled") {
    min = 100; max = 0;
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 5; c++) {
        const index = r * 5 + c;
        const key = flatKeys[index];
        const value = parseFloat(row[key]);
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
  }

  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 5; c++) {
      const index = r * 5 + c;
      const key = flatKeys[index];
      const value = parseFloat(row[key]);
      if (!isNaN(value)) {
        const plane = accPlanesArray[r][c];
        const text = accTextSprites[r][c];
        plane.material.color = getColor(value);
        text.material.map = createTextTexture(`${value.toFixed(1)}`);
        text.material.needsUpdate = true;
      }
    }
  }

  // Only update chart if section is visible
  const chartVisible = document.getElementById("chartSection")?.style.display === "block";
  if (chartVisible) updateTimeSeriesChart();

  const tireVisible = document.getElementById("tireSection")?.style.display === "block";
  if (tireVisible) updateTireHeatmap();
}


function togglePlayPause() {
  if (isPlaying) {
    clearInterval(intervalId);
    document.getElementById("playPauseBtn").innerText = "Play"; 
  } else {
    intervalId = setInterval(() => {
      currentFrame = (currentFrame + 1) % heatmapData.length;
      document.getElementById("timeSlider").value = currentFrame;
      updateAccumulatorHeatmap();
    }, 2100 - parseInt(document.getElementById("speedSlider").value));

    document.getElementById("playPauseBtn").innerText = "Pause";
  }
  isPlaying = !isPlaying;
}

// tire temp stuff
function updateTireHeatmap() {
  if (heatmapData.length === 0) return;
  const row = heatmapData[currentFrame];
  const tireMin = parseFloat(document.getElementById("tireMin").value);
  const tireMax = parseFloat(document.getElementById("tireMax").value);
  const tires = ["fl", "fr", "rl", "rr"];
  const zones = ["inner", "middle", "outer"];
  const zoneLabels = { inner: "Inner", middle: "Middle", outer: "Outer" };

  tires.forEach(tire => {
    const canvas = document.getElementById(`${tire}TireCanvas`);
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas

    zones.forEach((zone, i) => {
      const key = `${tire}_${zone}`;
      const value = parseFloat(row[key]);
      const color = getColorClamped(value, tireMin, tireMax);

      // Fill heatmap zone
      ctx.fillStyle = color;
      ctx.fillRect(i * 40, 20, 40, 40);  // shift down to make room for label

      // Draw temperature value in zone
      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(value.toFixed(1), i * 40 + 20, 40);  // center of colored box

      // Draw label above zone
      ctx.fillStyle = '#222';
      ctx.font = '12px Arial';
      ctx.fillText(zoneLabels[zone], i * 40 + 20, 10);
    });
  });
}

function getColorClamped(temp, min, max) {
  const ratio = (Math.min(Math.max(temp, min), max) - min) / (max - min);
  const colorStops = [
    [0, 0, 255],
    [0, 255, 255],
    [0, 255, 0],
    [255, 255, 0],
    [255, 0, 0]
  ];
  const scaled = ratio * (colorStops.length - 1);
  const lowIndex = Math.floor(scaled);
  const highIndex = Math.min(lowIndex + 1, colorStops.length - 1);
  const t = scaled - lowIndex;
  const interpolate = (a, b) => Math.round((1 - t) * a + t * b);
  const r = interpolate(colorStops[lowIndex][0], colorStops[highIndex][0]);
  const g = interpolate(colorStops[lowIndex][1], colorStops[highIndex][1]);
  const b = interpolate(colorStops[lowIndex][2], colorStops[highIndex][2]);
  return `rgb(${r},${g},${b})`;
}


function animate() {

  // :)
  if (planets) {
    planetOrbit1.rotation.y += 0.002;
    planetOrbit2.rotation.y += 0.002;
  }

  renderer.render(scene, camera);
}

// Predefined color palette
const predefinedColors = [
  'red', 'green', 'blue', 'orange', 'purple', 'cyan', 'magenta',
  'gold', 'lime', 'teal', 'pink', 'brown', 'navy', 'olive', 'maroon'
];

// Map to store consistent sensor colors
const sensorColors = {};
function getPersistentColor(sensorKey) {
  if (!sensorColors[sensorKey]) {
    const keys = Object.keys(sensorColors);
    const idx = keys.length % predefinedColors.length;
    sensorColors[sensorKey] = predefinedColors[idx];
  }
  return sensorColors[sensorKey];
}

window.addEventListener('DOMContentLoaded', () => {
  const controls = document.createElement('div');
  controls.style.position = 'absolute';
  controls.style.top = '10px';
  controls.style.left = '10px';
  controls.style.maxHeight = '95vh';           
  controls.style.overflowY = 'auto';           
  controls.style.background = 'rgba(255,255,255,0.95)';
  controls.style.padding = '10px';
  controls.style.borderRadius = '8px';
  controls.style.boxSizing = 'border-box'; 

  const section1 = createExpandableSection("Playback & Settings", 'mainSection', `
    <input type="file" id="fileInput" accept=".csv" /><br>
    <label for="mode">Choose a mode:</label>
    <select id="mode" name="modes">
      <option value="normal">normal</option>
      <option value="scaled">scaled</option>
    </select><br><br>
    <button id="playPauseBtn">Play</button>
    Speed: <input type="range" id="speedSlider" min="100" max="2000" value="500" step="100" /><br>
    Time: <input type="range" id="timeSlider" min="0" max="0" value="0" />
    Temp Max: <input type="number" id="maxTempSlider" min="20" max="100" value="60" step="2" /><br>
  `);
  
  const section2 = createExpandableSection("Sensor Selection & Chart", 'chartSection',`
    <label for="sensorSelect">Select Sensors:</label><br>
    <select id="sensorSelect" multiple size="10" style="width: 100%"></select><br><br>
  
    <button id="addSensorsBtn">Add to Graph</button>
    <button id="removeSensorsBtn">Remove from Graph</button><br><br>
  
    <label for="yMin">Y-Min:</label>
    <input type="number" id="yMin" value="20" step="0.1"><t>
  
    <label for="yMax">Y-Max:</label>
    <input type="number" id="yMax" value="60" step="0.1"><br><br>
  
    <label for="timeWindow">Time Window (seconds):</label>
    <input type="number" id="timeWindow" value="10" min="1" max="300" step="1"><br><br>
  
    <canvas id="timeSeriesChart" width="600" height="300"></canvas>    
  `);

  const section3 = createExpandableSection("Tire Temperature Heatmap", 'tireSection',`
    <label for="tireMin">Min Temp:</label>
    <input type="number" id="tireMin" value="20" step="0.5"><br>
    <label for="tireMax">Max Temp:</label>
    <input type="number" id="tireMax" value="60" step="0.5"><br><br>
  
    <div id="tireHeatmapContainer" style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; gap: 10px;">
        ${["fl", "fr"].map(pos => `
          <div>
            <div style="text-align:center;font-weight:bold">${pos.toUpperCase()}</div>
            <canvas id="${pos}TireCanvas" width="120" height="60" style="border:1px solid #ccc"></canvas>
          </div>
        `).join("")}
      </div>
      <div style="display: flex; gap: 10px;">
        ${["rl", "rr"].map(pos => `
          <div>
            <div style="text-align:center;font-weight:bold">${pos.toUpperCase()}</div>
            <canvas id="${pos}TireCanvas" width="120" height="60" style="border:1px solid #ccc"></canvas>
          </div>
        `).join("")}
      </div>
    </div>
  `);    

  const section4 = createExpandableSection("Sensor XY Scatter Plot", 'xySection', `
    <label for="xAxisSensor">X-Axis Sensor:</label><br>
    <select id="xAxisSensor" style="width: 100%"></select><br><br>
  
    <label for="yAxisSensor">Y-Axis Sensor:</label><br>
    <select id="yAxisSensor" style="width: 100%"></select><br><br>
  
    <button id="plotXYBtn">Plot XY</button><br><br>
  
    <canvas id="xyChart" width="600" height="300"></canvas>
  `);
  
  controls.innerHTML = ''; // clear anything in it
  controls.appendChild(section1);
  controls.appendChild(section2);
  controls.appendChild(section3);
  controls.appendChild(section4);

  let xAxisSensor, yAxisSensor;

  document.body.appendChild(controls);
  initChart();

  xAxisSensor = document.getElementById("xAxisSensor");
  yAxisSensor = document.getElementById("yAxisSensor");

  // After appending, safe to reference
  const fileInput = document.getElementById("fileInput");
  const modeSelect = document.getElementById("mode");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const speedSlider = document.getElementById("speedSlider");
  const timeSlider = document.getElementById("timeSlider");
  const maxTempSlider = document.getElementById("maxTempSlider");
  const sensorSelect = document.getElementById("sensorSelect");
  const addSensorsBtn = document.getElementById("addSensorsBtn");
  const removeSensorsBtn = document.getElementById("removeSensorsBtn");
  const yMinInput = document.getElementById("yMin");
  const yMaxInput = document.getElementById("yMax");
  const timeWindowInput = document.getElementById("timeWindow");
  const startChartBtn = document.getElementById("startChartBtn");
  const timeSeriesCanvas = document.getElementById("timeSeriesChart");  

  const timeLabel = document.createElement('div');
  timeLabel.id = 'timeLabel';
  timeLabel.style.marginTop = '10px';
  timeLabel.style.fontWeight = 'bold';
  timeLabel.innerText = "Time: 0.00 min";
  controls.appendChild(timeLabel);

  const plotXYBtn = document.getElementById("plotXYBtn");

  plotXYBtn.addEventListener("click", updateXYChart);

  fileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) loadCSVFromFile(file);
    const keys = Object.keys(heatmapData[0]);
    const sensorSelect = document.getElementById("sensorSelect");
    sensorSelect.innerHTML = '';
    keys.forEach(key => {
      if (key !== 'time') {
        const option = document.createElement("option");
        option.value = key;
        option.text = key;
        sensorSelect.appendChild(option);
      }
    });
  });

  playPauseBtn.addEventListener("click", togglePlayPause);
  timeSlider.addEventListener("input", e => {
    currentFrame = parseInt(e.target.value);
    updateAccumulatorHeatmap();
  });
  speedSlider.addEventListener("input", e => {
    if (isPlaying) {
      clearInterval(intervalId);
      intervalId = setInterval(() => {
        currentFrame = (currentFrame + 1) % heatmapData.length;
        document.getElementById("timeSlider").value = currentFrame;
        updateAccumulatorHeatmap();
      }, 2100 - parseInt(e.target.value));
    }
  });

  addSensorsBtn.addEventListener("click", () => {
    const selected = Array.from(document.getElementById("sensorSelect").selectedOptions).map(o => o.value);
    selected.forEach(sensor => selectedChartSensors.add(sensor));
    console.log("Added sensors:", Array.from(selectedChartSensors));
    updateTimeSeriesChart();
  });
  
  removeSensorsBtn.addEventListener("click", () => {
    const selected = Array.from(document.getElementById("sensorSelect").selectedOptions).map(o => o.value);
    selected.forEach(sensor => selectedChartSensors.delete(sensor));
    updateTimeSeriesChart();
  });

  xyCanvas = document.getElementById("xyChart");
  
});

function createExpandableSection(titleText, sectionId = "", contentHTML, ) {
  const section = document.createElement('div');
  section.style.marginBottom = '10px';

  const header = document.createElement('div');
  header.style.cursor = 'pointer';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.fontWeight = 'bold';

  const arrow = document.createElement('span');
  arrow.textContent = '▶';
  arrow.style.marginRight = '6px';
  arrow.style.transition = 'transform 0.2s';

  const title = document.createElement('span');
  title.textContent = titleText;

  const content = document.createElement('div');
  content.innerHTML = contentHTML;
  content.style.display = 'none';
  content.style.marginTop = '5px';
  if (sectionId) content.id = sectionId;

  header.appendChild(arrow);
  header.appendChild(title);
  section.appendChild(header);
  section.appendChild(content);

  header.addEventListener('click', () => {
    const isOpen = content.style.display === 'block';
    content.style.display = isOpen ? 'none' : 'block';
    arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
  });

  return section;
}


/*---------- chart.js section ----------*/

/**
 * returns the data object 
 * @param {Array<String>} [sensors] - the size of the grid helper
*/
function getDatasetObject(sensors) {
  let result = [];
  for (let i = 0;i < sensors.length;i++) {
    result.push({
      'label': sensors[i]['sens_name'],
      'data': sensors[i]['values'],
    })
  }
  return result;
}

function getGraphElement(data, config){

}

let timeSeriesChart = null;

function initChart() {
  const ctx = document.getElementById("timeSeriesChart").getContext("2d");
  timeSeriesChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: []
    },
    options: {
      responsive: false,
      animation: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' }
        },
        y: {
          title: { display: true, text: 'Value' }
        }
      },
      interaction: {
        intersect: false,
        mode: 'nearest'
      },
      plugins: {
        legend: {
          display: true
        }
      },
      onHover: (event, elements, chart) => {
        if (elements.length > 0) {
          const hoveredDatasetIndex = elements[0].datasetIndex;
          chart.data.datasets.forEach((dataset, idx) => {
            dataset.borderWidth = idx === hoveredDatasetIndex ? 3 : 1;
            dataset.borderColor = idx === hoveredDatasetIndex 
              ? dataset.borderColor 
              : `${dataset.borderColor}33`; // make others semi-transparent
          });
          chart.update('none'); // update with no animation
        } else {
          // Restore full opacity when not hovering
          chart.data.datasets.forEach(dataset => {
            dataset.borderWidth = 2;
            dataset.borderColor = getPersistentColor(dataset.label);
          });
          chart.update('none');
        }
      }
    }
    
  });
}


function updateTimeSeriesChart() {
  if (!timeSeriesChart || heatmapData.length === 0) return;

  const timeWindow = parseFloat(document.getElementById("timeWindow").value);
  const currentRow = heatmapData[currentFrame];
  if (!currentRow || !currentRow["time(s)"]) return;

  const currentTime = parseFloat(currentRow["time(s)"]);
  const startTime = currentTime - timeWindow;

  const yMin = parseFloat(document.getElementById("yMin").value);
  const yMax = parseFloat(document.getElementById("yMax").value);

  const visibleRows = heatmapData.filter(row => {
    const t = parseFloat(row["time(s)"]);
    return t >= startTime && t <= currentTime;
  });

  timeSeriesChart.data.datasets = Array.from(selectedChartSensors).map(sensorKey => ({
    label: sensorKey,
    borderColor: getPersistentColor(sensorKey),
    data: visibleRows.map(row => ({
      x: parseFloat(row["time(s)"]),
      y: parseFloat(row[sensorKey])
    })),
    fill: false,
    tension: 0.4,
    pointRadius: 0
  }));

  // Lock Y-axis
  timeSeriesChart.options.scales.y.min = yMin;
  timeSeriesChart.options.scales.y.max = yMax;

  // Dynamically update X-axis range
  timeSeriesChart.options.scales.x.min = startTime;
  timeSeriesChart.options.scales.x.max = currentTime;

  timeSeriesChart.update();
}

function getRandomColor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  const color = `hsl(${hash % 360}, 70%, 50%)`;
  return color;
}

let xyChart = null;

function updateXYChart() {
  const xKey = xAxisSensor.value;
  const yKey = yAxisSensor.value;

  if (!xKey || !yKey || heatmapData.length === 0) return;

  const data = heatmapData
    .map(row => ({
      x: parseFloat(row[xKey]),
      y: parseFloat(row[yKey])
    }))
    .filter(pt => !isNaN(pt.x) && !isNaN(pt.y));

  if (!xyChart) {
    xyChart = new Chart(xyCanvas.getContext("2d"), {
      type: 'scatter',
      data: {
        datasets: [{
          label: `${yKey} vs ${xKey}`,
          data,
          borderColor: 'blue',
          backgroundColor: 'rgba(0, 123, 255, 0.6)',
          pointRadius: 3
        }]
      },
      options: {
        responsive: false,
        animation: false,
        scales: {
          x: {
            title: { display: true, text: xKey },
            type: 'linear'
          },
          y: {
            title: { display: true, text: yKey },
            type: 'linear'
          }
        },
        plugins: {
          legend: { display: true }
        }
      }
    });
  } else {
    xyChart.data.datasets[0].label = `${yKey} vs ${xKey}`;
    xyChart.data.datasets[0].data = data;
    xyChart.options.scales.x.title.text = xKey;
    xyChart.options.scales.y.title.text = yKey;
    xyChart.update();
  }
}


camera.position.x = 100;
camera.position.z = 100;
camera.position.y = 300;

createPlanes();
load3D(accumulatorModel);
renderer.setAnimationLoop(animate);