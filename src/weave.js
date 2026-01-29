import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const DEG2RAD = Math.PI / 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function profileCurve(t, mode) {
  if (mode === "linear") return t;
  if (mode === "sharp") return t * t;
  return smoothstep(t);
}

function rotateZ(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point.x * cos - point.y * sin;
  const y = point.x * sin + point.y * cos;
  point.x = x;
  point.y = y;
}

function getRadiusAt(t, params) {
  const start = Math.max(0.001, params.radiusStart);
  const mid = Math.max(0.001, params.radiusMid);
  const end = Math.max(0.001, params.radiusEnd);
  const curve = params.profileCurve || "ease";

  if (t <= 0.5) {
    const local = t * 2;
    return lerp(start, mid, profileCurve(local, curve));
  }

  const local = (t - 0.5) * 2;
  return lerp(mid, end, profileCurve(local, curve));
}

function getMaxRadius(params) {
  return Math.max(params.radiusStart, params.radiusMid, params.radiusEnd);
}

function applyRadiusProfile(geometry, params, baseRadius) {
  const uv = geometry.attributes.uv;
  const normal = geometry.attributes.normal;
  const position = geometry.attributes.position;

  if (!uv || !normal || !position) return;

  for (let i = 0; i < position.count; i++) {
    const t = uv.getY(i);
    const targetRadius = getRadiusAt(t, params);
    const scale = targetRadius / baseRadius;
    const offset = baseRadius * (scale - 1);

    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);

    const px = position.getX(i) + nx * offset;
    const py = position.getY(i) + ny * offset;
    const pz = position.getZ(i) + nz * offset;

    position.setXYZ(i, px, py, pz);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function createCapGeometry(center, normal, radius, radialSegments) {
  const geometry = new THREE.CircleGeometry(radius, radialSegments);
  const up = new THREE.Vector3(0, 0, 1);
  const target = normal.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, target);
  geometry.applyQuaternion(quaternion);
  geometry.translate(center.x, center.y, center.z);
  geometry.computeVertexNormals();
  return geometry;
}

function buildThreadCurve(points, params) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubularSegments = Math.max(12, params.resolution * 2);
  const radialSegments = 12;
  const baseRadius = Math.max(0.001, params.radiusMid);
  const tube = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    baseRadius,
    radialSegments,
    false
  );

  applyRadiusProfile(tube, params, baseRadius);

  const start = curve.getPoint(0);
  const end = curve.getPoint(1);
  const startTangent = curve.getTangent(0).normalize();
  const endTangent = curve.getTangent(1).normalize();
  const radiusStart = getRadiusAt(0, params);
  const radiusEnd = getRadiusAt(1, params);

  const capStart = createCapGeometry(
    start,
    startTangent.clone().negate(),
    radiusStart,
    radialSegments
  );
  const capEnd = createCapGeometry(end, endTangent, radiusEnd, radialSegments);

  const merged = mergeGeometries([tube, capStart, capEnd], false);
  if (!merged) {
    return tube.toNonIndexed();
  }
  merged.computeVertexNormals();
  return merged.toNonIndexed();
}

function hash(value) {
  const s = Math.sin(value) * 43758.5453123;
  return s - Math.floor(s);
}

function getCustomTwist(t, params) {
  const p0 = clamp(params.twistCustom0, 0, 1);
  const p1 = clamp(params.twistCustom1, 0, 1);
  const p2 = clamp(params.twistCustom2, 0, 1);
  const p3 = clamp(params.twistCustom3, 0, 1);

  if (t <= 1 / 3) {
    const local = t * 3;
    return lerp(p0, p1, smoothstep(local));
  }
  if (t <= 2 / 3) {
    const local = (t - 1 / 3) * 3;
    return lerp(p1, p2, smoothstep(local));
  }
  const local = (t - 2 / 3) * 3;
  return lerp(p2, p3, smoothstep(local));
}

function getTwistFactor(t, params) {
  if (params.twistProfile === "linear") return t;
  if (params.twistProfile === "symmetric") {
    const tSym = 1 - Math.abs(0.5 - t) * 2;
    return smoothstep(tSym);
  }
  if (params.twistProfile === "custom") {
    return getCustomTwist(t, params);
  }
  return smoothstep(t);
}

function getTwistAngle(t, strandIndex, params) {
  const factor = getTwistFactor(t, params);
  const noiseStrength = params.twistNoise || 0;
  const noise = (hash((strandIndex + 1) * 12.9898 + t * 78.233) - 0.5) * 2;
  const twistDegrees = params.twistAmount * factor + noise * noiseStrength;
  return twistDegrees * DEG2RAD;
}

function getHeightFactor(indexA, indexB, frac, levels) {
  if (levels <= 1) return 1;
  const levelA = (indexA + indexB) % levels;
  const levelB = (indexA + indexB + 1) % levels;
  const factorA = (levelA + 1) / levels;
  const factorB = (levelB + 1) / levels;
  return lerp(factorA, factorB, smoothstep(frac));
}

