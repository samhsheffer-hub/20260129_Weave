# 20260129_Weave

Browser-based parametric 3D weave generator built with Three.js and lil-gui, offering warp/weft controls, color modes, lighting presets, shape profiles, relaxation, and STL/OBJ export from a single merged mesh.

## Features
- Warp/weft weave generator with multi-height crossings and collision-like push-apart at intersections.
- Strand relaxation pass with stiffness and bend resistance for more natural sag and transitions.
- Thickness profile along each strand (start/mid/end) with curve control.
- Twist profiles (linear/ease/symmetric/custom) plus subtle twist noise.
- Independent warp/weft cross-section shapes: tube/pipe/square/rect with size controls.
- Color modes: single, two-color warp/weft, height gradient, and strand gradient via vertex colors.
- Lighting presets plus a fading infinite-style ground grid.
- Background color control.
- STL and OBJ export of the current parametric state.

## Getting Started
1. Install dependencies: `npm install`
2. Start the dev server: `npm run dev`
3. Open the local URL shown in the terminal.

## Controls
- **Threads:** thread counts, spacing, weave height, and resolution.
- **Shape:** warp/weft cross-section type, sizes, and pipe wall thickness.
- **Thickness:** radius start/mid/end with profile curve.
- **Crossings:** height levels and push-apart contact tuning.
- **Relaxation:** stiffness, bend resistance, and iteration count.
- **Twist:** profile selection, noise, and custom graph values.
- **Layout:** weave angle rotation.
- **Color:** color mode and gradient endpoints.
- **Lighting:** switch between five preset rigs.
- **Background:** scene background color.
- **Export:** download STL or OBJ for the current mesh.

## Deployment
- Local build:
  ```bash
  npm install
  npm run build
  ```
- GitHub Pages deploy (gh-pages branch uses relative paths):
  ```bash
  git checkout gh-pages
  npm install
  npm run build
  git add -f dist
  git commit -m "Update GitHub Pages build"
  git push
  ```
- Live demo:
  `https://samhsheffer-hub.github.io/20260129_Weave/`
