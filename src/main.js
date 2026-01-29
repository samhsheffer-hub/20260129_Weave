import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import GUI from "lil-gui";
import "./style.css";

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="app-shell">
    <header class="toolbar">
      <div>
        <div class="title">Lobed Plan + Massing</div>
        <div class="subtitle">Procedural floor plan + 3D extrusion</div>
      </div>
      <div class="toolbar-actions">
        <button class="toolbar-button" id="regenBtn">Regenerate</button>
        <button class="toolbar-button" id="exportSvgBtn">Export SVG</button>
        <button class="toolbar-button" id="exportGlbBtn">Export GLB</button>
      </div>
    </header>
    <main class="split">
      <section class="panel plan-panel">
        <div class="panel-label">2D Plan</div>
        <canvas id="planCanvas"></canvas>
      </section>
      <section class="panel massing-panel">
        <div class="panel-label">3D Massing</div>
        <div class="gui-mount" id="guiMount"></div>
        <div id="threeRoot"></div>
      </section>
    </main>
  </div>
`;

const planCanvas = document.querySelector("#planCanvas");
const planCtx = planCanvas.getContext("2d");
const threeRoot = document.querySelector("#threeRoot");
const guiMount = document.querySelector("#guiMount");

const params = {
  seed: 42,
  baseWidth: 26,
  baseHeight: 18,
  cornerRadius: 5,
  lobeCount: 6,
  lobeMaxRadius: 4.5,
  lobeMinRadius: 2.2,
  lobeSmoothness: 0.6,
  foldDepth: 1.0,
  neckWidth: 1.3,
  wallThickness: 0.35,
  buildingHeight: 6.5,
  podHeightVariance: 2.2,
  planScale: 1.0,
  showFurniture: true,
  showGuides: true,
  showCirclesFeature: true,
};

const colors = {
  background: "#f3f0ea",
  outer: "#1d1b19",
  inner: "#47433f",
  thin: "#6f6a65",
  hatch: "#f2b7cf",
  guide: "#b4aca1",
  fill: "#f8f6f1",
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
threeRoot.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#efece6");

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(16, -22, 16);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 3);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(20, -10, 28);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
fillLight.position.set(-12, 16, 14);
scene.add(fillLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({ color: "#e3ddd3", roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -0.02;
scene.add(ground);

let massingGroup = new THREE.Group();
scene.add(massingGroup);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
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

function roundedRectPoints(width, height, radius, edgeSegs = 10, cornerSegs = 8) {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = clamp(radius, 0, Math.min(hw, hh));
  const points = [];
  const addEdge = (from, to, segments) => {
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      points.push(new THREE.Vector2(lerp(from.x, to.x, t), lerp(from.y, to.y, t)));
    }
  };
  const addArc = (center, start, end, segments) => {
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const angle = lerp(start, end, t);
      points.push(new THREE.Vector2(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r));
    }
  };

  points.push(new THREE.Vector2(hw - r, hh));
  addEdge({ x: hw - r, y: hh }, { x: -hw + r, y: hh }, edgeSegs);
  addArc({ x: -hw + r, y: hh - r }, Math.PI / 2, Math.PI, cornerSegs);
  addEdge({ x: -hw, y: hh - r }, { x: -hw, y: -hh + r }, edgeSegs);
  addArc({ x: -hw + r, y: -hh + r }, Math.PI, Math.PI * 1.5, cornerSegs);
  addEdge({ x: -hw + r, y: -hh }, { x: hw - r, y: -hh }, edgeSegs);
  addArc({ x: hw - r, y: -hh + r }, Math.PI * 1.5, Math.PI * 2, cornerSegs);
  addEdge({ x: hw, y: -hh + r }, { x: hw, y: hh - r }, edgeSegs);
  addArc({ x: hw - r, y: hh - r }, 0, Math.PI / 2, cornerSegs);

  return points;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return area * 0.5;
}

function computeNormals(points) {
  const outward = polygonArea(points) >= 0;
  const normals = points.map((point, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const ux = tx / len;
    const uy = ty / len;
    const right = new THREE.Vector2(uy, -ux);
    const left = new THREE.Vector2(-uy, ux);
    return outward ? right : left;
  });
  return normals;
}

function getDistances(points) {
  const distances = [0];
  let total = 0;
  for (let i = 1; i <= points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i % points.length];
    total += prev.distanceTo(curr);
    distances.push(total);
  }
  return { distances, total };
}

function segmentIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function polygonSelfIntersects(points) {
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let j = i + 2; j < points.length; j += 1) {
      if (j === i || (j + 1) % points.length === i) continue;
      const c = points[j];
      const d = points[(j + 1) % points.length];
      if (segmentIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function polygonsOverlap(polyA, polyB) {
  for (let i = 0; i < polyA.length; i += 1) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j += 1) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];
      if (segmentIntersect(a1, a2, b1, b2)) return true;
    }
  }
  if (pointInPolygon(polyA[0], polyB)) return true;
  if (pointInPolygon(polyB[0], polyA)) return true;
  return false;
}

function circleToPolygon(center, radius, segments = 24) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (Math.PI * 2 * i) / segments;
    points.push(new THREE.Vector2(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius));
  }
  return points;
}

function resampleSmooth(points, samples) {
  const curvePoints = points.map((p) => new THREE.Vector3(p.x, p.y, 0));
  const curve = new THREE.CatmullRomCurve3(curvePoints, true, "catmullrom", 0.8);
  return curve.getPoints(samples).map((p) => new THREE.Vector2(p.x, p.y));
}

function lobeOffsets(points, normals, rng, options) {
  const { distances, total } = getDistances(points);
  const fold = clamp(options.foldDepth ?? 1, 0.1, 3.5);
  const minRadius = options.lobeMinRadius * fold;
  const maxRadius = options.lobeMaxRadius * fold;
  const lobes = Array.from({ length: options.lobeCount }).map(() => ({
    t: rng(),
    radius: lerp(minRadius, maxRadius, rng()),
    width: lerp(0.05, 0.18, options.lobeSmoothness * clamp(2 - fold * 0.35, 0.6, 1.2)),
  }));
  const valleys = Array.from({ length: Math.max(2, Math.floor(options.lobeCount * 0.5)) }).map(() => ({
    t: rng(),
    radius: -lerp(minRadius * 0.6, maxRadius * 0.9, rng()),
    width: lerp(0.05, 0.16, options.lobeSmoothness),
  }));

  return points.map((point, i) => {
    const t = distances[i] / total;
    let offset = 0;
    const applyBumps = (items) => {
      items.forEach((lobe) => {
        const raw = Math.abs(t - lobe.t);
        const d = Math.min(raw, 1 - raw);
        const bump = Math.exp(-Math.pow(d / lobe.width, 2)) * lobe.radius;
        offset += bump;
      });
    };
    applyBumps(lobes);
    applyBumps(valleys);
    const noise = (rng() * 2 - 1) * minRadius * 0.25;
    offset = Math.max(-maxRadius * 0.9, offset + noise);
    return point.clone().add(normals[i].clone().multiplyScalar(offset));
  });
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function buildRoundedRect(center, width, height, radius) {
  const points = roundedRectPoints(width, height, radius, 6, 6);
  return points.map((p) => p.clone().add(center));
}

function generatePlan(options) {
  const rng = mulberry32(options.seed);
  const base = roundedRectPoints(options.baseWidth, options.baseHeight, options.cornerRadius, 12, 10);
  let outline = base;
  let lobeMax = options.lobeMaxRadius;
  let foldDepth = options.foldDepth;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const normals = computeNormals(outline);
    const lobePoints = lobeOffsets(outline, normals, rng, {
      ...options,
      lobeMaxRadius: lobeMax,
      foldDepth,
    });
    const smoothed = resampleSmooth(lobePoints, 240);
    if (!polygonSelfIntersects(smoothed)) {
      outline = smoothed;
      break;
    }
    lobeMax *= 0.85;
    foldDepth *= 0.9;
  }

  const hallWidth = options.baseWidth * 0.46;
  const hallHeight = options.baseHeight * 0.34;
  const hall = buildRoundedRect(new THREE.Vector2(0, 0), hallWidth, hallHeight, options.cornerRadius * 0.4);

  const circles = [];
  if (options.showCirclesFeature) {
    const radius = Math.min(options.baseWidth, options.baseHeight) * 0.14;
    circles.push({ center: new THREE.Vector2(0, 0), radius, isVoid: true });
    circles.push({ center: new THREE.Vector2(0, 0), radius: radius * 0.55, isVoid: false });
  }

  const pods = [];
  const necks = [];
  const podCount = Math.floor(lerp(4, 7, rng()));
  const outlineNormals = computeNormals(outline);
  for (let i = 0; i < podCount; i += 1) {
    const idx = Math.floor(rng() * outline.length);
    const anchor = outline[idx];
    const inward = outlineNormals[idx].clone().multiplyScalar(-1);
    const offset = lerp(2.4, 3.8, rng());
    const center = anchor.clone().add(inward.multiplyScalar(offset));
    const podWidth = lerp(2.2, 3.5, rng());
    const podHeight = lerp(1.8, 2.9, rng());
    const pod = buildRoundedRect(center, podWidth, podHeight, Math.min(podWidth, podHeight) * 0.35);

    if (pod.every((p) => pointInPolygon(p, outline))) {
      pods.push({ points: pod, height: lerp(-0.5, 1, rng()) });
      const neckDir = new THREE.Vector2(0, 0).sub(center).normalize();
      const neckStart = center.clone().add(neckDir.clone().multiplyScalar(podHeight * 0.5));
      const neckLength = options.neckWidth * lerp(0.9, 1.4, rng());
      const neckEnd = neckStart.clone().add(neckDir.clone().multiplyScalar(neckLength));
      necks.push({ start: neckStart, end: neckEnd });
    }
  }

  const furniture = [];
  if (options.showFurniture) {
    const tableCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < tableCount; i += 1) {
      const x = lerp(-hallWidth * 0.3, hallWidth * 0.3, rng());
      const y = lerp(-hallHeight * 0.3, hallHeight * 0.3, rng());
      furniture.push({
        type: "table",
        center: new THREE.Vector2(x, y),
        radius: lerp(0.4, 0.65, rng()),
        chairs: 4 + Math.floor(rng() * 4),
      });
    }
  }

  const stairs = [];
  const stairCount = 2 + Math.floor(rng() * 2);
  const normals = computeNormals(outline);
  for (let i = 0; i < stairCount; i += 1) {
    const idx = Math.floor(rng() * outline.length);
    const anchor = outline[idx];
    const inward = normals[idx].clone().multiplyScalar(-1);
    const center = anchor.clone().add(inward.multiplyScalar(lerp(3.0, 4.8, rng())));
    const radius = lerp(1.6, 2.4, rng());
    if (!pointInPolygon(center, outline)) continue;
    const footprint = circleToPolygon(center, radius, 20);
    if (!footprint.every((p) => pointInPolygon(p, outline))) continue;
    const overlaps = stairs.some((stair) => {
      const dist = stair.center.distanceTo(center);
      return dist < stair.radius + radius + 0.5;
    });
    if (overlaps) continue;
    stairs.push({
      type: "spiral",
      center,
      radius,
      coreRadius: lerp(0.35, 0.55, rng()),
      steps: 18 + Math.floor(rng() * 8),
    });
  }

  const rooms = [];
  const roomAttempts = 8;
  for (let i = 0; i < roomAttempts; i += 1) {
    const roomWidth = lerp(3.8, 6.8, rng());
    const roomHeight = lerp(3.2, 5.6, rng());
    const center = new THREE.Vector2(lerp(-6, 6, rng()), lerp(-4, 4, rng()));
    const room = buildRoundedRect(center, roomWidth, roomHeight, Math.min(roomWidth, roomHeight) * 0.25);
    if (!room.every((p) => pointInPolygon(p, outline))) continue;
    const overlapsRoom = rooms.some((existing) => polygonsOverlap(existing, room));
    if (overlapsRoom) continue;
    const overlapsStair = stairs.some((stair) => {
      const stairFootprint = circleToPolygon(stair.center, stair.radius, 20);
      return polygonsOverlap(stairFootprint, room);
    });
    if (overlapsStair) continue;
    rooms.push(room);
    if (rooms.length >= 3) break;
  }

  return {
    outline,
    hall,
    circles,
    pods,
    necks,
    rooms,
    stairs,
    furniture,
  };
}

function getBounds(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function drawPath(ctx, points, close = true) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (close) ctx.closePath();
}

function drawPlan(plan) {
  const { outline, hall, circles, pods, necks, furniture } = plan;
  const scaledOutline = outline.map((p) => p.clone().multiplyScalar(params.planScale));
  const scaledHall = hall.map((p) => p.clone().multiplyScalar(params.planScale));
  const scaledPods = pods.map((pod) => pod.points.map((p) => p.clone().multiplyScalar(params.planScale)));
  const scaledNecks = necks.map((neck) => ({
    start: neck.start.clone().multiplyScalar(params.planScale),
    end: neck.end.clone().multiplyScalar(params.planScale),
  }));
  const scaledCircles = circles.map((circle) => ({
    center: circle.center.clone().multiplyScalar(params.planScale),
    radius: circle.radius * params.planScale,
    isVoid: circle.isVoid,
  }));
  const scaledFurniture = furniture.map((item) => ({
    ...item,
    center: item.center.clone().multiplyScalar(params.planScale),
  }));
  const scaledRooms = plan.rooms.map((room) => room.map((p) => p.clone().multiplyScalar(params.planScale)));
  const scaledStairs = plan.stairs.map((stair) => ({
    ...stair,
    center: stair.center.clone().multiplyScalar(params.planScale),
    radius: stair.radius ? stair.radius * params.planScale : undefined,
    coreRadius: stair.coreRadius ? stair.coreRadius * params.planScale : undefined,
    width: stair.width ? stair.width * params.planScale : undefined,
    height: stair.height ? stair.height * params.planScale : undefined,
  }));

  planCtx.fillStyle = colors.background;
  planCtx.fillRect(0, 0, planCanvas.width, planCanvas.height);

  const bounds = getBounds(scaledOutline);
  const margin = 40;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = Math.min((planCanvas.width - margin * 2) / width, (planCanvas.height - margin * 2) / height);

  planCtx.save();
  planCtx.translate(planCanvas.width / 2, planCanvas.height / 2);
  planCtx.scale(scale, -scale);
  planCtx.translate(-(bounds.minX + width / 2), -(bounds.minY + height / 2));

  const outerWidth = params.wallThickness / scale;
  const innerWidth = params.wallThickness * 0.65 / scale;
  const thinWidth = params.wallThickness * 0.3 / scale;

  planCtx.fillStyle = colors.fill;
  drawPath(planCtx, scaledOutline);
  planCtx.fill();

  planCtx.strokeStyle = colors.outer;
  planCtx.lineWidth = outerWidth;
  planCtx.lineJoin = "round";
  planCtx.lineCap = "round";
  drawPath(planCtx, scaledOutline);
  planCtx.stroke();

  planCtx.strokeStyle = colors.inner;
  planCtx.lineWidth = innerWidth;
  drawPath(planCtx, scaledHall);
  planCtx.stroke();

  scaledRooms.forEach((room) => {
    drawPath(planCtx, room);
    planCtx.stroke();
  });

  scaledPods.forEach((pod) => {
    drawPath(planCtx, pod);
    planCtx.stroke();
  });

  planCtx.strokeStyle = colors.inner;
  planCtx.lineWidth = innerWidth * 0.85;
  scaledNecks.forEach((neck) => {
    planCtx.beginPath();
    planCtx.moveTo(neck.start.x, neck.start.y);
    planCtx.lineTo(neck.end.x, neck.end.y);
    planCtx.stroke();
  });

  if (params.showCirclesFeature) {
    planCtx.strokeStyle = colors.inner;
    planCtx.lineWidth = innerWidth * 0.9;
    scaledCircles.forEach((circle) => {
      planCtx.beginPath();
      planCtx.arc(circle.center.x, circle.center.y, circle.radius, 0, Math.PI * 2);
      planCtx.stroke();
    });
  }

  if (params.showGuides) {
    planCtx.strokeStyle = colors.guide;
    planCtx.setLineDash([0.6 / scale, 0.6 / scale]);
    planCtx.lineWidth = thinWidth;
    planCtx.globalAlpha = 0.8;
    drawPath(planCtx, scaledOutline);
    planCtx.stroke();
    planCtx.setLineDash([]);

    planCtx.save();
    planCtx.globalAlpha = 0.7;
    drawPath(planCtx, scaledHall);
    planCtx.clip();
    const hatchSpacing = 1.2;
    planCtx.strokeStyle = colors.hatch;
    planCtx.lineWidth = thinWidth;
    for (let x = bounds.minX - height; x < bounds.maxX + height; x += hatchSpacing) {
      planCtx.beginPath();
      planCtx.moveTo(x, bounds.minY - height);
      planCtx.lineTo(x + height * 2, bounds.maxY + height * 2);
      planCtx.stroke();
    }
    planCtx.restore();
  }

  if (params.showFurniture) {
    planCtx.strokeStyle = colors.thin;
    planCtx.lineWidth = thinWidth;
    scaledFurniture.forEach((item) => {
      planCtx.beginPath();
      planCtx.arc(item.center.x, item.center.y, item.radius, 0, Math.PI * 2);
      planCtx.stroke();
      planCtx.beginPath();
      planCtx.moveTo(item.center.x - item.radius * 0.6, item.center.y);
      planCtx.lineTo(item.center.x + item.radius * 0.6, item.center.y);
      planCtx.stroke();

      const chairRadius = item.radius * 0.28;
      const chairDistance = item.radius * 1.5;
      for (let i = 0; i < item.chairs; i += 1) {
        const angle = (Math.PI * 2 * i) / item.chairs;
        const cx = item.center.x + Math.cos(angle) * chairDistance;
        const cy = item.center.y + Math.sin(angle) * chairDistance;
        planCtx.beginPath();
        planCtx.arc(cx, cy, chairRadius, 0, Math.PI * 2);
        planCtx.stroke();
      }
    });
  }

  if (scaledStairs.length) {
    planCtx.strokeStyle = colors.inner;
    planCtx.lineWidth = innerWidth * 0.8;
    scaledStairs.forEach((stair) => {
      if (stair.type === "spiral") {
        planCtx.beginPath();
        planCtx.arc(stair.center.x, stair.center.y, stair.radius, 0, Math.PI * 2);
        planCtx.stroke();
        planCtx.beginPath();
        planCtx.arc(stair.center.x, stair.center.y, stair.coreRadius, 0, Math.PI * 2);
        planCtx.stroke();
        for (let i = 0; i < stair.steps; i += 1) {
          const angle = (Math.PI * 2 * i) / stair.steps;
          const x0 = stair.center.x + Math.cos(angle) * stair.coreRadius;
          const y0 = stair.center.y + Math.sin(angle) * stair.coreRadius;
          const x1 = stair.center.x + Math.cos(angle) * stair.radius;
          const y1 = stair.center.y + Math.sin(angle) * stair.radius;
          planCtx.beginPath();
          planCtx.moveTo(x0, y0);
          planCtx.lineTo(x1, y1);
          planCtx.stroke();
        }
      } else {
        const rect = buildRoundedRect(new THREE.Vector2(0, 0), stair.width, stair.height, 0.5);
        const rectScaled = rect.map((p) => p.clone().add(stair.center));
        drawPath(planCtx, rectScaled);
        planCtx.stroke();
        const stepCount = stair.steps;
        for (let i = 1; i < stepCount; i += 1) {
          const t = i / stepCount;
          const x = stair.center.x - stair.width * 0.35 + t * stair.width * 0.7;
          planCtx.beginPath();
          planCtx.moveTo(x, stair.center.y - stair.height * 0.45);
          planCtx.lineTo(x, stair.center.y + stair.height * 0.45);
          planCtx.stroke();
        }
        planCtx.beginPath();
        planCtx.moveTo(stair.center.x, stair.center.y - stair.height * 0.2);
        planCtx.lineTo(stair.center.x, stair.center.y + stair.height * 0.2);
        planCtx.stroke();
      }
    });
  }

  planCtx.restore();
}

function buildShape(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
}

function updateMassing(plan) {
  const scale = params.planScale;
  massingGroup.clear();

  const outer = plan.outline.map((p) => p.clone().multiplyScalar(scale));
  const shape = buildShape(outer);

  plan.circles.forEach((circle) => {
    if (!circle.isVoid) return;
    const hole = new THREE.Path();
    hole.absellipse(
      circle.center.x * scale,
      circle.center.y * scale,
      circle.radius * scale,
      circle.radius * scale,
      0,
      Math.PI * 2,
      false
    );
    shape.holes.push(hole);
  });

  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: params.buildingHeight,
    bevelEnabled: false,
  });

  extrude.computeVertexNormals();

  const mainMaterial = new THREE.MeshStandardMaterial({
    color: "#e9a3c4",
    roughness: 0.8,
    metalness: 0.05,
  });
  const mainMesh = new THREE.Mesh(extrude, mainMaterial);
  massingGroup.add(mainMesh);

  const podMaterial = new THREE.MeshStandardMaterial({
    color: "#d98cb3",
    roughness: 0.85,
    metalness: 0.05,
  });

  plan.pods.forEach((pod) => {
    const podPoints = pod.points.map((p) => p.clone().multiplyScalar(scale));
    const podShape = buildShape(podPoints);
    const height = Math.max(0.6, params.buildingHeight + pod.height * params.podHeightVariance);
    const podExtrude = new THREE.ExtrudeGeometry(podShape, {
      depth: height,
      bevelEnabled: false,
    });
    const podMesh = new THREE.Mesh(podExtrude, podMaterial);
    massingGroup.add(podMesh);
  });

  massingGroup.position.z = 0;
}

function buildSvg(plan) {
  const scale = params.planScale;
  const outline = plan.outline.map((p) => new THREE.Vector2(p.x * scale, -p.y * scale));
  const hall = plan.hall.map((p) => new THREE.Vector2(p.x * scale, -p.y * scale));
  const pods = plan.pods.map((pod) => pod.points.map((p) => new THREE.Vector2(p.x * scale, -p.y * scale)));
  const necks = plan.necks.map((neck) => ({
    start: new THREE.Vector2(neck.start.x * scale, -neck.start.y * scale),
    end: new THREE.Vector2(neck.end.x * scale, -neck.end.y * scale),
  }));
  const circles = plan.circles.map((circle) => ({
    center: new THREE.Vector2(circle.center.x * scale, -circle.center.y * scale),
    radius: circle.radius * scale,
  }));
  const furniture = plan.furniture.map((item) => ({
    ...item,
    center: new THREE.Vector2(item.center.x * scale, -item.center.y * scale),
  }));
  const stairs = plan.stairs.map((stair) => ({
    ...stair,
    center: new THREE.Vector2(stair.center.x * scale, -stair.center.y * scale),
    radius: stair.radius ? stair.radius * scale : undefined,
    coreRadius: stair.coreRadius ? stair.coreRadius * scale : undefined,
    width: stair.width ? stair.width * scale : undefined,
    height: stair.height ? stair.height * scale : undefined,
  }));

  const bounds = getBounds(outline);
  const padding = 2;
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding;

  const outerWidth = params.wallThickness;
  const innerWidth = params.wallThickness * 0.65;
  const thinWidth = params.wallThickness * 0.3;

  const pathData = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ") + " Z";

  const svgParts = [];
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}" width="1200" height="900">`);
  svgParts.push(`<rect x="${minX.toFixed(2)}" y="${minY.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="${colors.background}"/>`);
  svgParts.push(`<path d="${pathData(outline)}" fill="${colors.fill}" stroke="${colors.outer}" stroke-width="${outerWidth}" stroke-linejoin="round"/>`);
  svgParts.push(`<path d="${pathData(hall)}" fill="none" stroke="${colors.inner}" stroke-width="${innerWidth}" stroke-linejoin="round"/>`);
  pods.forEach((pod) => {
    svgParts.push(`<path d="${pathData(pod)}" fill="none" stroke="${colors.inner}" stroke-width="${innerWidth}"/>`);
  });
  necks.forEach((neck) => {
    svgParts.push(
      `<line x1="${neck.start.x.toFixed(3)}" y1="${neck.start.y.toFixed(3)}" x2="${neck.end.x.toFixed(3)}" y2="${neck.end.y.toFixed(3)}" stroke="${colors.inner}" stroke-width="${innerWidth * 0.85}" stroke-linecap="round"/>`
    );
  });
  if (params.showCirclesFeature) {
    circles.forEach((circle) => {
      svgParts.push(
        `<circle cx="${circle.center.x.toFixed(3)}" cy="${circle.center.y.toFixed(3)}" r="${circle.radius.toFixed(3)}" fill="none" stroke="${colors.inner}" stroke-width="${innerWidth * 0.9}"/>`
      );
    });
  }

  if (params.showGuides) {
    svgParts.push(
      `<path d="${pathData(outline)}" fill="none" stroke="${colors.guide}" stroke-width="${thinWidth}" stroke-dasharray="0.6 0.6"/>`
    );
  }

  if (params.showFurniture) {
    furniture.forEach((item) => {
      svgParts.push(
        `<circle cx="${item.center.x.toFixed(3)}" cy="${item.center.y.toFixed(3)}" r="${item.radius.toFixed(3)}" fill="none" stroke="${colors.thin}" stroke-width="${thinWidth}"/>`
      );
      svgParts.push(
        `<line x1="${(item.center.x - item.radius * 0.6).toFixed(3)}" y1="${item.center.y.toFixed(3)}" x2="${(item.center.x + item.radius * 0.6).toFixed(3)}" y2="${item.center.y.toFixed(3)}" stroke="${colors.thin}" stroke-width="${thinWidth}"/>`
      );
    });
  }

  stairs.forEach((stair) => {
    if (stair.type === "spiral") {
      svgParts.push(
        `<circle cx="${stair.center.x.toFixed(3)}" cy="${stair.center.y.toFixed(3)}" r="${stair.radius.toFixed(3)}" fill="none" stroke="${colors.inner}" stroke-width="${innerWidth * 0.8}"/>`
      );
      svgParts.push(
        `<circle cx="${stair.center.x.toFixed(3)}" cy="${stair.center.y.toFixed(3)}" r="${stair.coreRadius.toFixed(3)}" fill="none" stroke="${colors.inner}" stroke-width="${innerWidth * 0.8}"/>`
      );
      const stepLines = [];
      for (let i = 0; i < stair.steps; i += 1) {
        const angle = (Math.PI * 2 * i) / stair.steps;
        const x0 = stair.center.x + Math.cos(angle) * stair.coreRadius;
        const y0 = stair.center.y + Math.sin(angle) * stair.coreRadius;
        const x1 = stair.center.x + Math.cos(angle) * stair.radius;
        const y1 = stair.center.y + Math.sin(angle) * stair.radius;
        stepLines.push(
          `<line x1="${x0.toFixed(3)}" y1="${y0.toFixed(3)}" x2="${x1.toFixed(3)}" y2="${y1.toFixed(3)}" stroke="${colors.inner}" stroke-width="${innerWidth * 0.6}"/>`
        );
      }
      svgParts.push(...stepLines);
    } else {
      const rect = buildRoundedRect(new THREE.Vector2(0, 0), stair.width, stair.height, 0.5);
      const rectScaled = rect.map((p) => new THREE.Vector2(p.x + stair.center.x, p.y + stair.center.y));
      const rectPath = rectScaled.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ") + " Z";
      svgParts.push(
        `<path d="${rectPath}" fill="none" stroke="${colors.inner}" stroke-width="${innerWidth * 0.8}" stroke-linejoin="round"/>`
      );
      for (let i = 1; i < stair.steps; i += 1) {
        const t = i / stair.steps;
        const x = stair.center.x - stair.width * 0.35 + t * stair.width * 0.7;
        svgParts.push(
          `<line x1="${x.toFixed(3)}" y1="${(stair.center.y - stair.height * 0.45).toFixed(3)}" x2="${x.toFixed(3)}" y2="${(stair.center.y + stair.height * 0.45).toFixed(3)}" stroke="${colors.inner}" stroke-width="${innerWidth * 0.6}"/>`
        );
      }
    }
  });

  svgParts.push(`</svg>`);
  return svgParts.join("");
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function exportSvg(plan) {
  const svg = buildSvg(plan);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "floor-plan.svg");
}

