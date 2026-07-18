import * as THREE from "three";
import { GAME_CONFIG } from "../../shared/config.js";
import { createArena } from "../world/Arena.js";
import { PlayerController } from "../player/PlayerController.js";
import { RemotePlayer } from "../player/RemotePlayer.js";
import { Pistol } from "../weapons/Pistol.js";
import { NetworkClient } from "../net/NetworkClient.js";
import { Hud } from "../ui/Hud.js";
import { FootstepAudio } from "../audio/FootstepAudio.js";

export class Game {
  constructor(root) {
    this.root = root;
    this.clock = new THREE.Clock();
    this.remotePlayers = new Map();
    this.room = null;
    this.localId = null;
  }

  start() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x171615);
    this.scene.fog = new THREE.Fog(0x171615, 22, 66);

    this.camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 150);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.root.append(this.renderer.domElement);

    this.arena = createArena(this.scene);
    this.player = new PlayerController(this.camera, this.renderer.domElement, this.arena.colliders);
    this.footstepAudio = new FootstepAudio(this.camera);
    this.localFootsteps = this.footstepAudio.createLocalEmitter(this.camera);
    this.weapon = new Pistol(this.camera, this.scene);
    this.hud = new Hud(this.root);
    this.network = new NetworkClient();

    this.bindEvents();
    this.animate();
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    this.hud.onCreateRoom(() => this.network.createRoom());
    this.hud.onQuickMatch(() => this.network.quickMatch());
    this.hud.onJoinRoom((code) => this.network.joinRoom(code));
    this.hud.onReady((ready) => this.network.setReady(ready));
    this.hud.onPlayAgain(() => window.location.reload());

    this.renderer.domElement.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || !this.canAct()) return;
      this.player.lockPointer();
      const shot = this.weapon.tryFire();
      if (!shot) return;
      this.network.fire(shot);
      this.hud.flashAmmo();
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "KeyR" && this.canAct()) {
        this.network.reload();
        this.weapon.startReload();
      }
    });

    this.network.on("room", (room) => this.applyRoomState(room));
    this.network.on("shot", (shot) => this.showShot(shot));
    this.network.on("reloadStart", ({ reloadMs }) => this.weapon.startReload(reloadMs));
    this.network.on("roundStart", (room) => {
      this.weapon.reset();
      this.forceLocalSpawn = true;
      this.applyRoomState(room);
      this.hud.showBanner(`Round ${room.round}`);
    });
    this.network.on("roundEnd", (result) => {
      this.hud.showBanner(result.reason);
    });
    this.network.on("suddenDeath", () => {
      this.hud.showBanner("Sudden death");
    });
    this.network.on("matchEnd", ({ winnerSlot }) => {
      const local = this.getLocalPlayer();
      this.hud.showWinner(local && local.slot === winnerSlot ? "You won the match" : "Match lost");
    });
  }

  applyRoomState(room) {
    this.room = room;
    this.localId = this.localId || room.viewerId || this.network.id;
    this.footstepAudio.setMatchActive(room.status !== "waiting");
    this.hud.updateRoom(room, this.localId);

    const local = this.getLocalPlayer();
    if (local) {
      this.player.setServerState(local, this.forceLocalSpawn);
      this.forceLocalSpawn = false;
      this.weapon.setAmmo(local.ammo);
    }

    const activeRemoteIds = new Set();
    for (const player of room.players) {
      if (player.id === this.localId) continue;
      activeRemoteIds.add(player.id);
      let remote = this.remotePlayers.get(player.id);
      if (!remote) {
        remote = new RemotePlayer(this.scene, player.slot, this.footstepAudio);
        this.remotePlayers.set(player.id, remote);
      }
      remote.update(player);
    }

    for (const [id, remote] of this.remotePlayers) {
      if (!activeRemoteIds.has(id)) {
        remote.dispose(this.scene);
        this.remotePlayers.delete(id);
      }
    }
  }

  showShot(shot) {
    const isLocal = shot.shooterId === this.localId;
    this.footstepAudio.playShot(shot.origin, isLocal, this.scene);
    this.weapon.showTracer(shot.origin, shot.hit?.point ?? shot.coverHit?.point, shot.direction, isLocal);
    if (shot.hit) {
      this.arena.showImpact(shot.hit.point, shot.hit.part);
      this.hud.showHit(shot.hit.part, isLocal);
    } else if (shot.coverHit) {
      this.arena.showImpact(shot.coverHit.point, "cover");
    }
  }

  canAct() {
    const local = this.getLocalPlayer();
    return this.room?.status === "playing" && local && !local.dead;
  }

  getLocalPlayer() {
    return this.room?.players.find((player) => player.id === this.localId);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.canAct()) {
      this.player.update(dt);
      this.weapon.update(dt);
      this.network.sendPlayerUpdate(this.player.snapshot());
      this.localFootsteps.tick(dt, {
        audible: this.player.audible,
        dead: false,
        speed: this.player.currentSpeed
      });
    }
    for (const remote of this.remotePlayers.values()) remote.tick(dt);
    this.hud.updateTimer(this.room);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
