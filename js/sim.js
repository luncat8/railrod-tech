(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var Sim = RR.Sim || {};

	Sim.create = function (seed) {
		var value = RR.Rng.normalizeSeed(seed);
		var sim = {
			seed: value,
			rng: RR.Rng.create(value),
			steps: 0,
			time: 0,
			world: null,
			train: { x: 0, v: RR.Const.TRAIN_V }
		};

		Sim.reset(sim, value);
		return sim;
	};

	Sim.reset = function (sim, seed) {
		var value = RR.Rng.normalizeSeed(seed);

		sim.seed = value;
		RR.Rng.seed(sim.rng, value);
		sim.steps = 0;
		sim.time = 0;
		sim.world = RR.World.generate(sim.rng);
		RR.Economy.refreshPrices(sim.world);
		sim.train.x = sim.world.x[0];
		sim.train.v = RR.Const.TRAIN_V;
	};

	Sim.step = function (sim, dt) {
		sim.steps += 1;
		sim.time = sim.steps * dt;
		RR.Economy.tick(sim.world, dt);
		// placeholder kinematics: constant visual speed, wraps at the seam
		sim.train.x = RR.World.wrap(sim.train.x + sim.train.v * dt);
	};

	RR.Sim = Sim;

	if (typeof module !== "undefined" && module.exports) module.exports = Sim;
})(globalThis);
