"use strict";

var assert = require("assert");
var Rng = require("../js/rng.js");
var Const = require("../js/const.js");
var World = require("../js/world.js");
// sim.js calls into economy and train at reset/step, so they load first, in dependency order
require("../js/economy.js");
require("../js/tech.js");
require("../js/trade.js");
var Train = require("../js/train.js");
require("../js/line.js");
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

	assert.deepStrictEqual(Array.from(a.terrain), Array.from(b.terrain));
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
	assert.strictEqual(world.terrain.length, Const.TERRAIN_N);
	for (i = 0; i < world.terrain.length; i += 1) {
		assert(Number.isFinite(world.terrain[i]), "terrain height is finite");
		assert(Math.abs(world.terrain[i]) <= Const.TERRAIN_RELIEF_M, "height stays within the relief scale");
	}

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

function testTerrainWrapsRendersAndCopies() {
	var world = World.generate(Rng.create(73));
	var copy = World.blank(world.nodeCount);
	var flat = World.blank(1);
	var view = { trackY: 400 };
	var slopeLimit = Const.TERRAIN_SLOPE_MAX_DEG * Math.PI / 180;
	var x;
	var height;
	var slope;

	assert.strictEqual(World.terrainHeightAt(flat, 0), 0, "a blank heightmap starts flat");
	assert.strictEqual(World.terrainSlopeAt(flat, 0), 0, "a flat heightmap has zero grade");
	assert.strictEqual(Render.terrainColor(0), "#0e120f", "zero slope keeps the flat ground tone");
	assert.notStrictEqual(Render.terrainColor(-slopeLimit), Render.terrainColor(slopeLimit),
		"the restrained palette distinguishes downhill from uphill");
	assert.strictEqual(Render.terrainColor(slopeLimit * 2), Render.terrainColor(slopeLimit),
		"extreme slopes clamp to the end of the colormap");

	for (x = -Const.RING_KM; x <= Const.RING_KM * 2; x += 0.37) {
		height = World.terrainHeightAt(world, x);
		slope = World.terrainSlopeAt(world, x);
		assert(Math.abs(height - World.terrainHeightAt(world, x + Const.RING_KM)) < 1e-5,
			"height repeats around the loop");
		assert(Math.abs(slope - World.terrainSlopeAt(world, x + Const.RING_KM)) < 1e-7,
			"slope repeats around the loop");
		assert(Math.abs(Render.trackYAt(view, world, x)
			- (view.trackY - height * Const.TERRAIN_Y_PX_PER_M)) < 1e-9,
			"terrain height maps to canvas Y with the configured scale");
	}
	assert(Math.abs(World.terrainHeightAt(world, 0.001)
		- World.terrainHeightAt(world, Const.RING_KM - 0.001)) < 0.1,
		"the profile is smooth through the ring seam");
	World.copyInto(copy, world);
	assert.deepStrictEqual(Array.from(copy.terrain), Array.from(world.terrain), "world snapshots carry the terrain profile");
}

// the kinematics step is the only writer of train.x: it must stay wrapped and
// continuous while the train travels more than a full lap
function testTrainCrossesSeamWithoutJump() {
	var sim = Sim.create(31337);
	var train = sim.trains[0];
	var dt = Const.DT;
	var steps = Math.ceil(Const.RING_KM / (0.4 * dt)) + 10;
	var prev = train.x;
	var i;
	var d;

	// a free run: no stop ahead, so the track speed is the only cap
	train.v = 0;
	for (i = 0; i < steps; i += 1) {
		Train.advance(train, dt, train.build.vTrack, 0);
		d = (train.x - prev) % Const.RING_KM;
		if (d < 0) d += Const.RING_KM;
		assert(train.x >= 0 && train.x < Const.RING_KM, "position stays wrapped");
		assert(d < 0.5, "no jump across the seam");
		assert(World.distance(train.x, prev) === Math.min(d, Const.RING_KM - d), "ring distance matches the step");
		prev = train.x;
	}
	assert(train.v > 0, "a free-running train keeps accelerating over a lap");
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
	var train = sim.trains[0];
	var cameraX = train.x;
	var follow = 0.1;
	var steps = Math.ceil(Const.RING_KM * 2.5 / (0.4 * Const.DT));
	var prevSx = Render.screenX(train.x, cameraX, px, width, ringKm);
	var i;
	var sx;

	train.v = 0;
	for (i = 0; i < steps; i += 1) {
		Train.advance(train, Const.DT, train.build.vTrack, 0);
		cameraX = Render.cameraStep(cameraX, train.x, ringKm, follow);
		sx = Render.screenX(train.x, cameraX, px, width, ringKm);
		assert(Math.abs(sx - prevSx) < 50, "no screen jump across the seam while the camera follows");
		assert(Math.abs(sx - width * 0.5) <= width * 0.5 + 60, "train stays on screen");
		prevSx = sx;
	}
}

function testHitNodeFindsNearestNode() {
	var sim = Sim.create(2468);
	var world = sim.world;
	var view = {
		cameraX: world.x[0],
		pxPerKm: 50,
		width: 1200,
		trackY: 400
	};
	var i;
	var sx;
	var sy;

	// every node is hit at its own screen column, inside the node's terrain-relative band
	for (i = 0; i < world.nodeCount; i += 1) {
		sx = Render.screenX(world.x[i], view.cameraX, view.pxPerKm, view.width, Const.RING_KM);
		sy = Render.trackYAt(view, world, world.x[i]) - 30;
		assert.strictEqual(Render.hitNode(view, sim, sx, sy), i, "node " + i + " is hit at its own column");
	}
	// above the band, and far off the track, nothing is hit
	assert.strictEqual(Render.hitNode(view, sim, 600, view.trackY - 80), -1);
	assert.strictEqual(Render.hitNode(view, sim, -5000, view.trackY), -1);
}

// every resource must have an emitter and a hungry yard, or a slice of the map is dead
function testEveryResourceHasBothSides() {
	var s;
	var world;
	var emits;
	var wants;
	var i;
	var r;

	for (s = 0; s < 200; s += 1) {
		world = World.generate(Rng.create(90000 + s));
		emits = [0, 0, 0];
		wants = [0, 0, 0];
		for (i = 0; i < world.nodeCount; i += 1) {
			for (r = 0; r < Const.RES_N; r += 1) {
				if (world.kind[i] === World.SRC && world.inflow[i * Const.RES_N + r] > 0) emits[r] += 1;
				if (world.kind[i] === World.CON && (world.need[i] & (1 << r))) wants[r] += 1;
			}
		}
		for (r = 0; r < Const.RES_N; r += 1) {
			assert(emits[r] > 0, "seed " + (90000 + s) + " has an emitter of r" + (r + 1));
			assert(wants[r] > 0, "seed " + (90000 + s) + " has a yard that buys r" + (r + 1));
		}
	}
}

testSpacingAcrossSeeds();
testGenerationIsDeterministic();
testWorldShape();
testTerrainWrapsRendersAndCopies();
testTrainCrossesSeamWithoutJump();
testEveryPositionHasACameraNearCopy();
testCameraFollowsAcrossSeam();
testHitNodeFindsNearestNode();
testEveryResourceHasBothSides();
console.log("World checks passed: 100-seed spacing, deterministic terrain and markets, terrain wrapping and rendering, world shape, seam-continuous train and camera, node hit test, and every resource with an emitter and a buyer on 200 seeds.");
