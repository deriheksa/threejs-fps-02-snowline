// SNOWLINE — mesh batching for the static arena.
// Groups are merged into one BufferGeometry each (with a shared material) so
// the map renders in a handful of draw calls instead of hundreds. The merge
// is done by hand (positions + normals + indices) so the game needs no
// three.js addons beyond the vendored core.
import * as THREE from 'three';

// Merge a list of BoxGeometry meshes into one BufferGeometry. Returns null
// when there is nothing to merge.
export function batchMeshes(items) {
  if (!items?.length) return null;
  const positions = [], normals = [], indices = [];
  let offset = 0;
  for (const item of items) {
    const g = new THREE.BoxGeometry(item.w, item.h, item.d);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(item.x, item.y, item.z));
    positions.push(...g.attributes.position.array);
    normals.push(...g.attributes.normal.array);
    for (let i = 0; i < g.index.count; i++) indices.push(g.index.array[i] + offset);
    offset += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}
