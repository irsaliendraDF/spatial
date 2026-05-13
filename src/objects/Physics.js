// Physics — lightweight cannon-es wrapper. Disabled unless CONFIG.PHYSICS_ENABLED.
// Objects get dynamic bodies; strokes are never added. A static floor at y=0
// catches them. Grabbing disables gravity on the grabbed object by setting mass=0.
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, CONFIG.PHYSICS_GRAVITY, 0) });
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 6;

    const floorMat = new CANNON.Material('floor');
    const floor = new CANNON.Body({ mass: 0, material: floorMat });
    floor.addShape(new CANNON.Plane());
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floor);

    this.bodies = new Map();   // mesh.uuid -> body
    this.enabled = CONFIG.PHYSICS_ENABLED;
  }

  setEnabled(on) {
    this.enabled = on;
    CONFIG.PHYSICS_ENABLED = on;
  }

  // Approximate a mesh's bounding box into a box body.
  attach(mesh) {
    if (this.bodies.has(mesh.uuid)) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
    const body = new CANNON.Body({ mass: 1 });
    body.addShape(shape);
    body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    this.world.addBody(body);
    this.bodies.set(mesh.uuid, body);
  }

  detach(mesh) {
    const body = this.bodies.get(mesh.uuid);
    if (body) {
      this.world.removeBody(body);
      this.bodies.delete(mesh.uuid);
    }
  }

  // While grabbed, freeze physics for this body (mass=0 = kinematic-like).
  setGrabbed(mesh, grabbed) {
    const body = this.bodies.get(mesh.uuid);
    if (!body) return;
    if (grabbed) {
      body._prevMass = body.mass;
      body.mass = 0;
      body.type = CANNON.Body.KINEMATIC;
      body.velocity.setZero(); body.angularVelocity.setZero();
    } else {
      body.type = CANNON.Body.DYNAMIC;
      body.mass = body._prevMass ?? 1;
      body.updateMassProperties();
    }
  }

  // For kinematic (grabbed) bodies, sync physics position to mesh so collisions
  // update. For dynamic bodies, sync mesh to physics.
  syncFromMesh(mesh) {
    const body = this.bodies.get(mesh.uuid);
    if (!body) return;
    body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
  }

  syncToMesh(mesh) {
    const body = this.bodies.get(mesh.uuid);
    if (!body || body.mass === 0) return;
    mesh.position.set(body.position.x, body.position.y, body.position.z);
    mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  }

  update(dt) {
    if (!this.enabled) return;
    this.world.gravity.set(0, CONFIG.PHYSICS_GRAVITY, 0);
    this.world.step(1 / 60, dt, 3);
  }
}
