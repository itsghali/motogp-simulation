// Stationary visible entity. Vehicle owns its state; no custom locomotion.
class Obstacle extends Vehicle {
  constructor(genome, spec) {
    super(genome);
    if (![spec.x, spec.y, spec.radius].every(Number.isFinite) || spec.radius < 2 || spec.radius > 60 || spec.x < 0 || spec.x > 920 || spec.y < 0 || spec.y > 720) throw new Error("Obstacle : x 0–920, y 0–720, rayon 2–60 px.");
    this.pos.set(spec.x, spec.y); this.radius = spec.radius;
    this.vel.set(0, 0); this.acc.set(0, 0); this.maxspeed = 0;
  }
  snapshot() { return { x: this.pos.x, y: this.pos.y, radius: this.radius }; }
  show(preview = false) {
    if (preview) {
      push(); noFill(); stroke("#fff5b6"); strokeWeight(1);
      ellipse(this.pos.x, this.pos.y, this.radius * 2);
      line(this.pos.x - 3, this.pos.y, this.pos.x + 3, this.pos.y);
      line(this.pos.x, this.pos.y - 3, this.pos.x, this.pos.y + 3);
      noStroke(); fill("#fff5b6"); textAlign(CENTER, CENTER); textSize(8);
      text("APERÇU INACTIF · PROCHAINE COURSE", this.pos.x, this.pos.y - this.radius - 8);
      pop(); return;
    }
    push(); stroke("#fff2b0"); strokeWeight(1); fill("#25323c"); ellipse(this.pos.x, this.pos.y, this.radius * 2);
    fill(preview ? "#dfce6f" : "#ec8c34"); ellipse(this.pos.x, this.pos.y, this.radius * 1.3);
    noStroke(); fill("#151e25"); ellipse(this.pos.x, this.pos.y, this.radius * 0.6);
    pop();
  }
}
