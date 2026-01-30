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

function makeRectShape(width, height) {
  const shape = new THREE.Shape();
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  shape.moveTo(-halfW, -halfH);
  shape.lineTo(halfW, -halfH);
  shape.lineTo(halfW, halfH);
  shape.lineTo(-halfW, halfH);
  shape.lineTo(-halfW, -halfH);
  return shape;
}

function getShapeConfig(params, isWarp) {
  const shapeType = isWarp ? params.warpShape : params.weftShape;
  const widthRaw = isWarp ? params.warpWidth : params.weftWidth;
  const heightRaw = isWarp ? params.warpHeight : params.weftHeight;
  const wallRaw = isWarp ? params.warpWall : params.weftWall;

  const width = Math.max(0.001, widthRaw || params.radiusMid * 2);
  const height = Math.max(0.001, heightRaw || params.radiusMid * 2);
  const wall = Math.max(0.001, wallRaw || 0.02);

  if (shapeType === "square") {
    const size = Math.max(width, height);
    return {
      shape: makeRectShape(size, size),
      baseRadius: size * 0.5,
      segments: 4,
    };
  }

  if (shapeType === "rect") {
    return {
      shape: makeRectShape(width, height),
      baseRadius: Math.max(width, height) * 0.5,
      segments: 4,
    };
  }

  const outer = Math.max(width, height) * 0.5;
  const circle = new THREE.Shape();
  circle.absarc(0, 0, outer, 0, Math.PI * 2, false);

  if (shapeType === "pipe") {
    const innerRadius = Math.max(0.001, outer - wall);
    const hole = new THREE.Path();
    hole.absarc(0, 0, Math.min(innerRadius, outer * 0.95), 0, Math.PI * 2, true);
    circle.holes.push(hole);
  }

  return {
    shape: circle,
    baseRadius: outer,
    segments: 32,
  };
}

function stripCaps(geometry) {
  if (!geometry.index || !geometry.groups || geometry.groups.length === 0) {
    return geometry;
  }
  const sideGroup = geometry.groups[0];
  if (!sideGroup || sideGroup.count <= 0) return geometry;

  const indexArray = geometry.index.array;
  const sliced = indexArray.slice(
    sideGroup.start,
    sideGroup.start + sideGroup.count
  );

  const trimmed = geometry.clone();
  trimmed.setIndex(new THREE.BufferAttribute(sliced, 1));
  trimmed.clearGroups();
  trimmed.addGroup(0, sliced.length, 0);
  return trimmed;
}

function createCapFromShape(shape, center, normal, scale) {
  const geometry = new THREE.ShapeGeometry(shape, 24);
  geometry.scale(scale, scale, scale);
  const up = new THREE.Vector3(0, 0, 1);
  const target = normal.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, target);
  geometry.applyQuaternion(quaternion);
  geometry.translate(center.x, center.y, center.z);
  geometry.computeVertexNormals();
  return geometry;
}

