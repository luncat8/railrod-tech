(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var Sweep = RR.Sweep || {};
	// the panel's y half-range only grows: a scale that breathes with every sample
	// would make the dots jitter while a pass fills
	var Y_MIN = 0.05;

	// A headless pass over the (gauge, wheel, engine) grid. Every combo re-runs the trade
	// loop from one fixture — the live world as it stands, copied once — and from the same
	// parked start, so the samples are comparable and no combo pays for a warm-up. The
	// page drives it on a per-frame step budget and re-arms it once the market has gone
	// through a cycle; a node experiment calls it as fast as the loop allows. Nothing
	// here touches the sim: same world, same train rules, private copies of both.
	Sweep.create = function (minSeconds, maxSeconds) {
		var count = C.SWEEP_G_N * C.SWEEP_D_N * C.SWEEP_E_N;
		var sweep = {
			world: RR.World.blank(C.NODE_N),
			train: RR.Train.create(RR.Tech.derive(RR.Tech.defaultKnobs()), C.WAGON_DEFAULT),
			knobs: RR.Tech.defaultKnobs(),
			fixture: new Float64Array(C.NODE_N * C.RES_N),
			net: new Float64Array(count),
			mean: new Float64Array(count),
			mass: new Float64Array(count),
			span: new Float64Array(count),
			mark: new Uint8Array(count),
			order: new Int32Array(count),
			cell: new Int32Array(3),
			count: count,
			cutoff: Math.round((maxSeconds || C.SWEEP_MAX_S) / C.DT),
			minSample: Math.round((minSeconds || C.SWEEP_MIN_S) / C.DT),
			combo: -1,
			left: 0,
			since: 0,
			settling: false,
			cycle0: 0,
			cash0: 0,
			done: 0,
			armedAt: -1,
			running: false,
			best: -1,
			massLo: Infinity,
			massHi: -Infinity,
			yScale: Y_MIN
		};
		var i;

		for (i = 0; i < count; i += 1) sweep.order[i] = (i * C.SWEEP_STRIDE) % count;
		return sweep;
	};

	// combo index → grid cell, in sweep.cell; gauge varies fastest, engine slowest
	Sweep.cellOf = function (sweep, combo) {
		var row = combo - (combo % C.SWEEP_G_N);
		var cell = sweep.cell;

		cell[0] = combo - row;
		cell[1] = (row / C.SWEEP_G_N) % C.SWEEP_D_N;
		cell[2] = (row / C.SWEEP_G_N - cell[1]) / C.SWEEP_D_N;
		return cell;
	};

	// grid endpoints are included, so an optimum pinned to an edge reads as one
	Sweep.knobAt = function (index, count) {
		return index / (count - 1);
	};

	// the measured combo a live build sits closest to, for the panel's crosshair
	Sweep.comboFor = function (sweep, knobs) {
		var g = Math.round(knobs[RR.Tech.GAUGE] * (C.SWEEP_G_N - 1));
		var d = Math.round(knobs[RR.Tech.WHEEL] * (C.SWEEP_D_N - 1));
		var e = Math.round(knobs[RR.Tech.ENGINE] * (C.SWEEP_E_N - 1));

		return g + C.SWEEP_G_N * (d + C.SWEEP_D_N * e);
	};

	// The fixture is the live world where it stands, yards and prices included: a build is
	// scored on the market it would actually meet, and every build meets the same one.
	// An arm with `fresh` throws away the samples of earlier passes: the grid is about this
	// map and this consist length, so a new seed or wagon count means a new grid.
	Sweep.arm = function (sweep, sim, fresh) {
		var train = sim.trains[0];

		RR.World.copyInto(sweep.world, sim.world);
		sweep.fixture.set(sweep.world.stock);
		sweep.train.wagons = train.wagons;
		if (fresh) {
			sweep.mark.fill(0);
			sweep.mean.fill(0);
		}
		sweep.done = 0;
		sweep.best = -1;
		sweep.armedAt = sim.time;
		sweep.massLo = Infinity;
		sweep.massHi = -Infinity;
		sweep.yScale = Y_MIN;
		sweep.running = true;
		start(sweep, sweep.order[0]);
	};

	// start one combo: its build, the fixture's stock, a train parked at node 0
	function start(sweep, combo) {
		var cell = Sweep.cellOf(sweep, combo);
		var train = sweep.train;

		sweep.knobs[RR.Tech.GAUGE] = Sweep.knobAt(cell[0], C.SWEEP_G_N);
		sweep.knobs[RR.Tech.WHEEL] = Sweep.knobAt(cell[1], C.SWEEP_D_N);
		sweep.knobs[RR.Tech.ENGINE] = Sweep.knobAt(cell[2], C.SWEEP_E_N);
		RR.Train.setBuild(train, RR.Tech.derive(sweep.knobs));
		sweep.world.stock.set(sweep.fixture);
		RR.Train.reset(train, sweep.world);
		sweep.combo = combo;
		sweep.mass[combo] = RR.Train.tareMass(train);
		begin(sweep, true);
	};

	// the sample clock: money is counted between two moments when the train is empty
	// at a stop, so cargo in transit never appears as a windfall or a loss
	function begin(sweep, settling) {
		sweep.settling = settling;
		sweep.cash0 = sweep.train.cash;
		sweep.cycle0 = sweep.train.cycle;
		sweep.left = sweep.cutoff;
		sweep.since = 0;
	}

	// true in the step the train leaves a stop with nothing aboard: the train keeps that
	// count itself, so a swept dot and a fixed-length line end on the very same event
	function cycleEnd(sweep) {
		var ended = sweep.train.cycle !== sweep.cycle0;

		sweep.cycle0 = sweep.train.cycle;
		return ended;
	}

	// the trade loop without the readouts: no price cache, no clock, no HUD
	function measureStep(sweep) {
		RR.Economy.tick(sweep.world, C.DT);
		RR.Train.step(sweep.train, sweep.world, C.DT);
	}

	// one sample of one combo. The market breathes on a period of the order of a pass, so
	// a dot keeps the running average over the passes it has appeared in and the panel
	// sharpens as the player plays: the optimum emerges, it is not announced
	function record(sweep) {
		var combo = sweep.combo;
		var seconds = sweep.since * C.DT;
		var net = (sweep.train.cash - sweep.cash0) / seconds - sweep.train.capexRate;
		var mass = sweep.mass[combo];
		var magnitude;

		sweep.net[combo] = net;
		sweep.span[combo] = seconds;
		sweep.mean[combo] = sweep.mark[combo] ? sweep.mean[combo] + C.SWEEP_EMA * (net - sweep.mean[combo]) : net;
		sweep.mark[combo] = 1;
		if (sweep.best < 0 || sweep.mean[combo] > sweep.mean[sweep.best]) sweep.best = combo;
		if (mass < sweep.massLo) sweep.massLo = mass;
		if (mass > sweep.massHi) sweep.massHi = mass;
		magnitude = Math.abs(sweep.mean[combo]);
		if (magnitude > sweep.yScale) sweep.yScale = magnitude;
	}

	// a pass ends by re-reading the whole grid: each dot is compared while it is being
	// written, and a dot that later falls below the champion would otherwise stay marked
	function finish(sweep) {
		var best = 0;
		var combo;

		for (combo = 1; combo < sweep.count; combo += 1) {
			if (sweep.mean[combo] > sweep.mean[best]) best = combo;
		}
		sweep.best = best;
	}

	// run up to budgetSteps of the pass; returns the steps used, 0 when idle
	Sweep.step = function (sweep, budgetSteps) {
		var steps = 0;

		while (steps < budgetSteps && sweep.running) {
			measureStep(sweep);
			steps += 1;
			sweep.left -= 1;
			if (sweep.settling) {
				if (sweep.left > 0 && !cycleEnd(sweep)) continue;
				begin(sweep, false);
				continue;
			}
			sweep.since += 1;
			if (sweep.left > 0 && !(cycleEnd(sweep) && sweep.since >= sweep.minSample)) continue;
			record(sweep);
			sweep.done += 1;
			if (sweep.done < sweep.count) {
				start(sweep, sweep.order[sweep.done]);
				continue;
			}
			finish(sweep);
			sweep.running = false;
			sweep.combo = -1;
			break;
		}
		return steps;
	};

	// run a pass to its end, for a caller with no frame budget to respect. A combo costs a
	// settle plus a sample, so one budgeted call per combo is enough
	Sweep.run = function (sweep) {
		var budget = 2 * sweep.cutoff + 8;
		var i;

		for (i = 0; i < sweep.count && sweep.running; i += 1) Sweep.step(sweep, budget);
		return !sweep.running;
	};

	RR.Sweep = Sweep;

	if (typeof module !== "undefined" && module.exports) module.exports = Sweep;
})(globalThis);
