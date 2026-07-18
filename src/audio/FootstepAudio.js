import * as THREE from "three";

export const FOOTSTEP_HEARING_RADIUS = 16;
const FOOTSTEP_NEAR_DISTANCE = 2.5;
const LOCAL_FOOTSTEP_MIN_VOLUME = 0.052;
const LOCAL_FOOTSTEP_MAX_VOLUME = 0.072;

export function getOpponentFootstepVolume(distance) {
  if (!Number.isFinite(distance) || distance >= FOOTSTEP_HEARING_RADIUS) return 0;

  const normalizedDistance = THREE.MathUtils.clamp(
    (distance - FOOTSTEP_NEAR_DISTANCE) / (FOOTSTEP_HEARING_RADIUS - FOOTSTEP_NEAR_DISTANCE),
    0,
    1
  );
  const proximity = 1 - normalizedDistance;
  return 0.035 + 0.22 * Math.pow(proximity, 1.35);
}

export class FootstepAudio {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.footstepBuffer = makeFootstepBuffer(this.listener.context);
    this.shotBuffer = makeShotBuffer(this.listener.context);
    this.lobbyMusic = new Audio("/audio/Rick%20and%20Morty.mp3");
    this.lobbyMusic.loop = true;
    this.lobbyMusic.preload = "auto";
    this.lobbyMusic.volume = 0.32;
    this.matchActive = false;
    this.hasInteracted = false;
    this.shotCount = 0;
    this.localStepCount = 0;
    this.remoteStepCount = 0;
    this.lastRemoteStepDistance = null;
    this.unlock = this.unlock.bind(this);
    window.addEventListener("pointerdown", this.unlock, { passive: true, capture: true });
    window.addEventListener("keydown", this.unlock, { capture: true });
    window.__gulagAudioDebug = () => this.debugState();
    this.syncDebugState();
  }

  unlock() {
    this.hasInteracted = true;
    const pending = [];
    if (this.listener.context.state !== "running") {
      pending.push(this.listener.context.resume());
    }
    if (!this.matchActive && this.lobbyMusic.paused) {
      pending.push(this.lobbyMusic.play());
    }
    Promise.allSettled(pending).then(() => this.syncDebugState());
  }

  setMatchActive(active) {
    this.matchActive = Boolean(active);
    if (this.matchActive) {
      this.lobbyMusic.pause();
      this.lobbyMusic.currentTime = 0;
    } else if (this.hasInteracted) {
      this.lobbyMusic.play().catch(() => {});
    }
    queueMicrotask(() => this.syncDebugState());
  }

  createEmitter(group) {
    return new FootstepEmitter(this.listener, this.footstepBuffer, group, true, (distance, played) => {
      if (played) this.remoteStepCount += 1;
      this.lastRemoteStepDistance = distance;
      this.syncDebugState();
    });
  }

  createLocalEmitter(group) {
    return new FootstepEmitter(this.listener, this.footstepBuffer, group, false, () => {
      this.localStepCount += 1;
      this.syncDebugState();
    });
  }

  playShot(position, isLocal, scene) {
    this.shotCount += 1;
    this.syncDebugState();

    if (this.listener.context.state !== "running") {
      this.listener.context.resume()
        .then(() => this.playShotBuffer(position, isLocal, scene))
        .catch(() => {});
      return;
    }
    this.playShotBuffer(position, isLocal, scene);
  }

  playShotBuffer(position, isLocal, scene) {
    if (isLocal) {
      const source = this.listener.context.createBufferSource();
      const gain = this.listener.context.createGain();
      source.buffer = this.shotBuffer;
      gain.gain.value = 0.72;
      source.connect(gain).connect(this.listener.context.destination);
      source.start();
      return;
    }

    const audio = new THREE.PositionalAudio(this.listener);
    audio.setBuffer(this.shotBuffer);
    audio.setRefDistance(4);
    audio.setMaxDistance(42);
    audio.setRolloffFactor(1.35);
    audio.setVolume(0.92);
    audio.position.set(position.x, position.y, position.z);
    scene.add(audio);
    audio.play();
    setTimeout(() => {
      if (audio.isPlaying) audio.stop();
      scene.remove(audio);
      audio.disconnect();
    }, 500);
  }

  debugState() {
    return {
      contextState: this.listener.context.state,
      lobbyPlaying: !this.lobbyMusic.paused,
      matchActive: this.matchActive,
      shotCount: this.shotCount,
      localStepCount: this.localStepCount,
      remoteStepCount: this.remoteStepCount,
      lastRemoteStepDistance: this.lastRemoteStepDistance,
      footstepHearingRadius: FOOTSTEP_HEARING_RADIUS
    };
  }

  syncDebugState() {
    const state = this.debugState();
    document.documentElement.dataset.audioContext = state.contextState;
    document.documentElement.dataset.lobbyAudio = state.lobbyPlaying ? "playing" : "paused";
    document.documentElement.dataset.matchAudio = state.matchActive ? "match" : "lobby";
    document.documentElement.dataset.shotAudioCount = String(state.shotCount);
    document.documentElement.dataset.localFootstepCount = String(state.localStepCount);
    document.documentElement.dataset.remoteFootstepCount = String(state.remoteStepCount);
    document.documentElement.dataset.remoteFootstepDistance = state.lastRemoteStepDistance === null
      ? "none"
      : state.lastRemoteStepDistance.toFixed(2);
  }
}

