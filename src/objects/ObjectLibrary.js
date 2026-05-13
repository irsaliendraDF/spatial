// ObjectLibrary — 8 primitive templates, built procedurally (no fetch).
// Each template exposes {id, name, build(): Mesh}. Meshes from build() are
// fresh geometry + material instances so spawns don't share state.
import * as THREE from 'three';

function std(hex, opts = {}) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0.15, ...opts });
}

export const LIBRARY = [
  {
    id: 'cube', name: 'Cube',
    build: () => new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), std(0x7ae0ff)),
  },
  {
    id: 'sphere', name: 'Sphere',
    build: () => new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 16), std(0x2fff70)),
  },
  {
    id: 'torus', name: 'Torus',
    build: () => new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 16, 48), std(0xff7a3c)),
  },
  {
    id: 'cone', name: 'Cone',
    build: () => new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.34, 32), std(0xff3a6a)),
  },
  {
    id: 'cylinder', name: 'Cylinder',
    build: () => new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 32), std(0xa864ff)),
  },
  {
    id: 'arrow', name: 'Arrow',
    build: () => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 16), std(0xffe066));
      shaft.position.y = 0.0;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 24), std(0xffe066));
      head.position.y = 0.24;
      g.add(shaft); g.add(head);
      // Treat the group as a mesh — give it a compound bounding box
      g.userData.isArrow = true;
      // Wrap as a single mesh-like with a bounding box
      return g;
    },
  },
  {
    id: 'ring', name: 'Ring',
    build: () => new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 10, 96), std(0x7ae0ff, { metalness: 0.7, roughness: 0.2 })),
  },
  {
    id: 'plank', name: 'Plank',
    build: () => new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.12), std(0x9fa8b8)),
  },
];

export function templateById(id) {
  return LIBRARY.find(t => t.id === id) || LIBRARY[0];
}
export function templateByIndex(i) {
  return LIBRARY[((i % LIBRARY.length) + LIBRARY.length) % LIBRARY.length];
}
