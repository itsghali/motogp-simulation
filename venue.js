// A single static scene entity. Decorations never enter the perception wall list.
class Venue extends Vehicle {
  constructor(genome) {
    super(genome);
    this.layer = document.createElement("canvas"); this.layer.width = 920; this.layer.height = 720;
    this.crowdLayer = document.createElement("canvas"); this.crowdLayer.width = 920; this.crowdLayer.height = 720;
    this.build();
  }
  build() {
    const ctx = this.layer.getContext("2d");
    const crowd = this.crowdLayer.getContext("2d");
    ctx.fillStyle = "#647353"; ctx.fillRect(0, 0, 920, 720);
    ctx.fillStyle = "#788365";
    for (let i = 0; i < 280; i++) ctx.fillRect((i * 173) % 920, (i * 83) % 720, 2, 2);
    const label = (text, x, y, size = 10, color = "#ecf3db") => { ctx.fillStyle = color; ctx.font = `bold ${size}px system-ui`; ctx.fillText(text, x, y); };
    // Run-off, service roads, pit buildings, paddock and fictional branding.
    ctx.strokeStyle = "#929282"; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(848, 125); ctx.lineTo(848, 565); ctx.lineTo(780, 645); ctx.stroke();
    ctx.fillStyle = "#b1a58a"; ctx.fillRect(777, 335, 49, 162);
    ctx.fillStyle = "#525e64"; ctx.fillRect(804, 343, 10, 147);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = ["#e1554c", "#3f8fca", "#ead66a"][i % 3]; ctx.fillRect(815, 338 + i * 13, 12, 10);
      ctx.fillStyle = "#202f36"; ctx.fillRect(817, 340 + i * 13, 8, 6);
    }
    label("PIT LANE", 782, 328, 8); label("NEURAL GP", 808, 514, 9);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = ["#d7ded8", "#b84c47", "#3a759c"][i % 3]; ctx.fillRect(865, 160 + i * 34, 27, 22);
      ctx.fillStyle = "#25333a"; ctx.fillRect(866, 177 + i * 34, 25, 3);
    }
    ctx.fillStyle = "#c6d5cf"; ctx.fillRect(803, 276, 28, 38); ctx.fillStyle = "#304851"; ctx.fillRect(800, 275, 34, 13);
    label("RACE CONTROL", 782, 267, 8);
    ctx.fillStyle = "#e9ece4"; ctx.fillRect(861, 540, 27, 12); ctx.fillStyle = "#e44040"; ctx.fillRect(872, 541, 4, 10); ctx.fillRect(868, 544, 12, 4);
    const stands = [[610, 650, 160, 33], [48, 210, 36, 140], [430, 24, 200, 27], [100, 584, 145, 34], [334, 302, 48, 20]];
    stands.forEach(([x, y, w, h], index) => {
      ctx.fillStyle = "#2e4148"; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
      ctx.fillStyle = index % 2 ? "#a9b5ae" : "#70848a"; ctx.fillRect(x, y, w, h);
      for (let row = 0; row < h - 3; row += 5) for (let col = 0; col < w - 3; col += 5) {
        crowd.fillStyle = ["#f1cf81", "#bd544d", "#98bac9", "#e5dfca", "#2d363a"][(row * 3 + col * 7 + index) % 5];
        crowd.fillRect(x + col + 1, y + row + 1, 3, 3);
      }
      if (index % 2 === 0) { ctx.fillStyle = "#30424b"; ctx.fillRect(x - 5, y - 8, w + 10, 5); }
    });
    label("JEREZ · GENETIC RACING", 325, 690, 14);
    label("FAN ZONE", 82, 650, 10);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = ["#e3984f", "#61aa9d", "#d4c379"][i % 3];
      ctx.beginPath(); ctx.moveTo(77 + i * 30, 669); ctx.lineTo(89 + i * 30, 654); ctx.lineTo(101 + i * 30, 669); ctx.fill();
    }
    for (const [x, y] of [[100, 180], [575, 625], [740, 95], [248, 410]]) {
      ctx.fillStyle = "#f99734"; ctx.fillRect(x, y, 5, 8); ctx.fillStyle = "#d8d8c0"; ctx.fillRect(x, y - 3, 5, 3);
      ctx.strokeStyle = "#ccd7be"; ctx.lineWidth = 1; ctx.strokeRect(x - 4, y - 7, 15, 19);
    }
    for (const [x, y] of [[160, 80], [530, 605]]) {
      ctx.fillStyle = "#17252f"; ctx.fillRect(x, y, 72, 29); ctx.fillStyle = "#4c7180"; ctx.fillRect(x + 32, y + 29, 8, 16);
      label("NEURAL GP", x + 7, y + 18, 10, "#78dfb2");
    }
    [200, 150, 100, 50].forEach((n, i) => { ctx.fillStyle = "#f0efe1"; ctx.fillRect(686 + i * 13, 320, 22, 11); label(String(n), 687 + i * 13, 328, 7, "#233139"); });
  }
  show(showCrowd = true) { drawingContext.drawImage(this.layer, 0, 0); if (showCrowd) drawingContext.drawImage(this.crowdLayer, 0, 0); }
  prepareTrack(circuit) {
    const key = `${circuit.trackWidth}:${circuit.totalPixels}`;
    if (this.trackKey === key) return;
    this.trackKey = key;
    if (!this.runoffLayer) {
      this.runoffLayer = document.createElement("canvas"); this.kerbLayer = document.createElement("canvas");
      for (const layer of [this.runoffLayer, this.kerbLayer]) { layer.width = 920; layer.height = 720; }
    }
    const under = this.runoffLayer.getContext("2d"); const over = this.kerbLayer.getContext("2d");
    under.clearRect(0, 0, 920, 720); over.clearRect(0, 0, 920, 720);
    const path = (ctx, points) => { ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); };
    for (const points of [circuit.inner, circuit.outer]) {
      path(under, points); under.strokeStyle = "#bca98b"; under.lineWidth = 18; under.stroke();
      path(over, points); over.strokeStyle = "#f6f2e8"; over.lineWidth = 4; over.setLineDash([]); over.stroke();
      over.strokeStyle = "#dc333c"; over.setLineDash([9, 9]); over.stroke(); over.setLineDash([]);
    }
  }
  showTrackUnderlay(circuit) { this.prepareTrack(circuit); drawingContext.drawImage(this.runoffLayer, 0, 0); }
  showTrackEdges(circuit) { this.prepareTrack(circuit); drawingContext.drawImage(this.kerbLayer, 0, 0); }
  showActivity(race, time, settings) {
    const ctx = drawingContext; const start = race.circuit.checkpoints[0].center;
    ctx.save();
    if (["GRID", "INTRO"].includes(race.phase)) {
      ctx.globalAlpha = race.phase === "GRID" ? Math.max(0, 1 - race.phaseTime / race.timing.grid) : 1;
      race.population.forEach(bike => {
        ctx.fillStyle = "#e7e8d8"; ctx.fillRect(bike.pos.x - 10, bike.pos.y - 5, 4, 6);
        ctx.fillStyle = `hsl(${bike.id * 63},60%,60%)`; ctx.beginPath(); ctx.arc(bike.pos.x - 11, bike.pos.y - 7, 7, 0, Math.PI * 2); ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
    if (settings.crowd) {
      for (let i = 0; i < 8; i++) {
        const x = 610 + i * 20; const y = 642;
        ctx.strokeStyle = "#e8ddaf"; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 13); ctx.stroke();
        ctx.fillStyle = i % 2 ? "#e34c46" : "#f2c960";
        const wave = settings.reduced ? 0 : Math.sin(time / 350 + i) * 2;
        ctx.fillRect(x, y - 13 + wave, 9, 5);
      }
    }
    const flag = race.flags.flag;
    ctx.fillStyle = { GREEN: "#62e99c", YELLOW: "#ffe269", RED: "#f35c56", CHEQUERED: "#fff" }[flag];
    ctx.fillRect(start.x + 34, start.y - 15, 18, 12);
    if (flag === "CHEQUERED") for (let i = 0; i < 6; i++) {
      ctx.fillStyle = "#141b23"; ctx.fillRect(start.x + 34 + (i % 3) * 6, start.y - 15 + Math.floor(i / 3) * 6, 3, 3);
    }
    ctx.restore();
  }
}
