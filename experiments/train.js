"use strict";

var assert = require("assert");
var Rng = require("../js/rng.js");
var Const = require("../js/const.js");
var World = require("../js/world.js");
// sim.js calls into economy and train at reset/step, so they load first
require("../js/economy.js");
var Train = require("../js/train.js");
var Sim = require("../js/sim.js");

var DT = Const.DT;
var SEED = 24680;
var LEG_KM = Const.RING_KM / Const.NODE_N; // mean node spacing
var MAX_STEPS = 60 * 600;

// a two-node ring: enough for the state machine, and the leg length is exact
function lineWorld(a, b) {
	return {
		nodeCount: 2,
		x: Float32Array.of(a, b)
	};
}

function runLeg(train, world) {
	var steps = 0;

	while (train.state === Train.CRUISE && steps < MAX_STEPS) {
		Train.step(train, world, DT);
		steps += 1;
	}
	assert(steps < MAX_STEPS, "the train reaches its waypoint");
	return train.tripTime;
}

function freshTrain(wagons) {
	var train = Train.create();

	if (wagons !== undefined) train.wagons = wagons;
	return train;
}

function testMassModel() {
	var build = Train.getBuild();
	var train = freshTrain(4);
	var wagons;
	var prev = 0;
	var mass;

	train.cargoUnits = 0;
	Train.refreshProfile(train);
	assert.strictEqual(train.mass, build.mLoco + 4 * build.mWagon, "empty consist mass");

	train.cargoUnits = 3;
	Train.refreshProfile(train);
	assert.strictEqual(train.mass, build.mLoco + 4 * build.mWagon + 3 * Const.UNIT_T, "cargo adds payload mass");

	train.cargoUnits = 0;
	for (wagons = Const.WAGON_MIN; wagons <= Const.WAGON_MAX; wagons += 1) {
		train.wagons = wagons;
		Train.refreshProfile(train);
		mass = train.mass;
		assert(mass > prev, "mass grows with the consist");
		assert.strictEqual(mass, build.mLoco + wagons * build.mWagon, "mass is loco + wagons");
		prev = mass;
	}
}

function testProfileReachesTheSpeedCap() {
	var build = Train.getBuild();
	var train = freshTrain(Const.WAGON_DEFAULT);

	Train.refreshProfile(train);
	assert(train.profile.T > 0 && train.profile.S > 0, "the accel phase is non-degenerate");
	assert(Math.abs(train.profile.v - build.vTrack) < 1e-6, "the starting build reaches the track speed");
	assert(train.profile.S < build.vTrack * train.profile.T, "accelerating covers less than cruising would");
}

function testWagonsLengthenTheTrip() {
	var wagons;
	var prev = 0;
	var time;
	var slow;
	var fast;
	var ratio;

	for (wagons = Const.WAGON_MIN; wagons <= Const.WAGON_MAX; wagons += 1) {
		time = runLegTrip(wagons);
		assert(time > prev, "W=" + wagons + " is slower than W=" + (wagons - 1));
		prev = time;
	}

	fast = runLegTrip(4);
	slow = runLegTrip(8);
	ratio = slow / fast;
	assert(ratio > 1.15, "doubling the consist lengthens the trip by more than 15% (got " + ratio.toFixed(3) + ")");
	console.log("  trip " + LEG_KM.toFixed(2) + " km: W=1 " + runLegTrip(1).toFixed(2)
		+ " s, W=4 " + fast.toFixed(2) + " s, W=8 " + slow.toFixed(2) + " s (x" + ratio.toFixed(2) + ")");
}

function runLegTrip(wagons) {
	var train = freshTrain(wagons);
	var world = lineWorld(0, LEG_KM);

	Train.reset(train, world);
	return runLeg(train, world);
}

function testEstimateMatchesMeasuredTrips() {
	var worst = 0;
	var worstAt = "";
	var wagons;
	var km;
	var train = freshTrain();
	var world;
	var measured;
	var planned;
	var error;

	for (wagons = Const.WAGON_MIN; wagons <= Const.WAGON_MAX; wagons += 1) {
		train.wagons = wagons;
		for (km = 0.5; km <= 30; km *= 1.5) {
			world = lineWorld(0, km);
			Train.reset(train, world);
			planned = train.tripEstimate;
			measured = runLeg(train, world);
			error = Math.abs(planned - measured) / measured;
			assert(error < 0.1, "W=" + wagons + " L=" + km.toFixed(2) + ": estimate off by " + (error * 100).toFixed(1) + "%");
			if (error > worst) {
				worst = error;
				worstAt = "W=" + wagons + " L=" + km.toFixed(2) + " km";
			}
		}
	}
	console.log("  worst trip estimate error: " + (worst * 100).toFixed(2) + "% at " + worstAt);
}

