import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import GUI from "lil-gui";
import "./style.css";

const app = document.querySelector("#app");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0f1418, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
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

const hemiLight = new THREE.HemisphereLight(0x9ec5ff, 0x202026, 0.9);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
keyLight.position.set(10, 16, 8);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffe7c4, 0.6);
fillLight.position.set(-12, 6, 4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
rimLight.position.set(0, 8, -12);
scene.add(rimLight);

const params = {
  backgroundColor: "#0f1418",
  floorCount: 40,
  floorHeight: 0.25,
  towerHeight: 20,
  slabSize: 4,
  slabDepth: 0.5,
  slabShape: "box",
  segments: 32,
  polygonSides: 6,
  polygonIrregularity: 0.2,
  starPoints: 5,
  starInnerRadius: 0.25,
  roundRadius: 0.08,
  roundSegments: 4,
  cylinderSegments: 32,
  circleSegments: 48,
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
  color: 0xffffff,
});

let towerMesh = null;

function createSlabGeometry() {
  if (params.slabShape === "cylinder") {
    const segments = Math.max(6, Math.floor(params.segments));
    return new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1);
  }
  if (params.slabShape === "circle") {
    const segments = Math.max(8, Math.floor(params.segments));
    return new THREE.CylinderGeometry(0.5, 0.5, 1, segments, 1);
  }
  if (params.slabShape === "polygon") {
    const sides = Math.max(3, Math.floor(params.segments));
    const irregularity = THREE.MathUtils.clamp(params.polygonIrregularity, 0, 0.6);
    const shape = new THREE.Shape();
    for (let i = 0; i <= sides; i += 1) {
      const t = i / sides;
      const angle = t * Math.PI * 2;
      const jitter = irregularity === 0 ? 1 : 1 - irregularity + Math.random() * irregularity * 2;
      const radius = 0.5 * jitter;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: false,
      steps: 1,
    });
    geometry.center();
    return geometry;
  }
  if (params.slabShape === "star") {
    const points = Math.max(3, Math.floor(params.starPoints));
    const inner = THREE.MathUtils.clamp(params.starInnerRadius, 0.05, 0.49);
    const shape = new THREE.Shape();
    const total = points * 2;
    for (let i = 0; i <= total; i += 1) {
      const t = i / total;
      const angle = t * Math.PI * 2;
      const radius = i % 2 === 0 ? 0.5 : inner;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: false,
      steps: 1,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.center();
    return geometry;
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
}

const tempObj = new THREE.Object3D();
const colorBottom = new THREE.Color();
const colorTop = new THREE.Color();

function rebuildTower() {
  const count = Math.max(1, Math.floor(params.floorCount));
  updateSlabGeometry();

  const height = Math.max(1, params.towerHeight);
  const spacing = height / count;
  const slabY = -height / 2;
  const twistCurveFn = curveFns[params.twistCurve] || curveFns.linear;
  const scaleCurveFn = curveFns[params.scaleCurve] || curveFns.linear;

  colorBottom.set(params.bottomColor);
  colorTop.set(params.topColor);

  const geometries = [];

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

    const slab = slabGeometry.clone();
    slab.applyMatrix4(tempObj.matrix);

    const position = slab.attributes.position;
    const colors = new Float32Array(position.count * 3);
    for (let v = 0; v < position.count; v += 1) {
      const y = position.getY(v);
      const ty = THREE.MathUtils.clamp((y - slabY) / height, 0, 1);
      const color = colorBottom.clone().lerp(colorTop, ty);
      colors[v * 3] = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
    slab.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometries.push(slab);
  }

  const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
  merged.computeVertexNormals();
  geometries.forEach((geom) => geom.dispose());

  if (!towerMesh) {
    towerMesh = new THREE.Mesh(merged, slabMaterial);
    scene.add(towerMesh);
  } else {
    towerMesh.geometry.dispose();
    towerMesh.geometry = merged;
  }
}

function exportObj() {
  if (!towerMesh) return;
  towerMesh.updateMatrixWorld(true);

  const geometry = towerMesh.geometry.clone();
  geometry.applyMatrix4(towerMesh.matrixWorld);

  const position = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  const normal = geometry.getAttribute("normal");
  const index = geometry.index;

  let obj = "o TwistedTower\n";

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (color) {
      const r = color.getX(i);
      const g = color.getY(i);
      const b = color.getZ(i);
      obj += `v ${x} ${y} ${z} ${r} ${g} ${b}\n`;
    } else {
      obj += `v ${x} ${y} ${z}\n`;
    }
  }

  if (normal) {
    for (let i = 0; i < normal.count; i += 1) {
      const x = normal.getX(i);
      const y = normal.getY(i);
      const z = normal.getZ(i);
      obj += `vn ${x} ${y} ${z}\n`;
    }
  }

  const faceLine = (a, b, c) => {
    if (normal) {
      const na = a + 1;
      const nb = b + 1;
      const nc = c + 1;
      return `f ${a + 1}//${na} ${b + 1}//${nb} ${c + 1}//${nc}\n`;
    }
    return `f ${a + 1} ${b + 1} ${c + 1}\n`;
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      obj += faceLine(a, b, c);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      obj += faceLine(i, i + 1, i + 2);
    }
  }

  geometry.dispose();

  const blob = new Blob([obj], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "twisted-tower.obj";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

rebuildTower();

const gui = new GUI({ width: 280, title: "Twisted Tower" });
gui.addColor(params, "backgroundColor")
  .name("Background")
  .onChange((value) => {
    renderer.setClearColor(value, 1);
    scene.background = new THREE.Color(value);
  });
gui.add(params, "floorCount", 1, 120, 1).name("Floors").onChange(rebuildTower);
gui.add(params, "towerHeight", 5, 80, 0.5).name("Total Height").onChange(rebuildTower);
gui.add(params, "floorHeight", 0.1, 1, 0.05).name("Slab Height").onChange(rebuildTower);
gui.add(params, "slabSize", 1, 8, 0.1).name("Slab Width").onChange(rebuildTower);
gui.add(params, "slabDepth", 0.2, 6, 0.1).name("Slab Depth").onChange(rebuildTower);
gui.add(params, "slabShape", ["box", "rounded", "circle", "cylinder", "polygon", "star"])
  .name("Slab Shape")
  .onChange(rebuildTower);
gui.add(params, "segments", 3, 96, 1).name("Segments").onChange(rebuildTower);
gui.add(params, "polygonSides", 3, 12, 1).name("Polygon Sides").onChange(rebuildTower);
gui.add(params, "polygonIrregularity", 0, 0.6, 0.01)
  .name("Irregularity")
  .onChange(rebuildTower);
gui.add(params, "starPoints", 3, 12, 1).name("Star Points").onChange(rebuildTower);
gui.add(params, "starInnerRadius", 0.05, 0.49, 0.01).name("Star Inner").onChange(rebuildTower);
gui.add(params, "roundRadius", 0, 0.45, 0.01).name("Round Radius").onChange(rebuildTower);
gui.add(params, "roundSegments", 1, 12, 1).name("Round Segs").onChange(rebuildTower);
gui.add(params, "cylinderSegments", 6, 64, 1).name("Cylinder Segs").onChange(rebuildTower);
gui.add(params, "circleSegments", 8, 96, 1).name("Circle Segs").onChange(rebuildTower);

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

const exportFolder = gui.addFolder("Export");
exportFolder.add({ obj: exportObj }, "obj").name("OBJ");

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
