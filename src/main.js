import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import GUI from "lil-gui";
import "./style.css";

const app = document.querySelector("#app");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0f1418, 1);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(10, 10, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(10, 16, 8);
scene.add(keyLight);

const params = {
  floorCount: 40,
  floorHeight: 0.25,
  towerHeight: 20,
  slabSize: 4,
  slabDepth: 0.5,
  slabShape: "box",
  roundRadius: 0.08,
  roundSegments: 4,
  cylinderSegments: 32,
  twistMin: 0,
  twistMax: 180,
  scaleMin: 1,
  scaleMax: 0.5,
  twistCurve: "linear",
  scaleCurve: "easeInOut",
  bottomColor: "#f2a365",
  topColor: "#4dd0e1",
};

const curveFns = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

let slabGeometry = null;
const slabMaterial = new THREE.MeshStandardMaterial({
  metalness: 0.1,
  roughness: 0.5,
  vertexColors: true,
});

let slabs = null;

function createSlabGeometry() {
  if (params.slabShape === "cylinder") {
    const segments = Math.max(6, Math.floor(params.cylinderSegments));
    return new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1);
  }
  if (params.slabShape === "rounded") {
    const radius = Math.min(0.45, Math.max(0, params.roundRadius));
    const segments = Math.max(1, Math.floor(params.roundSegments));
    return new RoundedBoxGeometry(1, 1, 1, segments, radius);
  }
  return new THREE.BoxGeometry(1, 1, 1);
}

function updateSlabGeometry() {
  const newGeometry = createSlabGeometry();
  if (slabGeometry) {
    slabGeometry.dispose();
  }
  slabGeometry = newGeometry;
  if (slabs) {
    slabs.geometry = slabGeometry;
  }
}

function ensureSlabs(count) {
  if (!slabGeometry) {
    updateSlabGeometry();
  }
  if (slabs && slabs.count === count) return;
  if (slabs) {
    slabs.material.dispose();
    scene.remove(slabs);
  }
  slabs = new THREE.InstancedMesh(slabGeometry, slabMaterial, count);
  slabs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  slabs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  scene.add(slabs);
}

const tempObj = new THREE.Object3D();
const colorBottom = new THREE.Color();
const colorTop = new THREE.Color();

function rebuildTower() {
  const count = Math.max(1, Math.floor(params.floorCount));
  updateSlabGeometry();
  ensureSlabs(count);

  const height = Math.max(1, params.towerHeight);
  const spacing = height / count;
  const slabY = -height / 2;
  const twistCurveFn = curveFns[params.twistCurve] || curveFns.linear;
  const scaleCurveFn = curveFns[params.scaleCurve] || curveFns.linear;

  colorBottom.set(params.bottomColor);
  colorTop.set(params.topColor);

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const twistT = twistCurveFn(t);
    const scaleT = scaleCurveFn(t);
    const twist = THREE.MathUtils.degToRad(
      THREE.MathUtils.lerp(params.twistMin, params.twistMax, twistT)
    );
    const scale = THREE.MathUtils.lerp(params.scaleMin, params.scaleMax, scaleT);

    tempObj.position.set(0, slabY + i * spacing, 0);
    tempObj.rotation.set(0, twist, 0);
    tempObj.scale.set(params.slabSize * scale, params.floorHeight, params.slabDepth * scale);
    tempObj.updateMatrix();
    slabs.setMatrixAt(i, tempObj.matrix);

    const color = colorBottom.clone().lerp(colorTop, t);
    slabs.setColorAt(i, color);
  }

  slabs.instanceMatrix.needsUpdate = true;
  slabs.instanceColor.needsUpdate = true;
}

rebuildTower();

const gui = new GUI({ width: 280, title: "Twisted Tower" });
gui.add(params, "floorCount", 1, 120, 1).name("Floors").onChange(rebuildTower);
gui.add(params, "towerHeight", 5, 80, 0.5).name("Total Height").onChange(rebuildTower);
gui.add(params, "floorHeight", 0.1, 1, 0.05).name("Slab Height").onChange(rebuildTower);
gui.add(params, "slabSize", 1, 8, 0.1).name("Slab Width").onChange(rebuildTower);
gui.add(params, "slabDepth", 0.2, 6, 0.1).name("Slab Depth").onChange(rebuildTower);
gui.add(params, "slabShape", ["box", "rounded", "cylinder"]).name("Slab Shape").onChange(rebuildTower);
gui.add(params, "roundRadius", 0, 0.45, 0.01).name("Round Radius").onChange(rebuildTower);
gui.add(params, "roundSegments", 1, 12, 1).name("Round Segs").onChange(rebuildTower);
gui.add(params, "cylinderSegments", 6, 64, 1).name("Cylinder Segs").onChange(rebuildTower);

const twistFolder = gui.addFolder("Twist Gradient");
twistFolder.add(params, "twistMin", -720, 720, 1).name("Min (deg)").onChange(rebuildTower);
twistFolder.add(params, "twistMax", -720, 720, 1).name("Max (deg)").onChange(rebuildTower);
twistFolder.add(params, "twistCurve", Object.keys(curveFns)).name("Curve").onChange(rebuildTower);

const scaleFolder = gui.addFolder("Scale Gradient");
scaleFolder.add(params, "scaleMin", 0.2, 2, 0.01).name("Min").onChange(rebuildTower);
scaleFolder.add(params, "scaleMax", 0.2, 2, 0.01).name("Max").onChange(rebuildTower);
scaleFolder.add(params, "scaleCurve", Object.keys(curveFns)).name("Curve").onChange(rebuildTower);

const colorFolder = gui.addFolder("Color Gradient");
colorFolder.addColor(params, "bottomColor").name("Bottom").onChange(rebuildTower);
colorFolder.addColor(params, "topColor").name("Top").onChange(rebuildTower);

const uiPanel = document.createElement("div");
uiPanel.className = "ui-panel";
uiPanel.innerHTML = "<strong>Tip:</strong> drag to orbit, scroll to zoom.";
app.appendChild(uiPanel);

function onResize() {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