function testArrivalAndDwell() {
	var world = lineWorld(0, LEG_KM);
	var train = freshTrain();

	Train.reset(train, world);
	runLeg(train, world);

	assert.strictEqual(train.v, 0, "arrival captures the waypoint by stopping");
	assert.strictEqual(train.x, world.x[1], "arrival lands exactly on the waypoint");
	assert.strictEqual(train.at, 1, "the train knows where it stands");
	assert.strictEqual(train.state, Train.DWELL, "arrival starts the dwell");
	assert(Math.abs(train.dwellLeft - Const.DWELL_S) < 1e-9, "dwell starts at DWELL_S");
	assert.strictEqual(train.lastTripTime, train.tripTime, "arrival freezes the reported trip");
	assert(Math.abs(train.lastTripKm - LEG_KM) < 1e-6, "the reported leg is the one just run");

	// dwell counts down, then the waypoints swap and the train departs
	var guard = 0;
	while (train.state === Train.DWELL && guard < MAX_STEPS) {
		Train.step(train, world, DT);
		guard += 1;
	}
	assert.strictEqual(train.state, Train.CRUISE, "the dwell ends");
	assert.strictEqual(train.from, 1, "the shuttle partner is the node just reached");
	assert.strictEqual(train.to, 0, "the train heads back");
	assert.strictEqual(train.dir, -1, "and reverses direction");
	assert(train.dwellLeft <= 0, "the dwell clock is spent");
	assert(train.lastTripTime > 0, "the reported trip survives the departure");
	assert.strictEqual(train.tripTime, 0, "the new leg starts a fresh clock");

	// half a dwell before the first step is still inside the dwell
	Train.reset(train, world);
	runLeg(train, world);
	Train.step(train, world, Const.DWELL_S * 0.5);
	assert.strictEqual(train.state, Train.DWELL, "a short step does not end the dwell");
}

function testClearRouteParksTheTrain() {
	var train = freshTrain();
	var world = lineWorld(0, LEG_KM);

	Train.reset(train, world);
	Train.setDestination(train, world, train.at);
	assert.strictEqual(train.state, Train.WAIT, "clicking the node the train stands on parks it");
	assert.strictEqual(train.to, -1, "no destination");

	Train.step(train, world, DT);
	assert.strictEqual(train.v, 0, "a parked train does not move");

	// routing from a parked train shuttles between the two nodes
	Train.setDestination(train, world, 1);
	assert.strictEqual(train.state, Train.CRUISE, "routing departs at once");
	assert.strictEqual(train.from, 0, "from where it stood");
	assert.strictEqual(train.to, 1, "to the clicked node");
}

function testRetargetWhileCruising() {
	var train = freshTrain();
	var world = { nodeCount: 3, x: Float32Array.of(0, 10, 40) };

	Train.reset(train, world);
	assert.strictEqual(train.to, 1, "reset routes to the nearest node");

	Train.setDestination(train, world, 2);
	assert.strictEqual(train.to, 2, "a click retargets a running train");
	assert.strictEqual(train.from, 0, "and keeps the node it came from");
	assert.strictEqual(train.at, -1, "a running train has no current node");
}

function testAntipodalLegTakesIncreasingX() {
	var train = freshTrain();
	var world = lineWorld(0, Const.RING_KM * 0.5);

	Train.reset(train, world);
	assert.strictEqual(train.dir, 1, "a tie takes the increasing-x arc");
	assert(Math.abs(train.tripKm - Const.RING_KM * 0.5) < 1e-6, "half a ring either way");
}

