(function (root) {
  function at(circuit, position, fallbackHeading = 0, lookaheadDist = 0) {
    if (circuit?.nearestProjection && circuit.centerline?.length > 1) {
      const projection = circuit.nearestProjection(position);
      if (Number.isInteger(projection?.segment) && projection.segment >= 0 && projection.segment < circuit.centerline.length) {
        let seg = projection.segment;
        if (lookaheadDist > 0 && circuit.cumulative && circuit.totalPixels) {
          const targetProg = (projection.progressPixels + lookaheadDist) % circuit.totalPixels;
          for (let i = 0; i < circuit.segmentLengths.length; i++) {
            if (circuit.cumulative[i + 1] >= targetProg) { seg = i; break; }
          }
        }
        const start = circuit.centerline[seg];
        for (let offset = 1; offset < circuit.centerline.length; offset++) {
          const end = circuit.centerline[(seg + offset) % circuit.centerline.length];
          const forward = createVector(end.x - start.x, end.y - start.y);
          if (Number.isFinite(forward.x) && Number.isFinite(forward.y) && forward.mag() > 1e-9) {
            forward.normalize();
            return { forward, normal: createVector(-forward.y, forward.x), segment: seg };
          }
        }
      }
    }
    const forward = createVector(Math.cos(fallbackHeading), Math.sin(fallbackHeading));
    return { forward, normal: createVector(-forward.y, forward.x), segment: null };
  }
  function projectDesired(desired, frame, maxSpeed) {
    const forwardSpeed = Math.max(0, desired.x * frame.forward.x + desired.y * frame.forward.y);
    const lateralSpeed = desired.x * frame.normal.x + desired.y * frame.normal.y;
    return createVector(frame.forward.x * forwardSpeed + frame.normal.x * lateralSpeed,
      frame.forward.y * forwardSpeed + frame.normal.y * lateralSpeed).limit(maxSpeed);
  }
  root.RaceTrackFrame = { at, projectDesired };
})(typeof globalThis !== "undefined" ? globalThis : this);
