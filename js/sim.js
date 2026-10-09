(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var Sim = RR.Sim || {};

	Sim.create = function (seed) {
		var value = RR.Rng.normalizeSeed(seed);
		var sim = {
			seed: value,
			rng: RR.Rng.create(value),
			steps: 0,
			time: 0,
			world: null,
			knobs: RR.Tech.defaultKnobs(),
			trains: null,
			cashSeen: 0,
			profitRate: 0,
			capexRate: 0,
			netRate: 0
		};

		Sim.reset(sim, value);
		return sim;
	};

	// the build survives a new world: the player's configuration is not part of the seed
	Sim.reset = function (sim, seed) {
		var value = RR.Rng.normalizeSeed(seed);

		sim.seed = value;
		RR.Rng.seed(sim.rng, value);
		sim.steps = 0;
		sim.time = 0;
		sim.world = RR.World.generate(sim.rng);
		RR.Economy.refreshPrices(sim.world);
		// array shape reserved for the 0.2 competitor trains; one train today
		if (!sim.trains) sim.trains = [RR.Train.create(RR.Tech.derive(sim.knobs), C.WAGON_DEFAULT)];
		RR.Train.reset(sim.trains[0], sim.world);
		sim.cashSeen = 0;
		sim.profitRate = 0;
		Sim.refreshCapex(sim);
	};

	// capex is amortised, so only a build change moves it; never per step
	Sim.refreshCapex = function (sim) {
		var trains = sim.trains;
		var capex = 0;
		var i;

		for (i = 0; i < trains.length; i += 1) capex += trains[i].capexRate;
		sim.capexRate = capex;
		sim.netRate = sim.profitRate - capex;
	};

	Sim.setKnob = function (sim, slot, value) {
		var build;
		var i;

		sim.knobs[slot] = RR.Tech.clampKnob(value);
		build = RR.Tech.derive(sim.knobs);
		for (i = 0; i < sim.trains.length; i += 1) RR.Train.setBuild(sim.trains[i], build);
		Sim.refreshCapex(sim);
	};

	Sim.setWagons = function (sim, count) {
		var i;

		for (i = 0; i < sim.trains.length; i += 1) RR.Train.setWagons(sim.trains[i], count);
		Sim.refreshCapex(sim);
	};

	// profit rate: EMA of the trains' cash flow per second, over PROFIT_TAU_S
	function updateProfit(sim, dt) {
		var trains = sim.trains;
		var cash = 0;
		var flow;
		var i;

		for (i = 0; i < trains.length; i += 1) cash += trains[i].cash;
		flow = cash - sim.cashSeen;
		sim.cashSeen = cash;
		sim.profitRate += (flow / dt - sim.profitRate) * (dt / C.PROFIT_TAU_S);
		sim.netRate = sim.profitRate - sim.capexRate;
	}

	Sim.step = function (sim, dt) {
		var trains = sim.trains;
		var i;

		sim.steps += 1;
		sim.time = sim.steps * dt;
		RR.Economy.tick(sim.world, dt);
		for (i = 0; i < trains.length; i += 1) RR.Train.step(trains[i], sim.world, dt);
		updateProfit(sim, dt);
	};

	RR.Sim = Sim;

	if (typeof module !== "undefined" && module.exports) module.exports = Sim;
})(globalThis);
