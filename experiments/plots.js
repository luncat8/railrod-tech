"use strict";

// 0.1.7 — build curves. The plots are the model the sim runs, not a picture of
// something else, so the check is that each curve says what the knob contract says
// and that a curve read at the marker is the number Tech and Train would give.

var assert = require("assert");
var Const = require("../js/const.js");
require("../js/rng.js");
require("../js/world.js");
require("../js/economy.js");
var Tech = require("../js/tech.js");
require("../js/trade.js");
var Train = require("../js/train.js");
var Sim = require("../js/sim.js");
var Plot = require("../js/plot.js");

var SEEDS = [731421, 1000, 1001, 1002, 1003, 1004];

function simAt(seed) {
	return Sim.create(seed);
}

function plotFor(sim, control) {
	var plot = Plot.create();

	Plot.fill(plot, control, sim);
	return plot;
}

function seriesOf(plot, chartIndex, seriesIndex) {
	return plot.charts[chartIndex].series[seriesIndex];
}

// every curve is a number, and the marker sits inside the curve's own range
function testCurvesAreFiniteAndBounded() {
	var s;
	var c;
	var i;
	var k;
	var sim;
	var plot;
	var chart;
	var series;

	for (s = 0; s < SEEDS.length; s += 1) {
		sim = simAt(SEEDS[s]);
		for (c = 0; c < Plot.CONTROL_N; c += 1) {
			plot = plotFor(sim, c);
			assert.strictEqual(plot.control, c, "the plot is the one asked for");
			for (i = 0; i < plot.chartN; i += 1) {
				chart = plot.charts[i];
				for (k = 0; k < chart.seriesN; k += 1) {
					series = chart.series[k];
					for (var v = 0; v < Plot.SAMPLES; v += 1) {
						assert(Number.isFinite(series.values[v]), "curve " + series.name + " is finite");
					}
					assert(series.at >= series.lo - 1e-9 && series.at <= series.hi + 1e-9,
						"the marker sits inside the curve it reads (" + series.name + ")");
					assert(chart.x1 > chart.x0, "the x axis runs forwards");
				}
			}
		}
	}
}

// wagons: mass is linear in the wagon count, and the consist's hold with it. the
// transfer time grows with the wagon count and only creeps up with the wagon size
function testWagonsPlotIsWeightAndTransferTime() {
	var sim = simAt(SEEDS[0]);
	var train = sim.trains[0];
	var plot = plotFor(sim, Plot.WAGONS);
	var mass = seriesOf(plot, 0, 0);
	var loaded = seriesOf(plot, 0, 1);
	var swap = seriesOf(plot, 0, 2);
	var build = sim.trains[0].build;
	var w;
	var step;

	// the x of this plot is whole wagons, so the curve is a staircase over them
	for (w = 1; w < Plot.SAMPLES; w += 1) {
		assert(mass.values[w] >= mass.values[w - 1], "more wagons never weigh less");
		assert(loaded.values[w] > mass.values[w], "a loaded consist weighs more than an empty one");
		assert(swap.values[w] >= swap.values[w - 1], "more wagons never take less time to load and unload");
	}
	step = (mass.values[Plot.SAMPLES - 1] - mass.values[0]) / (Const.WAGON_MAX - Const.WAGON_MIN);
	assert(Math.abs(step - build.mWagon) < 1e-6, "one wagon adds one wagon's weight");
	assert(Math.abs(swap.values[Plot.SAMPLES - 1] - 2 * Train.capacity(full(train)) / build.transferRate) < 1e-9,
		"the swap time is the whole hold out and the whole hold in");

	// size against count: a wagon twice the size costs less than twice the time
	Sim.setKnob(sim, Tech.GAUGE, 0);
	var narrow = plotFor(sim, Plot.WAGONS).charts[0].series[2].values[Plot.SAMPLES - 1];
	Sim.setKnob(sim, Tech.GAUGE, 1);
	var wide = plotFor(sim, Plot.WAGONS).charts[0].series[2].values[Plot.SAMPLES - 1];
	assert(wide > narrow, "a bigger wagon does take longer to empty and fill");
	assert(wide < 2 * narrow, "but nowhere near proportionally: the hatch grows with the wagon");
	Sim.setKnob(sim, Tech.GAUGE, Const.KNOB_G);
}

