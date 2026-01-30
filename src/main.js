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

const STORAGE_KEY = "weaveBackground";
const storedBackground =
  typeof window !== "undefined"
    ? window.localStorage.getItem(STORAGE_KEY)
    : null;
const initialBackground = storedBackground || "#0b0d10";

const scene = new THREE.Scene();
scene.background = new THREE.Color(initialBackground);

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
const container = document.querySelector("#app") || document.body;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const grid = createGroundGrid({ baseColor: initialBackground });
scene.add(grid);

let weaveMesh = null;
let weaveMaterial = null;

const params = {
  threadCountU: 12,
  threadCountV: 12,
  warpShape: "tube",
  weftShape: "tube",
  warpWidth: 0.24,
  warpHeight: 0.24,
  weftWidth: 0.24,
  weftHeight: 0.24,
  warpWall: 0.03,
  weftWall: 0.03,
  radiusStart: 0.1,
  radiusMid: 0.12,
  radiusEnd: 0.1,
  profileCurve: "ease",
  spacing: 0.6,
  weaveHeight: 0.28,
  heightLevels: 3,
  contactOffset: 0.06,
  contactSmoothness: 0.2,
  collisionPadding: 0,
  stiffness: 0.7,
  bendResistance: 0.6,
  relaxIterations: 18,
  twistAmount: 120,
  twistProfile: "ease",
  twistNoise: 6,
  twistCustom0: 0,
  twistCustom1: 0.5,
  twistCustom2: 0.5,
  twistCustom3: 0,
  weaveAngle: 15,
  resolution: 80,
  colorMode: "twoColor",
  primaryColor: "#f5f5f2",
  secondaryColor: "#ff8f6b",
  gradientStart: "#53e3ff",
  gradientEnd: "#f38bff",
  lightingPreset: "Studio Soft",
  backgroundColor: initialBackground,
  exportSTL: () => exportSTL(weaveMesh, "weave"),
  exportOBJ: () => exportOBJ(weaveMesh, "weave"),
};

function applyBackground(color) {
  const next = new THREE.Color(color);
  scene.background = next;
  if (grid.material?.uniforms?.baseColor) {
    grid.material.uniforms.baseColor.value.set(next);
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, color);
  }
}

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
  if (!merged) {
    console.error("Merge failed - check geometry attributes");
    return;
  }
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
applyBackground(params.backgroundColor);
rebuildWeave();

const gui = new GUI({ title: "Weave Controls" });
const weaveFolder = gui.addFolder("Threads");
weaveFolder.add(params, "threadCountU", 2, 40, 1).onFinishChange(rebuildWeave);
weaveFolder.add(params, "threadCountV", 2, 40, 1).onFinishChange(rebuildWeave);
weaveFolder.add(params, "spacing", 0.25, 1.5, 0.01).onFinishChange(rebuildWeave);
weaveFolder.add(params, "weaveHeight", 0, 0.8, 0.01).onFinishChange(rebuildWeave);
weaveFolder.add(params, "resolution", 12, 140, 1).onFinishChange(rebuildWeave);

const shapeFolder = gui.addFolder("Shape");
shapeFolder
  .add(params, "warpShape", ["tube", "pipe", "square", "rect"])
  .onFinishChange(rebuildWeave);
shapeFolder
  .add(params, "weftShape", ["tube", "pipe", "square", "rect"])
  .onFinishChange(rebuildWeave);
shapeFolder.add(params, "warpWidth", 0.05, 1.0, 0.01).onFinishChange(rebuildWeave);
shapeFolder.add(params, "warpHeight", 0.05, 1.0, 0.01).onFinishChange(rebuildWeave);
shapeFolder.add(params, "weftWidth", 0.05, 1.0, 0.01).onFinishChange(rebuildWeave);
shapeFolder.add(params, "weftHeight", 0.05, 1.0, 0.01).onFinishChange(rebuildWeave);
shapeFolder.add(params, "warpWall", 0.005, 0.2, 0.005).onFinishChange(rebuildWeave);
shapeFolder.add(params, "weftWall", 0.005, 0.2, 0.005).onFinishChange(rebuildWeave);

const profileFolder = gui.addFolder("Thickness");
profileFolder.add(params, "radiusStart", 0.02, 0.4, 0.01).onFinishChange(rebuildWeave);
profileFolder.add(params, "radiusMid", 0.02, 0.5, 0.01).onFinishChange(rebuildWeave);
profileFolder.add(params, "radiusEnd", 0.02, 0.4, 0.01).onFinishChange(rebuildWeave);
profileFolder
  .add(params, "profileCurve", ["linear", "ease", "sharp"])
  .onFinishChange(rebuildWeave);

const crossingFolder = gui.addFolder("Crossings");
crossingFolder.add(params, "heightLevels", 2, 6, 1).onFinishChange(rebuildWeave);
crossingFolder.add(params, "contactOffset", 0, 0.3, 0.01).onFinishChange(rebuildWeave);
crossingFolder
  .add(params, "contactSmoothness", 0.05, 0.6, 0.01)
  .onFinishChange(rebuildWeave);
crossingFolder
  .add(params, "collisionPadding", 0, 0.3, 0.01)
  .onFinishChange(rebuildWeave);

const relaxFolder = gui.addFolder("Relaxation");
relaxFolder.add(params, "stiffness", 0, 1, 0.01).onFinishChange(rebuildWeave);
relaxFolder
  .add(params, "bendResistance", 0, 1, 0.01)
  .onFinishChange(rebuildWeave);
relaxFolder.add(params, "relaxIterations", 0, 60, 1).onFinishChange(rebuildWeave);

const twistFolder = gui.addFolder("Twist");
twistFolder.add(params, "twistAmount", -360, 360, 1).onFinishChange(rebuildWeave);
twistFolder
  .add(params, "twistProfile", ["linear", "ease", "symmetric", "custom"])
  .onFinishChange(rebuildWeave);
twistFolder.add(params, "twistNoise", 0, 20, 0.5).onFinishChange(rebuildWeave);
const customTwistFolder = twistFolder.addFolder("Custom Graph");
customTwistFolder.add(params, "twistCustom0", 0, 1, 0.01).onFinishChange(rebuildWeave);
customTwistFolder.add(params, "twistCustom1", 0, 1, 0.01).onFinishChange(rebuildWeave);
customTwistFolder.add(params, "twistCustom2", 0, 1, 0.01).onFinishChange(rebuildWeave);
customTwistFolder.add(params, "twistCustom3", 0, 1, 0.01).onFinishChange(rebuildWeave);

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

const backgroundFolder = gui.addFolder("Background");
backgroundFolder.addColor(params, "backgroundColor").onChange((value) => {
  applyBackground(value);
});

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

