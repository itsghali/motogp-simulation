class Drone extends Vehicle {
  constructor(genome, id, random) {
    super(genome); this.id = id; this.maxspeed = 1.8; this.maxforce = 0.055;
    this.pos.set(100 + random.next() * 720, 100 + random.next() * 520);
    const angle = random.next() * Math.PI * 2; this.vel = p5.Vector.fromAngle(angle).setMag(1.2);
    this.heading = angle;
  }
  step(force) {
    this.applyForce(force.copy().limit(this.maxforce)); super.update();
    if (this.vel.mag() > 1e-6) this.heading = this.vel.heading();
  }
  snapshot() { return { id: this.id, x: this.pos.x, y: this.pos.y, heading: this.heading }; }
  show(snapshot = this.snapshot(), time = 0) {
    push(); translate(snapshot.x, snapshot.y); rotate(snapshot.heading);
    stroke("#bddce8"); strokeWeight(1.3); line(-5, -5, 5, 5); line(-5, 5, 5, -5);
    fill("#244552"); ellipse(0, 0, 6, 4);
    for (const x of [-5, 5]) for (const y of [-5, 5]) {
      noFill(); stroke("#91d9e7"); ellipse(x, y, 5, 5);
      const phase = time * 0.08 + this.id;
      line(x - Math.cos(phase) * 2, y - Math.sin(phase) * 2, x + Math.cos(phase) * 2, y + Math.sin(phase) * 2);
    }
    pop();
  }
}
