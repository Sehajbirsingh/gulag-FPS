import { Server } from "socket.io";
import { GAME_CONFIG } from "../shared/config.js";
import { MatchManager } from "./matchManager.js";

export function attachGameServer(httpServer, {
  tickRateMs = GAME_CONFIG.tickRateMs,
  matchOptions = {}
} = {}) {
  const io = new Server(httpServer, {
    cors: { origin: true }
  });
  const manager = new MatchManager(io, matchOptions);

  io.on("connection", (socket) => {
    socket.emit("server:config", GAME_CONFIG);

    socket.on("room:create", withAck(socket, () => manager.createRoom(socket)));
    socket.on("room:quick-match", withAck(socket, () => manager.quickMatch(socket)));
    socket.on("room:join", withAck(socket, ({ code }) => manager.joinRoom(socket, code)));
    socket.on("player:ready", ({ ready }) => manager.setReady(socket, ready));
    socket.on("player:update", (payload) => manager.updatePlayer(socket, payload));
    socket.on("weapon:fire", (payload) => manager.fire(socket, payload));
    socket.on("weapon:reload", () => manager.reload(socket));
    socket.on("disconnect", () => manager.disconnect(socket));
  });

  const tickTimer = setInterval(() => manager.tick(), tickRateMs);
  return {
    io,
    manager,
    close() {
      clearInterval(tickTimer);
      return new Promise((resolve) => io.close(resolve));
    }
  };
}

function withAck(socket, handler) {
  return (payload, ack) => {
    try {
      const data = handler(payload ?? {});
      if (typeof ack === "function") ack({ ok: true, data });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
      else socket.emit("error:toast", { message: error.message });
    }
  };
}
