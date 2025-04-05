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

import { Delaunay } from 'd3-delaunay'; // Add this to your import section (include `d3-delaunay` via a script tag or npm if bundling)

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

function latLonToXZ(lat, lon, baseLat, baseLon) {
  const earthRadius = 6371000; // meters
  const dLat = (lat - baseLat) * Math.PI / 180;
  const dLon = (lon - baseLon) * Math.PI / 180;

  const x = earthRadius * dLon * Math.cos(baseLat * Math.PI / 180);
  const z = -earthRadius * dLat; // invert so north is negative z

  return { x, z };
}

/*---------- ThreeJS section ----------*/
const scene = new THREE.Scene();
const container = document.getElementById("threejs-container");
const camera = new THREE.PerspectiveCamera(
  75,
  container.clientWidth / container.clientHeight,
  0.1,
  5000
);

const gltfLoader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#bg") });

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(
  document.getElementById("threejs-container").clientWidth,
  document.getElementById("threejs-container").clientHeight
);
window.addEventListener("resize", () => {
  const container = document.getElementById("threejs-container");
  renderer.setSize(container.clientWidth, container.clientHeight);
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
});


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
const chassisModel = 'chassis.gltf'

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
let chassisMesh = null; // global
function load3D(modelPath, posX = 0, posY = 0, posZ = 0, scaleX = 1, scaleY = 1, scaleZ = 1) {
  gltfLoader.load(modelPath, gltf => {
    const model = gltf.scene;
    model.scale.set(scaleX, scaleY, scaleZ);
    model.position.set(posX, posY, posZ);
    accGroup.add(model);
    modelGroup.add(model);

    if (modelPath === chassisModel) {
      chassisMesh = model; // store reference
    }
  }, undefined, error => console.error(error));
}


const accPlanesArray = Array(20).fill().map(() => Array(5).fill(null));
const accTextSprites = Array(20).fill().map(() => Array(5).fill(null));

let accGroup = new THREE.Group(); // Holds model and planes
let modelGroup = new THREE.Group();
accGroup.add(modelGroup);
let gpsLatKey = null;
let gpsLonKey = null;
let baseLat = 0;
let baseLon = 0;
let targetPosition = new THREE.Vector3();
let trackOffset = new THREE.Vector3(0, 0, 0);
let cameraOffset = new THREE.Vector3();
let cameraOffsetFromAcc = new THREE.Vector3(0, 40, 80); // initial offset
let carMovement = true;
let cameraFollowCar = true;
let userIsOrbiting = false;
let cameraLockToAcc = false;


const carModelScale = 0.03;
const TRACK_SCALE = 10;
scene.add(accGroup);

function createTextTexture(message) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  // Text
  ctx.clearRect(0, 0, canvas.width, canvas.height); // clear to transparent
  ctx.fillStyle = "rgba(255, 255, 255, 1)"; // white text
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
      const planeGeometry = new THREE.PlaneGeometry(gridSquareSize * 3 * carModelScale, gridSquareSize * 1 * carModelScale);
      const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
      const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
      planeMesh.rotation.x = degToRad(-90);
      planeMesh.position.set(((c * 70) + 30) * carModelScale, 198 * carModelScale, (-(r * 32) - (10 + ((r + 1 % 2) * r / 50))) * carModelScale);
      planeMesh.userData.index = { r, c };
      accGroup.add(planeMesh);
      modelGroup.add(planeMesh);

      accPlanesArray[r][c] = planeMesh;

      const spriteMaterial = new THREE.SpriteMaterial({ map: createTextTexture("...") });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(100 * carModelScale, 40 * carModelScale, 1 * carModelScale);
      sprite.position.set(((c * 70) + 30) * carModelScale, 202.5 * carModelScale, (-(r * 32) - (10 + ((r + 1 % 2) * r / 50))) * carModelScale);
      accGroup.add(sprite);
      modelGroup.add(sprite);
      accTextSprites[r][c] = sprite;
    }
  }
}