function testSeamCrossingLegMatchesItsMirror() {
	var flat = freshTrain();
	var wrap = freshTrain();
	var flatWorld = lineWorld(10, 10 + LEG_KM);
	var wrapWorld = lineWorld(Const.RING_KM - 2, LEG_KM - 2);
	var flatTime;
	var wrapTime;

	Train.reset(flat, flatWorld);
	Train.reset(wrap, wrapWorld);
	assert.strictEqual(wrap.dir, 1, "the leg crosses x = 0 going up");

	flatTime = runLeg(flat, flatWorld);
	wrapTime = runLeg(wrap, wrapWorld);

	assert(Math.abs(flatTime - wrapTime) < 1e-3, "a seam-crossing trip takes the same time as its mirror");
	assert(Math.abs(flat.tripEstimate - wrap.tripEstimate) < 1e-3, "and is planned identically");
	assert.strictEqual(wrap.x, wrapWorld.x[1], "it lands on the far node");
}

function testSpeedStaysInsideItsBounds() {
	var sim = Sim.create(SEED);
	var train = sim.trains[0];
	var build = Train.getBuild();
	var i;

	for (i = 0; i < 60 * 120; i += 1) {
		Sim.step(sim, DT);
		assert(train.v >= 0, "speed never goes negative");
		assert(train.v <= build.vTrack + 1e-9, "speed never exceeds the track limit");
		assert(Number.isFinite(train.x) && train.x >= 0 && train.x < Const.RING_KM, "position stays on the ring");
	}
}

function testStalledBuildCannotDepart() {
	var build = Train.getBuild();
	var train = freshTrain();
	var world = lineWorld(0, LEG_KM);
	var i;

	Train.setBuild({
		mLoco: build.mLoco,
		mWagon: build.mWagon,
		vTrack: build.vTrack,
		power: 0,
		cRR: build.cRR,
		fTrac: 0
	});
	Train.reset(train, world);
	assert.strictEqual(train.tripEstimate, Infinity, "a train that cannot move plans an infinite trip");
	for (i = 0; i < 600; i += 1) Train.step(train, world, DT);
	assert.strictEqual(train.v, 0, "no traction, no motion");
	assert.strictEqual(train.state, Train.CRUISE, "it waits for a route it can run");

	Train.setBuild(build);
	Train.reset(train, world);
	assert(train.tripEstimate > 0 && train.tripEstimate < Infinity, "restoring the build restores the plan");
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
	assert.strictEqual(a.trains[0].state, b.trains[0].state, "same steps, same state");
	assert.strictEqual(a.trains[0].tripTime, b.trains[0].tripTime, "same steps, same trip clock");
	assert.strictEqual(a.trains[0].at, b.trains[0].at, "same steps, same waypoint");
}

function testTrainRunsTheSeededWorld() {
	var sim = Sim.create(SEED);
	var train = sim.trains[0];
	var arrivals = 0;
	var prevState = train.state;
	var i;
	var j;
	var distance;

	for (i = 0; i < 60 * 300; i += 1) {
		Sim.step(sim, DT);
		if (train.state === Train.DWELL && prevState === Train.CRUISE) arrivals += 1;
		prevState = train.state;
	}
	assert(arrivals >= 10, "the train completes trips (got " + arrivals + ")");
	assert(train.to >= 0 && train.to < sim.world.nodeCount, "the destination is a real node");

	// every other node is a legal destination, along the shorter arc
	for (j = 0; j < sim.world.nodeCount; j += 1) {
		if (j === train.at || j === train.from) continue;
		Train.setDestination(train, sim.world, j);
		distance = World.distance(train.x, sim.world.x[j]);
		assert(Math.abs(train.tripKm - distance) < 1e-3, "the leg length is the ring distance to node " + j);
		assert(train.tripEstimate > 0 && train.tripEstimate < Infinity, "node " + j + " gets a finite plan");
	}
}

testMassModel();
testProfileReachesTheSpeedCap();
testWagonsLengthenTheTrip();
testEstimateMatchesMeasuredTrips();
testArrivalAndDwell();
testClearRouteParksTheTrain();
testRetargetWhileCruising();
testAntipodalLegTakesIncreasingX();
testSeamCrossingLegMatchesItsMirror();
testSpeedStaysInsideItsBounds();
testStalledBuildCannotDepart();
testDeterminism();
testTrainRunsTheSeededWorld();
console.log("Train checks passed: mass model, wagon sweep, trip estimate, state machine, seam, speed bounds, determinism.");
