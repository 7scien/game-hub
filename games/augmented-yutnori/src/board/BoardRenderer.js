import { EDGES, NODES, HOME, WAIT, nodePoint, physicalPoint } from "../core/board.js";

const COLORS = {
  red: "#ef4655",
  blue: "#3a8ff0",
  green: "#21a46b",
  yellow: "#f5bd27",
};

export class BoardRenderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.animation = null;
    this.selection = {};
    this.hoveredNode = null;
    this.fxPhase = 0;
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
    this.ambientTimer = setInterval(() => {
      if (!this.hasAmbientEffects()) return;
      this.fxPhase = (this.fxPhase + 1) % 120;
      this.draw();
    }, 180);
    this.draw();
  }

  destroy() {
    this.resizeObserver.disconnect();
    clearInterval(this.ambientTimer);
  }

  hasAmbientEffects() {
    return Boolean(this.game.boardState?.fog?.turnsRemaining
      || this.game.boardState?.reaper
      || this.game.boardState?.markers?.some((marker) => ["campfire", "sharpshooter"].includes(marker.type))
      || this.game.players.some((player) => player.pieces.some((piece) => ["zombie", "zealot", "queen"].includes(piece.type) || piece.effects?.some((effect) => ["shield", "bomb"].includes(effect.type)))));
  }

  sizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, Math.round(rect.width * dpr));
    const height = Math.max(320, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: width / dpr, height: height / dpr };
  }

  mapPoint(nodeOrPoint, size) {
    let [x, y] = Array.isArray(nodeOrPoint) ? nodeOrPoint : physicalPoint(nodeOrPoint, this.game.boardState);
    if (Array.isArray(nodeOrPoint)) {
      const turns = ((this.game.boardState?.rotation || 0) % 4 + 4) % 4;
      for (let index = 0; index < turns; index += 1) [x, y] = [1 - y, x];
      if (this.game.boardState?.fold === "vertical") x = x < 0.5 ? 1 - x : x;
      if (this.game.boardState?.fold === "horizontal") y = y < 0.5 ? 1 - y : y;
    }
    const pad = size * 0.075;
    return [pad + x * (size - pad * 2), pad + y * (size - pad * 2)];
  }

  draw(selection = null) {
    if (selection) this.selection = selection;
    selection = this.selection;
    const { width, height } = this.sizeCanvas();
    const size = Math.min(width, height);
    const offsetX = (width - size) / 2;
    const offsetY = (height - size) / 2;
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.translate(offsetX, offsetY);

    const pad = size * 0.035;
    ctx.save();
    ctx.shadowColor = "rgba(54, 39, 19, .28)";
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 18;
    const rim = ctx.createLinearGradient(0, 0, 0, size);
    rim.addColorStop(0, "#ead7ad");
    rim.addColorStop(.55, "#cba771");
    rim.addColorStop(1, "#a77d49");
    ctx.fillStyle = rim;
    this.roundRect(ctx, pad, pad + size * .012, size - pad * 2, size - pad * 2, 30);
    ctx.fill();
    ctx.restore();

    const paper = ctx.createLinearGradient(0, 0, size, size);
    paper.addColorStop(0, "#fffdf5");
    paper.addColorStop(.48, "#f8f0de");
    paper.addColorStop(1, "#efe0c2");
    ctx.fillStyle = paper;
    this.roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, 28);
    ctx.fill();
    ctx.strokeStyle = "#7f603d";
    ctx.lineWidth = Math.max(3, size * 0.009);
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = .12;
    ctx.strokeStyle = "#8f6d43";
    ctx.lineWidth = 1;
    for (let index = 0; index < 8; index += 1) {
      const y = pad + (size - pad * 2) * ((index + 1) / 9);
      ctx.beginPath();
      ctx.moveTo(pad * 1.4, y);
      ctx.bezierCurveTo(size * .28, y - 5, size * .68, y + 7, size - pad * 1.4, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.lineCap = "round";
    for (const [from, to] of EDGES) {
      const [x1, y1] = this.mapPoint(from, size);
      const [x2, y2] = this.mapPoint(to, size);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.shadowColor = "rgba(87, 61, 31, .20)";
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 2;
      ctx.strokeStyle = from === "C" || to === "C" ? "#a98d68" : "#b79b74";
      ctx.lineWidth = Math.max(4, size * 0.010);
      ctx.stroke();
    }
    ctx.shadowColor = "transparent";

    this.drawPathPreview(ctx, size, selection.previewPaths || []);

    const center = this.mapPoint("C", size);
    ctx.beginPath();
    ctx.arc(center[0], center[1], size * 0.075, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.64)";
    ctx.fill();
    ctx.strokeStyle = "rgba(57,58,53,.13)";
    ctx.lineWidth = size * 0.004;
    ctx.stroke();

    for (const [id] of Object.entries(NODES)) this.drawNode(ctx, id, size, selection);
    this.drawPieces(ctx, size, selection);
    this.drawBoardObjects(ctx, size);
    if (this.animation) this.drawMovingPiece(ctx, size, this.animation);

    const [homeX, homeY] = this.mapPoint(HOME, size);
    ctx.save();
    ctx.translate(homeX, homeY);
    ctx.fillStyle = "rgba(255,248,228,.92)";
    this.roundRect(ctx, -size * .052, -size * .052, size * .104, size * .104, size * .018);
    ctx.fill();
    ctx.strokeStyle = "#684d32";
    ctx.lineWidth = size * 0.006;
    ctx.stroke();
    ctx.fillStyle = "#5f4630";
    ctx.font = `900 ${size * .016}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("출발", 0, -size * .011);
    ctx.fillText("도착", 0, size * .012);
    ctx.restore();

    ctx.restore();
  }

  drawNode(ctx, id, size, selection) {
    const [x, y] = this.mapPoint(id, size);
    const major = ["TR", "TL", "BL", "HOME", "C"].includes(id);
    const radius = size * (major ? 0.023 : 0.014);
    const isTarget = selection.targetNodes?.includes(id);
    const isPreview = selection.previewNodes?.includes(id);
    const isHovered = this.hoveredNode === id;
    if (isPreview || isHovered) {
      ctx.beginPath();
      ctx.arc(x, y, radius + size * (isHovered ? .015 : .009), 0, Math.PI * 2);
      ctx.fillStyle = isHovered ? "rgba(69, 153, 255, .22)" : "rgba(255, 194, 45, .16)";
      ctx.fill();
    }
    if (isTarget) {
      ctx.beginPath();
      ctx.arc(x, y, radius + size * 0.018, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 181, 35, ${.28 + (this.fxPhase % 4) * .04})`;
      ctx.fill();
      ctx.strokeStyle = "#e99b00";
      ctx.lineWidth = size * 0.006;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const nodeFill = ctx.createRadialGradient(x - radius * .35, y - radius * .45, radius * .15, x, y, radius);
    nodeFill.addColorStop(0, "#fffef9");
    nodeFill.addColorStop(.68, id === "C" ? "#f8f5eb" : "#f4ead6");
    nodeFill.addColorStop(1, "#d9c49f");
    ctx.shadowColor = "rgba(77, 55, 29, .25)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = nodeFill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = isHovered ? "#3b8feb" : "#765a39";
    ctx.lineWidth = size * 0.004;
    ctx.stroke();
    if (major) {
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.58, 0, Math.PI * 2);
      ctx.strokeStyle = "#30312e";
      ctx.lineWidth = size * 0.003;
      ctx.stroke();
    }
  }

  drawPathPreview(ctx, size, paths) {
    if (!paths.length) return;
    ctx.save();
    ctx.setLineDash([size * .018, size * .012]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    paths.forEach((path, index) => {
      if (!path?.length) return;
      ctx.beginPath();
      path.forEach((node, nodeIndex) => {
        const [x, y] = this.mapPoint(node, size);
        if (nodeIndex === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = index ? "rgba(58,143,240,.62)" : "rgba(239,159,23,.82)";
      ctx.lineWidth = size * .009;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.stroke();
    });
    ctx.restore();
  }

  drawPieces(ctx, size, selection = {}) {
    const hidden = new Set(this.animation?.pieceIds ?? []);
    const groups = new Map();
    for (const player of this.game.players) {
      for (const piece of player.pieces) {
        if (piece.hiddenOnline || !piece.node || [WAIT, HOME].includes(piece.node) || hidden.has(piece.id) || !this.isPieceVisible(player, piece)) continue;
        const key = `${player.id}:${piece.node}:${piece.stackId || "legacy"}`;
        if (!groups.has(key)) groups.set(key, { player, node: piece.node, pieces: [] });
        groups.get(key).pieces.push(piece);
      }
    }
    const groupsByNode = new Map();
    for (const group of groups.values()) {
      if (!groupsByNode.has(group.node)) groupsByNode.set(group.node, []);
      groupsByNode.get(group.node).push(group);
    }
    for (const [node, nodeGroups] of groupsByNode) {
      const [baseX, baseY] = this.mapPoint(node, size);
      nodeGroups.forEach((group, index) => {
        const angle = nodeGroups.length > 1 ? (Math.PI * 2 * index) / nodeGroups.length : 0;
        const offset = nodeGroups.length > 1 ? size * 0.018 : 0;
        this.drawToken(
          ctx,
          baseX + Math.cos(angle) * offset,
          baseY + Math.sin(angle) * offset,
          size,
          group.player.color,
          group.pieces.length,
          false,
          group.pieces.map((piece) => piece.type),
          group.pieces.some((piece) => piece.effects?.some((effect) => effect.type === "shield")),
          group.pieces,
          group.pieces.some((piece) => piece.id === selection.selectedPieceId),
        );
      });
    }
  }

  isPieceVisible(player, piece) {
    const fog = this.game.boardState?.fog;
    const viewer = this.game.players.find((candidate) => candidate.id === this.game.onlineViewerPlayerId) || this.game.currentPlayer;
    if (!fog || fog.turnsRemaining < 1 || viewer.id === fog.ownerId || player.id === viewer.id) return true;
    const nearby = new Set(viewer.pieces.filter((candidate) => ![WAIT, HOME].includes(candidate.node)).flatMap((candidate) => [
      candidate.node,
      ...EDGES.filter(([from, to]) => from === candidate.node || to === candidate.node).flat(),
    ]));
    return nearby.has(piece.node);
  }

  drawBoardObjects(ctx, size) {
    const objects = [...(this.game.boardState?.markers || [])];
    if (this.game.boardState?.reaper) objects.push({ type: "reaper", node: this.game.boardState.reaper.node });
    for (const object of objects) {
      if (!object.node || !NODES[object.node]) continue;
      const [x, y] = this.mapPoint(object.node, size);
      const icon = { poop: "💩", sharpshooter: "⌖", campfire: "🔥", reaper: "☠", trap: "⚠", reward: "🎁", garlic: "🧄", assassin: "🗡" }[object.type] || "✦";
      ctx.save();
      const pulse = 1 + Math.sin((this.fxPhase + x) * .32) * .08;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.029 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = object.type === "sharpshooter" ? "rgba(237,57,65,.18)" : object.type === "reaper" ? "rgba(36,21,48,.55)" : "rgba(255,255,255,.86)";
      ctx.shadowColor = object.type === "campfire" ? "#ff7a1a" : object.type === "reaper" ? "#6d31a0" : "rgba(70,50,20,.28)";
      ctx.shadowBlur = object.type === "campfire" || object.type === "reaper" ? 18 : 7;
      ctx.fill();
      if (object.type === "sharpshooter") {
        ctx.strokeStyle = "#e64145";
        ctx.lineWidth = size * .004;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - size * .04, y); ctx.lineTo(x + size * .04, y);
        ctx.moveTo(x, y - size * .04); ctx.lineTo(x, y + size * .04);
        ctx.stroke();
      }
      ctx.shadowColor = "transparent";
      ctx.font = `${size * 0.036}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, x, y);
      ctx.restore();
    }
    const fog = this.game.boardState?.fog;
    if (fog?.turnsRemaining > 0 && this.game.currentPlayer.id !== fog.ownerId) {
      ctx.save();
      const mist = ctx.createRadialGradient(size * .5, size * .5, size * .16, size * .5, size * .5, size * .7);
      mist.addColorStop(0, "rgba(235,240,237,.12)");
      mist.addColorStop(.65, "rgba(218,226,223,.48)");
      mist.addColorStop(1, "rgba(196,207,204,.70)");
      ctx.fillStyle = mist;
      ctx.fillRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92);
      ctx.restore();
    }
  }

  drawMovingPiece(ctx, size, animation) {
    const [x, y] = this.mapPoint(animation.position, size);
    this.drawToken(ctx, x, y, size, animation.color, animation.pieceIds.length, true);
  }

  drawToken(ctx, x, y, size, color, count = 1, moving = false, types = [], shielded = false, pieces = [], selected = false) {
    const radius = size * 0.031;
    ctx.save();
    if (selected) {
      ctx.beginPath();
      ctx.arc(x, y, radius * (1.55 + Math.sin(this.fxPhase * .35) * .08), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,190,32,.22)";
      ctx.fill();
      ctx.strokeStyle = "#ffb719";
      ctx.lineWidth = size * .006;
      ctx.stroke();
    }
    const specialType = types.find((type) => type && type !== "normal");
    if (["zombie", "zealot", "queen"].includes(specialType)) {
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.32, 0, Math.PI * 2);
      ctx.strokeStyle = specialType === "zombie" ? "rgba(124,51,174,.72)" : specialType === "zealot" ? "rgba(96,76,206,.65)" : "rgba(250,187,38,.75)";
      ctx.lineWidth = size * .004;
      ctx.setLineDash([size * .007, size * .006]);
      ctx.lineDashOffset = -this.fxPhase;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.shadowColor = moving ? "rgba(255, 174, 30, .55)" : "rgba(37, 31, 22, .26)";
    ctx.shadowBlur = moving ? 18 : 8;
    ctx.shadowOffsetY = moving ? 0 : 4;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const tokenFill = ctx.createRadialGradient(x - radius * .35, y - radius * .45, radius * .1, x, y, radius);
    tokenFill.addColorStop(0, "#fff");
    tokenFill.addColorStop(.16, COLORS[color]);
    tokenFill.addColorStop(.72, COLORS[color]);
    tokenFill.addColorStop(1, "rgba(25,20,18,.58)");
    ctx.fillStyle = tokenFill;
    ctx.fill();
    ctx.strokeStyle = "#fffdf7";
    ctx.lineWidth = size * 0.008;
    ctx.stroke();
    if (shielded) {
      const shield = ctx.createRadialGradient(x - radius * .4, y - radius * .5, 0, x, y, radius * 1.55);
      shield.addColorStop(0, "rgba(255,255,255,.45)");
      shield.addColorStop(.58, "rgba(81,193,255,.12)");
      shield.addColorStop(1, "rgba(57,157,239,.30)");
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.42, 0, Math.PI * 2);
      ctx.fillStyle = shield;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.38, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(78, 190, 255, .82)";
      ctx.lineWidth = size * 0.006;
      ctx.stroke();
    }
    ctx.shadowColor = "transparent";
    ctx.beginPath();
    ctx.arc(x - radius * 0.25, y - radius * 0.28, radius * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.42)";
    ctx.fill();
    if (count > 1) {
      ctx.beginPath();
      ctx.arc(x + radius * 0.72, y - radius * 0.72, radius * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = "#25231f";
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = `800 ${radius * 0.72}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(count), x + radius * 0.72, y - radius * 0.69);
    }
    if (specialType) {
      const marker = { goblin: "🔥", vanguard: "⚑", zombie: "☣", cannon: "砲", pawn: "♟", kim: "☂", queen: "♛", monster: "👹", star: "★", zealot: "🔮", pelican: "🦤", marathoner: "🏃" }[specialType] || "✦";
      ctx.fillStyle = specialType === "zombie" ? "#6d29a8" : "#24231f";
      ctx.font = `900 ${radius * 0.9}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(marker, x, y + radius * 0.08);
    }
    const bomb = pieces.flatMap((piece) => piece.effects || []).find((effect) => effect.type === "bomb");
    const special = pieces.find((piece) => piece.special)?.special;
    let status = "";
    if (bomb) status = `💣${Math.max(0, bomb.explodeRound - this.game.round)}`;
    else if (specialType === "queen") status = `♥${special?.lives ?? 1}`;
    else if (specialType === "kim") status = `⌛${special?.remainingTurns ?? 0}`;
    else if (specialType === "monster") status = `${special?.captures ?? 0}/${special?.target ?? 12}`;
    else if (specialType === "star") status = `${pieces.reduce((sum, piece) => sum + (piece.special?.starLevel || 0), 0)}★`;
    else if (specialType === "pelican" && special?.swallowed?.length) status = `🪶${special.swallowed.length}`;
    if (status) {
      ctx.font = `800 ${radius * 0.48}px system-ui`;
      ctx.fillStyle = "#1f201d";
      ctx.textAlign = "center";
      ctx.fillText(status, x, y + radius * 1.55);
    }
    ctx.restore();
  }

  hitTest(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const size = Math.min(width, height);
    const offsetX = (width - size) / 2;
    const offsetY = (height - size) / 2;
    const x = clientX - rect.left - offsetX;
    const y = clientY - rect.top - offsetY;
    let closest = null;
    let closestDistance = Infinity;
    for (const id of Object.keys(NODES)) {
      const [nodeX, nodeY] = this.mapPoint(id, size);
      const value = Math.hypot(x - nodeX, y - nodeY);
      if (value < closestDistance) { closest = id; closestDistance = value; }
    }
    return closestDistance <= Math.max(24, size * .045) ? closest : null;
  }

  setHoveredNode(node) {
    if (this.hoveredNode === node) return;
    this.hoveredNode = node;
    this.draw();
  }

  animateMove(event, speed = 1) {
    const points = [event.from, ...event.pathNodes].filter(Boolean);
    if (points.length < 2 || event.from === WAIT) points.unshift([1.02, 1.02]);
    const duration = Math.max(110, 260 / speed);
    return new Promise((resolve) => {
      let segment = 0;
      const runSegment = () => {
        if (segment >= points.length - 1) {
          this.animation = null;
          this.draw();
          resolve();
          return;
        }
        const from = Array.isArray(points[segment]) ? points[segment] : nodePoint(points[segment]);
        const to = Array.isArray(points[segment + 1]) ? points[segment + 1] : nodePoint(points[segment + 1]);
        const started = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - started) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          this.animation = {
            pieceIds: event.movingIds,
            color: event.color,
            position: [from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased],
          };
          this.draw();
          if (t < 1) requestAnimationFrame(tick);
          else {
            segment += 1;
            runSegment();
          }
        };
        requestAnimationFrame(tick);
      };
      runSegment();
    });
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }
}

export { COLORS };
