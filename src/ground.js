import * as THREE from "three";

export function createGroundGrid(options = {}) {
  const size = 200;
  const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const baseColor = options.baseColor ?? "#0b0d10";
  const gridColor = options.gridColor ?? "#9aa4b5";

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    extensions: {
      derivatives: true,
    },
    uniforms: {
      gridColor: { value: new THREE.Color(gridColor) },
      baseColor: { value: new THREE.Color(baseColor) },
      gridScale: { value: 1.0 },
      majorScale: { value: 5.0 },
      fadeFactor: { value: 0.03 },
      lineWidth: { value: 0.8 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorld = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 gridColor;
      uniform vec3 baseColor;
      uniform float gridScale;
      uniform float majorScale;
      uniform float fadeFactor;
      uniform float lineWidth;

      float gridLine(vec2 coord, float width) {
        vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
        float line = 1.0 - min(min(grid.x, grid.y), 1.0);
        return smoothstep(0.0, width, line);
      }

      void main() {
        vec2 coord = vWorld.xz / gridScale;
        vec2 coordMajor = vWorld.xz / majorScale;

        float minor = gridLine(coord, lineWidth * 0.5);
        float major = gridLine(coordMajor, lineWidth);
        float line = max(minor * 0.5, major);

        float dist = length(vWorld.xz);
        float fade = exp(-dist * fadeFactor);
        vec3 color = mix(baseColor, gridColor, line);
        gl_FragColor = vec4(color, line * fade);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -2.2;
  mesh.receiveShadow = true;
  return mesh;
}
