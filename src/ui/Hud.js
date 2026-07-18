export class Hud {
  constructor(root) {
    this.root = root;
    this.root.insertAdjacentHTML("beforeend", template());
    this.lobby = root.querySelector(".lobby");
    this.roomCode = root.querySelector("[data-room-code]");
    this.joinInput = root.querySelector("[data-join-code]");
    this.readyButton = root.querySelector("[data-ready]");
    this.healthFill = root.querySelector("[data-health-fill]");
    this.healthText = root.querySelector("[data-health-text]");
    this.ammo = root.querySelector("[data-ammo]");
    this.timer = root.querySelector("[data-timer]");
    this.score = root.querySelector("[data-score]");
    this.status = root.querySelector("[data-status]");
    this.banner = root.querySelector("[data-banner]");
    this.winner = root.querySelector(".winner");
    this.winnerText = root.querySelector("[data-winner-text]");
    this.hitMarker = root.querySelector(".hit-marker");
    this.ready = false;
  }

  onCreateRoom(handler) {
    this.root.querySelector("[data-create]").addEventListener("click", async () => {
      try {
        const pendingRoom = handler();
        const requestedCode = pendingRoom?.roomCode;
        const copyPending = requestedCode ? this.copyRoomCode(requestedCode) : null;
        const room = await pendingRoom;
        if (room?.code !== requestedCode) await this.copyRoomCode(room.code);
        else await copyPending;
      } catch (error) {
        this.setStatus(error.message);
      }
    });
  }

  onQuickMatch(handler) {
    this.root.querySelector("[data-quick]").addEventListener("click", () => handler().catch((error) => this.setStatus(error.message)));
  }

  onJoinRoom(handler) {
    this.root.querySelector("[data-join]").addEventListener("click", () => {
      handler(this.joinInput.value).catch((error) => this.setStatus(error.message));
    });
  }

  onReady(handler) {
    this.readyButton.addEventListener("click", () => {
      this.ready = !this.ready;
      handler(this.ready);
      this.readyButton.textContent = this.ready ? "Ready" : "Set Ready";
    });
  }

  onPlayAgain(handler) {
    this.root.querySelector("[data-play-again]").addEventListener("click", handler);
  }

  updateRoom(room, localId) {
    const local = room.players.find((player) => player.id === localId);
    const opponent = room.players.find((player) => player.id !== localId);
    this.lobby.classList.toggle("is-hidden", room.status === "playing" || room.status === "roundEnd" || room.status === "matchEnd");
    this.roomCode.textContent = room.code ? `Room ${room.code}` : "No room";
    this.readyButton.disabled = room.players.length < 1 || room.status === "playing";
    if (room.status === "waiting") {
      this.status.textContent = opponent ? "Opponent connected" : "Waiting for opponent";
    } else {
      this.status.textContent = room.suddenDeath ? "Sudden death" : room.status;
    }

    if (local) {
      this.healthFill.style.width = `${local.hp}%`;
      this.healthText.textContent = `${local.hp} HP`;
      this.ammo.textContent = `${local.ammo} / 8`;
    }
    this.score.textContent = `${room.wins[0]} - ${room.wins[1]}`;
  }

  updateTimer(room) {
    if (!room || room.status !== "playing") {
      this.timer.textContent = "1:00";
      return;
    }
    const remaining = Math.max(0, room.roundEndsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    this.timer.textContent = `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }

  showBanner(text) {
    this.banner.textContent = text;
    this.banner.classList.add("is-visible");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.banner.classList.remove("is-visible"), 1800);
  }

  showWinner(text) {
    this.winnerText.textContent = text;
    this.winner.classList.add("is-visible");
  }

  showHit(part, isLocal) {
    if (!isLocal) return;
    this.hitMarker.textContent = part === "head" ? "HEADSHOT" : part.toUpperCase();
    this.hitMarker.classList.add("is-visible");
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => this.hitMarker.classList.remove("is-visible"), 350);
  }

  flashAmmo() {
    this.ammo.classList.add("pulse");
    setTimeout(() => this.ammo.classList.remove("pulse"), 160);
  }

  setStatus(message) {
    this.status.textContent = message;
  }

  async copyRoomCode(code) {
    this.joinInput.value = code;
    let copied = false;
    try {
      await navigator.clipboard?.writeText(code);
      copied = Boolean(navigator.clipboard);
    } catch {
      // Clipboard permission varies by browser; the selected field is the fallback.
    }
    if (!copied) {
      this.joinInput.focus();
      this.joinInput.select();
      this.joinInput.setSelectionRange(0, code.length);
      copied = document.execCommand?.("copy") === true;
    }
    this.setStatus(copied ? `Room ${code} copied` : `Room ${code} ready to copy`);
  }
}

function template() {
  return `
    <div class="hud">
      <div class="topbar">
        <div class="score" data-score>0 - 0</div>
        <div class="timer" data-timer>1:00</div>
        <div class="room-pill" data-room-code>No room</div>
      </div>
      <div class="health">
        <div class="health-fill" data-health-fill></div>
        <span data-health-text>100 HP</span>
      </div>
      <div class="ammo" data-ammo>8 / 8</div>
      <div class="crosshair"></div>
      <div class="hit-marker"></div>
      <div class="banner" data-banner></div>
    </div>
    <section class="lobby">
      <div class="lobby-panel">
        <h1>Gulag Duel</h1>
        <div class="actions">
          <button data-quick>Auto Match</button>
          <button data-create>Create Room</button>
        </div>
        <div class="join-row">
          <input data-join-code maxlength="5" placeholder="Room code" />
          <button data-join>Join</button>
        </div>
        <button class="ready" data-ready>Set Ready</button>
        <p data-status>Choose a room</p>
        <div class="controls-note">WASD move · Shift silent walk · Hold C crouch · R reload</div>
      </div>
    </section>
    <section class="winner">
      <div>
        <h2 data-winner-text>Match complete</h2>
        <button data-play-again>Play Again</button>
      </div>
    </section>
  `;
}