function getColor(temp) {
  if (mode == "normal") {
    min = 23, max = document.getElementById("maxTempSlider").value;
  }
  
  const ratio = (Math.min(Math.max(temp, min), max) - min) / (max - min);
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
let threeJSActive = true;
let intervalId;

function smoothPath(pathPoints, samples = 200) {
  const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.1);
  return curve.getPoints(samples);
}

function segmentByJump(points, baseLat, baseLon, maxJumpMeters = 10) {
  const segments = [];
  let currentSegment = [];

  for (let i = 0; i < points.length; i++) {
    const curr = latLonToXZ(points[i].lat, points[i].lon, baseLat, baseLon);
    const prev = currentSegment.length > 0
      ? latLonToXZ(currentSegment[currentSegment.length - 1].lat, currentSegment[currentSegment.length - 1].lon, baseLat, baseLon)
      : null;

    if (prev) {
      const dx = curr.x - prev.x;
      const dz = curr.z - prev.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > maxJumpMeters) {
        if (currentSegment.length >= 2) segments.push([...currentSegment]);
        currentSegment = [];
      }
    }

    currentSegment.push(points[i]);
  }

  if (currentSegment.length >= 2) segments.push(currentSegment);
  return segments;
}

function createTrackRibbon(pathPoints, width = 6) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];

  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = pathPoints[i];
    const p2 = pathPoints[i + 1];

    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    const normal = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);

    const left1 = new THREE.Vector3().addVectors(p1, normal);
    const right1 = new THREE.Vector3().subVectors(p1, normal);
    const left2 = new THREE.Vector3().addVectors(p2, normal);
    const right2 = new THREE.Vector3().subVectors(p2, normal);

    const baseIndex = positions.length / 3;

    [left1, right1, left2, right2].forEach(v => {
      positions.push(v.x, v.y, v.z);
    });

    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex + 1, baseIndex + 3, baseIndex + 2);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x444444,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.trackRibbon = true;
  scene.add(mesh);
}

function createRibbonBetweenPaths(path1, path2) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];

  const len = Math.min(path1.length, path2.length);
  for (let i = 0; i < len - 1; i++) {
    const p1 = path1[i];
    const p2 = path1[i + 1];
    const p3 = path2[i];
    const p4 = path2[i + 1];

    const baseIndex = positions.length / 3;

    [p1, p3, p2, p4].forEach(p => {
      positions.push(p.x, p.y, p.z);
    });

    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex + 2, baseIndex + 1, baseIndex + 3);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x444444,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.trackRibbon = true;
  scene.add(mesh);
}

let earthOverlayMesh = null;

const earthOverlayRotationDeg = 90;
function createEarthOverlay(imageUrl, widthMeters, heightMeters) {
  const loader = new THREE.TextureLoader();
  loader.load(imageUrl, texture => {
    const geometry = new THREE.PlaneGeometry(widthMeters, heightMeters);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 1 });
    earthOverlayMesh = new THREE.Mesh(geometry, material);

    earthOverlayMesh.rotation.set(-Math.PI / 2, 0, degToRad(earthOverlayRotationDeg));
    earthOverlayMesh.position.set(0, 0.05, 0);  // Slightly above ground

    scene.add(earthOverlayMesh);
    earthOverlayMesh.visible = false; // Start hidden
  });
}

