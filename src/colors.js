import * as THREE from "three";

function lerpColor(colorA, colorB, t) {
  return colorA.clone().lerp(colorB, t);
}

function getGlobalZRange(strands) {
  let minZ = Infinity;
  let maxZ = -Infinity;

  strands.forEach((strand) => {
    const position = strand.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const z = position.getZ(i);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  });

  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return { minZ: 0, maxZ: 1 };
  }

  return { minZ, maxZ: maxZ === minZ ? minZ + 0.0001 : maxZ };
}

export function applyColorMode(strands, params) {
  const primary = new THREE.Color(params.primaryColor);
  const secondary = new THREE.Color(params.secondaryColor);
  const gradientStart = new THREE.Color(params.gradientStart);
  const gradientEnd = new THREE.Color(params.gradientEnd);

  const { minZ, maxZ } = getGlobalZRange(strands);
  const totalStrands = Math.max(1, strands.length - 1);

  strands.forEach((strand) => {
    const geometry = strand.geometry;
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      let color = primary;

      if (params.colorMode === "twoColor") {
        color = strand.isWarp ? primary : secondary;
      } else if (params.colorMode === "heightGradient") {
        const z = position.getZ(i);
        const t = THREE.MathUtils.clamp((z - minZ) / (maxZ - minZ), 0, 1);
        color = lerpColor(gradientStart, gradientEnd, t);
      } else if (params.colorMode === "strandGradient") {
        const t = THREE.MathUtils.clamp(
          strand.strandIndex / totalStrands,
          0,
          1
        );
        color = lerpColor(gradientStart, gradientEnd, t);
      }

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  });
}
