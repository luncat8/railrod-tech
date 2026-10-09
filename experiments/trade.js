"use strict";

var assert = require("assert");
var Rng = require("../js/rng.js");
var Const = require("../js/const.js");
var World = require("../js/world.js");
var Economy = require("../js/economy.js");
var Tech = require("../js/tech.js");
var Trade = require("../js/trade.js");
var Train = require("../js/train.js");
require("../js/line.js");
var Sim = require("../js/sim.js");

var DT = Const.DT;
var R1 = 0; // resource index; need-mask bit for R1 is 1 << R1
var R2 = 1;
var BIT_R1 = 1 << R1;
var BIT_R2 = 1 << R2;
var SPREAD = Const.SPREAD;

// a hand-built ring, so every expected quote is known in advance
function makeWorld(nodes) {
	var n = nodes.length;
	var world = {
		nodeCount: n,
		x: new Float32Array(n),
		kind: new Int8Array(n),
		need: new Int8Array(n),
		rate: new Float32Array(n),
		fragility: new Float32Array(n),
		stock: new Float64Array(n * Const.RES_N),
		cap: new Float32Array(n * Const.RES_N),
		base: new Float32Array(n * Const.RES_N),
		price: new Float32Array(n * Const.RES_N)
	};
	var i;
	var r;
	var spec;

	for (i = 0; i < n; i += 1) {
		spec = nodes[i];
		world.x[i] = spec.x;
		world.kind[i] = spec.kind;
		world.need[i] = spec.need || 0;
		world.rate[i] = 0;
		world.fragility[i] = spec.fragility || 1;
		for (r = 0; r < Const.RES_N; r += 1) {
			world.cap[i * Const.RES_N + r] = spec.cap || 80;
			world.base[i * Const.RES_N + r] = spec.base || 10;
			world.stock[i * Const.RES_N + r] = (spec.stock && spec.stock[r]) || 0;
		}
	}
	return world;
}

function emptyTrain(wagons) {
	return Train.create(Tech.derive(Tech.defaultKnobs()), wagons);
}

// the price one unit fetches when the node holds `s` units right now (sell side)
function sellAt(world, i, r, s) {
	return Economy.priceAt(world, i, r, s + 0.5) * (1 - SPREAD);
}

// the price one unit costs when the node holds `s` units right now (buy side)
function buyAt(world, i, r, s) {
	return Economy.priceAt(world, i, r, s - 0.5) * (1 + SPREAD);
}

function cloneWorld(world) {
	var copy = {};
	var key;

	for (key in world) {
		if (ArrayBuffer.isView(world[key])) copy[key] = world[key].slice();
		else copy[key] = world[key];
	}
	return copy;
}

function cloneTrain(train) {
	var copy = {};
	var key;

	for (key in train) copy[key] = train[key];
	copy.cargo = train.cargo.slice();
	return copy;
}

function testMarginRuleDecidesLoading() {
	var world = makeWorld([
		{ x: 0, kind: World.SRC, stock: [50, 0, 0], base: 10 },
		{ x: 20, kind: World.CON, need: BIT_R1, base: 30, stock: [0, 0, 0] }
	]);
	var margin = Trade.loadMargin(world, 0, R1);
	var expected = sellAt(world, 1, R1, 0) - buyAt(world, 0, R1, 50);

	assert(margin > 0, "a rich source sells to a paying consumer");
	assert(Math.abs(margin - expected) < 1e-6, "margin = best sell quote - buy quote (got " + margin + ", want " + expected + ")");
	assert.strictEqual(Trade.pickLoad(world, 0), R1, "so the train loads R1");

	// the consumer pays less than the source asks: no margin, no load
	world.base[1 * Const.RES_N + R1] = 2;
	assert(Trade.loadMargin(world, 0, R1) < 0, "a cheap consumer gives a negative margin");
	assert.strictEqual(Trade.pickLoad(world, 0), -1, "so the train leaves the wagon empty");
}

function testBestSellOnlyCountsConsumersThatNeedTheResource() {
	var world = makeWorld([
		{ x: 0, kind: World.SRC, stock: [50, 50, 0], base: 10 },
		{ x: 10, kind: World.CON, need: BIT_R2, base: 60, stock: [0, 0, 0] },
		{ x: 20, kind: World.CON, need: BIT_R1, base: 20, stock: [0, 0, 0] }
	]);

	assert(Math.abs(Trade.bestSell(world, R1) - sellAt(world, 2, R1, 0)) < 1e-6, "R1 is priced at the R1 consumer only");
	assert(Math.abs(Trade.bestSell(world, R2) - sellAt(world, 1, R2, 0)) < 1e-6, "R2 is priced at the R2 consumer only");
	world.need[2] = 0;
	assert.strictEqual(Trade.bestSell(world, R1), 0, "no consumer needs R1, so nothing sells");
	assert(Trade.loadMargin(world, 0, R1) < 0, "so the margin is only the buy cost, and it is negative");
	assert.notStrictEqual(Trade.pickLoad(world, 0), R1, "R1 is not loaded for it");
	world.need[1] = 0;
	assert.strictEqual(Trade.pickLoad(world, 0), -1, "with no consumer for anything, nothing is loaded");
}

