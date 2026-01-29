import * as THREE from "three";

export const LIGHTING_PRESETS = [
  "Studio Soft",
  "Hard Sun",
  "Top Rim",
  "Gallery Warm",
  "Moonlight",
];

function clearExisting(scene) {
  const existing = scene.getObjectByName("lightingRig");
  if (existing) {
    existing.traverse((obj) => {
      if (obj.isLight && obj.shadow) {
        obj.shadow.map?.dispose();
      }
    });
    scene.remove(existing);
  }
}

export function applyLightingPreset(scene, preset) {
  clearExisting(scene);
  const rig = new THREE.Group();
  rig.name = "lightingRig";

  if (preset === "Hard Sun") {
    const hemi = new THREE.HemisphereLight(0xced8ff, 0x1f2330, 0.3);
    rig.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(8, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    rig.add(sun);
  } else if (preset === "Top Rim") {
    const ambient = new THREE.AmbientLight(0x283042, 0.2);
    rig.add(ambient);

    const rim = new THREE.DirectionalLight(0xffffff, 1.4);
    rim.position.set(0, 12, -6);
    rim.castShadow = true;
    rig.add(rim);

    const fill = new THREE.PointLight(0x7ea5ff, 0.6);
    fill.position.set(-6, 4, 6);
    rig.add(fill);
  } else if (preset === "Gallery Warm") {
    const ambient = new THREE.AmbientLight(0x7b5b3a, 0.25);
    rig.add(ambient);

    const key = new THREE.SpotLight(0xfff1d6, 1.0, 80, Math.PI / 6, 0.5, 1);
    key.position.set(6, 12, 8);
    key.castShadow = true;
    rig.add(key);

    const fill = new THREE.PointLight(0xffc9a8, 0.55);
    fill.position.set(-8, 4, -4);
    rig.add(fill);
  } else if (preset === "Moonlight") {
    const ambient = new THREE.AmbientLight(0x0f1220, 0.2);
    rig.add(ambient);

    const moon = new THREE.DirectionalLight(0x9bb6ff, 0.9);
    moon.position.set(-6, 10, -8);
    moon.castShadow = true;
    rig.add(moon);

    const accent = new THREE.PointLight(0x4a6cff, 0.4);
    accent.position.set(6, 2, 6);
    rig.add(accent);
  } else {
    const ambient = new THREE.AmbientLight(0x5a6a7a, 0.35);
    rig.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(6, 10, 6);
    key.castShadow = true;
    rig.add(key);

    const fill = new THREE.DirectionalLight(0xbad1ff, 0.45);
    fill.position.set(-8, 4, -6);
    rig.add(fill);

    const back = new THREE.PointLight(0x9bd2ff, 0.4);
    back.position.set(0, 6, -10);
    rig.add(back);
  }

  scene.add(rig);
}