// gauge: the hold is a staircase of whole units over the wagon count, and the mass
// it drags along rises with it. the two together are the reason to look twice
function testGaugePlotIsHoldAgainstMass() {
	var sim = simAt(SEEDS[0]);
	var train = sim.trains[0];
	var plot = plotFor(sim, Plot.GAUGE);
	var hold = seriesOf(plot, 0, 0);
	var mass = seriesOf(plot, 0, 1);
	var i;

	for (i = 1; i < Plot.SAMPLES; i += 1) {
		assert(hold.values[i] >= hold.values[i - 1], "a wider gauge never holds less");
		assert(mass.values[i] > mass.values[i - 1], "and always drags more iron");
	}
	assert.strictEqual(hold.values[0], train.wagons * Const.UNIT_T, "the narrowest gauge holds one unit a wagon");
	assert.strictEqual(hold.values[Plot.SAMPLES - 1], train.wagons * Const.HOLD_MAX * Const.UNIT_T,
		"the widest holds HOLD_MAX units a wagon");
	assert.strictEqual(mass.values[Plot.SAMPLES - 1] - mass.values[0],
		train.wagons * (Tech.mWagonOf(1, Const.KNOB_D) - Tech.mWagonOf(0, Const.KNOB_D)),
		"the mass curve is the wagon the gauge builds");
}

// wheel: heavier and longer to stop as it grows, and the acceleration curve over
// speed is falling — the engine gives P / v and the mass divides what is left
function testWheelPlotIsFrictionAndMass() {
	var sim = simAt(SEEDS[0]);
	var plot = plotFor(sim, Plot.WHEEL);
	var mass = seriesOf(plot, 0, 0);
	var accel = seriesOf(plot, 0, 1);
	var brake = seriesOf(plot, 0, 2);
	var curve = seriesOf(plot, 1, 0);
	var narrow = seriesOf(plot, 1, 1);
	var wide = seriesOf(plot, 1, 2);
	var i;

	assert.strictEqual(plot.chartN, 2, "the wheel gets a second chart: acceleration over speed");
	for (i = 1; i < Plot.SAMPLES; i += 1) {
		assert(mass.values[i] > mass.values[i - 1], "a bigger wheel is heavier");
		assert(brake.values[i] > brake.values[i - 1], "and it runs faster, so it stops from further out");
		assert(curve.values[i] <= curve.values[i - 1] + 1e-12, "acceleration falls as speed rises");
		assert(narrow.values[i] <= narrow.values[i - 1] + 1e-12, "at any wheel size");
		assert(wide.values[i] <= wide.values[i - 1] + 1e-12, "at any wheel size");
	}
	assert(Math.abs(accel.values[0] - Train.accel(probeAt(sim, 0), 0)) < 1e-9,
		"the acceleration the plot names is Train.accel at a standstill");
	assert(Math.abs(brake.values[0] - Math.pow(Tech.vTrackOf(Const.KNOB_G, 0), 2) / (2 * Const.BRAKE_DECEL)) < 1e-9,
		"the brake distance is the line speed stopped at the service rate");
	assert(curve.values[Plot.SAMPLES - 1] < curve.values[0], "the power limit bites by the top of the range");
}

// the sim's consist at the top of the wagon slider, on the plot's own scratch train
function full(train) {
	var probe = Plot.create().train;

	probe.wagons = Const.WAGON_MAX;
	probe.build = train.build;
	return probe;
}

// the scratch train the plots measure with: the player's consist, empty, built to
// the knobs of the sample the plot is drawing
function probeAt(sim, wheelKnob) {
	var knobs = [sim.knobs[Tech.GAUGE], wheelKnob, sim.knobs[Tech.ENGINE]];
	var probe = Plot.create().train;

	probe.wagons = sim.trains[0].wagons;
	probe.cargoUnits = 0;
	Tech.deriveInto(probe.build, knobs);
	return probe;
}

function probeOf(sim) {
	return probeAt(sim, sim.knobs[Tech.WHEEL]);
}

