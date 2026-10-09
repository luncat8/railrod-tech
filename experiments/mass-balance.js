"use strict";

var assert = require("assert");
var Rng = require("../js/rng.js");
var Const = require("../js/const.js");
var World = require("../js/world.js");
require("../js/economy.js");
var Tech = require("../js/tech.js");
require("../js/trade.js");
var Train = require("../js/train.js");
var Sim = require("../js/sim.js");

var SEED_BASE = 9000;
var SEED_COUNT = 20;
var STEPS = 20000;
var CHECK_EVERY = 300;
// float64 ledgers close to ~1e-11; a float32 ledger drifted past 1e-2 within minutes
var TOL = 1e-6;

// sum of one resource over the nodes of an array laid out node-major (n * RES_N)
function sumRes(arr, n, r) {
	var sum = 0;
	var i;

	for (i = 0; i < n; i += 1) sum += arr[i * Const.RES_N + r];
	return sum;
}

// units in the train's wagons, by resource
function carriedRes(train, r) {
	var count = 0;
	var w;

	for (w = 0; w < Train.SLOT_MAX; w += 1) {
		if (train.cargo[w] === r) count += 1;
	}
	return count;
}

// the economy's conservation law, per resource:
// stock now + carried now + consumed = stock at generation + produced − overflow
function checkConservation(sim, initial, label) {
	var world = sim.world;
	var train = sim.trains[0];
	var n = world.nodeCount;
	var r;
	var left;
	var right;

	for (r = 0; r < Const.RES_N; r += 1) {
		left = sumRes(world.stock, n, r) + carriedRes(train, r) + sumRes(world.consumed, n, r);
		right = initial[r] + sumRes(world.produced, n, r) - sumRes(world.overflow, n, r);
		assert(Math.abs(left - right) < TOL, label + ": resource " + r + " conserved (diff " + (left - right) + ")");
	}
}

// the yard and the train stay inside their limits at every check
function checkBounds(sim, label) {
	var world = sim.world;
	var train = sim.trains[0];
	var i;
	var r;
	var idx;
	var units = 0;
	var w;

	for (i = 0; i < world.nodeCount; i += 1) {
		for (r = 0; r < Const.RES_N; r += 1) {
			idx = i * Const.RES_N + r;
			assert(world.stock[idx] >= -1e-6, label + ": no negative stock");
			assert(world.stock[idx] <= world.cap[idx] + 1e-4, label + ": no stock over cap");
		}
	}
	// a slot is the unit of trade: it holds one unit of one resource, or nothing
	for (w = 0; w < Train.SLOT_MAX; w += 1) {
		if (train.cargo[w] < 0) continue;
		units += 1;
		assert(Train.wagonOfSlot(train, w) < train.wagons, label + ": no cargo beyond the consist");
	}
	assert.strictEqual(units, train.cargoUnits, label + ": cargo count matches the wagons");
	// the widest gauge sets the ceiling: cargo loaded under it stays aboard if the
	// gauge is narrowed, so the bound is the hold, not the hold of the moment
	assert(train.cargoUnits <= train.wagons * Const.HOLD_MAX, label + ": no more units than the gauge allows");
}

// the run: normal driving, then knob and wagon changes in the middle of trading,
// since a build change must not create or destroy any unit
function runSeed(seed) {
	var sim = Sim.create(seed);
	var generated = World.generate(Rng.create(sim.seed));
	var initial = [];
	var n = generated.nodeCount;
	var r;
	var i;
	var label = "seed " + seed;

	assert.deepStrictEqual(Array.from(generated.x), Array.from(sim.world.x), label + ": regenerated world matches the sim's");
	for (r = 0; r < Const.RES_N; r += 1) initial[r] = sumRes(generated.stock, n, r);
	// reset already ran the parked train's transfers, so compare from the start of the conservation ledger
	checkConservation(sim, initial, label + " at start");
	for (i = 0; i < STEPS; i += 1) {
		if (i === 5000) Sim.setKnob(sim, Tech.GAUGE, 0.9);
		if (i === 9000) Sim.setKnob(sim, Tech.ENGINE, 0.2);
		if (i === 13000) Sim.setWagons(sim, 2);
		if (i === 16000) Sim.setWagons(sim, 7);
		Sim.step(sim, Const.DT);
		if (i % CHECK_EVERY === 0) {
			checkBounds(sim, label + " step " + i);
			checkConservation(sim, initial, label + " step " + i);
		}
	}
	checkConservation(sim, initial, label + " at end");
	return sim;
}

function testUnitsAreConservedAcrossSeeds() {
	var s;
	var sim;
	var moved = 0;

	for (s = 0; s < SEED_COUNT; s += 1) {
		sim = runSeed(SEED_BASE + s);
		moved += sim.trains[0].cash !== 0 ? 1 : 0;
	}
	assert(moved === SEED_COUNT, "every seed traded (" + moved + " of " + SEED_COUNT + ")");
}

testUnitsAreConservedAcrossSeeds();
console.log("Mass-balance checks passed: " + SEED_COUNT + " seeds x " + STEPS + " steps, every unit conserved per resource, through knob and wagon changes.");
