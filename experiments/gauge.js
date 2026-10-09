"use strict";

// 0.1.9 — the air the gauge pays for. Gauge used to buy a speed limit and a hold and
// cost iron, and nothing else: the drag term was a flat coefficient, so a train on
// 4.0 m track pushed exactly as much air as one on 0.6 m. That left the gauge with one
// channel pointing at speed and no channel pushing back, and the line time fell
// monotonically across the whole slider — the only thing that stopped a player going
// wide was money.
//
// What is here instead: the loading gauge is the vehicle's cross-section, so air is
// paid for in cross-section, and the track limit stops being a gift of the gauge. Past
// the middle of the slider a train is then limited by its own bulk rather than by its
// track, and both ends of the slider are slower than the middle.
//
// node experiments/gauge.js            the checks
// node experiments/gauge.js --report   print the curves, for a human

var assert = require("assert");
var Const = require("../js/const.js");
require("../js/rng.js");
var World = require("../js/world.js");
var Economy = require("../js/economy.js");
var Tech = require("../js/tech.js");
require("../js/trade.js");
var Train = require("../js/train.js");
var Line = require("../js/line.js");
var Sim = require("../js/sim.js");

var DT = Const.DT;
var WARM_S = 600;                     // the market has to be breathing before it is a fixture
var SEEDS = [731421, 1000, 424242];
var LAPS = Const.LINE_LAPS_DEFAULT;
var WAGONS = Const.WAGON_DEFAULT;
var G_N = 10;                         // gauge samples, both ends included

function argValue(name, dflt) {
	var i;
	var value;

	for (i = 0; i < process.argv.length; i += 1) {
		if (process.argv[i].indexOf(name + "=") !== 0) continue;
		value = Number(process.argv[i].slice(name.length + 1));
		return Number.isFinite(value) && value > 0 ? value : dflt;
	}
	return dflt;
}

function knob(g, d, e) {
	var knobs = Tech.defaultKnobs();

	knobs[Tech.GAUGE] = g;
	knobs[Tech.WHEEL] = d === undefined ? Const.KNOB_D : d;
	knobs[Tech.ENGINE] = e === undefined ? Const.KNOB_E : e;
	return knobs;
}

function loadedProbe(g) {
	var probe = Train.create(Tech.derive(knob(g)), WAGONS);

	probe.cargoUnits = Train.capacity(probe);
	return probe;
}

// ---- the channel itself -------------------------------------------------------

// the loading gauge is a cross-section, so the air a build pushes is the area the gauge
// gives it: monotone, and as wide as the gauge is, end to end
function testAirFollowsTheCrossSection() {
	var lo = Tech.areaOf(0);
	var hi = Tech.areaOf(1);
	var i;
	var g;
	var force;
	var last;

	assert(lo > 0, "even the narrowest build pushes some air");
	assert(Math.abs(hi - 1) < 1e-12, "the widest gauge is the unit the area is measured in");
	assert(Math.abs(hi / lo - Const.GAUGE_MAX_M / Const.GAUGE_MIN_M) < 1e-9,
		"and the area spans the gauge the way the slider does");

	last = -1;
	for (i = 0; i <= G_N; i += 1) {
		g = i / G_N;
		force = Const.C_DRAG * Tech.areaOf(g);
		assert(force > last, "a wider gauge pushes more air");
		last = force;
	}
}

// the point of the channel: at a speed the whole slider can reach, a wider gauge
// decelerates harder on air alone and carries away less of what the engine is making
function testAirCostsMoreAsTheGaugeGrows() {
	var v = 1.2;
	var lo = Train.accel(loadedProbe(0), v);
	var hi = Train.accel(loadedProbe(1), v);
	var mid = Train.accel(loadedProbe(0.5), v);

	assert(hi < mid && mid < lo, "at the same speed a wider gauge accelerates worse: " + [lo, mid, hi]);
}

// ---- the two ends of the slider -----------------------------------------------

// one lap from a standing start with nothing to stop for: the pure motion model, which
// is where the gauge trade-off lives before the market is laid over it
function lapSeconds(g, d, e, wagons) {
	var probe = Train.create(Tech.derive(knob(g, d, e)), wagons === undefined ? WAGONS : wagons);
	var v = 0;
	var s = 0;
	var t = 0;

	probe.cargoUnits = Train.capacity(probe);
	while (s < Const.RING_KM && t < 3000) {
		v = v > probe.build.vTrack ? probe.build.vTrack : Math.max(0, v + Train.accel(probe, v) * DT);
		s += v * DT;
		t += DT;
	}
	return t;
}

// the same lap, watched: the highest speed the build actually settles at. a build the
// air holds below its track limit never reaches it, so the run is capped in steps
function lapTopSpeed(g) {
	var probe = loadedProbe(g);
	var v = 0;
	var top = 0;
	var steps = 0;

	while (v < probe.build.vTrack && steps < 60000) {
		v = Math.max(0, v + Train.accel(probe, v) * DT);
		if (v > top) top = v;
		steps += 1;
	}
	return top;
}

// what makes an interior optimum: the narrow end is held down by its track and reaches
// the speed it is allowed, the wide end is held down by its own bulk and does not
function testTheWideEndIsLimitedByItsBulk() {
	var narrow = loadedProbe(0);
	var wide = loadedProbe(1);

	assert(lapTopSpeed(0) > narrow.build.vTrack - 1e-6,
		"the narrowest build reaches the speed its track allows");
	assert(lapTopSpeed(1) < wide.build.vTrack - 0.05,
		"the widest build cannot: " + lapTopSpeed(1).toFixed(3) + " of " + wide.build.vTrack.toFixed(3));
}

