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
			netRate: 0,
			netTrend: 0,
			netSlow: 0,
			netMean: 0,
			// the smoothing window the player reads: one flow, three windows on it
			smoothS: C.SMOOTH_DEFAULT_S,
			history: new Float64Array(C.HISTORY_N),
			historyStep: C.SMOOTH_DEFAULT_S / C.HISTORY_DIV,
			historyClock: 0,
			historyCount: 0,
			historyHead: 0
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
		sim.netMean = 0;
		sim.netTrend = 0;
		Sim.refreshCapex(sim);
		sim.history.fill(0);
		sim.historyCount = 0;
		sim.historyHead = 0;
		sim.historyClock = 0;
	};

	// capex is amortised, so only a build change moves it; never per step
	Sim.refreshCapex = function (sim) {
		var trains = sim.trains;
		var capex = 0;
		var i;

		for (i = 0; i < trains.length; i += 1) capex += trains[i].capexRate;
		sim.capexRate = capex;
		sim.netRate = sim.profitRate - capex;
		sim.netMean = sim.profitRate - capex;
		// the slow window is re-anchored too, so a rebuild is not read as a trend
		sim.netSlow = sim.profitRate - capex;
		sim.netTrend = 0;
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

	// Three windows on one flow, because three readers want three things: NET/S is the
	// ticker the player set the smoothing of, the slow one behind it says whether the
	// ticker is climbing or falling, and the long one is a rate a swept dot can be
	// compared to. The first two follow the smoothing slider, the last one does not.
	function updateProfit(sim, dt) {
		var trains = sim.trains;
		var cash = 0;
		var rate;
		var i;

		for (i = 0; i < trains.length; i += 1) cash += trains[i].cash;
		rate = (cash - sim.cashSeen) / dt;
		sim.cashSeen = cash;
		sim.profitRate += (rate - sim.profitRate) * (dt / sim.smoothS);
		sim.netRate = sim.profitRate - sim.capexRate;
		sim.netSlow += (rate - sim.capexRate - sim.netSlow) * (dt / (sim.smoothS * C.TREND_SLOW));
		sim.netTrend = sim.netRate - sim.netSlow;
		sim.netMean += (rate - sim.capexRate - sim.netMean) * (dt / C.NET_MEAN_S);
		Sim.sampleHistory(sim, dt);
	}

	// one sparkline sample per historyStep sim seconds. the caller sets that step, so a
	// 50 s frame in MAX mode cannot flood a window meant to hold hours of trade
	Sim.sampleHistory = function (sim, dt) {
		sim.historyClock += dt;
		if (sim.historyClock < sim.historyStep) return;

		sim.historyClock = 0;
		sim.history[sim.historyHead] = sim.netRate;
		sim.historyHead = (sim.historyHead + 1) % C.HISTORY_N;
		if (sim.historyCount < C.HISTORY_N) sim.historyCount += 1;
	};

	// The caller owns the clock and reports how much sim time its last frame was. The
	// sparkline follows the smoothing the player chose, but a frame this big must not
	// flood a window meant to hold hours of trade.
	Sim.setFrameSeconds = function (sim, seconds) {
		sim.historyStep = Math.max(sim.smoothS / C.HISTORY_DIV, seconds / C.HISTORY_PER_FRAME);
	};

	// the smoothing window is the player's: it sets how lumpy NET/S is allowed to be,
	// and the trend window and the sparkline step follow it
	Sim.setSmooth = function (sim, seconds) {
		if (!Number.isFinite(seconds)) return;
		sim.smoothS = Math.max(C.SMOOTH_MIN_S, Math.min(C.SMOOTH_MAX_S, seconds));
		sim.historyStep = sim.smoothS / C.HISTORY_DIV;
	};


	Sim.step = function (sim, dt) {
		var trains = sim.trains;
		var i;

		sim.steps += 1;
		sim.time = sim.steps * dt;
		RR.Economy.tick(sim.world, dt);
		for (i = 0; i < trains.length; i += 1) RR.Train.step(trains[i], sim.world, dt);
		// after the transfers, so a frame never shows a yard one step behind its cargo
		RR.Economy.refreshPrices(sim.world);
		updateProfit(sim, dt);
	};

	RR.Sim = Sim;

	if (typeof module !== "undefined" && module.exports) module.exports = Sim;
})(globalThis);