class FootstepEmitter {
  constructor(listener, buffer, group, positional, onStep) {
    this.listener = listener;
    this.positional = positional;
    this.onStep = onStep;
    this.listenerPosition = new THREE.Vector3();
    this.sourcePosition = new THREE.Vector3();
    this.audio = positional ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener);
    this.audio.setBuffer(buffer);
    if (positional) {
      this.audio.panner.panningModel = "HRTF";
      this.audio.setDistanceModel("linear");
      this.audio.setRefDistance(FOOTSTEP_NEAR_DISTANCE);
      this.audio.setMaxDistance(FOOTSTEP_HEARING_RADIUS);
      this.audio.setRolloffFactor(0.82);
      this.audio.setVolume(getOpponentFootstepVolume(FOOTSTEP_NEAR_DISTANCE));
    } else {
      this.audio.setVolume(LOCAL_FOOTSTEP_MIN_VOLUME);
    }
    this.audio.position.set(0, 0.08, 0);
    this.stepTimer = 0;
    group.add(this.audio);
  }

  tick(dt, player) {
    if (!player?.audible || player.dead) {
      this.stepTimer = Math.min(this.stepTimer, 0.12);
      return;
    }

    const speed = Math.max(0, player.speed ?? 0);
    if (speed < 0.45) return;

    this.stepTimer -= dt;
    if (this.stepTimer > 0) return;

    const stride = THREE.MathUtils.clamp(0.64 - speed * 0.038, 0.39, 0.59);
    this.stepTimer = stride + Math.random() * 0.035;

    let distance = 0;
    let volume = THREE.MathUtils.lerp(
      LOCAL_FOOTSTEP_MIN_VOLUME,
      LOCAL_FOOTSTEP_MAX_VOLUME,
      THREE.MathUtils.clamp((speed - 1.5) / 4.5, 0, 1)
    );
    if (this.positional) {
      this.listener.getWorldPosition(this.listenerPosition);
      this.audio.getWorldPosition(this.sourcePosition);
      distance = this.listenerPosition.distanceTo(this.sourcePosition);
      volume = getOpponentFootstepVolume(distance);
      if (volume === 0) {
        this.onStep?.(distance, false);
        return;
      }
    }

    if (this.audio.context.state !== "running" || this.audio.isPlaying) return;

    this.audio.setVolume(volume);
    this.audio.setPlaybackRate(0.96 + Math.random() * 0.1);
    this.audio.play();
    this.onStep?.(distance, true);
  }
}

function makeFootstepBuffer(context) {
  const seconds = 0.135;
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let noiseState = 0;

  for (let i = 0; i < length; i += 1) {
    const t = i / context.sampleRate;
    const attack = 1 - Math.exp(-t * 130);
    const soleEnvelope = attack * Math.exp(-t * 34);
    const heel = Math.sin(t * Math.PI * 2 * 138) * soleEnvelope * 0.2;
    noiseState = noiseState * 0.42 + (Math.random() * 2 - 1) * 0.58;
    const concrete = noiseState * soleEnvelope * 0.22;
    const toe = Math.sin(t * Math.PI * 2 * 315) * Math.exp(-t * 58) * 0.065;
    data[i] = (heel + concrete + toe) * 0.5;
  }

  return buffer;
}

function makeShotBuffer(context) {
  const seconds = 0.34;
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let noise = 0;

  for (let i = 0; i < length; i += 1) {
    const t = i / context.sampleRate;
    noise = noise * 0.24 + (Math.random() * 2 - 1) * 0.76;
    const crack = noise * Math.exp(-t * 76) * 0.95;
    const body = Math.sin(t * Math.PI * 2 * 92) * Math.exp(-t * 17) * 0.72;
    const mechanism = Math.sin(t * Math.PI * 2 * 760) * Math.exp(-t * 92) * 0.18;
    data[i] = Math.tanh((crack + body + mechanism) * 1.35) * 0.74;
  }

  return buffer;
}