// the claim the milestone exists for: neither end of the gauge slider is the fastest
// lap, and the fastest one is comfortably inside the slider
function testLapTimeHasAnInteriorMinimum() {
	var i;
	var g;
	var times = [];
	var best = 0;

	for (i = 0; i <= G_N; i += 1) {
		g = i / G_N;
		times.push(lapSeconds(g));
		if (times[best] > times[i]) best = i;
	}
	for (i = 1; i <= G_N; i += 1) {
		assert(times[i] < times[i - 1] || i > best, "lap time falls only up to the optimum");
	}
	assert(best > 0 && best < G_N, "the fastest lap is not at an end of the slider: g = " + best / G_N);
	assert(times[0] > times[best] * 1.08, "the narrowest gauge is slower than the best by a margin");
	assert(times[G_N] > times[best] * 1.08, "and so is the widest: " + times.map(function (t) {
		return t.toFixed(1);
	}).join(" "));
}

// ---- the line's clock is not the line's pace ----------------------------------

function warmSim(seed) {
	var sim = Sim.create(seed);
	var steps = Math.round(WARM_S / DT);
	var i;

	for (i = 0; i < steps; i += 1) Sim.step(sim, DT);
	return sim;
}

// a line on the market the seed warmed to, with the seconds split between the stops and
// the track: a build is only called slow by the pace, never by the clock alone
function lineRun(seed, g, laps) {
	var sim = warmSim(seed);
	var world = World.blank(Const.NODE_N);
	var train = Train.create(Tech.derive(knob(g)), WAGONS);
	var meter = Line.createMeter();
	var steps = 0;

	World.copyInto(world, sim.world);
	Train.reset(train, world);
	Line.setTarget(meter, laps === undefined ? LAPS : laps);
	Line.begin(meter);
	while (steps < 400000) {
		Economy.tick(world, DT);
		Train.step(train, world, DT);
		steps += 1;
		if (Line.observe(meter, train, DT)) break;
	}
	return meter;
}

// the split has to be exact or the pace is a story about nothing
function testTheClockSplitsIntoStopsAndTrack() {
	var meter = lineRun(SEEDS[0], Const.KNOB_G);
	var dwell = Line.dwell(meter);

	assert(meter.move > 0, "a line spends some of its clock under way");
	assert(dwell > 0, "and some of it at a stop");
	assert(Math.abs(meter.move + dwell - meter.seconds) < 1e-9, "the two add up to the line's time");
	assert(Math.abs(Line.speed(meter) * meter.move - meter.km) < 1e-9, "and the pace is the distance over the moving time");
}

// a line that ran further to finish clean is slower in seconds and not in speed: the
// pace is what answers the gauge question, and it peaks inside the slider too
function testTheLinePacePeaksInsideTheSlider() {
	var i;
	var s;
	var g;
	var pace = [];
	var best = 0;

	for (i = 0; i <= G_N; i += 1) {
		g = i / G_N;
		pace.push(0);
		for (s = 0; s < SEEDS.length; s += 1) pace[i] += Line.speed(lineRun(SEEDS[s], g));
		pace[i] /= SEEDS.length;
		if (pace[best] < pace[i]) best = i;
	}
	assert(best > 0 && best < G_N, "the fastest pace is not at an end of the slider: g = " + best / G_N);
	assert(pace[0] < pace[best] * 0.97, "the narrowest gauge runs slower than the best by a margin");
	assert(pace[G_N] < pace[best] * 0.97, "and so does the widest: " + pace.map(function (v) {
		return v.toFixed(3);
	}).join(" "));
}

// ---- report -------------------------------------------------------------------

function report() {
	var i;
	var g;
	var pace = [];
	var seconds = [];
	var meter;
	var s;

	console.log("gauge sweep · " + WAGONS + " wagons · wheel " + Const.KNOB_D + " · engine " + Const.KNOB_E);
	console.log("g\tgauge m\tarea\ttrack km/s\ttop km/s\tlap s\ttare t\thold\tline s\tpace km/s");
	for (i = 0; i <= G_N; i += 1) {
		g = i / G_N;
		pace.push(0);
		seconds.push(0);
		for (s = 0; s < SEEDS.length; s += 1) {
			meter = lineRun(SEEDS[s], g);
			pace[i] += Line.speed(meter);
			seconds[i] += meter.seconds;
		}
		pace[i] /= SEEDS.length;
		seconds[i] /= SEEDS.length;
		console.log([
			g.toFixed(1),
			Tech.gaugeM(g).toFixed(2),
			Tech.areaOf(g).toFixed(3),
			Tech.derive(knob(g)).vTrack.toFixed(3),
			lapTopSpeed(g).toFixed(3),
			lapSeconds(g).toFixed(1),
			Math.round(Tech.derive(knob(g)).mLoco + WAGONS * Tech.derive(knob(g)).mWagon),
			Train.capacity(loadedProbe(g)),
			seconds[i].toFixed(1),
			pace[i].toFixed(3)
		].join("\t"));
	}
}

var tests = [
	testAirFollowsTheCrossSection,
	testAirCostsMoreAsTheGaugeGrows,
	testTheWideEndIsLimitedByItsBulk,
	testLapTimeHasAnInteriorMinimum,
	testTheClockSplitsIntoStopsAndTrack,
	testTheLinePacePeaksInsideTheSlider
];

if (process.argv.indexOf("--report") >= 0) report();
else {
	tests.forEach(function (test) {
		test();
	});
	console.log("Gauge checks passed: air follows the cross-section, it costs more as the gauge grows, the wide end is limited by its bulk, the fastest lap and the fastest pace are both inside the slider, and a line's clock splits exactly into stops and track.");
}