function segmentByLap(data, lapKey) {
  const laps = [];
  let currentLap = null;
  let lastLapValue = null;

  data.forEach(row => {
    const lapValue = row[lapKey];
    if (lapValue !== lastLapValue) {
      currentLap = [];
      laps.push(currentLap);
      lastLapValue = lapValue;
    }
    currentLap.push(row);
  });

  return laps;
}

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

      if (!heatmapData[0]) return;

      const keys = Object.keys(heatmapData[0]);
      const sensorSelect = document.getElementById("sensorSelect");
      const xAxisSensor = document.getElementById("xAxisSensor");
      const yAxisSensor = document.getElementById("yAxisSensor");
      const customSensorSelect = document.getElementById("customSensors");

      [sensorSelect, xAxisSensor, yAxisSensor, customSensorSelect].forEach(el => el.innerHTML = '');
      keys.forEach(key => {
        if (!key.toLowerCase().includes("time")) {
          const option = new Option(key, key);
          sensorSelect.appendChild(option);
          xAxisSensor.appendChild(option.cloneNode(true));
          yAxisSensor.appendChild(option.cloneNode(true));
          customSensorSelect.appendChild(option.cloneNode(true));
        }
      });

      gpsLatKey = keys.find(k => k.toLowerCase().includes("lat"));
      gpsLonKey = keys.find(k => k.toLowerCase().includes("lon"));
      if (!gpsLatKey || !gpsLonKey) return;

      baseLat = parseFloat(heatmapData[0][gpsLatKey]);
      baseLon = parseFloat(heatmapData[0][gpsLonKey]);

      const gpsPoints = heatmapData.map(row => ({
        lat: parseFloat(row[gpsLatKey]),
        lon: parseFloat(row[gpsLonKey])
      })).filter(p => !isNaN(p.lat) && !isNaN(p.lon) && p.lat !== 0 && p.lon !== 0);

      const allSmoothed = [];
      const segments = segmentByJump(gpsPoints, baseLat, baseLon, 10);

      segments.forEach(segment => {
        const rawPath = segment.map(p => {
          const { x, z } = latLonToXZ(p.lat, p.lon, baseLat, baseLon);
          return new THREE.Vector3(x * TRACK_SCALE, 0.1, z * TRACK_SCALE);
        });

        const smoothed = smoothPath(rawPath, 400);

        const center = smoothed.reduce((acc, p) => {
          acc.x += p.x; acc.z += p.z;
          return acc;
        }, { x: 0, z: 0 });

        center.x /= smoothed.length;
        center.z /= smoothed.length;
        trackOffset.set(center.x, 0, center.z);  // store offset globally

        smoothed.forEach(p => {
          p.x -= center.x;
          p.z -= center.z;
        });

        allSmoothed.push(smoothed);
      });

      if (allSmoothed.length === 1) {
        createTrackRibbon(allSmoothed[0]);
      } else {
        for (let i = 0; i < allSmoothed.length - 1; i++) {
          createRibbonBetweenPaths(allSmoothed[i], allSmoothed[i + 1]);
        }
      }      
      
      document.getElementById("timeSlider").max = heatmapData.length - 1;
      updateAccumulatorHeatmap();
    }
  });
}


let mode = "normal"
let min = 100;
let max = 0;
function updateAccumulatorHeatmap() {
  mode = document.getElementById("mode").value
  const row = heatmapData[currentFrame];
  if (!row) return;
  let flatKeys = Object.keys(row).filter(k => k.startsWith("seg"));
  const rawHeadingDeg = parseFloat(row["gps_direction[none]"]);
  const normalizedDeg = ((rawHeadingDeg % 360) + 360) % 360;  // ensures 0–359
  direction = degToRad(normalizedDeg);
  console.log(direction)

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

  const customVisible = document.getElementById("customGraphSection")?.style.display === "block";
  if (customVisible) updateCustomGraphs();

  if (gpsLatKey && gpsLonKey && heatmapData.length > 0) {
    const row = heatmapData[currentFrame];
    const lat = parseFloat(row[gpsLatKey]);
    const lon = parseFloat(row[gpsLonKey]);
  
    const pos = latLonToXZ(lat, lon, baseLat, baseLon);
    const newX = pos.x * TRACK_SCALE - trackOffset.x;
    const newZ = pos.z * TRACK_SCALE - trackOffset.z;

    if (Math.abs(newX) > 10000 || Math.abs(newZ) > 10000) {
      targetPosition.set(0, 0.1, 0);
    } else {
      targetPosition.set(newX, 0.1, newZ);
    }

  }
  
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
      const color = getColorMap(value, tireMin, tireMax);

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

  const throttle = parseFloat(row["M400_throttlePosition[%]"]) * 100;
  const brakeF = parseFloat(row["ATCCF_brakePressureF[psi]"]) / 6;
  const brakeR = parseFloat(row["ATCCF_brakePressureR[psi]"]) / 6;
  drawPedalBars(throttle, brakeF, brakeR);
  const speed = parseFloat(row["gps_speed[km/h]"]);
  drawSpeedometer(speed);
}

