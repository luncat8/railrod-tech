"use strict";

var assert = require("assert");
var Const = require("../js/const.js");
require("../js/rng.js");
require("../js/world.js");
require("../js/economy.js");
var Tech = require("../js/tech.js");
require("../js/trade.js");
require("../js/train.js");
require("../js/line.js");
var Sim = require("../js/sim.js");

var STEPS = 10;

function buildAt(g, d, e) {
	return Tech.derive(knobsOf(g, d, e));
}

function knobsOf(g, d, e) {
	var knobs = Tech.defaultKnobs();

	knobs[Tech.GAUGE] = g;
	knobs[Tech.WHEEL] = d;
	knobs[Tech.ENGINE] = e;
	return knobs;
}

// the default build is the 0.1.3 consist: these are the numbers the sliders start from
function testDefaultBuildMatchesThe013Consist() {
	var build = buildAt(Const.KNOB_G, Const.KNOB_D, Const.KNOB_E);

	assert(Math.abs(build.mLoco - 40) < 1e-9, "loco mass at e = 0.5 is 40 t");
	assert(Math.abs(build.mWagon - 21) < 1e-9, "wagon mass at g = d = 0.5 is 21 t");
	assert(Math.abs(build.vTrack - 1.6) < 1e-9, "track speed at g = d = 0.5 is 1.6 km/s");
	assert(Math.abs(build.cRR - 0.0095) < 1e-9, "rolling resistance at d = 0.5 is 0.0095");
	assert(Math.abs(build.fTrac - 46.8) < 1e-9, "traction limit at e = 0.5 is 46.8 km/s² · t");
	assert(Math.abs(build.power - 160 * Math.pow(0.575, 1.8)) < 1e-9, "power at e = 0.5 follows the engine curve");
}

// the knob contract: every knob moves its build quantity in the stated direction
function testKnobsMoveTheBuildMonotonically() {
	var i;
	var lo = buildAt(0.1, 0.5, 0.5);
	var hi = buildAt(0.9, 0.5, 0.5);
	var wheelLo = buildAt(0.5, 0.1, 0.5);
	var wheelHi = buildAt(0.5, 0.9, 0.5);
	var engLo = buildAt(0.5, 0.5, 0.1);
	var engHi = buildAt(0.5, 0.5, 0.9);

	assert(hi.trackPerKm > lo.trackPerKm, "gauge raises track cost");
	assert(hi.wagonCost > lo.wagonCost, "gauge raises wagon cost");
	assert(hi.mWagon > lo.mWagon, "gauge raises wagon mass");
	assert(hi.vTrack > lo.vTrack, "gauge raises track speed");
	assert(wheelHi.mWagon > wheelLo.mWagon, "a bigger wheel is heavier");
	assert(wheelHi.wagonCost > wheelLo.wagonCost, "a bigger wheel costs more");
	assert(wheelHi.vTrack > wheelLo.vTrack, "a bigger wheel runs faster");
	assert(wheelHi.cRR < wheelLo.cRR, "a bigger wheel rolls easier");
	assert(engHi.mLoco > engLo.mLoco, "a bigger engine is heavier");
	assert(engHi.power > engLo.power, "a bigger engine has more power");
	assert(engHi.locoCost > engLo.locoCost, "a bigger engine costs more");
	assert(engHi.fTrac > engLo.fTrac, "a bigger engine adds traction through its mass");
	for (i = 1; i <= STEPS; i += 1) {
		assert(buildAt(i / (STEPS + 1), 0.5, 0.5).trackPerKm > buildAt((i - 1) / (STEPS + 1), 0.5, 0.5).trackPerKm, "track cost rises with gauge at every step");
	}
}

function testClampKeepsKnobsInRange() {
	assert.strictEqual(Tech.clampKnob(-1), Const.KNOB_MIN);
	assert.strictEqual(Tech.clampKnob(2), Const.KNOB_MAX);
	assert.strictEqual(Tech.clampKnob(0.37), 0.37);
}

// capex is amortised over AMORT_S and charged per wagon, per loco and per km of track
function testCapexIsTheAmortisedBuildValue() {
	var build = buildAt(0.5, 0.5, 0.5);
	var value = Const.RING_KM * build.trackPerKm + 4 * build.wagonCost + build.locoCost;

	assert(Math.abs(Tech.capexRate(build, 4) - value / Const.AMORT_S) < 1e-12, "capex rate = value / AMORT_S");
	assert(Tech.capexRate(build, 5) > Tech.capexRate(build, 4), "one more wagon adds capex");
	assert(Tech.capexRate(buildAt(0.9, 0.5, 0.5), 4) > Tech.capexRate(build, 4), "a wider gauge adds capex");
	assert(Tech.capexRate(buildAt(0.5, 0.5, 0.9), 4) > Tech.capexRate(build, 4), "a bigger engine adds capex");
}

