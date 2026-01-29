import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";

function downloadBlob(data, filename, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportSTL(mesh, name) {
  if (!mesh) return;
  const exporter = new STLExporter();
  const data = exporter.parse(mesh, { binary: true });
  downloadBlob(data, `${name}.stl`, "model/stl");
}

export function exportOBJ(mesh, name) {
  if (!mesh) return;
  const exporter = new OBJExporter();
  const data = exporter.parse(mesh);
  downloadBlob(data, `${name}.obj`, "text/plain");
}
