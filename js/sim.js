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
			trains: null
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
		// array shape reserved for the 0.2 competitor trains; one train today
		if (!sim.trains) sim.trains = [RR.Train.create()];
		RR.Train.reset(sim.trains[0], sim.world);
	};

	Sim.step = function (sim, dt) {
		var trains = sim.trains;
		var i;

		sim.steps += 1;
		sim.time = sim.steps * dt;
		RR.Economy.tick(sim.world, dt);
		for (i = 0; i < trains.length; i += 1) RR.Train.step(trains[i], sim.world, dt);
	};

	RR.Sim = Sim;

	if (typeof module !== "undefined" && module.exports) module.exports = Sim;
})(globalThis);