function exportGlb() {
  const exporter = new GLTFExporter();
  exporter.parse(
    massingGroup,
    (result) => {
      const output = result instanceof ArrayBuffer ? result : JSON.stringify(result);
      const blob = new Blob([output], { type: "model/gltf-binary" });
      downloadBlob(blob, "massing.glb");
    },
    (error) => {
      console.error(error);
    },
    { binary: true }
  );
}

let currentPlan = generatePlan(params);

function regenerate() {
  currentPlan = generatePlan({ ...params });
  drawPlan(currentPlan);
  updateMassing(currentPlan);
}

const gui = new GUI({ title: "Plan Controls" });
guiMount.appendChild(gui.domElement);
gui.domElement.classList.add("gui-panel");

gui.add(params, "seed", 1, 9999, 1).onFinishChange(regenerate);
gui.add(params, "baseWidth", 16, 36, 0.5).onFinishChange(regenerate);
gui.add(params, "baseHeight", 12, 28, 0.5).onFinishChange(regenerate);
gui.add(params, "cornerRadius", 2, 10, 0.25).onFinishChange(regenerate);
gui.add(params, "lobeCount", 3, 10, 1).onFinishChange(regenerate);
gui.add(params, "lobeMinRadius", 1, 4, 0.1).onFinishChange(regenerate);
gui.add(params, "lobeMaxRadius", 2, 7, 0.1).onFinishChange(regenerate);
gui.add(params, "lobeSmoothness", 0.2, 1, 0.05).onFinishChange(regenerate);
gui.add(params, "foldDepth", 0.2, 3.2, 0.05).onFinishChange(regenerate);
gui.add(params, "neckWidth", 0.8, 2.2, 0.05).onFinishChange(regenerate);
gui.add(params, "wallThickness", 0.2, 0.6, 0.02).onFinishChange(regenerate);
gui.add(params, "buildingHeight", 3, 12, 0.5).onFinishChange(regenerate);
gui.add(params, "podHeightVariance", 0, 5, 0.25).onFinishChange(regenerate);
gui.add(params, "planScale", 0.6, 1.6, 0.05).onFinishChange(regenerate);
gui.add(params, "showFurniture").onFinishChange(regenerate);
gui.add(params, "showGuides").onFinishChange(regenerate);
gui.add(params, "showCirclesFeature").onFinishChange(regenerate);

document.querySelector("#regenBtn").addEventListener("click", () => {
  params.seed = Math.floor(Math.random() * 9000 + 1000);
  gui.controllers.forEach((controller) => controller.updateDisplay());
  regenerate();
});

document.querySelector("#exportSvgBtn").addEventListener("click", () => exportSvg(currentPlan));
document.querySelector("#exportGlbBtn").addEventListener("click", () => exportGlb());

function resize() {
  const planRect = planCanvas.getBoundingClientRect();
  planCanvas.width = Math.floor(planRect.width * window.devicePixelRatio);
  planCanvas.height = Math.floor(planRect.height * window.devicePixelRatio);
  planCtx.setTransform(1, 0, 0, 1, 0, 0);

  const massingRect = threeRoot.getBoundingClientRect();
  renderer.setSize(massingRect.width, massingRect.height);
  camera.aspect = massingRect.width / massingRect.height;
  camera.updateProjectionMatrix();

  drawPlan(currentPlan);
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(planCanvas);
resizeObserver.observe(threeRoot);
window.addEventListener("resize", resize);

regenerate();
resize();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