function testUnloadNeedsRecipeAndRoom() {
	var world = makeWorld([
		{ x: 0, kind: World.CON, need: BIT_R1, base: 20, stock: [79, 0, 0], cap: 80 },
		{ x: 10, kind: World.CON, need: BIT_R1, base: 20, stock: [79.5, 0, 0], cap: 80 },
		{ x: 20, kind: World.CON, need: BIT_R2, base: 20, stock: [0, 0, 0], cap: 80 },
		{ x: 30, kind: World.SRC, need: BIT_R1, base: 10, stock: [0, 0, 0], cap: 80 }
	]);

	assert(Trade.wantsUnload(world, 0, R1), "a consumer with one slot free takes a unit");
	assert(!Trade.wantsUnload(world, 1, R1), "less than one slot free refuses");
	assert(!Trade.wantsUnload(world, 2, R1), "a consumer that does not need R1 refuses it");
	assert(!Trade.wantsUnload(world, 3, R1), "a source never takes a unit back");
}

function testTransactIsQuoteByQuote() {
	var world = makeWorld([
		{ x: 0, kind: World.SRC, stock: [50, 0, 0], base: 10 },
		{ x: 20, kind: World.CON, need: BIT_R1, base: 30, stock: [0, 0, 0] }
	]);
	var train = emptyTrain(3);
	var take = Train.capacity(train);
	var want = 0;
	var s;
	var moved;

	// each unit is quoted after the previous one has moved the stock
	for (s = 50; s > 50 - take; s -= 1) want -= buyAt(world, 0, R1, s);
	moved = Trade.transact(train, world, 0);
	assert.strictEqual(moved, take, "three wagons take a full hold of units");
	assert(Math.abs(train.cash - want) < 1e-5, "cash is the sum of sequential buy quotes (got " + train.cash + ", want " + want + ")");
	assert.strictEqual(world.stock[0], 50 - take, "the source gave up exactly the units that fit");
	assert.strictEqual(train.cargoUnits, take, "and the train holds them");
	for (s = 0; s < Train.capacity(train); s += 1) {
		assert.strictEqual(train.cargo[s], R1, "every slot the consist offers is filled");
	}
}

function testUnloadPaysSellQuotes() {
	var world = makeWorld([
		{ x: 0, kind: World.CON, need: BIT_R1, base: 30, stock: [5, 0, 0] }
	]);
	var train = emptyTrain(3);
	var want = 0;
	var s;
	var moved;

	fillCargo(train, world, 3);
	for (s = 5; s < 8; s += 1) want += sellAt(world, 0, R1, s);
	moved = Trade.transact(train, world, 0);
	assert.strictEqual(moved, 3, "three units unloaded");
	assert(Math.abs(train.cash - want) < 1e-5, "cash is the sum of sequential sell quotes");
	assert.strictEqual(world.stock[0], 8, "the consumer took three units");
	assert.strictEqual(train.cargoUnits, 0, "and the train is empty");
}

function testRoundTripAtOneNodeLosesTheSpread() {
	var world = makeWorld([
		{ x: 0, kind: World.SRC, stock: [10, 0, 0], base: 10 }
	]);
	var buy = Economy.buyQuote(world, 0, R1);
	var sell;

	// buy one unit, then sell it straight back at the same node
	world.stock[0] -= 1;
	sell = Economy.sellQuote(world, 0, R1);
	world.stock[0] += 1;
	assert(sell < buy, "selling back is cheaper than buying");
	assert(Math.abs((sell - buy) + 2 * SPREAD * Economy.priceAt(world, 0, R1, 9.5)) < 1e-9, "the loss is the full spread on the midpoint price");
}

function testSourceDoesNotBuyBack() {
	var world = makeWorld([
		{ x: 0, kind: World.SRC, stock: [1, 0, 0], base: 10 },
		{ x: 20, kind: World.CON, need: BIT_R1, base: 30, stock: [0, 0, 0] }
	]);
	var train = emptyTrain(2);
	var cash;

	fillCargo(train, world, 1);
	cash = train.cash;
	assert.strictEqual(Trade.transact(train, world, 0), 1, "the source takes nothing back but loads one free wagon");
	assert.strictEqual(train.cargoUnits, 2, "the carried unit stays on board");
	assert(train.cash < cash, "and the only money moved is the purchase");
	assert.strictEqual(world.stock[0], 0, "the source yard only lost the purchased unit");
}

