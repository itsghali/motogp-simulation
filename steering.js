(function (root) {
  function limitVector(vector, maxForce) {
    const magnitude = Math.hypot(vector.x, vector.y);
    if (magnitude <= maxForce || magnitude === 0) return { x: vector.x, y: vector.y };
    return { x: vector.x / magnitude * maxForce, y: vector.y / magnitude * maxForce };
  }

  function computeSteeringForce(currentVelocity, desiredVelocity, maxForce) {
    return limitVector({
      x: desiredVelocity.x - currentVelocity.x,
      y: desiredVelocity.y - currentVelocity.y
    }, maxForce);
  }

  function buildDecisionFromOutput(genome, inputs, output) {
    const traits = genome.traits;
    const left = (inputs[0] + inputs[1] + inputs[2]) / 3;
    const right = (inputs[4] + inputs[5] + inputs[6]) / 3;
    const forwardDanger = inputs[3];
    const correction = (left - right) * traits.trackCorrection;
    const learnedTurn = output[0] * (0.3 + traits.direction * 0.7);
    const cornerTurn = correction * (0.4 + traits.cornerSensitivity * 0.9);
    const steering = Math.max(-1, Math.min(1, learnedTurn + cornerTurn));
    const caution = Math.max(forwardDanger, Math.abs(left - right) * traits.cornerSensitivity);
    const learnedThrottle = (output[1] + 1) / 2;
    const targetThrottle = learnedThrottle * (0.35 + traits.aggressiveness * 0.65);
    const braking = Math.max(0, caution - (0.72 - traits.braking * 0.42));
    const throttle = Math.max(0, Math.min(1, targetThrottle * traits.acceleration - braking * (0.6 + traits.braking)));
    return { steering, throttle, braking };
  }

  function buildDecision(genome, inputs) {
    return buildDecisionFromOutput(genome, inputs, genome.predict(inputs));
  }

  const api = { SteeringController: { limitVector, computeSteeringForce, buildDecision, buildDecisionFromOutput } };
  Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