function cleanupGeometry(geometry, areaEps, maxCoord) {
  const src = geometry.toNonIndexed();
  const position = src.attributes.position;
  const normal = src.attributes.normal;
  const uv = src.attributes.uv;

  const posArray = position.array;
  const normArray = normal ? normal.array : null;
  const uvArray = uv ? uv.array : null;

  const outPos = [];
  const outNorm = [];
  const outUv = [];

  const maxCoordAbs = maxCoord ?? 1e4;

  for (let i = 0; i < posArray.length; i += 9) {
    const ax = posArray[i];
    const ay = posArray[i + 1];
    const az = posArray[i + 2];
    const bx = posArray[i + 3];
    const by = posArray[i + 4];
    const bz = posArray[i + 5];
    const cx = posArray[i + 6];
    const cy = posArray[i + 7];
    const cz = posArray[i + 8];

    if (
      !Number.isFinite(ax) ||
      !Number.isFinite(ay) ||
      !Number.isFinite(az) ||
      !Number.isFinite(bx) ||
      !Number.isFinite(by) ||
      !Number.isFinite(bz) ||
      !Number.isFinite(cx) ||
      !Number.isFinite(cy) ||
      !Number.isFinite(cz)
    ) {
      continue;
    }

    if (
      Math.abs(ax) > maxCoordAbs ||
      Math.abs(ay) > maxCoordAbs ||
      Math.abs(az) > maxCoordAbs ||
      Math.abs(bx) > maxCoordAbs ||
      Math.abs(by) > maxCoordAbs ||
      Math.abs(bz) > maxCoordAbs ||
      Math.abs(cx) > maxCoordAbs ||
      Math.abs(cy) > maxCoordAbs ||
      Math.abs(cz) > maxCoordAbs
    ) {
      continue;
    }

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;

    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;

    const area = 0.5 * Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
    if (area < areaEps) {
      continue;
    }

    outPos.push(ax, ay, az, bx, by, bz, cx, cy, cz);

    if (normArray) {
      outNorm.push(
        normArray[i],
        normArray[i + 1],
        normArray[i + 2],
        normArray[i + 3],
        normArray[i + 4],
        normArray[i + 5],
        normArray[i + 6],
        normArray[i + 7],
        normArray[i + 8]
      );
    }

    if (uvArray) {
      const uvIndex = (i / 3) * 2;
      outUv.push(
        uvArray[uvIndex],
        uvArray[uvIndex + 1],
        uvArray[uvIndex + 2],
        uvArray[uvIndex + 3],
        uvArray[uvIndex + 4],
        uvArray[uvIndex + 5]
      );
    }
  }

  const cleaned = new THREE.BufferGeometry();
  cleaned.setAttribute("position", new THREE.Float32BufferAttribute(outPos, 3));
  if (normArray) {
    cleaned.setAttribute("normal", new THREE.Float32BufferAttribute(outNorm, 3));
  }
  if (uvArray) {
    cleaned.setAttribute("uv", new THREE.Float32BufferAttribute(outUv, 2));
  }
  cleaned.computeVertexNormals();
  return cleaned;
}

function buildThreadCurve(points, params, shapeConfig) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
  const tubularSegments = Math.max(24, params.resolution * 3);
  const geometry = new THREE.ExtrudeGeometry(shapeConfig.shape, {
    steps: tubularSegments,
    bevelEnabled: false,
    extrudePath: curve,
    curveSegments: shapeConfig.segments,
  });

  applyRadiusProfile(geometry, params, shapeConfig.baseRadius);

  const sideOnly = stripCaps(geometry);
  const start = curve.getPoint(0);
  const end = curve.getPoint(1);
  const startTangent = curve.getTangent(0).normalize();
  const endTangent = curve.getTangent(1).normalize();

  const scaleStart = getRadiusAt(0, params) / shapeConfig.baseRadius;
  const scaleEnd = getRadiusAt(1, params) / shapeConfig.baseRadius;

  const capStart = createCapFromShape(
    shapeConfig.shape,
    start,
    startTangent.clone().negate(),
    scaleStart
  );
  const capEnd = createCapFromShape(
    shapeConfig.shape,
    end,
    endTangent,
    scaleEnd
  );

  const combined = [sideOnly, capStart, capEnd].map((g) => g.toNonIndexed());
  const mergedGeometry = mergeGeometries(combined, false);
  return cleanupGeometry(
    mergedGeometry,
    Math.max(1e-8, shapeConfig.baseRadius * shapeConfig.baseRadius * 5e-4),
    1e3
  );
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

  const warpShape = getShapeConfig(params, true);
  const weftShape = getShapeConfig(params, false);

  for (let i = 0; i < totalU; i++) {
    const points = [];
    const y = -halfU + i * spacing;
    for (let s = 0; s <= params.resolution; s++) {
      const t = s / params.resolution;
      const x = lerp(-halfV, halfV, t);
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
    const geometry = buildThreadCurve(relaxed, params, warpShape);
    geometry.userData = { strandIndex, totalStrands, isWarp: true };
    strands.push({ geometry, strandIndex, totalStrands, isWarp: true });
    strandIndex += 1;
  }

  for (let j = 0; j < totalV; j++) {
    const points = [];
    const x = -halfV + j * spacing;
    for (let s = 0; s <= params.resolution; s++) {
      const t = s / params.resolution;
      const y = lerp(-halfU, halfU, t);
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
    const geometry = buildThreadCurve(relaxed, params, weftShape);
    geometry.userData = { strandIndex, totalStrands, isWarp: false };
    strands.push({ geometry, strandIndex, totalStrands, isWarp: false });
    strandIndex += 1;
  }

  return strands;
}
