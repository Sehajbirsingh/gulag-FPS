import { io } from "socket.io-client";

const ROOM_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class NetworkClient {
  constructor() {
    this.socket = io();
    this.handlers = new Map();
    this.seq = 0;
    this.lastSent = 0;

    this.socket.on("connect", () => this.emit("connected", this.socket.id));
    this.socket.on("room:state", (room) => this.emit("room", room));
    this.socket.on("player:correction", (state) => this.emit("correction", state));
    this.socket.on("weapon:shot", (shot) => this.emit("shot", shot));
    this.socket.on("weapon:reload-start", (payload) => this.emit("reloadStart", payload));
    this.socket.on("round:start", (room) => this.emit("roundStart", room));
    this.socket.on("round:end", (result) => this.emit("roundEnd", result));
    this.socket.on("round:sudden-death", (payload) => this.emit("suddenDeath", payload));
    this.socket.on("match:end", (payload) => this.emit("matchEnd", payload));
  }

  get id() {
    return this.socket.id;
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
  }

  emit(event, payload) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }

  createRoom() {
    const code = Array.from(
      { length: 5 },
      () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]
    ).join("");
    const pendingRoom = this.request("room:create", { code });
    pendingRoom.roomCode = code;
    return pendingRoom;
  }

  async quickMatch() {
    return this.request("room:quick-match");
  }

  async joinRoom(code) {
    return this.request("room:join", { code });
  }

  setReady(ready) {
    this.socket.emit("player:ready", { ready });
  }

  sendPlayerUpdate(snapshot, { force = false } = {}) {
    const now = performance.now();
    if (!force && now - this.lastSent < 33) return null;
    this.lastSent = now;
    const seq = ++this.seq;
    const transport = force ? this.socket : this.socket.volatile;
    transport.emit("player:update", { ...snapshot, seq });
    return seq;
  }

  fire(shot) {
    this.socket.emit("weapon:fire", shot);
  }

  reload() {
    this.socket.emit("weapon:reload");
  }

  request(event, payload = {}) {
    return new Promise((resolve, reject) => {
      this.socket.emit(event, payload, (response) => {
        if (response?.ok) resolve(response.data);
        else reject(new Error(response?.error || "Request failed."));
      });
    });
  }
}
