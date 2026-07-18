import * as THREE from "three";
import { GAME_CONFIG } from "../../shared/config.js";

export class Pistol {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.ammo = GAME_CONFIG.pistol.magazineSize;
    this.lastShot = 0;
    this.reloadUntil = 0;
    this.recoil = 0;
    this.tracers = [];
    this.model = this.createModel();
    this.camera.add(this.model);
    this.scene.add(this.camera);
  }

  createModel() {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f1e1c, roughness: 0.52, metalness: 0.65 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x42352a, roughness: 0.82, metalness: 0.1 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.58), dark);
    slide.position.set(0.34, -0.22, -0.74);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), grip);
    handle.position.set(0.34, -0.43, -0.5);
    handle.rotation.x = -0.2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 12), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.34, -0.2, -1.05);
    group.add(slide, handle, barrel);
    return group;
  }

  tryFire() {
    const now = performance.now();
    if (this.ammo <= 0 || now < this.reloadUntil || now - this.lastShot < GAME_CONFIG.pistol.fireCooldownMs) return null;
    this.lastShot = now;
    this.ammo -= 1;
    this.recoil += 0.035;

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.x += (Math.random() - 0.5) * GAME_CONFIG.pistol.spreadRadians;
    direction.y += (Math.random() - 0.5) * GAME_CONFIG.pistol.spreadRadians;
    direction.z += (Math.random() - 0.5) * GAME_CONFIG.pistol.spreadRadians;
    direction.normalize();

    return {
      origin: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      shotId: `${Date.now()}-${Math.random().toString(16).slice(2)}`
    };
  }

  startReload(reloadMs = GAME_CONFIG.pistol.reloadMs) {
    if (this.ammo === GAME_CONFIG.pistol.magazineSize) return;
    this.reloadUntil = performance.now() + reloadMs;
  }

  setAmmo(ammo) {
    this.ammo = ammo;
  }

  reset() {
    this.ammo = GAME_CONFIG.pistol.magazineSize;
    this.reloadUntil = 0;
    this.lastShot = 0;
    this.recoil = 0;
  }

  update(dt) {
    this.recoil = Math.max(0, this.recoil - dt * 0.12);
    this.model.position.set(0, -this.recoil * 1.5, this.recoil * 0.7);
    this.model.rotation.x = -this.recoil * 3;
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      tracer.material.opacity = Math.max(0, tracer.life / 0.11);
      if (tracer.life <= 0) {
        this.scene.remove(tracer);
        tracer.geometry.dispose();
        tracer.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  showTracer(origin, point, direction, isLocal) {
    const start = new THREE.Vector3(origin.x, origin.y, origin.z);
    const end = point
      ? new THREE.Vector3(point.x, point.y, point.z)
      : start.clone().add(new THREE.Vector3(direction.x, direction.y, direction.z).multiplyScalar(GAME_CONFIG.pistol.range));
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
      color: isLocal ? 0xffe08a : 0xff6d4b,
      transparent: true,
      opacity: 0.9
    });
    const line = new THREE.Line(geometry, material);
    line.life = 0.11;
    this.tracers.push(line);
    this.scene.add(line);
  }
}
