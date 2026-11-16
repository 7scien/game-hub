import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Server } from "socket.io";
import { OnlineError, RoomManager } from "./RoomManager.js";
import { FixedWindowRateLimiter } from "./security.js";

const defaultDataFile = process.env.ONLINE_DATA_FILE === ":memory:"
  ? null
  : resolve(process.cwd(), process.env.ONLINE_DATA_FILE || "server/data/rooms.json");

const publicError = (error) => ({
  ok: false,
  error: error instanceof OnlineError
    ? { code: error.code, message: error.message }
    : { code: "SERVER_ERROR", message: "서버에서 요청을 처리하지 못했습니다." },
});

const defaultRateProfiles = {
  // 같은 가정/학교 NAT 아래 4명이 방 생성·재접속을 반복해도 정상 사용을 막지 않는다.
  admission: { limit: 30, windowMs: 60_000 },
  lobby: { limit: 30, windowMs: 60_000 },
  command: { limit: 45, windowMs: 5_000 },
};

const envDuration = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const defaultManagerOptions = {
  idleRoomTtlMs: envDuration("ONLINE_IDLE_ROOM_TTL_MS", 12 * 60 * 60_000),
  finishedRoomTtlMs: envDuration("ONLINE_FINISHED_ROOM_TTL_MS", 2 * 60 * 60_000),
  emptyRoomTtlMs: envDuration("ONLINE_EMPTY_ROOM_TTL_MS", 5 * 60_000),
};

