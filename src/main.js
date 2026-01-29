import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import GUI from "lil-gui";
import { generateWeaveGeometries } from "./weave.js";
import { applyColorMode } from "./colors.js";
import { createGroundGrid } from "./ground.js";
import { applyLightingPreset, LIGHTING_PRESETS } from "./lighting.js";
import { exportOBJ, exportSTL } from "./exporters.js";
import "./style.css";

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0d10");

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(8, 7, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
const container = document.querySelector('#app') || document.body;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const grid = createGroundGrid();
scene.add(grid);

let weaveMesh = null;
let weaveMaterial = null;

const params = {
  threadCountU: 12,
  threadCountV: 12,
  threadRadius: 0.12,
  spacing: 0.6,
  weaveHeight: 0.28,
  twistAmount: 120,
  twistMode: "startToEnd",
  scaleTaper: 0.35,
  scaleMode: "symmetrical",
  weaveAngle: 15,
  resolution: 60,
  colorMode: "twoColor",
  primaryColor: "#f5f5f2",
  secondaryColor: "#ff8f6b",
  gradientStart: "#53e3ff",
  gradientEnd: "#f38bff",
  lightingPreset: "Studio Soft",
  exportSTL: () => exportSTL(weaveMesh, "weave"),
  exportOBJ: () => exportOBJ(weaveMesh, "weave"),
};

function rebuildWeave() {
  if (weaveMesh) {
    weaveMesh.geometry.dispose();
    scene.remove(weaveMesh);
  }

  const strands = generateWeaveGeometries(params);
  applyColorMode(strands, params);

  const merged = mergeGeometries(
    strands.map((strand) => strand.geometry),
    false
  );
  merged.computeVertexNormals();

  if (!weaveMaterial) {
    weaveMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.08,
      roughness: 0.72,
    });
  }

  weaveMesh = new THREE.Mesh(merged, weaveMaterial);
  weaveMesh.castShadow = true;
  weaveMesh.receiveShadow = false;
  scene.add(weaveMesh);
}

function applyLighting() {
  applyLightingPreset(scene, params.lightingPreset);
}

applyLighting();
rebuildWeave();

const gui = new GUI({ title: "Weave Controls" });
const weaveFolder = gui.addFolder("Threads");
weaveFolder.add(params, "threadCountU", 2, 40, 1).onFinishChange(rebuildWeave);
weaveFolder.add(params, "threadCountV", 2, 40, 1).onFinishChange(rebuildWeave);
weaveFolder.add(params, "threadRadius", 0.04, 0.4, 0.01).onFinishChange(rebuildWeave);
weaveFolder.add(params, "spacing", 0.25, 1.5, 0.01).onFinishChange(rebuildWeave);
weaveFolder.add(params, "weaveHeight", 0, 0.8, 0.01).onFinishChange(rebuildWeave);
weaveFolder.add(params, "resolution", 12, 140, 1).onFinishChange(rebuildWeave);

const twistFolder = gui.addFolder("Twist + Taper");
twistFolder.add(params, "twistAmount", -360, 360, 1).onFinishChange(rebuildWeave);
twistFolder
  .add(params, "twistMode", ["startToEnd", "symmetrical"])
  .onFinishChange(rebuildWeave);
twistFolder.add(params, "scaleTaper", 0, 0.9, 0.01).onFinishChange(rebuildWeave);
twistFolder
  .add(params, "scaleMode", ["symmetrical", "startToEnd"])
  .onFinishChange(rebuildWeave);

const layoutFolder = gui.addFolder("Layout");
layoutFolder.add(params, "weaveAngle", -180, 180, 1).onFinishChange(rebuildWeave);

const colorFolder = gui.addFolder("Color");
colorFolder
  .add(params, "colorMode", [
    "single",
    "twoColor",
    "heightGradient",
    "strandGradient",
  ])
  .onFinishChange(rebuildWeave);
colorFolder.addColor(params, "primaryColor").onFinishChange(rebuildWeave);
colorFolder.addColor(params, "secondaryColor").onFinishChange(rebuildWeave);
colorFolder.addColor(params, "gradientStart").onFinishChange(rebuildWeave);
colorFolder.addColor(params, "gradientEnd").onFinishChange(rebuildWeave);

const lightingFolder = gui.addFolder("Lighting");
lightingFolder
  .add(params, "lightingPreset", LIGHTING_PRESETS)
  .onChange(applyLighting);

const exportFolder = gui.addFolder("Export");
exportFolder.add(params, "exportSTL");
exportFolder.add(params, "exportOBJ");

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

