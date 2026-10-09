"use strict";

var assert = require("assert");
var Const = require("../js/const.js");
// load order matters: each module captures the ones before it at load time
require("../js/rng.js");
var World = require("../js/world.js");
require("../js/economy.js");
var Tech = require("../js/tech.js");
var Trade = require("../js/trade.js");
var Train = require("../js/train.js");
require("../js/line.js");
var Sim = require("../js/sim.js");

var DT = Const.DT;
var SEED = 24680;
var MAX_STEPS = 60 * 900;

// a hand-built ring, so every expected answer is known in advance
function makeWorld(nodes) {
	var n = nodes.length;
	var world = World.blank(n);
	var i;
	var r;
	var spec;

	for (i = 0; i < n; i += 1) {
		spec = nodes[i];
		world.x[i] = spec.x;
		world.kind[i] = spec.kind;
		world.need[i] = spec.need || 0;
		world.rate[i] = spec.rate || 0;
		world.fragility[i] = spec.fragility || 1;
		for (r = 0; r < Const.RES_N; r += 1) {
			world.cap[i * Const.RES_N + r] = spec.cap || 80;
			world.base[i * Const.RES_N + r] = spec.base || 10;
			world.stock[i * Const.RES_N + r] = (spec.stock && spec.stock[r]) || 0;
		}
	}
	return world;
}

var R1 = 1; // recipe bit for resource 0: a consumer whose need mask is 1 takes R1

// source at 0 holding `srcStock` R1, consumer at `km` needing R1 with an empty yard
function lineWorld(km, srcStock) {
	return makeWorld([
		{ x: 0, kind: World.SRC, stock: [srcStock === undefined ? 50 : srcStock, 0, 0], base: 10 },
		{ x: km, kind: World.CON, need: R1, rate: 0.01, base: 30, stock: [0, 0, 0] }
	]);
}

function freshTrain(wagons) {
	return Train.create(Tech.derive(Tech.defaultKnobs()), wagons);
}

// the train is parked at node 0: reset runs the arrival there, so it loads first
function parkAtSource(train, world) {
	Train.reset(train, world);
}

function stepUntil(train, world, done) {
	var steps = 0;

	while (!done() && steps < MAX_STEPS) {
		Train.step(train, world, DT);
		steps += 1;
	}
	assert(steps < MAX_STEPS, "the awaited state is reached");
	return steps;
}

function simUntil(sim, done) {
	var steps = 0;

	while (!done() && steps < MAX_STEPS) {
		Sim.step(sim, DT);
		steps += 1;
	}
	assert(steps < MAX_STEPS, "the awaited state is reached");
	return steps;
}

function isDwelling(train) {
	return train.state === Train.DWELL;
}

function testOneWayNeverReverses() {
	var s;
	var i;
	var sim;
	var train;
	var before;
	var step;

	for (s = 0; s < 6; s += 1) {
		sim = Sim.create(SEED + s);
		train = sim.trains[0];
		for (i = 0; i < 60 * 240; i += 1) {
			before = train.x;
			Sim.step(sim, DT);
			// World.wrap keeps x in [0, RING_KM): a backward move would show as a
			// step of almost a whole lap, so a short forward step covers both claims
			step = World.wrap(train.x - before);
			assert(step < 0.5, "forward and continuous (seed " + (SEED + s) + ")");
		}
	}
}

function testStopsOnlyWhereTradeIsWanted() {
	var s;
	var i;
	var j;
	var sim;
	var train;
	var world;
	var wanted = [];
	var before;
	var ds;
	var prevDwell;
	var stops = 0;

	for (s = 0; s < 8; s += 1) {
		sim = Sim.create(SEED + 100 + s);
		train = sim.trains[0];
		world = sim.world;
		prevDwell = false;
		for (i = 0; i < 60 * 300; i += 1) {
			// judged before the step, so a node is never excused by the step's own transfers
			for (j = 0; j < world.nodeCount; j += 1) wanted[j] = Trade.wantsStop(train, world, j);
			before = train.x;
			Sim.step(sim, DT);
			ds = World.wrap(train.x - before);
			if (isDwelling(train) && !prevDwell) stops += 1;
			prevDwell = isDwelling(train);
			for (j = 0; j < world.nodeCount; j += 1) {
				if (wanted[j] && passedInside(world.x[j], before, ds) && train.at !== j) {
					assert.fail("a wanted node was passed (seed " + (SEED + 100 + s) + ", node " + j + ")");
				}
			}
		}
	}
	assert(stops >= 20, "the loop actually stops (got " + stops + ")");
}