// the sliders read in physical units: gauge in metres, wheel in metres
function testReadoutsAreInPhysicalUnits() {
	assert(Math.abs(Tech.gaugeM(0) - 0.6) < 1e-9, "gauge slider bottom is 0.6 m");
	assert(Math.abs(Tech.gaugeM(1) - 4.0) < 1e-9, "gauge slider top is 4.0 m");
	assert(Math.abs(Tech.gaugeM(0.5) - 2.3) < 1e-9, "gauge slider middle is 2.3 m");
	assert(Math.abs(Tech.wheelM(0) - 0.4) < 1e-9, "wheel bottom is 0.4 m");
	assert(Math.abs(Tech.wheelM(1) - 1.6) < 1e-9, "wheel top is 1.6 m");
}

// 0.1.7: the gauge carries the cargo. a wider wagon holds more units, and the hold
// is a whole number of units over the wagon — the rest of the model counts in units
function testGaugeSetsTheWagonHold() {
	var i;

	assert.strictEqual(Tech.holdPerWagon(0), 1, "the narrowest gauge holds one unit a wagon");
	assert.strictEqual(Tech.holdPerWagon(1), Const.HOLD_MAX, "the widest holds HOLD_MAX units a wagon");
	for (i = 1; i <= STEPS; i += 1) {
		assert(Tech.holdPerWagon(i / STEPS) > Tech.holdPerWagon((i - 1) / STEPS), "a wider gauge always holds more");
	}
}

// the hatch grows with the wagon, so a bigger wagon turns round in less than its own
// size in extra time — which is what makes the size worth paying for
function testTransferRateGrowsWithTheHold() {
	var lo = buildAt(0, 0.5, 0.5);
	var hi = buildAt(1, 0.5, 0.5);

	assert(hi.transferRate > lo.transferRate, "a bigger wagon is emptied through a bigger hatch");
	assert(hi.wagonHold / hi.transferRate > lo.wagonHold / lo.transferRate, "but not fast enough to keep up with its hold");
	assert(hi.transferRate / lo.transferRate < hi.wagonHold / lo.wagonHold, "so the hatch is the cheaper of the two");
}

// the dwell rule: it grows fast with the wagon count and slowly with the wagon size
function testDwellGrowsWithCountBeforeSize() {
	var wagons = 4;
	var narrow = buildAt(0, 0.5, 0.5);
	var wide = buildAt(1, 0.5, 0.5);
	var swapNarrow = 2 * Math.round(wagons * narrow.wagonHold) / narrow.transferRate;
	var swapWide = 2 * Math.round(wagons * wide.wagonHold) / wide.transferRate;
	var swapTwice = 2 * Math.round(2 * wagons * narrow.wagonHold) / narrow.transferRate;

	assert(swapTwice > 1.9 * swapNarrow, "twice the wagons is nearly twice the dwell");
	assert(swapWide > swapNarrow, "a wider wagon does take longer to load and unload");
	assert(swapWide < 1.5 * swapNarrow, "but a fraction of what the count costs");
}

// a knob change reaches the sim: the build and the amortised capex both move
function testSimSetKnobUpdatesBuildAndCapex() {
	var sim = Sim.create(24680);
	var before = sim.capexRate;

	Sim.setKnob(sim, Tech.ENGINE, 0.9);
	assert(sim.capexRate > before, "a bigger engine raises the capex rate");
	assert(Math.abs(sim.capexRate - Tech.capexRate(sim.trains[0].build, sim.trains[0].wagons)) < 1e-12, "the sim's capex is the train's build");
	assert(Math.abs(sim.netRate - (sim.profitRate - sim.capexRate)) < 1e-12, "net = profit − capex");
	Sim.setKnob(sim, Tech.ENGINE, 7);
	assert.strictEqual(sim.knobs[Tech.ENGINE], Const.KNOB_MAX, "an out-of-range knob is clamped");
}

testDefaultBuildMatchesThe013Consist();
testKnobsMoveTheBuildMonotonically();
testClampKeepsKnobsInRange();
testCapexIsTheAmortisedBuildValue();
testReadoutsAreInPhysicalUnits();
testGaugeSetsTheWagonHold();
testTransferRateGrowsWithTheHold();
testDwellGrowsWithCountBeforeSize();
testSimSetKnobUpdatesBuildAndCapex();
console.log("Tech checks passed: default build matches the 0.1.3 consist, knobs move the build as stated, clamp, amortised capex, physical readouts, and the gauge carrying the hold.");