// engine: both force curves rise with the loco, but the power line rises faster and
// crosses the adhesion line inside the slider. past the crossing the extra iron buys
// nothing the rails can take, and that crossing is the whole story of the knob
function testEnginePlotIsForceAgainstMass() {
	var s;
	var sim;
	var plot;
	var force;
	var limited;
	var mass;
	var i;
	var crossings = 0;

	for (s = 0; s < SEEDS.length; s += 1) {
		sim = simAt(SEEDS[s]);
		plot = plotFor(sim, Plot.ENGINE);
		force = seriesOf(plot, 0, 0);
		limited = seriesOf(plot, 0, 1);
		mass = seriesOf(plot, 0, 2);
		for (i = 1; i < Plot.SAMPLES; i += 1) {
			assert(force.values[i] > force.values[i - 1], "a heavier loco grips harder");
			assert(limited.values[i] > limited.values[i - 1], "and carries more power");
			assert(mass.values[i] > mass.values[i - 1], "and has to move more of itself");
		}
		assert(limited.values[0] < force.values[0], "the smallest engine is power limited");
		if (limited.values[Plot.SAMPLES - 1] > force.values[Plot.SAMPLES - 1]) crossings += 1;
	}
	assert.strictEqual(crossings, SEEDS.length, "the power line crosses the adhesion line on every seed");
}

// the curves are the sim: read at the player's build, they are what Tech and Train say
function testPlotAgreesWithTheBuild() {
	var s;
	var c;
	var sim;
	var plot;
	var train;
	var build;

	for (s = 0; s < SEEDS.length; s += 1) {
		sim = simAt(SEEDS[s]);
		train = sim.trains[0];
		build = train.build;

		plot = plotFor(sim, Plot.WAGONS);
		assert(Math.abs(seriesOf(plot, 0, 0).at - Train.tareMass(train)) < 1e-9, "mass at the marker is the consist");
		assert(Math.abs(seriesOf(plot, 0, 2).at - 2 * Train.capacity(train) / build.transferRate) < 1e-9,
			"dwell at the marker is the hold over the transfer rate");

		plot = plotFor(sim, Plot.GAUGE);
		assert(Math.abs(seriesOf(plot, 0, 0).at - Train.capacity(train) * Const.UNIT_T) < 1e-9,
			"hold at the marker is the consist's hold");
		assert(Math.abs(seriesOf(plot, 0, 1).at - Train.tareMass(train)) < 1e-9, "and its mass is the tare");

		plot = plotFor(sim, Plot.WHEEL);
		assert(Math.abs(seriesOf(plot, 0, 1).at - Train.accel(probeOf(sim), 0)) < 1e-9,
			"acceleration at the marker is the train's own");
		assert(Math.abs(seriesOf(plot, 0, 2).at - build.vTrack * build.vTrack / (2 * Const.BRAKE_DECEL)) < 1e-9,
			"and so is the brake distance");

		plot = plotFor(sim, Plot.ENGINE);
		assert(Math.abs(seriesOf(plot, 0, 0).at - build.fTrac) < 1e-9, "force at the marker is the adhesion limit");
		assert(Math.abs(seriesOf(plot, 0, 1).at - build.power / build.vTrack) < 1e-9, "and P / V is the power left");
	}
}

// a plot is filled, not rebuilt: dragging a slider must not allocate a new one
function testFillReusesThePlot() {
	var sim = simAt(SEEDS[0]);
	var plot = Plot.create();
	var first = plot.charts[0].series[0].values;
	var i;

	for (i = 0; i < Plot.CONTROL_N; i += 1) {
		Plot.fill(plot, i, sim);
		assert.strictEqual(plot.charts[0].series[0].values, first, "the curve buffers are reused");
	}
}

// the wagon count is part of the gauge and wheel plots, so they follow the slider
function testPlotsFollowTheConsist() {
	var sim = simAt(SEEDS[0]);
	var train = sim.trains[0];

	Sim.setWagons(sim, 8);
	assert.strictEqual(plotFor(sim, Plot.GAUGE).charts[0].series[0].values[0], train.wagons * Const.UNIT_T,
		"the gauge plot is drawn for the consist the player is running");
	Sim.setWagons(sim, 1);
	assert(train.wagons > 1, "and the wagon count will not drop under the cargo already aboard");
	assert.strictEqual(plotFor(sim, Plot.GAUGE).charts[0].series[0].values[0], train.wagons * Const.UNIT_T,
		"so the curve follows the wagons the slider can actually reach");
}

testCurvesAreFiniteAndBounded();
testWagonsPlotIsWeightAndTransferTime();
testGaugePlotIsHoldAgainstMass();
testWheelPlotIsFrictionAndMass();
testEnginePlotIsForceAgainstMass();
testPlotAgreesWithTheBuild();
testFillReusesThePlot();
testPlotsFollowTheConsist();
console.log("Plot checks passed: four build curves, finite and bounded, in the directions the knob contract states, the engine's power line crossing its adhesion line, and every curve agreeing with the build it reads.");