// node at x lies in the (before, before + ds] arc this step covered
function passedInside(x, before, ds) {
	var d = World.wrap(x - before);

	return d > 0 && d <= ds;
}

function testStopsAreExactAndBrakingStaysBounded() {
	var world = lineWorld(20);
	var train = freshTrain(4);
	var prevV;
	var peak = 0;
	var steps;

	parkAtSource(train, world);
	assert.strictEqual(train.cargoUnits, Train.capacity(train), "a rich source fills every slot while the margin pays");
	stepUntil(train, world, function () {
		return train.state === Train.CRUISE;
	});
	for (steps = 0; steps < MAX_STEPS && !isDwelling(train); steps += 1) {
		prevV = train.v;
		Train.step(train, world, DT);
		if (train.state === Train.CRUISE && train.v < prevV) peak = Math.max(peak, (prevV - train.v) / DT);
	}
	assert(steps < MAX_STEPS, "the train reaches the consumer");
	assert.strictEqual(train.at, 1, "the train stopped at the consumer");
	assert.strictEqual(train.x, world.x[1], "captured exactly on the node");
	assert.strictEqual(train.v, 0, "and at rest");
	assert(peak <= Const.BRAKE_DECEL * 1.05, "a clean approach brakes at the service rate (peak " + peak.toFixed(3) + ")");
}

function testLateStopStillArrivesExactly() {
	// a consumer appears inside the braking distance of a train already at speed
	var world = lineWorld(40);
	var train = freshTrain(4);

	parkAtSource(train, world);
	stepUntil(train, world, function () {
		return train.state === Train.CRUISE;
	});
	stepUntil(train, world, function () {
		return train.v > 1.2 && train.x > 5;
	});
	world.x[1] = World.wrap(train.x + 0.9);
	stepUntil(train, world, function () {
		return isDwelling(train);
	});
	assert.strictEqual(train.x, world.x[1], "a late stop is still reached exactly");
}

function testNoStopRunsAtTrackSpeed() {
	var world = makeWorld([
		{ x: 0, kind: World.CON, need: R1, base: 20, stock: [0, 0, 0] },
		{ x: 20, kind: World.CON, need: R1, base: 20, stock: [0, 0, 0] },
		{ x: 40, kind: World.SRC, base: 10, stock: [0, 0, 0] }
	]);
	var train = freshTrain(4);
	var stops = 0;
	var prevDwell = false;
	var i;

	parkAtSource(train, world);
	for (i = 0; i < 60 * 300; i += 1) {
		Train.step(train, world, DT);
		if (isDwelling(train) && !prevDwell) stops += 1;
		prevDwell = isDwelling(train);
	}
	assert.strictEqual(stops, 0, "no node wants the train, so it never stops");
	assert(Math.abs(train.v - train.build.vTrack) < 1e-9, "it cruises at the track speed");
}

function testTransferDwellMatchesUnits() {
	var world = lineWorld(12);
	var train = freshTrain(3);

	parkAtSource(train, world);
	assert.strictEqual(train.cargoUnits, Train.capacity(train), "three wagons, a full hold of units");
	assert(Math.abs(train.dwellTotal - train.cargoUnits / train.build.transferRate) < 1e-9, "load dwell = units / transfer rate");
	stepUntil(train, world, function () {
		return isDwelling(train) && train.at === 1;
	});
	assert.strictEqual(train.cargoUnits, 0, "the consumer took every unit");
	assert(Math.abs(train.dwellTotal - Train.capacity(train) / train.build.transferRate) < 1e-9, "unload dwell = units / transfer rate");
}

