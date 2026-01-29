import * as THREE from "three";

const DEG2RAD = Math.PI / 180;

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function rotateZ(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point.x * cos - point.y * sin;
  const y = point.x * sin + point.y * cos;
  point.x = x;
  point.y = y;
}

function getTwistFactor(t, mode) {
  if (mode === "symmetrical") {
    const tSym = 1 - Math.abs(0.5 - t) * 2;
    return smoothstep(tSym);
  }
  return smoothstep(t);
}

function getScaleFactor(t, params) {
  const { scaleTaper, scaleMode } = params;
  if (scaleTaper <= 0) return 1;

  let base = t;
  if (scaleMode === "symmetrical") {
    base = 1 - Math.abs(0.5 - t) * 2;
  }

  const eased = smoothstep(base);
  const scale = 1 - scaleTaper * (1 - eased);
  return Math.max(0.12, scale);
}

function applyTaperToTube(geometry, params) {
  const uv = geometry.attributes.uv;
  const normal = geometry.attributes.normal;
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i++) {
    const t = uv.getY(i);
    const scale = getScaleFactor(t, params);

    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);

    const px = position.getX(i) + nx * params.threadRadius * (scale - 1);
    const py = position.getY(i) + ny * params.threadRadius * (scale - 1);
    const pz = position.getZ(i) + nz * params.threadRadius * (scale - 1);

    position.setXYZ(i, px, py, pz);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function buildThreadCurve(points, params) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubularSegments = Math.max(12, params.resolution * 2);
  const radialSegments = 10;
  const tube = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    params.threadRadius,
    radialSegments,
    false
  );
  applyTaperToTube(tube, params);
  return tube.toNonIndexed();
}

export function generateWeaveGeometries(params) {
  const strands = [];
  const totalU = Math.max(2, Math.floor(params.threadCountU));
  const totalV = Math.max(2, Math.floor(params.threadCountV));
  const spacing = Math.max(0.001, params.spacing);

  const sizeU = (totalU - 1) * spacing;
  const sizeV = (totalV - 1) * spacing;
  const halfU = sizeU / 2;
  const halfV = sizeV / 2;

  const weaveAngle = params.weaveAngle * DEG2RAD;
  const twistAmount = params.twistAmount * DEG2RAD;

  let strandIndex = 0;
  const totalStrands = totalU + totalV;

  for (let i = 0; i < totalU; i++) {
    const points = [];
    const y = -halfU + i * spacing;
    for (let s = 0; s <= params.resolution; s++) {
      const t = s / params.resolution;
      const x = THREE.MathUtils.lerp(-halfV, halfV, t);
      const phase = i * Math.PI;
      const z = params.weaveHeight * Math.sin((x / spacing) * Math.PI + phase);

      const point = new THREE.Vector3(x, y, z);
      const twist = twistAmount * getTwistFactor(t, params.twistMode);
      rotateZ(point, twist);
      rotateZ(point, weaveAngle);
      points.push(point);
    }

    const geometry = buildThreadCurve(points, params);
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
      const phase = j * Math.PI;
      const z =
        -params.weaveHeight * Math.sin((y / spacing) * Math.PI + phase);

      const point = new THREE.Vector3(x, y, z);
      const twist = twistAmount * getTwistFactor(t, params.twistMode);
      rotateZ(point, twist);
      rotateZ(point, weaveAngle);
      points.push(point);
    }

    const geometry = buildThreadCurve(points, params);
    geometry.userData = { strandIndex, totalStrands, isWarp: false };
    strands.push({ geometry, strandIndex, totalStrands, isWarp: false });
    strandIndex += 1;
  }

  return strands;
}