export async function createOnlineServer({
  port = Number(process.env.PORT || 3001),
  host = process.env.HOST || "127.0.0.1",
  dataFile = defaultDataFile,
  corsOrigin = process.env.ONLINE_ALLOWED_ORIGINS || "*",
  cleanupIntervalMs = Number(process.env.ONLINE_CLEANUP_INTERVAL_MS || 60_000),
  trustProxy = process.env.ONLINE_TRUST_PROXY === "1",
  rng,
  now = () => Date.now(),
  logger = console,
  managerOptions = defaultManagerOptions,
  rateProfiles = defaultRateProfiles,
} = {}) {
  const manager = new RoomManager({ dataFile, rng, now, ...managerOptions });
  await manager.load();
  const rateLimiter = new FixedWindowRateLimiter({ now });
  const startedAt = now();
  const metrics = { commands: 0, rejected: 0, maxStateBytes: 0, lastStateBytes: 0, cleanedRooms: 0 };
  const log = (level, event, context = {}) => {
    const record = JSON.stringify({ time: new Date().toISOString(), level, event, ...context });
    (logger[level] || logger.log)?.call(logger, record);
  };

  const origins = corsOrigin === "*" ? "*" : corsOrigin.split(",").map((item) => item.trim()).filter(Boolean);
  const originAllowed = (origin) => !origin || origins === "*" || origins.includes(origin);
  const json = (response, status, body) => {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    response.end(JSON.stringify(body));
  };
  const httpServer = createHttpServer((request, response) => {
    const path = new URL(request.url || "/", "http://localhost").pathname;
    if (request.method !== "GET") { json(response, 405, { ok: false, error: "method not allowed" }); return; }
    if (path === "/health") {
      json(response, 200, { ok: true, service: "augmented-yutnori-online", uptimeSeconds: Math.floor((now() - startedAt) / 1000), rooms: manager.rooms.size, connections: io.engine.clientsCount });
      return;
    }
    if (path === "/ready") {
      const audit = manager.auditRooms();
      json(response, audit.ok ? 200 : 503, { ok: audit.ok, rooms: audit.roomCount, invalidRooms: audit.invalid.length, persistence: dataFile ? "json" : "memory" });
      return;
    }
    if (path === "/metrics") {
      json(response, 200, { ok: true, ...metrics, rooms: manager.rooms.size, connections: io.engine.clientsCount });
      return;
    }
    json(response, 200, { name: "augmented-yutnori-online", websocket: true, health: "/health", ready: "/ready" });
  });

  const io = new Server(httpServer, {
    cors: { origin: origins },
    allowRequest: (request, callback) => callback(null, originAllowed(request.headers.origin)),
    maxHttpBufferSize: 100_000,
    httpCompression: true,
    perMessageDeflate: { threshold: 1024 },
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  const emitRoom = (code, excludedSocketIds = new Set()) => {
    const room = manager.rooms.get(code);
    if (!room) return;
    for (const player of room.players.filter((candidate) => candidate.connected && candidate.socketId && !excludedSocketIds.has(candidate.socketId))) {
      const view = manager.view(code, player.id);
      const bytes = Buffer.byteLength(JSON.stringify(view));
      metrics.lastStateBytes = bytes;
      metrics.maxStateBytes = Math.max(metrics.maxStateBytes, bytes);
      io.to(player.socketId).emit("online:state", view);
    }
  };

  const bindSession = (socket, room, player) => {
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.data.pendingRoomCode = null;
    socket.data.requestId = null;
    socket.join(room.code);
  };

  const persistAndEmit = async (room, excludedSocketIds = new Set()) => {
    await manager.persist();
    if (room && manager.rooms.has(room.code)) emitRoom(room.code, excludedSocketIds);
  };

  const socketAddress = (socket) => {
    if (trustProxy) {
      const forwarded = String(socket.handshake.headers["x-forwarded-for"] || "").split(",")[0].trim();
      if (forwarded) return forwarded;
    }
    return socket.handshake.address || "unknown";
  };

  const enforceRate = (socket, profileName) => {
    const profile = rateProfiles[profileName] || defaultRateProfiles[profileName];
    const identity = profileName === "admission" ? socketAddress(socket) : socket.id;
    const result = rateLimiter.consume(`${profileName}:${identity}`, profile);
    if (!result.ok) {
      const error = new OnlineError("RATE_LIMITED", `요청이 너무 많습니다. ${Math.ceil(result.retryAfterMs / 1000)}초 후 다시 시도해 주세요.`);
      error.retryAfterMs = result.retryAfterMs;
      throw error;
    }
  };

  const handle = (socket, event, profileName, handler) => {
    socket.on(event, async (payload, acknowledge = () => {}) => {
      try {
        enforceRate(socket, profileName);
        const result = await handler(payload || {});
        acknowledge({ ok: true, ...(result || {}) });
      } catch (error) {
        metrics.rejected += 1;
        log(error instanceof OnlineError ? "warn" : "error", "socket_request_failed", { event, code: error.code || "SERVER_ERROR", roomCode: socket.data.roomCode || socket.data.pendingRoomCode || null, playerId: socket.data.playerId || null });
        acknowledge(publicError(error));
      }
    });
  };

  io.on("connection", (socket) => {
    socket.emit("online:connection", { status: "connected" });

    handle(socket, "room:create", "admission", async (payload) => {
      const session = manager.createRoom({ ...payload, socketId: socket.id });
      bindSession(socket, session.room, session.player);
      await persistAndEmit(session.room, new Set([socket.id]));
      return { session: { roomCode: session.room.code, playerId: session.player.id, reconnectToken: session.reconnectToken }, state: manager.view(session.room.code, session.player.id) };
    });

    handle(socket, "room:join", "admission", async (payload) => {
      const session = manager.joinRoom({ ...payload, socketId: socket.id });
      if (session.pending) {
        socket.data.pendingRoomCode = session.room.code;
        socket.data.requestId = session.request.id;
        await persistAndEmit(session.room);
        return { pending: true, request: { roomCode: session.room.code, requestId: session.request.id, name: session.request.name } };
      }
      bindSession(socket, session.room, session.player);
      await persistAndEmit(session.room, new Set([socket.id]));
      return { session: { roomCode: session.room.code, playerId: session.player.id, reconnectToken: session.reconnectToken }, state: manager.view(session.room.code, session.player.id) };
    });

    handle(socket, "room:resume", "admission", async (payload) => {
      const session = manager.resumeRoom({ ...payload, code: payload?.code || payload?.roomCode, socketId: socket.id });
      if (session.replacedSocketId && session.replacedSocketId !== socket.id) {
        const replaced = io.sockets.sockets.get(session.replacedSocketId);
        replaced?.emit("online:session-replaced", { message: "다른 기기에서 같은 플레이어로 재접속했습니다." });
        replaced?.disconnect(true);
      }
      bindSession(socket, session.room, session.player);
      await persistAndEmit(session.room, new Set([socket.id]));
      return { session: { roomCode: session.room.code, playerId: session.player.id, reconnectToken: session.reconnectToken }, state: manager.view(session.room.code, session.player.id) };
    });

    handle(socket, "room:settings", "lobby", async (payload) => {
      const room = manager.updateSettings(socket.data.roomCode, socket.data.playerId, payload.settings);
      await persistAndEmit(room, new Set([socket.id]));
      return { state: manager.view(room.code, socket.data.playerId) };
    });

    handle(socket, "room:ready", "lobby", async (payload) => {
      const room = manager.setReady(socket.data.roomCode, socket.data.playerId, payload.ready);
      await persistAndEmit(room, new Set([socket.id]));
      return { state: manager.view(room.code, socket.data.playerId) };
    });

    handle(socket, "room:approve", "lobby", async (payload) => {
      const room = manager.requireRoom(socket.data.roomCode);
      const request = room.joinRequests.find((candidate) => candidate.id === payload.requestId);
      const resolution = manager.resolveJoinRequest(room.code, socket.data.playerId, payload.requestId, Boolean(payload.approved));
      const applicant = request ? io.sockets.sockets.get(request.socketId) : null;
      if (resolution.approved && applicant) {
        bindSession(applicant, room, resolution.player);
        applicant.emit("room:approved", {
          session: { roomCode: room.code, playerId: resolution.player.id, reconnectToken: resolution.reconnectToken },
          state: manager.view(room.code, resolution.player.id),
        });
      } else applicant?.emit("room:approval-denied", { message: "방장이 참가 요청을 거절했습니다." });
      await persistAndEmit(room, new Set([socket.id, applicant?.id].filter(Boolean)));
      return { state: manager.view(room.code, socket.data.playerId) };
    });

    handle(socket, "room:kick", "lobby", async (payload) => {
      const result = manager.kickPlayer(socket.data.roomCode, socket.data.playerId, String(payload.playerId || ""));
      const kickedSocket = result.target.socketId ? io.sockets.sockets.get(result.target.socketId) : null;
      kickedSocket?.emit("room:kicked", { message: "방장이 대기실에서 내보냈습니다." });
      kickedSocket?.disconnect(true);
      await manager.persist();
      if (result.room) emitRoom(result.room.code, new Set([socket.id]));
      return { state: result.room ? manager.view(result.room.code, socket.data.playerId) : null };
    });

    handle(socket, "room:start", "lobby", async () => {
      const before = manager.requireRoom(socket.data.roomCode);
      const waitingSockets = before.joinRequests.map((request) => io.sockets.sockets.get(request.socketId)).filter(Boolean);
      const room = manager.startGame(before.code, socket.data.playerId);
      waitingSockets.forEach((candidate) => candidate.emit("room:approval-denied", { message: "게임이 시작되어 참가 요청이 종료되었습니다." }));
      await persistAndEmit(room, new Set([socket.id]));
      return { state: manager.view(room.code, socket.data.playerId) };
    });

    handle(socket, "room:rematch", "lobby", async () => {
      const room = manager.rematch(socket.data.roomCode, socket.data.playerId);
      await persistAndEmit(room, new Set([socket.id]));
      return { state: manager.view(room.code, socket.data.playerId) };
    });

    handle(socket, "room:leave", "lobby", async () => {
      const code = socket.data.roomCode;
      manager.removeLobbyPlayer(code, socket.data.playerId);
      socket.leave(code);
      socket.data.roomCode = null;
      socket.data.playerId = null;
      await manager.persist();
      if (manager.rooms.has(code)) emitRoom(code);
      return {};
    });

    handle(socket, "game:command", "command", async (command) => {
      const roomCode = socket.data.roomCode;
      const result = manager.executeCommand(roomCode, socket.data.playerId, command);
      const room = manager.requireRoom(roomCode);
      metrics.commands += 1;
      await persistAndEmit(room, new Set([socket.id]));
      return { ...result, state: manager.view(room.code, socket.data.playerId) };
    });

    socket.on("disconnect", async () => {
      try {
        const room = manager.disconnect(socket.id);
        if (room) await persistAndEmit(room);
      } catch (error) {
        log("error", "disconnect_cleanup_failed", { code: error.code || "SERVER_ERROR" });
      }
    });
  });

  const cleanupTimer = setInterval(async () => {
    try {
      rateLimiter.prune();
      const removed = manager.cleanupExpiredRooms();
      if (removed.length) {
        metrics.cleanedRooms += removed.length;
        await manager.persist();
        log("info", "expired_rooms_cleaned", { count: removed.length });
      }
    } catch (error) {
      log("error", "room_cleanup_failed", { code: error.code || "SERVER_ERROR" });
    }
  }, Math.max(1_000, cleanupIntervalMs));
  cleanupTimer.unref?.();

  await new Promise((resolveListen) => httpServer.listen(port, host, resolveListen));
  const address = httpServer.address();
  let closed = false;
  return {
    io,
    httpServer,
    manager,
    metrics,
    url: `http://${host}:${address.port}`,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(cleanupTimer);
      await new Promise((resolveClose) => io.close(resolveClose));
      // io.close가 발생시킨 disconnect 저장을 직렬 큐 뒤에서 한 번 더 기다린다.
      // 그렇지 않으면 테스트/배포 종료 직후 볼륨 파일 rename이 남을 수 있다.
      await manager.persist();
      if (httpServer.listening) await new Promise((resolveClose) => httpServer.close(resolveClose));
    },
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const server = await createOnlineServer();
  console.log(`Augmented Yutnori online server listening on ${server.url}`);
  const shutdown = async () => { await server.close(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("uncaughtException", async (error) => { console.error(JSON.stringify({ level: "fatal", event: "uncaught_exception", message: error.message })); await shutdown(); });
  process.on("unhandledRejection", (error) => console.error(JSON.stringify({ level: "error", event: "unhandled_rejection", message: error?.message || String(error) })));
}
