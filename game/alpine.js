// SNOWLINE — alpine set dressing: pine trees outside the arena, snowbanks
// along the walls, and the blue-hour sky gradient that gives the map its
// cold colour grade.
import * as THREE from 'three';

export function alpine(scene) {
  const trunk = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });
  const pine = new THREE.MeshStandardMaterial({ color: 0x1e4a2a, roughness: 0.9, flatShading: true });
  const snow = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.95 });
  const treeSpots = [
    [-28, -24], [-32, -8], [-28, 10], [-30, 24], [28, -24], [32, -6],
    [28, 12], [30, 26], [-14, -30], [8, -32], [24, -30], [-10, 30], [14, 30],
  ];
  for (const [x, z] of treeSpots) {
    const h = 4 + Math.random() * 2;
    const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 6), trunk);
    trunkMesh.position.set(x, 0.6, z);
    scene.add(trunkMesh);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6 - i * 0.4, 1.8, 8), pine);
      cone.position.set(x, 1.2 + i * 1.3, z);
      cone.castShadow = true;
      scene.add(cone);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.9, 8), snow);
    cap.position.set(x, 1.2 + 2 * 1.3 + 0.6, z);
    scene.add(cap);
  }
  // Snowbanks hugging the outer walls.
  const bankGeo = new THREE.SphereGeometry(1, 12, 8);
  for (let x = -20; x <= 20; x += 4) {
    for (const z of [-17.4, 17.4]) {
      const bank = new THREE.Mesh(bankGeo, snow);
      bank.scale.set(2.2, 0.7, 1.2);
      bank.position.set(x, 0.1, z);
      scene.add(bank);
    }
  }
}
