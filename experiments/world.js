"use strict";

var assert = require("assert");
var Rng = require("../js/rng.js");
var Const = require("../js/const.js");
var World = require("../js/world.js");
var Sim = require("../js/sim.js");
var Render = require("../js/render.js");

var SEED_BASE = 1000;
var SEED_COUNT = 100;

function testSpacingAcrossSeeds() {
	var s;
	var i;
	var j;
	var world;

	for (s = 0; s < SEED_COUNT; s += 1) {
		world = World.generate(Rng.create(SEED_BASE + s));
		assert.strictEqual(world.nodeCount, Const.NODE_N);
		for (i = 0; i < world.nodeCount; i += 1) {
			assert(world.x[i] >= 0 && world.x[i] < Const.RING_KM, "node position inside the ring");
			for (j = i + 1; j < world.nodeCount; j += 1) {
				assert(
					World.distance(world.x[i], world.x[j]) >= Const.MIN_GAP_KM - 1e-4,
					"seed " + (SEED_BASE + s) + ": nodes " + i + " and " + j + " closer than MIN_GAP_KM"
				);
			}
		}
	}
}

function testGenerationIsDeterministic() {
	var a = World.generate(Rng.create(424242));
	var b = World.generate(Rng.create(424242));

	assert.deepStrictEqual(Array.from(a.x), Array.from(b.x));
	assert.deepStrictEqual(Array.from(a.kind), Array.from(b.kind));
	assert.deepStrictEqual(Array.from(a.need), Array.from(b.need));
	assert.deepStrictEqual(Array.from(a.stock), Array.from(b.stock));
	assert.deepStrictEqual(Array.from(a.cap), Array.from(b.cap));
	assert.deepStrictEqual(Array.from(a.inflow), Array.from(b.inflow));
	assert.deepStrictEqual(Array.from(a.base), Array.from(b.base));
	assert.deepStrictEqual(Array.from(a.rate), Array.from(b.rate));
	assert.deepStrictEqual(Array.from(a.fragility), Array.from(b.fragility));
}

function testWorldShape() {
	var world = World.generate(Rng.create(7));
	var n = world.nodeCount;
	var res = Const.RES_N;
	var srcs = 0;
	var cons = 0;
	var i;
	var r;
	var idx;
	var inflows;
	var maskBits;

	assert.strictEqual(world.stock.length, n * res);
	assert.strictEqual(world.cap.length, n * res);
	assert.strictEqual(world.inflow.length, n * res);
	assert.strictEqual(world.base.length, n * res);
	assert.strictEqual(world.need.length, n);
	assert.strictEqual(world.rate.length, n);
	assert.strictEqual(world.fragility.length, n);

	for (i = 0; i < n; i += 1) {
		inflows = 0;
		maskBits = 0;
		for (r = 0; r < res; r += 1) {
			idx = i * res + r;
			if (world.inflow[idx] > 0) inflows += 1;
			if (world.need[i] & (1 << r)) maskBits += 1;
			assert(world.cap[idx] > 0, "yard capacity positive");
			assert(world.base[idx] > 0, "base price positive");
			assert(world.stock[idx] >= 0 && world.stock[idx] <= world.cap[idx] + 1e-4, "stock within capacity");
		}
		assert(world.fragility[i] >= Const.K_MIN && world.fragility[i] <= Const.K_MAX, "fragility in range");
		if (world.kind[i] === World.SRC) {
			srcs += 1;
			assert.strictEqual(inflows, 1, "source emits exactly one resource");
		} else {
			cons += 1;
			assert(maskBits >= 1 && maskBits <= 2, "consumer recipe uses one or two resources");
			assert(world.rate[i] > 0, "consumer rate positive");
		}
	}
	assert(srcs >= 1 && cons >= 1, "world has both sources and consumers");
}

function testTrainCrossesSeamWithoutJump() {
	var sim = Sim.create(31337);
	var v = Const.TRAIN_V;
	var dt = Const.DT;
	var steps = Math.ceil(Const.RING_KM / (v * dt)) + 10;
	var prev = sim.train.x;
	var i;
	var d;

	for (i = 0; i < steps; i += 1) {
		Sim.step(sim, dt);
		d = (sim.train.x - prev) % Const.RING_KM;
		if (d < 0) d += Const.RING_KM;
		assert(Math.abs(d - v * dt) < 1e-4, "wrapped step keeps constant speed across the seam");
		prev = sim.train.x;
	}
}

function testEveryPositionHasACameraNearCopy() {
	var ringKm = Const.RING_KM;
	var x;
	var cameraX;
	var copy;

	for (x = 0; x < ringKm; x += 0.37) {
		for (cameraX = 0; cameraX < ringKm; cameraX += 1.13) {
			copy = x + Render.copyOffset(x, cameraX, ringKm);
			assert(Math.abs(copy - cameraX) <= ringKm * 0.5 + 1e-9, "nearest ring copy within half a ring of the camera");
		}
	}
}

function testCameraFollowsAcrossSeam() {
	var ringKm = Const.RING_KM;
	var px = 50;
	var width = 1200;
	var sim = Sim.create(999);
	var cameraX = sim.train.x;
	var follow = 0.1;
	var steps = Math.ceil((Const.RING_KM * 2.5) / (Const.TRAIN_V * Const.DT));
	var prevSx = Render.screenX(sim.train.x, cameraX, px, width, ringKm);
	var i;
	var sx;

	for (i = 0; i < steps; i += 1) {
		Sim.step(sim, Const.DT);
		cameraX = Render.cameraStep(cameraX, sim.train.x, ringKm, follow);
		sx = Render.screenX(sim.train.x, cameraX, px, width, ringKm);
		assert(Math.abs(sx - prevSx) < 50, "no screen jump across the seam while the camera follows");
		assert(Math.abs(sx - width * 0.5) <= width * 0.5 + 60, "train stays on screen");
		prevSx = sx;
	}
}

testSpacingAcrossSeeds();
testGenerationIsDeterministic();
testWorldShape();
testTrainCrossesSeamWithoutJump();
testEveryPositionHasACameraNearCopy();
testCameraFollowsAcrossSeam();
console.log("World checks passed: 100-seed spacing, determinism, world shape, seam-continuous train and camera.");
