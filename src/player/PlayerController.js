import * as THREE from "three";
import { GAME_CONFIG, expandedObstacleBounds } from "../../shared/config.js";

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
    this.slowWalk = false;
    this.audible = false;
    this.onGround = true;
    this.keys = new Set();
    this.serverSlot = 0;
    this.hasSpawned = false;
    this.currentSpeed = 0;
    this.eyeHeight = GAME_CONFIG.player.eyeHeight;

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
    if (document.pointerLockElement === this.domElement) return;
    try {
      const pending = this.domElement.requestPointerLock();
      pending?.catch?.(() => {});
    } catch {
      // Pointer lock can be denied by browser policy without blocking gameplay input.
    }
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
    this.crouch = this.keys.has("KeyC");
    this.slowWalk = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && !this.crouch;
    const speed = this.crouch
      ? GAME_CONFIG.player.crouchSpeed
      : this.slowWalk
        ? GAME_CONFIG.player.silentWalkSpeed
        : GAME_CONFIG.player.walkSpeed;
    FORWARD.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    RIGHT.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const move = new THREE.Vector3();
    if (this.keys.has("KeyW")) move.add(FORWARD);
    if (this.keys.has("KeyS")) move.sub(FORWARD);
    if (this.keys.has("KeyD")) move.add(RIGHT);
    if (this.keys.has("KeyA")) move.sub(RIGHT);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    const isMoving = move.lengthSq() > 0.01;
    this.currentSpeed = isMoving ? speed : 0;

    this.velocity.x = move.x;
    this.velocity.z = move.z;
    if (this.onGround && this.keys.has("Space") && !this.crouch) {
      this.velocity.y = GAME_CONFIG.player.jumpVelocity;
      this.onGround = false;
    }

    this.velocity.y -= GAME_CONFIG.player.gravity * dt;
    this.depenetrate();
    this.moveAxis("x", this.velocity.x * dt);
    this.moveAxis("z", this.velocity.z * dt);
    this.position.y += this.velocity.y * dt;

    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }

    this.audible = isMoving && this.onGround && !this.slowWalk && !this.crouch;
    const targetEye = this.crouch ? GAME_CONFIG.player.crouchEyeHeight : GAME_CONFIG.player.eyeHeight;
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, targetEye, 18, dt);
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  moveAxis(axis, amount) {
    if (Math.abs(amount) < 0.000001) return;
    const halfW = GAME_CONFIG.arena.width / 2 - GAME_CONFIG.player.radius;
    const halfD = GAME_CONFIG.arena.depth / 2 - GAME_CONFIG.player.radius;
    const otherAxis = axis === "x" ? "z" : "x";
    const minKey = axis === "x" ? "minX" : "minZ";
    const maxKey = axis === "x" ? "maxX" : "maxZ";
    const otherMinKey = axis === "x" ? "minZ" : "minX";
    const otherMaxKey = axis === "x" ? "maxZ" : "maxX";
    const start = this.position[axis];
    let target = start + amount;

    for (const item of this.colliders) {
      if (this.position.y >= item.h - 0.02) continue;
      const bounds = expandedObstacleBounds(item);
      const other = this.position[otherAxis];
      if (other <= bounds[otherMinKey] || other >= bounds[otherMaxKey]) continue;

      if (amount > 0 && start <= bounds[minKey] && target > bounds[minKey]) {
        target = Math.min(target, bounds[minKey]);
      } else if (amount < 0 && start >= bounds[maxKey] && target < bounds[maxKey]) {
        target = Math.max(target, bounds[maxKey]);
      }
    }

    this.position[axis] = target;
    this.position.x = Math.max(-halfW, Math.min(halfW, this.position.x));
    this.position.z = Math.max(-halfD, Math.min(halfD, this.position.z));
  }

  depenetrate() {
    for (const item of this.colliders) {
      if (this.position.y >= item.h - 0.02) continue;
      const bounds = expandedObstacleBounds(item);
      if (this.position.x <= bounds.minX || this.position.x >= bounds.maxX
        || this.position.z <= bounds.minZ || this.position.z >= bounds.maxZ) continue;

      const exits = [
        { axis: "x", value: bounds.minX, distance: this.position.x - bounds.minX },
        { axis: "x", value: bounds.maxX, distance: bounds.maxX - this.position.x },
        { axis: "z", value: bounds.minZ, distance: this.position.z - bounds.minZ },
        { axis: "z", value: bounds.maxZ, distance: bounds.maxZ - this.position.z }
      ];
      exits.sort((a, b) => a.distance - b.distance);
      this.position[exits[0].axis] = exits[0].value;
    }
  }

  snapshot() {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      yaw: this.yaw,
      pitch: this.pitch,
      crouch: this.crouch,
      slowWalk: this.slowWalk,
      audible: this.audible
    };
  }
}
