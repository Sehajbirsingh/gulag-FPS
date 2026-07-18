import * as THREE from "three";
import { GAME_CONFIG, obstacleBounds } from "../../shared/config.js";

const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();

export class PlayerController {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.domElement = domElement;
    this.colliders = colliders;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouch = false;
    this.onGround = true;
    this.keys = new Set();
    this.serverSlot = 0;
    this.hasSpawned = false;

    this.camera.rotation.order = "YXZ";
    this.bindInput();
  }

  bindInput() {
    window.addEventListener("keydown", (event) => {
      this.keys.add(event.code);
      if (event.code === "Space") event.preventDefault();
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.code));
    document.addEventListener("mousemove", (event) => {
      if (document.pointerLockElement !== this.domElement) return;
      this.yaw -= event.movementX * 0.0022;
      this.pitch -= event.movementY * 0.0022;
      this.pitch = Math.max(-1.28, Math.min(1.28, this.pitch));
    });
  }

  lockPointer() {
    if (document.pointerLockElement !== this.domElement) this.domElement.requestPointerLock();
  }

  setServerState(state, force = false) {
    this.serverSlot = state.slot;
    if (force || !this.hasSpawned || state.dead) {
      this.position.set(state.position.x, state.position.y, state.position.z);
      this.yaw = state.yaw;
      this.pitch = state.pitch ?? 0;
      this.hasSpawned = true;
    }
  }

  update(dt) {
    this.crouch = this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.keys.has("KeyC");
    const speed = this.crouch ? GAME_CONFIG.player.crouchSpeed : GAME_CONFIG.player.walkSpeed;
    FORWARD.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    RIGHT.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const move = new THREE.Vector3();
    if (this.keys.has("KeyW")) move.add(FORWARD);
    if (this.keys.has("KeyS")) move.sub(FORWARD);
    if (this.keys.has("KeyD")) move.add(RIGHT);
    if (this.keys.has("KeyA")) move.sub(RIGHT);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);

    this.velocity.x = move.x;
    this.velocity.z = move.z;
    if (this.onGround && this.keys.has("Space") && !this.crouch) {
      this.velocity.y = GAME_CONFIG.player.jumpVelocity;
      this.onGround = false;
    }

    this.velocity.y -= GAME_CONFIG.player.gravity * dt;
    this.position.x += this.velocity.x * dt;
    this.resolveAxis("x");
    this.position.z += this.velocity.z * dt;
    this.resolveAxis("z");
    this.position.y += this.velocity.y * dt;

    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }

    const eye = this.crouch ? GAME_CONFIG.player.crouchEyeHeight : GAME_CONFIG.player.eyeHeight;
    this.camera.position.set(this.position.x, this.position.y + eye, this.position.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  resolveAxis(axis) {
    const halfW = GAME_CONFIG.arena.width / 2 - GAME_CONFIG.player.radius;
    const halfD = GAME_CONFIG.arena.depth / 2 - GAME_CONFIG.player.radius;
    this.position.x = Math.max(-halfW, Math.min(halfW, this.position.x));
    this.position.z = Math.max(-halfD, Math.min(halfD, this.position.z));

    for (const item of this.colliders) {
      const bounds = obstacleBounds(item);
      if (this.position.y > bounds.maxY) continue;
      const closestX = Math.max(bounds.minX, Math.min(bounds.maxX, this.position.x));
      const closestZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.position.z));
      const dx = this.position.x - closestX;
      const dz = this.position.z - closestZ;
      if (dx * dx + dz * dz >= GAME_CONFIG.player.radius ** 2) continue;

      if (axis === "x") {
        this.position.x = this.velocity.x > 0
          ? bounds.minX - GAME_CONFIG.player.radius
          : bounds.maxX + GAME_CONFIG.player.radius;
      } else {
        this.position.z = this.velocity.z > 0
          ? bounds.minZ - GAME_CONFIG.player.radius
          : bounds.maxZ + GAME_CONFIG.player.radius;
      }
    }
  }

  snapshot() {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      yaw: this.yaw,
      pitch: this.pitch,
      crouch: this.crouch
    };
  }
}