function testSourceWithFewUnitsLoadsFewUnits() {
	var world = lineWorld(12, 2);
	var train = freshTrain(6);

	parkAtSource(train, world);
	assert.strictEqual(train.cargoUnits, 2, "the source has two units to give");
	assert.strictEqual(world.stock[0], 0, "and they all left the yard");
}

function testStalledBuildSitsAtZero() {
	var world = lineWorld(12);
	var train = freshTrain(4);
	var build = Tech.derive(Tech.defaultKnobs());
	var i;

	build.power = 0;
	build.fTrac = 0;
	Train.setBuild(train, build);
	parkAtSource(train, world);
	for (i = 0; i < 600; i += 1) Train.step(train, world, DT);
	assert.strictEqual(train.v, 0, "no traction, no motion");
	assert.strictEqual(train.x, world.x[0], "the train never leaves its node");
	assert.strictEqual(train.state, Train.CRUISE, "it waits for a route it can run");
}

function testSetWagonsNeverDropsCargo() {
	var world = lineWorld(12);
	var train = freshTrain(4);

	parkAtSource(train, world);
	var loaded = train.cargoUnits;
	assert.strictEqual(loaded, Train.capacity(train), "four wagons loaded");
	Train.setWagons(train, 1);
	assert.strictEqual(train.wagons, 4, "a loaded consist cannot shrink below its cargo");
	Train.setWagons(train, 8);
	assert.strictEqual(train.wagons, 8, "growing is always allowed");
	assert.strictEqual(train.cargoUnits, loaded, "cargo is untouched by the change");
}

function testSetWagonsFloorFollowsTheHighestLoadedWagon() {
	var world = lineWorld(12, 3);
	var train = freshTrain(6);

	parkAtSource(train, world);
	assert.strictEqual(train.cargoUnits, 3, "three units loaded into the first slots");
	Train.setWagons(train, 2);
	assert.strictEqual(train.wagons, 3, "three units are dealt into three wagons before any takes a second");
}

function testKnobChangeNeverTeleports() {
	var sim = Sim.create(SEED + 7);
	var train = sim.trains[0];
	var before;
	var prevV;
	var step;
	var i;
	// the narrowest track the slider reaches: the train has to be above it, or the
	// gauge change below is not a slower track and accelerates instead of braking
	var narrow = Tech.vTrackOf(0, Const.KNOB_D);

	simUntil(sim, function () {
		return train.state === Train.CRUISE && train.v > narrow + 0.05;
	});
	before = train.x;
	prevV = train.v;
	// a gauge change slows the track: the train must brake down, not jump to the new speed
	Sim.setKnob(sim, Tech.GAUGE, 0);
	Sim.step(sim, DT);
	step = World.wrap(train.x - before);
	assert(step < 0.05, "the step after a knob change moves at most a few centimetres");
	assert(train.v <= prevV + 1e-9, "a slower track never raises speed");
	// the brake takes a moment to bring the speed down; once it has, the cap holds
	for (i = 0; i < 60 * 5; i += 1) Sim.step(sim, DT);
	for (i = 0; i < 60 * 120; i += 1) {
		Sim.step(sim, DT);
		assert(train.v <= train.build.vTrack + 1e-9, "speed is capped by the new track speed");
	}
}

// the trip ledger is what a fixed-length line is measured against, so it has to count the
// run and nothing else: forward only, closed by a delivered consist, zeroed by a new line
function testTheTripLedger() {
	var world = lineWorld(12);
	var train = freshTrain(4);
	var km;
	var stops;
	var cycle;
	var i;

	parkAtSource(train, world);
	assert.strictEqual(train.km, 0, "a parked train has run nothing");
	assert.strictEqual(train.stops, 1, "the stop it parked at counts, because it traded there");
	assert(train.units > 0, "and the units it lifted count with it");
	assert.strictEqual(train.cycle, 0, "leaving a stop loaded opens a cycle rather than closing one");

	for (i = 0; i < 60 * 60; i += 1) {
		km = train.km;
		stops = train.stops;
		cycle = train.cycle;
		Train.step(train, world, DT);
		assert(train.km >= km, "the odometer only runs forward");
		assert(train.stops >= stops, "a stop is never uncounted");
		assert(train.cycle >= cycle, "and neither is a closed cycle");
	}
	assert(train.km > 12, "the ledger measures the ground the loop covered (" + train.km.toFixed(1) + " km)");
	assert(train.cycle > 0, "a consist delivered empty closes a cycle");
	assert(train.units >= train.stops, "every counted stop moved at least one unit");

	Train.reset(train, world);
	assert.strictEqual(train.km, 0, "a new line starts the ledger again");
	assert.strictEqual(train.cycle, 0, "with no cycle closed yet");
	assert.strictEqual(train.stops, 1, "and the stop it starts at counted");
}

