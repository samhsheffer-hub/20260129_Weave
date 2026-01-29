import * as THREE from "three";
import noUiSlider from "nouislider";
import "nouislider/dist/nouislider.css";
import "./style.css";

const app = document.querySelector("#app");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xffffff, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 10);
camera.position.set(0, 0, 4);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(1.5, 2, 3);
scene.add(dirLight);

const params = {
  rows: 4,
  cols: 4,
  size: 1.0,
  cornerRadius: 0.12,
  waveAmp: 0.06,
  waveFreq: 2.6,
  tabDepth: 0.1,
  tabWidth: 0.35,
  groutGap: 0.03,
  seed: 7,
  depth: 0.08,
  twistMin: -8,
  twistMax: 8,
  scaleMin: 0.92,
  scaleMax: 1.05,
  tileColor: "#d8d8d8",
  groutColor: "#ffffff",
};

const tileMaterial = new THREE.MeshStandardMaterial({
  color: new THREE.Color(params.tileColor),
  roughness: 0.9,
  metalness: 0.0,
  side: THREE.DoubleSide,
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hashSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return Math.floor(seed);
  const str = String(seed ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createEdgeProfile({ length, waveAmp, waveFreq, tabDepth, tabWidth, seed, polarity }) {
  const rng = mulberry32(hashSeed(seed));
  const phase = rng() * Math.PI * 2;
  const noisePhaseA = rng() * Math.PI * 2;
  const noisePhaseB = rng() * Math.PI * 2;
  const noiseFreqA = 0.8 + rng() * 1.6;
  const noiseFreqB = 1.4 + rng() * 2.2;
  const count = Math.max(10, Math.round(waveFreq * 8));
  const points = [];

  const start = 0.5 - tabWidth * 0.5;
  const end = 0.5 + tabWidth * 0.5;

  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const envelope = Math.pow(Math.sin(Math.PI * t), 2);
    const wave = waveAmp * Math.sin(2 * Math.PI * waveFreq * t + phase) * envelope;

    let tab = 0;
    if (polarity !== 0 && tabWidth > 0) {
      const local = clamp((t - start) / (end - start), 0, 1);
      tab = polarity * tabDepth * Math.pow(Math.sin(Math.PI * local), 2);
    }

    const noise =
      waveAmp *
      0.12 *
      envelope *
      (Math.sin(2 * Math.PI * noiseFreqA * t + noisePhaseA) * 0.6 +
        Math.sin(2 * Math.PI * noiseFreqB * t + noisePhaseB) * 0.3);

    const offset = wave + tab + noise;
    points.push(new THREE.Vector2(t * length, offset));
  }

  return { length, points, polarity };
}

function mirrorProfile(profile) {
  const reversed = profile.points
    .slice()
    .reverse()
    .map((point) => new THREE.Vector2(profile.length - point.x, -point.y));
  return { length: profile.length, points: reversed, polarity: -profile.polarity };
}

function mapEdgePoint(point, side, size, cornerRadius) {
  const half = size * 0.5;
  const edgeLen = size - cornerRadius * 2;
  const u = point.x;
  const v = point.y;

  switch (side) {
    case "top":
      return new THREE.Vector2(-edgeLen * 0.5 + u, half + v);
    case "right":
      return new THREE.Vector2(half + v, edgeLen * 0.5 - u);
    case "bottom":
      return new THREE.Vector2(edgeLen * 0.5 - u, -half + v);
    case "left":
      return new THREE.Vector2(-half + v, -edgeLen * 0.5 + u);
    default:
      return new THREE.Vector2();
  }
}

function arcPoints(cx, cy, radius, startAngle, endAngle, segments) {
  const points = [];
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const angle = startAngle + (endAngle - startAngle) * t;
    points.push(new THREE.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
  }
  return points;
}

function edgeCurvePoints(profile, side, size, cornerRadius, samples = 48) {
  const curve = new THREE.CatmullRomCurve2(profile.points, false, "centripetal");
  return curve.getPoints(samples).map((p) => mapEdgePoint(p, side, size, cornerRadius));
}

function resolveEdgeProfile(edge, length, params, seedOffset) {
  if (edge && edge.points) return edge;
  const polarity = Number(edge || 0);
  return createEdgeProfile({
    length,
    waveAmp: params.waveAmp,
    waveFreq: params.waveFreq,
    tabDepth: params.tabDepth,
    tabWidth: params.tabWidth,
    seed: hashSeed(params.seed) + seedOffset,
    polarity,
  });
}

export function makeTileShape({
  size = 1,
  cornerRadius = 0.12,
  waveAmp = 0.06,
  waveFreq = 2.5,
  tabDepth = 0.1,
  tabWidth = 0.35,
  seed = 1,
  groutGap = 0,
  edges = { top: 0, right: 0, bottom: 0, left: 0 },
} = {}) {
  const localParams = { size, cornerRadius, waveAmp, waveFreq, tabDepth, tabWidth, seed };
  const edgeLen = size - cornerRadius * 2;

  const topProfile = resolveEdgeProfile(edges.top, edgeLen, localParams, 11);
  const rightProfile = resolveEdgeProfile(edges.right, edgeLen, localParams, 23);
  const bottomProfile = resolveEdgeProfile(edges.bottom, edgeLen, localParams, 37);
  const leftProfile = resolveEdgeProfile(edges.left, edgeLen, localParams, 41);

  const points = [];
  const half = size * 0.5;
  const r = cornerRadius;

  points.push(...edgeCurvePoints(topProfile, "top", size, r));
  points.push(...arcPoints(half - r, half - r, r, Math.PI / 2, 0, 8));
  points.push(...edgeCurvePoints(rightProfile, "right", size, r));
  points.push(...arcPoints(half - r, -half + r, r, 0, -Math.PI / 2, 8));
  points.push(...edgeCurvePoints(bottomProfile, "bottom", size, r));
  points.push(...arcPoints(-half + r, -half + r, r, -Math.PI / 2, -Math.PI, 8));
  points.push(...edgeCurvePoints(leftProfile, "left", size, r));
  points.push(...arcPoints(-half + r, half - r, r, Math.PI, Math.PI / 2, 8));

  if (groutGap > 0) {
    const scale = (size - groutGap * 2) / size;
    points.forEach((p) => {
      p.x *= scale;
      p.y *= scale;
    });
  }

  return new THREE.Shape(points);
}

export function generateTiledLayout(rows, cols, tileParams = {}) {
  const layout = [];
  const baseSeed = hashSeed(tileParams.seed ?? 1);

  for (let r = 0; r < rows; r += 1) {
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      const tileSeed = baseSeed + r * 1000 + c * 97;
      const rng = mulberry32(tileSeed);
      const edgeLen = tileParams.size - tileParams.cornerRadius * 2;

      const edges = {};

      if (r === 0) {
        edges.top = createEdgeProfile({
          length: edgeLen,
          waveAmp: tileParams.waveAmp,
          waveFreq: tileParams.waveFreq,
          tabDepth: tileParams.tabDepth,
          tabWidth: tileParams.tabWidth,
          seed: tileSeed + 1,
          polarity: 0,
        });
      } else {
        edges.top = mirrorProfile(layout[r - 1][c].edges.bottom);
      }

      if (c === 0) {
        edges.left = createEdgeProfile({
          length: edgeLen,
          waveAmp: tileParams.waveAmp,
          waveFreq: tileParams.waveFreq,
          tabDepth: tileParams.tabDepth,
          tabWidth: tileParams.tabWidth,
          seed: tileSeed + 2,
          polarity: 0,
        });
      } else {
        edges.left = mirrorProfile(row[c - 1].edges.right);
      }

      if (c === cols - 1) {
        edges.right = createEdgeProfile({
          length: edgeLen,
          waveAmp: tileParams.waveAmp,
          waveFreq: tileParams.waveFreq,
          tabDepth: tileParams.tabDepth,
          tabWidth: tileParams.tabWidth,
          seed: tileSeed + 3,
          polarity: 0,
        });
      } else {
        const polarity = rng() > 0.5 ? 1 : -1;
        edges.right = createEdgeProfile({
          length: edgeLen,
          waveAmp: tileParams.waveAmp,
          waveFreq: tileParams.waveFreq,
          tabDepth: tileParams.tabDepth,
          tabWidth: tileParams.tabWidth,
          seed: tileSeed + 3,
          polarity,
        });
      }

      if (r === rows - 1) {
        edges.bottom = createEdgeProfile({
          length: edgeLen,
          waveAmp: tileParams.waveAmp,
          waveFreq: tileParams.waveFreq,
          tabDepth: tileParams.tabDepth,
          tabWidth: tileParams.tabWidth,
          seed: tileSeed + 4,
          polarity: 0,
        });
      } else {
        const polarity = rng() > 0.5 ? 1 : -1;
        edges.bottom = createEdgeProfile({
          length: edgeLen,
          waveAmp: tileParams.waveAmp,
          waveFreq: tileParams.waveFreq,
          tabDepth: tileParams.tabDepth,
          tabWidth: tileParams.tabWidth,
          seed: tileSeed + 4,
          polarity,
        });
      }

      const shape = makeTileShape({
        ...tileParams,
        edges: {
          top: edges.top,
          right: edges.right,
          bottom: edges.bottom,
          left: edges.left,
        },
      });

      row.push({ shape, edges });
    }
    layout.push(row);
  }

  return layout;
}

let tileGroup = null;

function disposeGroup(group) {
  group.traverse((child) => {
    if (child.isMesh && child.geometry) {
      child.geometry.dispose();
    }
  });
}

function updateGrout() {
  scene.background = new THREE.Color(params.groutColor);
  renderer.setClearColor(params.groutColor, 1);
}

function buildTiles() {
  if (tileGroup) {
    scene.remove(tileGroup);
    disposeGroup(tileGroup);
  }

  const rows = params.rows;
  const cols = params.cols;
  const layout = generateTiledLayout(rows, cols, params);
  tileGroup = new THREE.Group();

  layout.forEach((row, r) => {
    row.forEach((tile, c) => {
      const geometry = new THREE.ExtrudeGeometry(tile.shape, {
        depth: params.depth,
        bevelEnabled: false,
        steps: 1,
      });
      geometry.center();
      const mesh = new THREE.Mesh(geometry, tileMaterial);

      const rowT = rows === 1 ? 0.5 : r / (rows - 1);
      const colT = cols === 1 ? 0.5 : c / (cols - 1);
      const gradientT = (rowT + colT) * 0.5;

      const scale = lerp(params.scaleMin, params.scaleMax, gradientT);
      const twist = lerp(params.twistMin, params.twistMax, gradientT) * (Math.PI / 180);

      mesh.position.x = (c - (cols - 1) / 2) * params.size;
      mesh.position.y = ((rows - 1) / 2 - r) * params.size;
      mesh.position.z = -params.depth * 0.5;
      mesh.rotation.z = twist;
      mesh.scale.setScalar(scale);

      tileGroup.add(mesh);
    });
  });

  scene.add(tileGroup);
  resize();
}

function resize() {
  const { innerWidth, innerHeight } = window;
  renderer.setSize(innerWidth, innerHeight);
  const aspect = innerWidth / innerHeight;
  const span = Math.max(params.cols, params.rows) * params.size * 0.7;
  camera.left = -span * aspect;
  camera.right = span * aspect;
  camera.top = span;
  camera.bottom = -span;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);

function createControlPanel() {
  const panel = document.createElement("div");
  panel.className = "control-panel";

  const title = document.createElement("div");
  title.className = "control-title";
  title.textContent = "Tile Controls";
  panel.appendChild(title);

  const section = document.createElement("div");
  section.className = "control-section";
  panel.appendChild(section);

  function addRow(labelText) {
    const row = document.createElement("div");
    row.className = "control-row";
    const label = document.createElement("span");
    label.className = "control-label";
    label.textContent = labelText;
    row.appendChild(label);
    section.appendChild(row);
    return row;
  }

  function addRangeControl({ label, min, max, step, value, onChange, format }) {
    const row = addRow(label);
    const input = document.createElement("input");
    input.type = "range";
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    const output = document.createElement("span");
    output.className = "control-value";
    const formatValue = format || ((val) => String(val));
    output.textContent = formatValue(Number(value));

    input.addEventListener("input", () => {
      const next = Number(input.value);
      output.textContent = formatValue(next);
      onChange(next);
    });

    row.appendChild(input);
    row.appendChild(output);
    return input;
  }

  function addColorControl({ label, value, onChange }) {
    const row = addRow(label);
    const input = document.createElement("input");
    input.type = "color";
    input.value = value;
    input.addEventListener("input", () => {
      onChange(input.value);
    });
    row.appendChild(input);
    return input;
  }

  function addDualSlider({ label, min, max, step, values, onChange, format }) {
    const row = addRow(label);
    const slider = document.createElement("div");
    slider.className = "range-slider";
    const output = document.createElement("span");
    output.className = "control-value";
    const formatValue = format || ((val) => String(val));

    noUiSlider.create(slider, {
      start: values,
      connect: true,
      step,
      range: { min, max },
    });

    slider.noUiSlider.on("update", (vals) => {
      const low = Number(vals[0]);
      const high = Number(vals[1]);
      output.textContent = `${formatValue(low)} - ${formatValue(high)}`;
    });

    slider.noUiSlider.on("change", (vals) => {
      const low = Number(vals[0]);
      const high = Number(vals[1]);
      onChange(low, high);
    });

    row.appendChild(slider);
    row.appendChild(output);
    return slider;
  }

  addRangeControl({
    label: "Rows",
    min: 1,
    max: 10,
    step: 1,
    value: params.rows,
    format: (val) => String(Math.round(val)),
    onChange: (val) => {
      params.rows = Math.max(1, Math.round(val));
      buildTiles();
    },
  });

  addRangeControl({
    label: "Cols",
    min: 1,
    max: 10,
    step: 1,
    value: params.cols,
    format: (val) => String(Math.round(val)),
    onChange: (val) => {
      params.cols = Math.max(1, Math.round(val));
      buildTiles();
    },
  });

  addRangeControl({
    label: "Tile Size",
    min: 0.6,
    max: 1.5,
    step: 0.02,
    value: params.size,
    format: (val) => val.toFixed(2),
    onChange: (val) => {
      params.size = val;
      buildTiles();
    },
  });

  addRangeControl({
    label: "Corner Radius",
    min: 0.02,
    max: 0.3,
    step: 0.01,
    value: params.cornerRadius,
    format: (val) => val.toFixed(2),
    onChange: (val) => {
      params.cornerRadius = val;
      buildTiles();
    },
  });

  addRangeControl({
    label: "Wave Amp",
    min: 0,
    max: 0.16,
    step: 0.005,
    value: params.waveAmp,
    format: (val) => val.toFixed(3),
    onChange: (val) => {
      params.waveAmp = val;
      buildTiles();
    },
  });

  addRangeControl({
    label: "Wave Freq",
    min: 1,
    max: 4,
    step: 0.1,
    value: params.waveFreq,
    format: (val) => val.toFixed(1),
    onChange: (val) => {
      params.waveFreq = val;
      buildTiles();
    },
  });

  addRangeControl({
    label: "Tab Depth",
    min: 0,
    max: 0.2,
    step: 0.005,
    value: params.tabDepth,
    format: (val) => val.toFixed(3),
    onChange: (val) => {
      params.tabDepth = val;
      buildTiles();
    },
  });

  addRangeControl({
    label: "Tab Width",
    min: 0.15,
    max: 0.7,
    step: 0.01,
    value: params.tabWidth,
    format: (val) => val.toFixed(2),
    onChange: (val) => {
      params.tabWidth = val;
      buildTiles();
    },
  });

  addRangeControl({
    label: "Grout Gap",
    min: 0,
    max: 0.1,
    step: 0.002,
    value: params.groutGap,
    format: (val) => val.toFixed(3),
    onChange: (val) => {
      params.groutGap = val;
      buildTiles();
    },
  });

  addRangeControl({
    label: "Height",
    min: 0.02,
    max: 0.2,
    step: 0.005,
    value: params.depth,
    format: (val) => val.toFixed(3),
    onChange: (val) => {
      params.depth = val;
      buildTiles();
    },
  });

  addRangeControl({
    label: "Seed",
    min: 0,
    max: 200,
    step: 1,
    value: params.seed,
    format: (val) => String(Math.round(val)),
    onChange: (val) => {
      params.seed = Math.round(val);
      buildTiles();
    },
  });

  addDualSlider({
    label: "Twist (deg)",
    min: -25,
    max: 25,
    step: 0.5,
    values: [params.twistMin, params.twistMax],
    format: (val) => val.toFixed(1),
    onChange: (low, high) => {
      params.twistMin = Math.min(low, high);
      params.twistMax = Math.max(low, high);
      buildTiles();
    },
  });

  addDualSlider({
    label: "Scale",
    min: 0.7,
    max: 1.3,
    step: 0.01,
    values: [params.scaleMin, params.scaleMax],
    format: (val) => val.toFixed(2),
    onChange: (low, high) => {
      params.scaleMin = Math.min(low, high);
      params.scaleMax = Math.max(low, high);
      buildTiles();
    },
  });

  addColorControl({
    label: "Tile Color",
    value: params.tileColor,
    onChange: (val) => {
      params.tileColor = val;
      tileMaterial.color.set(val);
    },
  });

  addColorControl({
    label: "Grout Color",
    value: params.groutColor,
    onChange: (val) => {
      params.groutColor = val;
      updateGrout();
    },
  });

  document.body.appendChild(panel);
}

updateGrout();
buildTiles();
resize();
createControlPanel();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();
