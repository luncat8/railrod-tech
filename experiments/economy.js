"use strict";

var assert = require("assert");
var Rng = require("../js/rng.js");
var Const = require("../js/const.js");
var World = require("../js/world.js");
var Economy = require("../js/economy.js");
require("../js/train.js");
var Sim = require("../js/sim.js");

var DT = Const.DT;
var TOL = 0.05;
var SEED = 90210;
var BOUND_SEED_BASE = 5000;
var BOUND_SEED_COUNT = 20;
var BOUND_STEPS = 2000;

function findNode(world, kind, maskBits) {
	var i;
	var bits;
	var r;

	for (i = 0; i < world.nodeCount; i += 1) {
		if (world.kind[i] !== kind) continue;
		if (maskBits === undefined) return i;
		bits = 0;
		for (r = 0; r < Const.RES_N; r += 1) {
			if (world.need[i] & (1 << r)) bits += 1;
		}
		if (bits === maskBits) return i;
	}
	return -1;
}

function createSimWithConsumer(maskBits) {
	var s;
	var sim;

	for (s = 0; s < 100; s += 1) {
		sim = Sim.create(SEED + s);
		if (findNode(sim.world, World.CON, maskBits) >= 0) return sim;
	}
	throw new Error("no consumer with a " + maskBits + "-resource recipe found");
}

function emittedIndex(world, i) {
	var r;

	for (r = 0; r < Const.RES_N; r += 1) {
		if (world.inflow[i * Const.RES_N + r] > 0) return r;
	}
	return -1;
}

function testFullYardHoldsFloorPriceAndOverflows() {
	var sim = Sim.create(SEED);
	var world = sim.world;
	var i = findNode(world, World.SRC);
	var r = emittedIndex(world, i);
	var idx = i * Const.RES_N + r;

	world.stock[idx] = world.cap[idx];
	world.overflow[idx] = 0;

	Sim.step(sim, DT);

	assert.strictEqual(world.stock[idx], world.cap[idx], "a full yard stays pinned at capacity");
	assert(
		Math.abs(world.overflow[idx] - world.inflow[idx] * DT) < 1e-6,
		"overflow is accounted per tick"
	);
	assert(
		Math.abs(world.price[idx] - world.base[idx] * Const.PRICE_FLOOR) < 1e-4,
		"a full yard holds the floor price"
	);
}

function testStarvedConsumerStalls() {
	var sim = createSimWithConsumer(2);
	var world = sim.world;
	var res = Const.RES_N;
	var i = findNode(world, World.CON, 2);
	var mask = world.need[i];
	var masked = [];
	var before = [];
	var r;
	var idx;
	var step;

	for (r = 0; r < res; r += 1) {
		if (mask & (1 << r)) masked.push(r);
	}

	// fully starved: every recipe input empty
	for (r = 0; r < res; r += 1) {
		idx = i * res + r;
		world.consumed[idx] = 0;
		if (mask & (1 << r)) world.stock[idx] = 0;
		before.push(world.stock[idx]);
	}
	for (step = 0; step < 600; step += 1) Sim.step(sim, DT);
	for (r = 0; r < res; r += 1) {
		idx = i * res + r;
		assert.strictEqual(world.stock[idx], before[r], "starved consumer stock frozen (r" + r + ")");
		assert.strictEqual(world.consumed[idx], 0, "starved consumer consumes nothing (r" + r + ")");
	}

	// half-fed: one input below one unit stalls the whole recipe
	world.stock[i * res + masked[0]] = 0.5;
	world.stock[i * res + masked[1]] = world.cap[i * res + masked[1]];
	before = [world.stock[i * res + masked[0]], world.stock[i * res + masked[1]]];
	for (step = 0; step < 600; step += 1) Sim.step(sim, DT);
	assert.strictEqual(world.stock[i * res + masked[0]], before[0], "half-fed consumer stays stalled (scarce input)");
	assert.strictEqual(world.stock[i * res + masked[1]], before[1], "half-fed consumer stays stalled (fed input frozen too)");
}

function testFedConsumerDrainsAtRate() {
	var sim = createSimWithConsumer(1);
	var world = sim.world;
	var res = Const.RES_N;
	var i = findNode(world, World.CON);
	var mask = world.need[i];
	var r;
	var idx;
	var step;
	var t;

	for (r = 0; r < res; r += 1) {
		idx = i * res + r;
		world.consumed[idx] = 0;
		if (mask & (1 << r)) world.stock[idx] = world.cap[idx];
	}

	for (step = 0; step < 600; step += 1) Sim.step(sim, DT);
	t = sim.time;

	for (r = 0; r < res; r += 1) {
		idx = i * res + r;
		if (mask & (1 << r)) {
			assert(
				Math.abs(world.consumed[idx] - world.rate[i] * t) <= TOL,
				"fed consumer drains at its rate (r" + r + ")"
			);
			assert(
				Math.abs(world.stock[idx] - (world.cap[idx] - world.rate[i] * t)) <= TOL,
				"fed consumer stock falls by the drained amount (r" + r + ")"
			);
		} else {
			assert.strictEqual(world.consumed[idx], 0, "consumer never touches a non-recipe resource");
		}
	}
}