function getColorMap(temp, min, max) {
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

let direction = 0;
let smoothedDirection = 0;

function normalizeAngleRad(angle) {
  return (angle + Math.PI * 2) % (Math.PI * 2);
}

// Increase smoothing factor (0.05 = smoother but slower)
const ROTATION_SMOOTHING = 1;

function animate() {
  if (!threeJSActive) return;
  
  if (carMovement) {
    const target = normalizeAngleRad(direction);
    const current = normalizeAngleRad(smoothedDirection);
    let angleDiff = target - current;
    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    smoothedDirection += angleDiff * ROTATION_SMOOTHING;
  
    modelGroup.rotation.set(0, -smoothedDirection + Math.PI / 2, 0);
    accGroup.position.lerp(targetPosition, 0.1);
  
    if (cameraLockToAcc) {
      const accCenter = targetPosition.clone().add(new THREE.Vector3(0, 0.1, 0)); // position of the car
      const rotatedOffset = cameraOffsetFromAcc.clone().applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        -smoothedDirection
      );
      camera.position.copy(accCenter.clone().add(rotatedOffset)); // No lerp = fixed offset
      orbit.target.copy(accCenter); // lock target as well
    }
  
  }

  orbit.update();
  renderer.render(scene, camera);
}

function getAccCenterWorldPosition() {
  const centerR = 7;
  const centerC = 2;

  const plane1 = accPlanesArray[centerR][centerC];
  const plane2 = accPlanesArray[centerR + 1][centerC];
  const plane3 = accPlanesArray[centerR][centerC + 1];
  const plane4 = accPlanesArray[centerR + 1][centerC + 1];

  // Get local positions of each plane
  const localCenter = new THREE.Vector3();
  [plane1, plane2, plane3, plane4].forEach(plane => {
    localCenter.add(plane.position);
  });
  localCenter.multiplyScalar(0.25); // average position

  // Apply modelGroup rotation to the local center
  const rotated = localCenter.clone().applyMatrix4(modelGroup.matrixWorld);

  return rotated;
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
    <button id="toggleThreeJSBtn">Pause 3D</button>
    <button id="toggleChassisBtn">Toggle Chassis Transparency</button><br>
    <button id="toggleCarMovementBtn">Disable car movement</button>
    <button id="toggleCameraFollowBtn">Disable Camera Follow</button><br>
    <button id="toggleOverlayBtn">Toggle Earth Overlay</button> 
    <input type="range" min="0" max="1" step="0.01" value="1" id="overlayOpacity"> <br>
    Speed: <input type="range" id="speedSlider" min="1000" max="2000" value="2000" step="100" /><br>
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

  const section3 = createExpandableSection("Tire Data & Pedal Inputs", 'tireSection',`
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
    </div><br>

    <canvas id="pedalInputCanvas" width="250" height="100" style="margin-top:10px;border:1px solid #ccc;"></canvas>
    <canvas id="speedometerCanvas" width="250" height="140" style="margin-top:10px;border:1px solid #ccc;"></canvas>
  `);    

  const section4 = createExpandableSection("Sensor XY Scatter Plot", 'xySection', `
    <label for="xAxisSensor">X-Axis Sensor:</label><br>
    <select id="xAxisSensor" style="width: 100%"></select><br><br>
  
    <label for="yAxisSensor">Y-Axis Sensor:</label><br>
    <select id="yAxisSensor" style="width: 100%"></select><br><br>
  
    <button id="plotXYBtn">Plot XY</button><br><br>
  
    <canvas id="xyChart" width="600" height="300"></canvas>
  `);
  const section5 = createExpandableSection("Custom Graph Builder", 'customGraphSection', `
    <label for="graphType">Chart Type:</label>
    <select id="graphType" style="width: 100%;">
      <option value="timeSeries">Time Series</option>
      <option value="gauge">Gauge</option>
      <option value="barInput">Pedal-style Bar</option>
    </select><br><br>
  
    <label for="customSensors">Select Sensors:</label><br>
    <select id="customSensors" multiple size="10" style="width: 100%"></select><br><br>
  
    <button id="renderCustomGraphBtn">Render Graph</button><br><br>
  
    <div id="customGraphsContainer"></div>
  `); 
  
  controls.innerHTML = ''; // clear anything in it
  controls.appendChild(section1);
  controls.appendChild(section2);
  controls.appendChild(section3);
  controls.appendChild(section4);
  controls.appendChild(section5);  // Custom Graph Builder section

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
  const carMovementButton = document.getElementById("toggleCarMovementBtn");
  const cameraFollowBtn = document.getElementById("toggleCameraFollowBtn");
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
  });

  playPauseBtn.addEventListener("click", togglePlayPause);
  timeSlider.addEventListener("input", e => {
    currentFrame = parseInt(e.target.value);
    updateAccumulatorHeatmap();
  });

  carMovementButton.addEventListener("click", () => {
    carMovement = !carMovement;
    carMovementButton.innerText = carMovement ? "Disable Car Movement" : "Enable Car Movement";
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
  const toggleThreeJSBtn = document.getElementById("toggleThreeJSBtn");
  toggleThreeJSBtn.addEventListener("click", () => {
    threeJSActive = !threeJSActive;
    toggleThreeJSBtn.innerText = threeJSActive ? "Pause 3D" : "Resume 3D";

    if (threeJSActive) {
      renderer.setAnimationLoop(animate);
    } else {
      renderer.setAnimationLoop(null);
    }
  });

  cameraFollowBtn.addEventListener("click", () => {
    cameraLockToAcc = !cameraLockToAcc;
    cameraFollowBtn.innerText = cameraLockToAcc ? "Unlock Camera" : "Lock Camera to Accumulator";
  
    if (cameraLockToAcc) {
      const accCenter = getAccCenterWorldPosition();
      cameraOffsetFromAcc = camera.position.clone().sub(accCenter);
    
      orbit.enabled = false;
      orbit.enablePan = false;
    } else {
      orbit.enabled = true;
      orbit.enablePan = true;
    }
    
  });  
  
  document.getElementById("toggleOverlayBtn").addEventListener("click", () => {
    if (!earthOverlayMesh) return;
    earthOverlayMesh.visible = !earthOverlayMesh.visible;
  
    // Optional: hide ribbon meshes if showing overlay
    scene.traverse(obj => {
      if (obj.userData.trackRibbon) obj.visible = !earthOverlayMesh.visible;
    });
  });  

  document.getElementById("toggleChassisBtn").addEventListener("click", () => {
    if (!chassisMesh) return;
  
    chassisMesh.traverse(child => {
      if (child.isMesh) {
        child.material.transparent = true;
        child.material.opacity = child.material.opacity === 1 ? 0.3 : 1;
        child.material.depthWrite = child.material.opacity === 1; // fix render ordering
      }
    });
  });  

  document.getElementById("overlayOpacity").addEventListener("input", e => {
    if (earthOverlayMesh) {
      earthOverlayMesh.material.opacity = parseFloat(e.target.value);
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
  document.getElementById("renderCustomGraphBtn").addEventListener("click", renderCustomGraph);
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
  if (!currentRow || !currentRow["xtime    [s]"]) return;

  const currentTime = parseFloat(currentRow["xtime    [s]"]);
  const startTime = currentTime - timeWindow;

  const yMin = parseFloat(document.getElementById("yMin").value);
  const yMax = parseFloat(document.getElementById("yMax").value);

  const visibleRows = heatmapData.filter(row => {
    const t = parseFloat(row["xtime    [s]"]);
    return t >= startTime && t <= currentTime;
  });

  timeSeriesChart.data.datasets = Array.from(selectedChartSensors).map(sensorKey => ({
    label: sensorKey,
    borderColor: getPersistentColor(sensorKey),
    data: visibleRows.map(row => ({
      x: parseFloat(row["xtime    [s]"]),
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

function drawPedalBars(throttle, brakeF, brakeR) {
  if ([throttle, brakeF, brakeR].some(v => isNaN(v))) {
    console.warn("Invalid values for pedal inputs", { throttle, brakeF, brakeR });
    return;
  }

  const canvas = document.getElementById("pedalInputCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const labels = ["Throttle", "Brake F", "Brake R"];
  const values = [throttle, brakeF, brakeR];
  const colors = ["green", "red", "darkred"];

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const barWidth = 50;
    const barHeight = val;
    const x = i * 80 + 10;
    const y = canvas.height - barHeight;

    // Bar
    ctx.fillStyle = colors[i];
    ctx.fillRect(x, y, barWidth, barHeight);

    // Value Label
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${val.toFixed(0)}%`, x + barWidth / 2, y - 5);

    // Label
    ctx.fillText(labels[i], x + barWidth / 2, canvas.height - 5);
  }
}

function drawSpeedometer(speed) {
  const canvas = document.getElementById("speedometerCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height - 10;
  const radius = 100;
  const maxSpeed = 100;

  // Arc background
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
  ctx.lineWidth = 15;
  ctx.strokeStyle = "#eee";
  ctx.stroke();

  // Colored arc for current speed
  const angle = Math.PI + (speed / maxSpeed) * Math.PI;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, angle);
  ctx.strokeStyle = "green";
  ctx.stroke();

  // Needle
  const needleLength = radius - 15;
  const needleAngle = Math.PI + (speed / maxSpeed) * Math.PI;
  const needleX = centerX + needleLength * Math.cos(needleAngle);
  const needleY = centerY + needleLength * Math.sin(needleAngle);

  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(needleX, needleY);
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Center hub
  ctx.beginPath();
  ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "black";
  ctx.fill();

  // Speed label
  ctx.fillStyle = "black";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${speed.toFixed(1)} kph`, centerX, 20);
}

let xyChart = null;
let customGraphs = [];


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

function renderCustomGraph() {
  const type = document.getElementById("graphType").value;
  const selected = Array.from(document.getElementById("customSensors").selectedOptions).map(o => o.value);
  if (selected.length === 0 || heatmapData.length === 0) return;

  const graphId = `customGraph-${Date.now()}`;
  const container = document.createElement("div");
  container.style.marginBottom = "15px";
  container.id = graphId;

  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = type === "gauge" ? 150 : 100;
  container.appendChild(canvas);

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Delete";
  removeBtn.addEventListener("click", () => {
    customGraphs = customGraphs.filter(g => g.id !== graphId);
    container.remove();
  });
  container.appendChild(removeBtn);

  document.getElementById("customGraphsContainer").appendChild(container);

  const ctx = canvas.getContext("2d");

  const graph = {
    id: graphId,
    type,
    canvas,
    ctx,
    sensors: selected
  };

  customGraphs.push(graph);
}

function updateCustomGraphs() {
  const timeKey = Object.keys(heatmapData[0]).find(k => k.toLowerCase().includes("time"));
  const row = heatmapData[currentFrame];
  if (!row) return;

  customGraphs.forEach(graph => {
    if (graph.type === "gauge") {
      const value = parseFloat(row[graph.sensors[0]]);
      drawGauge(graph.ctx, value, graph.sensors[0]);
    } else if (graph.type === "barInput") {
      const values = graph.sensors.map(sensor => ({
        label: sensor,
        value: parseFloat(row[sensor])
      }));
      drawCustomBars(graph.ctx, values);
    } if (type === "timeSeries") {
      const timeKey = Object.keys(heatmapData[0]).find(k => k.toLowerCase().includes("time"));
      const datasets = selected.map(sensor => ({
        label: sensor,
        data: heatmapData.map(row => ({
          x: parseFloat(row[timeKey]),
          y: parseFloat(row[sensor])
        })),
        borderColor: getPersistentColor(sensor),
        backgroundColor: getPersistentColor(sensor),
        fill: false,
        tension: 0.4,
        pointRadius: 0
      }));
    
      graph.chart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
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
          plugins: {
            legend: { display: true }
          }
        }
      });
    }        
    
  });
}

function drawGauge(ctx, value, label = "Sensor") {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const centerX = ctx.canvas.width / 2;
  const centerY = ctx.canvas.height - 10;
  const radius = 100;
  const max = 100;

  const angle = Math.PI + (value / max) * Math.PI;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
  ctx.lineWidth = 15;
  ctx.strokeStyle = "#eee";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, Math.PI, angle);
  ctx.strokeStyle = "green";
  ctx.stroke();

  const needleX = centerX + (radius - 10) * Math.cos(angle);
  const needleY = centerY + (radius - 10) * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(needleX, needleY);
  ctx.strokeStyle = "black";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "black";
  ctx.font = "16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${label}: ${value.toFixed(1)}`, centerX, 20);
}

function drawCustomBars(ctx, sensors) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  sensors.forEach((sensor, i) => {
    const val = sensor.value;
    const label = sensor.label;
    const barWidth = 50;
    const barHeight = val;
    const x = i * 80 + 10;
    const y = ctx.canvas.height - barHeight;

    ctx.fillStyle = getPersistentColor(label);
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${val.toFixed(1)}`, x + barWidth / 2, y - 5);
    ctx.fillText(label, x + barWidth / 2, ctx.canvas.height - 5);
  });
}

camera.position.x = 100;
camera.position.z = 100;
camera.position.y = 300;

createPlanes();
load3D(accumulatorModel, 0, 0, 0, carModelScale, carModelScale, carModelScale);
const chassisModelScale = 1150;
load3D(chassisModel, 0, 0, 0, carModelScale * chassisModelScale, carModelScale * chassisModelScale, carModelScale * chassisModelScale);

const cameraRig = new THREE.Group();
scene.add(cameraRig);

cameraRig.add(camera);
camera.position.set(0, 4, 8); // behind and above car
camera.lookAt(0, 0, 0);
orbit.enablePan = false;      // optional: prevent drifting
orbit.enableZoom = true;      // keep this if you want zoom
orbit.enableDamping = true;   // smooth orbiting
orbit.dampingFactor = 0.1;
// Store initial distance vector
//let initialOffset = camera.position.clone().sub(accGroup.position.clone());

orbit.addEventListener('start', () => {
  userIsOrbiting = true;
});
orbit.addEventListener('end', () => {
  userIsOrbiting = false;

  if (!cameraFollowCar) return;

  const accCenter = getAccCenterWorldPosition();
  cameraOffsetFromAcc = camera.position.clone().sub(accCenter);
});

const overlay_scale = 4000
createEarthOverlay('msu_erc.png', overlay_scale, overlay_scale);

// Wait briefly to ensure planes are added before calculating center
setTimeout(() => {
  const center = getAccCenterWorldPosition();
  //orbit.target.copy(center);
  orbit.update();

  // Update the offset vector from this center to the current camera position
  cameraOffsetFromAcc = camera.position.clone().sub(center);
}, 100);

const arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1.5, 0), 2, 0xff0000);
modelGroup.add(arrowHelper);

renderer.setAnimationLoop(() => {
  if (threeJSActive) animate();
});