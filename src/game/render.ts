import { CANNON_Y, CHARGE_MAX, DEFENSE_Y, GATE_H, H, W, type Game, type Unit } from "./engine";

export const CHAMP_BTN = { x: W - 40, y: CANNON_Y + 4, r: 26 };

const C = {
  ground: "#f3e3c3",
  groundDark: "#ead5ab",
  crew: "#ff6a33",
  crewDark: "#c4421a",
  foe: "#6b4ad6",
  foeDark: "#45309a",
  gate: "rgba(22, 170, 112, 0.32)",
  gateEdge: "#13995f",
  trap: "rgba(226, 52, 52, 0.30)",
  trapEdge: "#c22a2a",
  wall: "#8a7760",
  wallTop: "#a8957c",
  ink: "#2a221b",
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function crowd(ctx: CanvasRenderingContext2D, units: Unit[], body: string, dark: string) {
  ctx.fillStyle = "rgba(60, 40, 20, 0.16)";
  ctx.beginPath();
  for (const u of units) {
    if (u.big) continue;
    ctx.moveTo(u.x + u.r, u.y + 2.5);
    ctx.ellipse(u.x, u.y + 2.5, u.r, u.r * 0.6, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  // Little people: a body with a head on top, batched into one path per colour.
  ctx.fillStyle = dark;
  ctx.beginPath();
  for (const u of units) {
    if (u.big) continue;
    ctx.moveTo(u.x + u.r * 0.85, u.y + 0.5);
    ctx.ellipse(u.x, u.y + 0.5, u.r * 0.85, u.r * 1.05, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  for (const u of units) {
    if (u.big) continue;
    ctx.moveTo(u.x + u.r * 0.6, u.y);
    ctx.ellipse(u.x, u.y, u.r * 0.6, u.r * 0.8, 0, 0, Math.PI * 2);
    const hr = u.r * 0.58;
    ctx.moveTo(u.x + hr, u.y - u.r * 1.25);
    ctx.arc(u.x, u.y - u.r * 1.25, hr, 0, Math.PI * 2);
  }
  ctx.fill();
  for (const u of units) {
    if (!u.big) continue;
    ctx.fillStyle = "rgba(60, 40, 20, 0.2)";
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + 5, u.r, u.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(u.x, u.y - 1.5, u.r * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(u.hp), u.x, u.y - 1);
  }
}

export function draw(ctx: CanvasRenderingContext2D, g: Game) {
  // Ground with lane stripes; enemy territory at the top is tinted.
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.groundDark;
  for (let x = 0; x < W; x += 60) ctx.fillRect(x, 0, 30, H);
  const top = ctx.createLinearGradient(0, 0, 0, 200);
  top.addColorStop(0, "rgba(107, 74, 214, 0.22)");
  top.addColorStop(1, "rgba(107, 74, 214, 0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 200);
  const bottom = ctx.createLinearGradient(0, H - 120, 0, H);
  bottom.addColorStop(0, "rgba(255, 106, 51, 0)");
  bottom.addColorStop(1, "rgba(255, 106, 51, 0.22)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H - 120, W, 120);

  ctx.strokeStyle = "rgba(194, 66, 26, 0.45)";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, DEFENSE_Y);
  ctx.lineTo(W, DEFENSE_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const w of g.walls) {
    ctx.fillStyle = "rgba(60, 40, 20, 0.18)";
    roundRect(ctx, w.x + 3, w.y + 4, w.w, w.h, 4);
    ctx.fill();
    ctx.fillStyle = C.wall;
    roundRect(ctx, w.x, w.y, w.w, w.h, 4);
    ctx.fill();
    ctx.fillStyle = C.wallTop;
    roundRect(ctx, w.x + 2, w.y + 2, w.w - 4, Math.min(10, w.h - 4), 3);
    ctx.fill();
  }

  for (const gt of g.gates) {
    const trap = gt.kind === "trap";
    const x = gt.cx - gt.w / 2;
    const y = gt.y - GATE_H / 2;
    ctx.fillStyle = trap ? C.trap : C.gate;
    roundRect(ctx, x, y, gt.w, GATE_H, 5);
    ctx.fill();
    if (gt.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${gt.flash * 0.45})`;
      ctx.fill();
    }
    ctx.strokeStyle = trap ? C.trapEdge : C.gateEdge;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, gt.w, GATE_H, 5);
    ctx.stroke();
    ctx.fillStyle = trap ? C.trapEdge : C.gateEdge;
    roundRect(ctx, x - 3, y - 6, 6, GATE_H + 12, 3);
    ctx.fill();
    roundRect(ctx, x + gt.w - 3, y - 6, 6, GATE_H + 12, 3);
    ctx.fill();
    ctx.font = "900 17px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    const label = trap ? "✕" : `×${gt.n ?? 2}`;
    ctx.strokeText(label, gt.cx, gt.y);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, gt.cx, gt.y);
  }

  for (const s of g.spinners) {
    const dx = Math.cos(s.angle) * s.r;
    const dy = Math.sin(s.angle) * s.r;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(60, 40, 20, 0.2)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(s.x - dx + 2, s.y - dy + 4);
    ctx.lineTo(s.x + dx + 2, s.y + dy + 4);
    ctx.stroke();
    ctx.strokeStyle = "#3a2f4c";
    ctx.beginPath();
    ctx.moveTo(s.x - dx, s.y - dy);
    ctx.lineTo(s.x + dx, s.y + dy);
    ctx.stroke();
    ctx.strokeStyle = "#e2a93a";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = "butt";
    ctx.fillStyle = "#3a2f4c";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const b of g.bases) {
    const x = b.x - b.w / 2;
    const y = b.y - b.h / 2;
    const alive = b.hp > 0;
    ctx.fillStyle = "rgba(60, 40, 20, 0.2)";
    roundRect(ctx, x + 4, y + 6, b.w, b.h, 6);
    ctx.fill();
    ctx.fillStyle = alive ? C.foeDark : "#8d8578";
    roundRect(ctx, x, y, b.w, b.h, 6);
    ctx.fill();
    ctx.fillStyle = alive ? C.foe : "#a49c8f";
    roundRect(ctx, x + 4, y + 4, b.w - 8, b.h - 14, 4);
    ctx.fill();
    if (alive) {
      // Battlements and a door.
      ctx.fillStyle = C.foeDark;
      for (let i = 0; i < 5; i++) ctx.fillRect(x + 4 + i * ((b.w - 14) / 4), y - 8, 6, 9);
      ctx.fillStyle = "#2b1d63";
      roundRect(ctx, b.x - 10, y + b.h - 22, 20, 22, 9);
      ctx.fill();
      if (b.hitFlash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${b.hitFlash * 0.35})`;
        roundRect(ctx, x, y, b.w, b.h, 6);
        ctx.fill();
      }
    }
    // Health bar
    const bw = b.w + 10;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, b.x - bw / 2, y - 22, bw, 10, 5);
    ctx.fill();
    ctx.fillStyle = "#ff4d6d";
    roundRect(ctx, b.x - bw / 2 + 1.5, y - 20.5, Math.max(0, (bw - 3) * (b.hp / b.maxHp)), 7, 3.5);
    ctx.fill();
    ctx.font = "800 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(alive ? String(Math.ceil(b.hp)) : "DESTROYED", b.x, y + b.h / 2 - 4);
  }

  crowd(ctx, g.red, C.foe, C.foeDark);
  crowd(ctx, g.blue, C.crew, C.crewDark);

  for (const p of g.pops) {
    const a = 1 - p.t / 0.8;
    if (p.text) {
      ctx.font = "900 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(0,0,0,${a * 0.4})`;
      ctx.strokeText(p.text, p.x, p.y - p.t * 40);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillText(p.text, p.x, p.y - p.t * 40);
    } else {
      ctx.strokeStyle = p.color === 0 ? `rgba(255,106,51,${a})` : p.color === 1 ? `rgba(107,74,214,${a})` : `rgba(226,52,52,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 + p.t * 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Cannon
  const cx = g.cannonX;
  ctx.fillStyle = "rgba(60, 40, 20, 0.22)";
  ctx.beginPath();
  ctx.ellipse(cx, CANNON_Y + 18, 30, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  roundRect(ctx, cx - 9, CANNON_Y - 30, 18, 30, 5);
  ctx.fill();
  ctx.fillStyle = C.crew;
  ctx.fillRect(cx - 9, CANNON_Y - 22, 18, 5);
  ctx.fillStyle = "#3b322b";
  roundRect(ctx, cx - 24, CANNON_Y - 6, 48, 22, 9);
  ctx.fill();
  ctx.fillStyle = C.crew;
  ctx.beginPath();
  ctx.arc(cx, CANNON_Y + 3, 7, 0, Math.PI * 2);
  ctx.fill();

  // Champion button: a ring that fills as you shoot.
  const { x: bx, y: by, r } = CHAMP_BTN;
  const ready = g.charge >= CHARGE_MAX;
  const pulse = ready ? 1 + Math.sin(g.t * 8) * 0.06 : 1;
  ctx.fillStyle = ready ? C.crew : "rgba(42, 34, 27, 0.75)";
  ctx.beginPath();
  ctx.arc(bx, by, r * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(bx, by, r - 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(bx, by, r - 4, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * g.charge) / CHARGE_MAX);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "900 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", bx, by + 1);

  // Crowd counter and clock
  ctx.textAlign = "left";
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.fillStyle = C.ink;
  ctx.fillText(`👥 ${g.blue.length}`, 12, H - 18);
  ctx.textAlign = "right";
  ctx.fillText(`${g.level.name} · ${Math.floor(g.t)}s`, W - 12, 18);
}
