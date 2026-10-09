"use strict";

var assert = require("assert");
var Rng = require("../js/rng.js");
var Const = require("../js/const.js");
var World = require("../js/world.js");
var Sim = require("../js/sim.js");
var Clock = require("../js/clock.js");

var SEED = 184271;
var STEPS = 30000;

function randomizedStep(sim, dt) {
	Sim.step(sim, dt);
	Rng.nextUint(sim.rng);
}

function runSchedule(speed) {
	var sim = Sim.create(SEED);
	var clock = Clock.create();
	var frameCount = STEPS / speed;
	var frame = 0;

	assert.strictEqual(frameCount % 1, 0, "test schedule must land on an exact step count");
	for (frame = 0; frame < frameCount; frame += 1) {
		Clock.advance(clock, Const.DT, speed, randomizedStep, sim);
	}

	assert.strictEqual(sim.steps, STEPS, "schedule reached the requested fixed-step count");
	return sim;
}

function testSpeedIndependentDeterminism() {
	var normal = runSchedule(1);
	var fast = runSchedule(8);

	assert.strictEqual(normal.seed, fast.seed);
	assert.strictEqual(normal.steps, fast.steps);
	assert.strictEqual(normal.time, fast.time);
	assert.strictEqual(normal.rng.state, fast.rng.state);
}

function testStepCapAndDroppedTime() {
	var sim = Sim.create(SEED);
	var clock = Clock.create();
	var steps = Clock.advance(clock, 10, 8, Sim.step, sim);

	assert.strictEqual(steps, Const.MAX_STEPS);
	assert.strictEqual(sim.steps, Const.MAX_STEPS);
	assert(clock.droppedSeconds > 0, "lagged simulation time is reported");
	assert(clock.accumulator < Const.DT, "whole-step backlog is not carried forward");
}

function testResetReusesAndRestartsTheStream() {
	var sim = Sim.create(SEED);
	var stateAfterCreate = sim.rng.state;
	var xAfterCreate = Array.from(sim.world.x);
	var first = Rng.nextUint(sim.rng);

	Sim.reset(sim, SEED);
	assert.strictEqual(sim.rng.state, stateAfterCreate, "reset restarts the stream at the same post-generation point");
	assert.strictEqual(Rng.nextUint(sim.rng), first, "post-reset draws match post-create draws");
	assert.deepStrictEqual(Array.from(sim.world.x), xAfterCreate, "reset regenerates the identical world");
	assert.strictEqual(sim.steps, 0);
	assert.strictEqual(sim.time, 0);
}

testSpeedIndependentDeterminism();
testStepCapAndDroppedTime();
testResetReusesAndRestartsTheStream();
console.log("Harness checks passed: deterministic speed schedules, step cap, dropped-time accounting, and seed reset.");