function getContactWeight(distance, smoothness) {
  if (smoothness <= 0) return 0;
  const sigma = Math.max(0.0001, smoothness);
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

function relaxPoints(points, params) {
  const iterations = Math.max(0, Math.floor(params.relaxIterations || 0));
  if (iterations === 0 || points.length < 3) return points;

  const stiffness = clamp(params.stiffness ?? 0.7, 0, 1);
  const bendResistance = clamp(params.bendResistance ?? 0.6, 0, 1);
  const relaxStrength = (1 - stiffness) * (1 - bendResistance);

  const base = points.map((p) => p.clone());
  const temp = points.map((p) => p.clone());

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 1; i < temp.length - 1; i++) {
      const prev = temp[i - 1];
      const next = temp[i + 1];
      const current = temp[i];
      const target = prev.clone().add(next).multiplyScalar(0.5);
      const delta = target.sub(current).multiplyScalar(relaxStrength);
      current.add(delta);
      if (stiffness > 0) {
        current.lerp(base[i], stiffness * 0.25);
      }
    }
    temp[0].copy(base[0]);
    temp[temp.length - 1].copy(base[base.length - 1]);
  }

  return temp;
}

export function generateWeaveGeometries(params) {
  const strands = [];
  const totalU = Math.max(2, Math.floor(params.threadCountU));
  const totalV = Math.max(2, Math.floor(params.threadCountV));

  const levels = Math.max(1, Math.floor(params.heightLevels || 1));
  const contactOffset = Math.max(0, params.contactOffset || 0);
  const contactSmoothness = Math.max(0.001, params.contactSmoothness || 0.15);
  const clearance = Math.max(0, params.collisionPadding || 0);

  const maxRadius = Math.max(0.001, getMaxRadius(params));
  const minSpacing = maxRadius * 2 + clearance;
  const spacing = Math.max(0.001, params.spacing, minSpacing);
  const minWeaveHeight = maxRadius * 2 + clearance;
  const weaveHeight = Math.max(params.weaveHeight, minWeaveHeight);

  const sizeU = (totalU - 1) * spacing;
  const sizeV = (totalV - 1) * spacing;
  const halfU = sizeU / 2;
  const halfV = sizeV / 2;

  const weaveAngle = (params.weaveAngle || 0) * DEG2RAD;

  let strandIndex = 0;
  const totalStrands = totalU + totalV;

  for (let i = 0; i < totalU; i++) {
    const points = [];
    const y = -halfU + i * spacing;
    for (let s = 0; s <= params.resolution; s++) {
      const t = s / params.resolution;
      const x = THREE.MathUtils.lerp(-halfV, halfV, t);
      const cross = (x + halfV) / spacing;
      const baseIndex = Math.floor(cross);
      const frac = cross - baseIndex;
      const heightFactor = getHeightFactor(i, baseIndex, frac, levels);
      const phase = i * Math.PI;
      const zBase = weaveHeight * heightFactor * Math.cos(cross * Math.PI + phase);

      const nearestIndex = Math.round(cross);
      const nearestX = -halfV + nearestIndex * spacing;
      const distance = Math.abs(x - nearestX);
      const push = contactOffset * getContactWeight(distance, contactSmoothness);

      const point = new THREE.Vector3(x, y, zBase + push);
      const twist = getTwistAngle(t, strandIndex, params);
      rotateZ(point, twist);
      rotateZ(point, weaveAngle);
      points.push(point);
    }

    const relaxed = relaxPoints(points, params);
    const geometry = buildThreadCurve(relaxed, params);
    geometry.userData = { strandIndex, totalStrands, isWarp: true };
    strands.push({ geometry, strandIndex, totalStrands, isWarp: true });
    strandIndex += 1;
  }

  for (let j = 0; j < totalV; j++) {
    const points = [];
    const x = -halfV + j * spacing;
    for (let s = 0; s <= params.resolution; s++) {
      const t = s / params.resolution;
      const y = THREE.MathUtils.lerp(-halfU, halfU, t);
      const cross = (y + halfU) / spacing;
      const baseIndex = Math.floor(cross);
      const frac = cross - baseIndex;
      const heightFactor = getHeightFactor(j, baseIndex, frac, levels);
      const phase = j * Math.PI;
      const zBase = -weaveHeight * heightFactor * Math.cos(cross * Math.PI + phase);

      const nearestIndex = Math.round(cross);
      const nearestY = -halfU + nearestIndex * spacing;
      const distance = Math.abs(y - nearestY);
      const push = contactOffset * getContactWeight(distance, contactSmoothness);

      const point = new THREE.Vector3(x, y, zBase - push);
      const twist = getTwistAngle(t, strandIndex, params);
      rotateZ(point, twist);
      rotateZ(point, weaveAngle);
      points.push(point);
    }

    const relaxed = relaxPoints(points, params);
    const geometry = buildThreadCurve(relaxed, params);
    geometry.userData = { strandIndex, totalStrands, isWarp: false };
    strands.push({ geometry, strandIndex, totalStrands, isWarp: false });
    strandIndex += 1;
  }

  return strands;
}