// a build handed to a reset is the build taken: the consist is empty at that moment, so the
// wagon count is the one asked for and not one clamped by what the last build left aboard
function testResetTakesTheBuildItIsGiven() {
	var world = lineWorld(12);
	var train = freshTrain(8);
	var knobs = Tech.defaultKnobs();
	var build;

	parkAtSource(train, world);
	assert(train.cargoUnits > 4, "the train parked loaded with more than the new consist can hold");
	knobs[Tech.GAUGE] = 1;
	build = Tech.derive(knobs);
	Train.reset(train, world, build, 2);
	assert.strictEqual(train.wagons, 2, "a reset takes the wagon count it is given");
	assert.strictEqual(train.build.vTrack, build.vTrack, "and the build with it");
	assert.strictEqual(train.capexRate, Tech.capexRate(build, 2), "priced as the consist it now is");
	assert(train.cargoUnits <= Train.capacity(train), "loading again, it lifts no more than the new hold");
	assert.strictEqual(train.km, 0, "on a ledger that starts at zero");
}

// a stop that moves nothing is not a stop, and it does not close a trade cycle either
function testAnEmptyStopClosesNothing() {
	var world = lineWorld(12, 0);
	var train = freshTrain(4);
	var i;

	parkAtSource(train, world);
	assert.strictEqual(train.stops, 0, "a source with nothing to give is not a stop");
	assert.strictEqual(train.units, 0, "and moves no units");
	for (i = 0; i < 60 * 30; i += 1) Train.step(train, world, DT);
	assert.strictEqual(train.cycle, 0, "so no cycle is ever closed");
}

function testDeterminism() {
	var a = Sim.create(SEED);
	var b = Sim.create(SEED);
	var i;

	for (i = 0; i < 20000; i += 1) {
		Sim.step(a, DT);
		Sim.step(b, DT);
	}
	assert.strictEqual(a.trains[0].x, b.trains[0].x, "same steps, same position");
	assert.strictEqual(a.trains[0].v, b.trains[0].v, "same steps, same speed");
	assert.strictEqual(a.trains[0].cash, b.trains[0].cash, "same steps, same cash");
	assert.strictEqual(a.trains[0].cargoUnits, b.trains[0].cargoUnits, "same steps, same cargo");
	assert.strictEqual(a.trains[0].km, b.trains[0].km, "same steps, same distance run");
	assert.strictEqual(a.trains[0].stops, b.trains[0].stops, "same steps, same stops");
	assert.strictEqual(a.trains[0].units, b.trains[0].units, "same steps, same units moved");
	assert.strictEqual(a.trains[0].cycle, b.trains[0].cycle, "same steps, same cycles closed");
	assert.strictEqual(a.netRate, b.netRate, "same steps, same net rate");
}

testOneWayNeverReverses();
testStopsOnlyWhereTradeIsWanted();
testStopsAreExactAndBrakingStaysBounded();
testLateStopStillArrivesExactly();
testNoStopRunsAtTrackSpeed();
testTransferDwellMatchesUnits();
testSourceWithFewUnitsLoadsFewUnits();
testStalledBuildSitsAtZero();
testSetWagonsNeverDropsCargo();
testSetWagonsFloorFollowsTheHighestLoadedWagon();
testKnobChangeNeverTeleports();
testTheTripLedger();
testResetTakesTheBuildItIsGiven();
testAnEmptyStopClosesNothing();
testDeterminism();
console.log("Train checks passed: one-way loop, wanted-only stops, exact braked stops, late stops, no-stop cruise, transfer dwell, wagon floor, knob change, the trip ledger, a build taken at a reset, determinism.");
