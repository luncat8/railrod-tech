(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var Sim = RR.Sim || {};

	Sim.create = function (seed) {
		var value = RR.Rng.normalizeSeed(seed);

		return {
			seed: value,
			rng: RR.Rng.create(value),
			steps: 0,
			time: 0
		};
	};

	Sim.reset = function (sim, seed) {
		var value = RR.Rng.normalizeSeed(seed);

		sim.seed = value;
		RR.Rng.seed(sim.rng, value);
		sim.steps = 0;
		sim.time = 0;
	};

	Sim.step = function (sim, dt) {
		sim.steps += 1;
		sim.time = sim.steps * dt;
	};

	RR.Sim = Sim;

	if (typeof module !== "undefined" && module.exports) module.exports = Sim;
})(globalThis);
