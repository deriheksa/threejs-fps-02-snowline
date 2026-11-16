// SNOWLINE — the ridge: snow-capped mountain silhouettes ringing the arena
// so the horizon never reads as empty sky. Cones with white caps, layered
// by distance for depth.
import * as THREE from 'three';

export function ridgeArchitecture(scene) {
  const rock = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.95, flatShading: true });
  const snow = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.9, flatShading: true });
  const peaks = [
    [-55, 0, -45, 34, 26], [-30, 0, -58, 44, 32], [5, 0, -60, 38, 28],
    [38, 0, -52, 48, 36], [58, 0, -30, 36, 24], [62, 0, 8, 30, 22],
    [55, 0, 42, 40, 28], [20, 0, 58, 46, 34], [-18, 0, 56, 36, 26],
    [-52, 0, 38, 42, 30], [-62, 0, -8, 32, 24],
  ];
  for (const [x, y, z, height, radius] of peaks) {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), rock);
    peak.position.set(x, y + height / 2 - 2, z);
    scene.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.42, height * 0.32, 7), snow);
    cap.position.set(x, y + height - 2 - height * 0.16, z);
    scene.add(cap);
  }
}
