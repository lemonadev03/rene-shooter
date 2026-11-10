// @ts-check
/**
 * Structural subset of THREE.Vector3 that VectorSpring needs.
 * @typedef {{ x: number, y: number, z: number, clone: () => SpringVector,
 * set: (x: number, y: number, z: number) => SpringVector,
 * copy: (other: SpringVector) => SpringVector }} SpringVector
 */

// Exact solution of x'' + damping*x' + stiffness*(x-target) = 0 (unit mass).
/**
 * @param {number} dt
 * @param {number} stiffness
 * @param {number} damping
 * @returns {[number, number, number, number]}
 */
function coefficients(dt, stiffness, damping) {
  const a = damping * 0.5;
  const discriminant = a * a - stiffness;
  let c, s;
  if (Math.abs(discriminant) < 1e-8) {
    const decay = Math.exp(-a * dt);
    c = decay;
    s = dt * decay;
  } else if (discriminant < 0) {
    const w = Math.sqrt(-discriminant), decay = Math.exp(-a * dt);
    c = decay * Math.cos(w * dt);
    s = decay * Math.sin(w * dt) / w;
  } else {
    const w = Math.sqrt(discriminant);
    const slow = Math.exp((-a + w) * dt), fast = Math.exp((-a - w) * dt);
    c = (slow + fast) * 0.5;
    s = (slow - fast) / (2 * w);
  }
  return [c + a * s, s, -stiffness * s, c - a * s];
}

export class ScalarSpring {
  constructor(value = 0, { stiffness = 900, damping = 60 } = {}) {
    this.value = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
  }
  reset(value = 0) {
    this.value = value;
    this.velocity = 0;
    return this;
  }
  /**
   * @param {number} dt
   * @param {number} [target]
   */
  update(dt, target = 0) {
    if (dt <= 0) return this.value;
    const [xx, xv, vx, vv] = coefficients(dt, this.stiffness, this.damping);
    const offset = this.value - target, velocity = this.velocity;
    this.value = target + offset * xx + velocity * xv;
    this.velocity = offset * vx + velocity * vv;
    return this.value;
  }
}

// Accepts a THREE.Vector3 without importing Three, for direct Node checks too.
export class VectorSpring {
  /** @param {SpringVector} value */
  constructor(value, { stiffness = 900, damping = 60 } = {}) {
    this.value = value.clone();
    this.velocity = value.clone().set(0, 0, 0);
    this.stiffness = stiffness;
    this.damping = damping;
  }
  /** @param {SpringVector} [value] */
  reset(value) {
    if (value) this.value.copy(value);
    else this.value.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    return this;
  }
  /**
   * @param {number} dt
   * @param {SpringVector} [target]
   */
  update(dt, target) {
    if (dt <= 0) return this.value;
    const [xx, xv, vx, vv] = coefficients(dt, this.stiffness, this.damping);
    for (const axis of /** @type {const} */ (["x", "y", "z"])) {
      const goal = target ? target[axis] : 0;
      const offset = this.value[axis] - goal, velocity = this.velocity[axis];
      this.value[axis] = goal + offset * xx + velocity * xv;
      this.velocity[axis] = offset * vx + velocity * vv;
    }
    return this.value;
  }
}