function testFullConsumerRefusesAndTrainKeepsCargo() {
	var world = makeWorld([
		{ x: 0, kind: World.CON, need: BIT_R1, base: 30, stock: [80, 0, 0], cap: 80 }
	]);
	var train = emptyTrain(2);

	fillCargo(train, world, 1);
	assert.strictEqual(Trade.transact(train, world, 0), 0, "a full yard takes nothing");
	assert.strictEqual(train.cargoUnits, 1, "the unit stays on board");
	assert.strictEqual(train.cash, 0, "and no money moves");
}

function testLoadingStopsAtTheWagonLimit() {
	var world = makeWorld([
		{ x: 0, kind: World.SRC, stock: [30, 0, 0], base: 10 },
		{ x: 20, kind: World.CON, need: BIT_R1, base: 30, stock: [0, 0, 0] }
	]);
	var train = emptyTrain(2);

	assert.strictEqual(Trade.transact(train, world, 0), Train.capacity(train), "two wagons take exactly one hold each");
	assert.strictEqual(world.stock[0], 30 - Train.capacity(train), "and no more leave the yard");
	assert.strictEqual(Trade.wantsStop(train, world, 1), true, "the full train wants the consumer");
}

// the stop rule and the transfer rule must agree on every node of every seeded world:
// a node is a stop if and only if the transfer there moves something
function testWantsStopAgreesWithTransact() {
	var s;
	var i;
	var k;
	var world;
	var train;
	var trial;
	var wants;
	var moved;
	var checked = 0;
	var loadStates = [0, 1, 2, 3, 4, 5, 8];

	for (s = 0; s < 40; s += 1) {
		world = World.generate(Rng.create(5000 + s));
		for (k = 0; k < loadStates.length; k += 1) {
			for (i = 0; i < world.nodeCount; i += 1) {
				train = emptyTrain(Const.WAGON_DEFAULT);
				fillCargo(train, world, loadStates[k]);
				wants = Trade.wantsStop(train, world, i);
				trial = cloneWorld(world);
				moved = Trade.transact(cloneTrain(train), trial, i);
				assert.strictEqual(wants, moved > 0, "seed " + (5000 + s) + " node " + i + ": wantsStop must match a transfer");
				checked += 1;
			}
		}
	}
	assert(checked > 1000, "checked a meaningful number of stop decisions (" + checked + ")");
}

// a train carrying `units` of R1, in the first slots the consist offers
function fillCargo(train, world, units) {
	var top = Train.capacity(train);
	var slot = 0;

	train.cargoUnits = 0;
	while (units > 0 && slot < top) {
		train.cargo[slot] = R1;
		train.cargoUnits += 1;
		units -= 1;
		slot += 1;
	}
}

// the 0.1.4 profit measure: the EMA of cash flow, averaged over a window, equals
// the measured cash rate over that window. the window is long because trade is
// lumpy: over 900 s the two differ by up to 8%, over 7200 s by under 3%
function testProfitRateTracksCashFlow() {
	var seeds = [24680, 13579, 97531];
	var warm = 60 * 300;
	var span = 60 * 7200;
	var s;
	var i;
	var sim;
	var cash0;
	var rateSum;
	var measured;
	var mean;

	for (s = 0; s < seeds.length; s += 1) {
		sim = Sim.create(seeds[s]);
		for (i = 0; i < warm; i += 1) Sim.step(sim, DT);
		cash0 = sim.trains[0].cash;
		rateSum = 0;
		for (i = 0; i < span; i += 1) {
			Sim.step(sim, DT);
			rateSum += sim.profitRate;
		}
		measured = (sim.trains[0].cash - cash0) / (span * DT);
		mean = rateSum / span;
		assert(Math.abs(mean - measured) <= 0.05 * measured, "seed " + seeds[s] + ": mean EMA " + mean.toFixed(3) + " tracks the cash rate " + measured.toFixed(3));
	}
}

testMarginRuleDecidesLoading();
testBestSellOnlyCountsConsumersThatNeedTheResource();
testUnloadNeedsRecipeAndRoom();
testTransactIsQuoteByQuote();
testUnloadPaysSellQuotes();
testRoundTripAtOneNodeLosesTheSpread();
testSourceDoesNotBuyBack();
testFullConsumerRefusesAndTrainKeepsCargo();
testLoadingStopsAtTheWagonLimit();
testWantsStopAgreesWithTransact();
testProfitRateTracksCashFlow();
console.log("Trade checks passed: margin rule, recipe-only best sell, unload room, quote-by-quote cash, spread loss, no buy-back, wagon limit, stop rule agrees with transfers, profit EMA tracks cash flow.");
