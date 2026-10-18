// Visual reconstruction only. Never writes back into the live population.
class ReplayMotorcycle extends Motorcycle {
  displaySnapshot(snapshot, selected = false) {
    this.pos.set(snapshot.x, snapshot.y); this.vel.set(0, 0); this.heading = snapshot.heading;
    this.sensorReadings = snapshot.sensors.slice();
    this.show(false, selected);
  }
}
