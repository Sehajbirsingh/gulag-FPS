import * as THREE from "three";

export class RemotePlayer {
  constructor(scene, slot) {
    this.group = new THREE.Group();
    this.targetPosition = new THREE.Vector3();
    this.targetYaw = 0;

    const uniform = slot === 0 ? 0x7794a6 : 0xad6d53;
    const limbMaterial = new THREE.MeshStandardMaterial({ color: uniform, roughness: 0.8, metalness: 0.05 });
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: slot === 0 ? 0x8da7ae : 0xbe7f61, roughness: 0.82 });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xc5aa88, roughness: 0.7 });

    this.head = mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), headMaterial, 0, 1.63, 0);
    this.torso = mesh(new THREE.BoxGeometry(0.68, 0.96, 0.4), torsoMaterial, 0, 1.05, 0);
    this.leftArm = mesh(new THREE.BoxGeometry(0.22, 0.86, 0.22), limbMaterial, -0.47, 1.08, 0);
    this.rightArm = mesh(new THREE.BoxGeometry(0.22, 0.86, 0.22), limbMaterial, 0.47, 1.08, 0);
    this.leftLeg = mesh(new THREE.BoxGeometry(0.26, 0.84, 0.26), limbMaterial, -0.17, 0.42, 0);
    this.rightLeg = mesh(new THREE.BoxGeometry(0.26, 0.84, 0.26), limbMaterial, 0.17, 0.42, 0);

    this.group.add(this.head, this.torso, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
    scene.add(this.group);
  }

  update(player) {
    this.player = player;
    this.targetPosition.set(player.position.x, player.position.y, player.position.z);
    this.targetYaw = player.yaw;
    this.group.visible = !player.dead;
    const crouchDrop = player.crouch ? 0.42 : 0;
    for (const part of [this.head, this.torso, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg]) {
      part.position.y = part.userData.baseY - crouchDrop;
    }
  }

  tick(dt) {
    this.group.position.lerp(this.targetPosition, 1 - Math.pow(0.02, dt));
    this.group.rotation.y = lerpAngle(this.group.rotation.y, this.targetYaw, 1 - Math.pow(0.02, dt));
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((item) => {
      if (item.geometry) item.geometry.dispose();
      if (item.material) item.material.dispose();
    });
  }
}

function mesh(geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.userData.baseY = y;
  object.castShadow = true;
  return object;
}

function lerpAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}