function testPriceBoundsAndMonotonicity() {
	var s;
	var step;
	var sim;
	var world;
	var res = Const.RES_N;
	var i;
	var r;
	var idx;
	var base;
	var price;
	var buy;
	var sell;
	var lo;
	var hi;

	for (s = 0; s < BOUND_SEED_COUNT; s += 1) {
		sim = Sim.create(BOUND_SEED_BASE + s);
		world = sim.world;
		for (step = 0; step < BOUND_STEPS; step += 1) Sim.step(sim, DT);
		for (i = 0; i < world.nodeCount; i += 1) {
			for (r = 0; r < res; r += 1) {
				idx = i * res + r;
				base = world.base[idx];
				price = world.price[idx];
				buy = Economy.buyQuote(world, i, r);
				sell = Economy.sellQuote(world, i, r);
				assert(world.stock[idx] >= -1e-4 && world.stock[idx] <= world.cap[idx] + 1e-4, "stock stays inside the yard");
				assert(price >= base * Const.PRICE_FLOOR - 1e-4, "price never below the floor band");
				assert(price <= base + 1e-4, "price never above base");
				assert(buy <= base * (1 + Const.SPREAD) + 1e-4, "buy quote capped at base*(1+SPREAD)");
				assert(buy >= price - 1e-4, "buy quote covers the current price");
				assert(sell >= 0, "sell quote never negative");
				assert(sell <= price + 1e-4, "sell quote never above the current price");
				assert(sell <= buy, "spread keeps sell below buy");
			}
			for (r = 0; r < res; r += 1) {
				idx = i * res + r;
				lo = 0;
				while (lo < world.cap[idx]) {
					hi = Math.min(lo + world.cap[idx] / 8, world.cap[idx]);
					assert(
						Economy.priceAt(world, i, r, lo) >= Economy.priceAt(world, i, r, hi) - 1e-9,
						"price falls as stock rises"
					);
					lo = hi;
				}
			}
		}
	}
}

function testSameNodeRoundTripLosesTheSpread() {
	var sim = Sim.create(SEED);
	var world = sim.world;
	var i = findNode(world, World.SRC);
	var r = emittedIndex(world, i);
	var idx = i * Const.RES_N + r;
	var mid = Math.floor(world.cap[idx] / 2);
	var cost;
	var proceeds;

	world.stock[idx] = mid;
	cost = Economy.buyQuote(world, i, r);
	world.stock[idx] = mid - 1; // the train bought one unit
	proceeds = Economy.sellQuote(world, i, r);
	world.stock[idx] = mid;

	assert(proceeds < cost, "selling back at the same node loses money");
	assert(
		Math.abs(proceeds / cost - (1 - Const.SPREAD) / (1 + Const.SPREAD)) < 1e-4,
		"the round trip crosses the same underlying price interval"
	);
}

function testStockIsConserved() {
	var s;
	var step;
	var sim;
	var world;
	var res = Const.RES_N;
	var initial;
	var i;
	var r;
	var idx;
	var t;
	var expected;
	var actual;

	for (s = 0; s < 6; s += 1) {
		sim = Sim.create(SEED + 1000 + s);
		world = sim.world;
		initial = Array.from(world.stock);
		for (step = 0; step < BOUND_STEPS; step += 1) Sim.step(sim, DT);
		t = sim.time;
		for (i = 0; i < world.nodeCount; i += 1) {
			for (r = 0; r < res; r += 1) {
				idx = i * res + r;
				expected = initial[idx] + world.inflow[idx] * t;
				actual = world.stock[idx] + world.consumed[idx] + world.overflow[idx];
				assert(
					Math.abs(expected - actual) <= TOL + world.cap[idx] * 1e-4,
					"seed " + (SEED + 1000 + s) + " node " + i + " r" + r + ": stock conserved"
				);
			}
		}
	}
}

function testEconomyIsDeterministic() {
	var a = Sim.create(SEED);
	var b = Sim.create(SEED);
	var step;

	for (step = 0; step < 500; step += 1) {
		Sim.step(a, DT);
		Sim.step(b, DT);
	}

	assert.deepStrictEqual(Array.from(a.world.stock), Array.from(b.world.stock));
	assert.deepStrictEqual(Array.from(a.world.price), Array.from(b.world.price));
	assert.deepStrictEqual(Array.from(a.world.consumed), Array.from(b.world.consumed));
	assert.deepStrictEqual(Array.from(a.world.overflow), Array.from(b.world.overflow));
}

testFullYardHoldsFloorPriceAndOverflows();
testStarvedConsumerStalls();
testFedConsumerDrainsAtRate();
testPriceBoundsAndMonotonicity();
testSameNodeRoundTripLosesTheSpread();
testStockIsConserved();
testEconomyIsDeterministic();
console.log("Economy checks passed: floor price + overflow, consumer stall and drain, price bounds and monotonicity, spread round trip, conservation, determinism.");
