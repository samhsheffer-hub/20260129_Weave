# 20260129_Weave

Browser-based parametric 3D weave generator built with Three.js and lil-gui, offering warp/weft controls, color modes, lighting presets, and STL/OBJ export from a single merged mesh.

## Features
- Warp/weft thread generator with over-under offsets, twist modes, and symmetric tapering.
- Color modes: single, two-color warp/weft, height gradient, and strand gradient via vertex colors.
- Lighting presets plus a fading infinite-style ground grid.
- STL and OBJ export of the current parametric state.

## Getting Started
1. Install dependencies: `npm install`
2. Start the dev server: `npm run dev`
3. Open the local URL shown in the terminal.

## Controls
- **Threads:** thread counts, radius, spacing, weave height, and resolution.
- **Twist + Taper:** twist amount/mode and symmetric taper controls.
- **Layout:** weave angle rotation.
- **Color:** color mode and gradient endpoints.
- **Lighting:** switch between five preset rigs.
- **Export:** download STL or OBJ for the current mesh.
