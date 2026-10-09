"use strict";

// 0.1.8 — better testing. js/line.js is the fixed-length line and the bench of N of them:
// the checks are that a line is a total over a distance rather than a rate over a window,
// that it ends clean, that every row of the bench runs the same line on the same stations
// with only the train changed, and that a headless row is an exact replay of the line the
// page runs live.
//
// node experiments/line.js                 the checks
// node experiments/line.js --report        print a bench, for a human
// --laps=n and --seeds=n shrink or widen a run while tuning the cutoffs

var assert = require("assert");
var Const = require("../js/const.js");
require("../js/rng.js");
var World = require("../js/world.js");
require("../js/economy.js");
var Tech = require("../js/tech.js");
require("../js/trade.js");
var Train = require("../js/train.js");
var Line = require("../js/line.js");
var Sim = require("../js/sim.js");

var DT = Const.DT;
var WARM_S = 600;                       // the market has to be breathing before it is a fixture
var SEED = 731421;
var SEEDS = [731421, 1000, 424242].slice(0, argValue("--seeds", 3));
var LAPS = argValue("--laps", Const.LINE_LAPS_DEFAULT);
// a consist this heavy on this little traction cannot move once it is loaded: the row that
// prices dead weight
var STALLED = { wagons: 8, knobs: [1, 0, 0] };
var WIDE = { wagons: 8, knobs: [1, 1, 1] };
var PLAIN = { wagons: 4, knobs: [0.5, 0.5, 0.5] };
var SMALL = { wagons: 1, knobs: [0, 0, 0] };

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

function warmSim(seed, seconds) {
	var sim = Sim.create(seed);
	var steps = Math.round((seconds === undefined ? WARM_S : seconds) / DT);
	var i;

	for (i = 0; i < steps; i += 1) Sim.step(sim, DT);
	return sim;
}

// a sim in LINE mode, its bench armed on the market it warmed to
function lineSim(seed, laps) {
	var sim = warmSim(seed);
	var bench = Line.create();

	Line.enable(bench, sim);
	Line.setLaps(bench, laps === undefined ? LAPS : laps);
	Line.restartLive(bench, sim);
	return { sim: sim, bench: bench };
}

// run the live line out, one step at a time, and stop on the step it ends
function runLiveLine(sim, maxSteps) {
	var steps = 0;
	var limit = maxSteps || Math.round(Const.LINE_CUTOFF_S / DT) + 8;

	while (!sim.line.done && steps < limit) {
		Sim.step(sim, DT);
		steps += 1;
	}
	assert(sim.line.done, "the live line finishes inside the cutoff (" + steps + " steps)");
	return steps;
}

function benchOf(spec) {
	var held = lineSim(SEED);
	var i;

	for (i = 0; i < spec.length; i += 1) Line.setSlot(held.bench, i, spec[i].knobs, spec[i].wagons);
	Line.run(held.bench);
	return held;
}

function stockSum(world) {
	var sum = 0;
	var i;

	for (i = 0; i < world.stock.length; i += 1) sum += world.stock[i];
	return sum;
}

function snapshot(sim) {
	var train = sim.trains[0];

	return {
		seed: sim.seed,
		steps: sim.steps,
		time: sim.time,
		x: train.x,
		v: train.v,
		cash: train.cash,
		km: train.km,
		cargo: train.cargoUnits,
		stock: Array.from(sim.world.stock),
		netRate: sim.netRate,
		netMean: sim.netMean
	};
}

// the line is a length: it is totalled over the distance the train actually ran, and the
// total is the train's own ledger, not a window on it
function testALineIsATotalNotARate() {
	var held = lineSim(SEED);
	var sim = held.sim;
	var train = sim.trains[0];
	var meter = sim.line;
	var cashAtEnd;

	assert.strictEqual(meter.targetKm, LAPS * Const.RING_KM, "the line is the length it was asked for");
	runLiveLine(sim);
	cashAtEnd = meter.gross;

	assert(meter.km >= meter.targetKm, "the train ran the whole line (" + meter.km.toFixed(1) + " of " + meter.targetKm + " km)");
	assert(meter.seconds > meter.targetKm / train.build.vTrack, "and it took longer than the running time alone");
	assert.strictEqual(cashAtEnd, meter.gross, "the gross is a sum of the ledger");
	assert.strictEqual(meter.capex, train.capexRate * meter.seconds, "the capex is that sum's own seconds charged");
	assert.strictEqual(meter.net, meter.gross - meter.capex, "and the net is the two, not a rate over a window");
	assert(meter.stops > 0 && meter.units > 0, "the line traded: " + meter.stops + " stops, " + meter.units + " units");
	console.log("  line " + meter.targetKm + " km · " + meter.km.toFixed(1) + " km run in " + meter.seconds.toFixed(1) + " s · "
		+ meter.stops + " stops · gross " + meter.gross.toFixed(2) + " · capex " + meter.capex.toFixed(2)
		+ " · net " + meter.net.toFixed(2) + " cr (" + (meter.net / meter.seconds).toFixed(3) + " cr/s)");
}

// the end of a line is a clean moment: the train leaves a stop with nothing aboard, so no
// cargo in transit is priced as profit or as a loss
function testALineEndsClean() {
	var held = lineSim(SEED);
	var sim = held.sim;
	var train = sim.trains[0];

	runLiveLine(sim);
	assert.strictEqual(train.cargoUnits, 0, "the line ends with the consist empty");
	assert.strictEqual(sim.line.cut, false, "and at a clean stop, not at a cutoff");
	assert(train.cycle > 0, "the train closed a trade cycle to end it");
	assert.strictEqual(train.state, Train.CRUISE, "it is away from the stop it ended at");
}

// the same build on the same fixture is the same line: two runs, one number
function testALineIsRepeatable() {
	var a = lineSim(SEED);
	var b = lineSim(SEED);

	runLiveLine(a.sim);
	runLiveLine(b.sim);
	assert.strictEqual(a.sim.line.net, b.sim.line.net, "the total repeats");
	assert.strictEqual(a.sim.line.seconds, b.sim.line.seconds, "the time repeats");
	assert.strictEqual(a.sim.line.km, b.sim.line.km, "the distance repeats");
	assert.strictEqual(a.sim.line.units, b.sim.line.units, "and so does the trade");
}

// the total is the line's, not the smoothing window's: the readout the mode replaces cannot
// reach into the one that replaces it
function testTheTotalIgnoresTheSmoothingWindow() {
	var a = lineSim(SEED);
	var b = lineSim(SEED);

	Sim.setSmooth(a.sim, Const.SMOOTH_MIN_S);
	Sim.setSmooth(b.sim, Const.SMOOTH_MAX_S);
	runLiveLine(a.sim);
	runLiveLine(b.sim);
	assert.notStrictEqual(a.sim.netRate, b.sim.netRate, "the rolling rate does follow the window");
	assert.strictEqual(a.sim.line.net, b.sim.line.net, "the line total does not");
	assert.strictEqual(a.sim.line.seconds, b.sim.line.seconds, "and neither does the time");
}

// a longer line is more line: more distance, more seconds, and a total of its own
function testALongerLineRunsLonger() {
	var short = lineSim(SEED, 1);
	var long = lineSim(SEED, Const.LINE_LAPS_MAX);

	runLiveLine(short.sim);
	runLiveLine(long.sim);
	assert(long.sim.line.km > short.sim.line.km, "the longer line covers more ground");
	assert(long.sim.line.seconds > short.sim.line.seconds, "and takes more time");
	assert.notStrictEqual(long.sim.line.net, short.sim.line.net, "so it is not the same total");
	console.log("  one lap " + short.sim.line.km.toFixed(1) + " km in " + short.sim.line.seconds.toFixed(1) + " s → "
		+ short.sim.line.net.toFixed(2) + " cr; four laps " + long.sim.line.km.toFixed(1) + " km in "
		+ long.sim.line.seconds.toFixed(1) + " s → " + long.sim.line.net.toFixed(2) + " cr");
}

// N lines, one world: the bench is the fixture's stations and yards for every row, and the
// only thing that differs between rows is the train
function testTheBenchSharesOneWorld() {
	var held = lineSim(SEED);
	var bench = held.bench;
	var sim = held.sim;
	var fixtureStock = Array.from(bench.fixture.stock);
	var sameA;
	var sameB;
	var i;

	Line.setSlot(bench, 1, PLAIN.knobs, PLAIN.wagons);
	Line.setSlot(bench, 2, PLAIN.knobs, PLAIN.wagons);
	Line.run(bench);

	for (i = 0; i < sim.world.nodeCount; i += 1) {
		assert.strictEqual(bench.fixture.x[i], sim.world.x[i], "the bench holds the live stations");
		assert.strictEqual(bench.fixture.kind[i], sim.world.kind[i], "and what they are");
		assert.strictEqual(bench.fixture.need[i], sim.world.need[i], "and what they want");
	}
	assert.deepStrictEqual(Array.from(bench.fixture.stock), fixtureStock, "running the bench does not trade the fixture");
	sameA = bench.net[1];
	sameB = bench.net[2];
	assert.strictEqual(sameA, sameB, "one build in two rows is one measurement");
	assert.strictEqual(bench.seconds[1], bench.seconds[2], "down to the second");
	assert.strictEqual(bench.net[0], sameA, "and the live row is the same line again");
}

// the panel's number is not a model of the line, it is the line: the headless row and the
// run the player watches agree to the bit
function testARowIsAnExactLiveReplay() {
	var held = lineSim(SEED);
	var bench = held.bench;
	var sim = held.sim;

	Line.run(bench);
	assert.strictEqual(bench.queued[0], 0, "the live row is measured headlessly");
	runLiveLine(sim);
	assert.strictEqual(sim.line.net, bench.net[0], "the live line totals what the row says");
	assert.strictEqual(sim.line.gross, bench.gross[0], "gross for gross");
	assert.strictEqual(sim.line.capex, bench.capex[0], "capex for capex");
	assert.strictEqual(sim.line.seconds, bench.seconds[0], "second for second");
	assert.strictEqual(sim.line.km, bench.km[0], "metre for metre");
	assert.strictEqual(sim.line.stops, bench.stops[0], "stop for stop");
	assert.strictEqual(sim.line.units, bench.units[0], "and unit for unit");
}

// the comparison has to be able to tell two trains apart, or the bench measures nothing
function testTheBenchTellsTrainsApart() {
	var held = benchOf([PLAIN, WIDE, SMALL]);
	var bench = held.bench;
	var nets = [bench.net[0], bench.net[1], bench.net[2]];
	var seconds = [bench.seconds[0], bench.seconds[1], bench.seconds[2]];
	var i;
	var distinctNets = 0;
	var distinctSeconds = 0;

	for (i = 0; i < nets.length; i += 1) {
		assert(Number.isFinite(nets[i]) && Number.isFinite(seconds[i]), "row " + i + " is a number");
		if (nets.indexOf(nets[i]) === i) distinctNets += 1;
		if (seconds.indexOf(seconds[i]) === i) distinctSeconds += 1;
	}
	assert(distinctNets === nets.length, "three trains, three totals");
	assert(distinctSeconds === seconds.length, "and three times");
	assert.strictEqual(bench.best, nets.indexOf(Math.max.apply(null, nets)), "the best row is the largest total");
	for (i = 0; i < nets.length; i += 1) {
		console.log("  row " + i + " · " + bench.wagons[i] + "W "
			+ Array.from(bench.knobs[i]).map(function (v) { return v.toFixed(2); }).join("/")
			+ " · net " + nets[i].toFixed(2) + " cr · " + seconds[i].toFixed(1) + " s · "
			+ bench.km[i].toFixed(1) + " km · " + bench.units[i] + " units");
	}
}

// a train that cannot run the line is priced as the dead weight it is, not left running
function testDeadWeightIsPriced() {
	var held = benchOf([PLAIN, STALLED]);
	var bench = held.bench;

	assert.strictEqual(bench.cut[0], 0, "a trading train finishes the line clean");
	assert.strictEqual(bench.cut[1], 1, "a consist that cannot move does not");
	assert(bench.km[1] < bench.meter.targetKm, "it never ran the line (" + bench.km[1].toFixed(1) + " km)");
	assert(bench.seconds[1] >= Const.LINE_CUTOFF_S - DT, "it is cut at the time cutoff");
	assert(bench.net[1] < bench.net[0], "and it loses to the train that runs");
	console.log("  stalled row: " + bench.km[1].toFixed(1) + " km, " + bench.seconds[1].toFixed(0) + " s, net "
		+ bench.net[1].toFixed(2) + " cr against the trading row's " + bench.net[0].toFixed(2));
}

// the bench is a background job: it measures rows, and never the world it was armed from
function testTheBenchLeavesTheSimAlone() {
	var held = lineSim(SEED);
	var bench = held.bench;
	var sim = held.sim;
	var i;

	for (i = 1; i < bench.slots; i += 1) Line.setSlot(bench, i, WIDE.knobs, WIDE.wagons - i);
	var before = snapshot(sim);

	Line.run(bench);
	assert.deepStrictEqual(snapshot(sim), before, "a whole bench leaves the world, the train and the readouts alone");
	assert.strictEqual(bench.measured, Line.rowsUsed(bench), "and measures every row while it is at it");
}

// a frame budget is a frame budget: the bench spends what it is given and no more
function testTheBenchRunsOnABudget() {
	var held = lineSim(SEED);
	var bench = held.bench;
	var steps;

	Line.setSlot(bench, 1, WIDE.knobs, WIDE.wagons);
	steps = Line.step(bench, 100);
	assert.strictEqual(steps, 100, "the budget is spent");
	assert(bench.measured < Line.rowsUsed(bench), "and it is not enough to finish a line");
	Line.run(bench);
	assert.strictEqual(bench.measured, Line.rowsUsed(bench), "running it out measures every row");
	assert.strictEqual(Line.step(bench, 1000), 0, "a measured bench costs nothing a frame");
}

// + ROW puts the live build beside itself: it copies, it does not duplicate, and it wraps
function testCaptureFillsTheBench() {
	var held = lineSim(SEED);
	var bench = held.bench;
	var sim = held.sim;
	var first;
	var second;
	var i;

	first = Line.capture(bench, sim);
	assert.strictEqual(first, 1, "the first capture takes the first row after the live one");
	Sim.setKnob(sim, Tech.GAUGE, 1);
	Line.liveChanged(bench, sim);
	second = Line.capture(bench, sim);
	assert.strictEqual(second, 2, "a different build takes the next row");
	assert.strictEqual(bench.knobs[first][Tech.GAUGE], 0.5, "and the row behind it kept the build it was given");

	// the same build again is the same row, not a fourth one
	Line.capture(bench, sim);
	assert.strictEqual(Line.rowsUsed(bench), 3, "capturing the build already on the bench reuses its row");

	for (i = 0; i < Const.LINE_SLOT_MAX + 2; i += 1) {
		Sim.setKnob(sim, Tech.WHEEL, (i % Const.LINE_SLOT_MAX) / Const.LINE_SLOT_MAX);
		Line.liveChanged(bench, sim);
		Line.capture(bench, sim);
	}
	assert.strictEqual(Line.rowsUsed(bench), bench.slots, "the bench never grows past its rows");
	assert(bench.measured <= bench.slots, "and never claims more than it measured");
}

// a row clicked is a row run: the train takes the whole build, wagons included, even with
// cargo aboard that would otherwise clamp it
function testApplySlotTakesTheRowWhole() {
	var held = lineSim(SEED);
	var bench = held.bench;
	var sim = held.sim;
	var train = sim.trains[0];
	var i;

	Line.setSlot(bench, 1, WIDE.knobs, WIDE.wagons);
	runLiveLine(sim);
	for (i = 0; i < Math.round(300 / DT) && train.cargoUnits === 0; i += 1) Sim.step(sim, DT);
	assert(train.cargoUnits > 0, "the train is carrying cargo when the row is applied");

	assert.strictEqual(Line.applySlot(bench, sim, 1), true, "a captured row can be run");
	assert.strictEqual(train.wagons, WIDE.wagons, "the consist is the row's, not one clamped by the cargo aboard");
	for (i = 0; i < Tech.KNOB_N; i += 1) {
		assert.strictEqual(sim.knobs[i], WIDE.knobs[i], "knob " + i + " is the row's");
		assert.strictEqual(bench.knobs[0][i], WIDE.knobs[i], "and the live row says so");
	}
	assert.strictEqual(sim.line.done, false, "applying a row starts the line over");
	assert.strictEqual(train.x, sim.world.x[0], "from the start of it");
	assert.strictEqual(Line.applySlot(bench, sim, 0), false, "the live row is not a row to apply");
	assert.strictEqual(Line.applySlot(bench, sim, bench.slots - 1), false, "nor is an empty one");
}

// the row count is the player's: rows keep their builds through it, and are measured again
function testSlotsAndLapsAreThePlayers() {
	var held = lineSim(SEED);
	var bench = held.bench;
	var sim = held.sim;

	Line.setSlot(bench, 3, WIDE.knobs, WIDE.wagons);
	Line.run(bench);
	assert.strictEqual(bench.measured, 2, "two rows are measured at the default count");

	Line.setSlots(bench, Const.LINE_SLOT_MAX);
	assert.strictEqual(bench.slots, Const.LINE_SLOT_MAX, "the bench grows");
	assert.strictEqual(bench.used[3], 1, "the row behind the count kept its build");
	assert.strictEqual(bench.measured, 0, "and every row is measured again on this fixture");
	Line.run(bench);
	assert.strictEqual(bench.measured, Line.rowsUsed(bench), "which the bench then does");

	Line.setSlots(bench, Const.LINE_SLOT_MIN);
	assert.strictEqual(bench.slots, Const.LINE_SLOT_MIN, "it shrinks again");
	assert.strictEqual(bench.used[3], 1, "without throwing the hidden rows away");

	Line.setLaps(bench, Const.LINE_LAPS_MAX);
	assert.strictEqual(bench.meter.targetKm, Const.LINE_LAPS_MAX * Const.RING_KM, "a new length is the bench's");
	assert.strictEqual(bench.measured, 0, "and it is a new line for every row");
	assert.strictEqual(sim.line.done, false, "the live line restarts with it");
	Line.setLaps(bench, 99);
	assert.strictEqual(bench.laps, Const.LINE_LAPS_MAX, "the length is clamped");
}

// the mode is a toggle on the readouts and the fixture, not a new world: the seed, the step
// count and the market all survive it
function testTheModeIsAToggle() {
	var sim = warmSim(SEED);
	var bench = Line.create();
	var stockBefore = Array.from(sim.world.stock);
	var stepsBefore = sim.steps;
	var lineTime;
	var netBefore;
	var i;

	Line.enable(bench, sim);
	assert.strictEqual(sim.lineOn, true, "the mode is on");
	assert.strictEqual(sim.seed, SEED, "the seed survives it");
	assert.strictEqual(sim.steps, stepsBefore, "and so does the step count");
	assert.deepStrictEqual(Array.from(bench.fixture.stock), stockBefore, "the fixture is the market as it stood");
	assert.strictEqual(sim.trains[0].x, sim.world.x[0], "with the train at the start of the line");
	// the line's first load is lifted at node 0, so the world is that market less the
	// consist: the fixture keeps the whole of it, and every row starts from the whole of it
	assert.strictEqual(stockSum(sim.world) + sim.trains[0].cargoUnits, stockSum(bench.fixture),
		"the world is the fixture, less what the train lifted at the start");
	assert.strictEqual(sim.line.done, false, "and the line running");

	Sim.step(sim, DT);
	assert(sim.line.time > 0, "the line is being measured");

	Line.disable(bench, sim);
	assert.strictEqual(sim.lineOn, false, "the mode is off");
	assert.strictEqual(sim.netTrend, 0, "the rolling readouts are anchored again, not read as a trend");
	assert.strictEqual(sim.historyCount, 0, "the sparkline starts over");
	lineTime = sim.line.time;
	netBefore = sim.netRate;
	for (i = 0; i < Math.round(120 / DT); i += 1) Sim.step(sim, DT);
	assert.strictEqual(sim.line.time, lineTime, "the line stops being measured while the mode is off");
	assert.notStrictEqual(sim.netRate, netBefore, "and the rolling average is what runs again");
}

// every seed gets the same story: a line that finishes clean, and a bench that agrees with it
function testEverySeedRunsTheLine() {
	var s;
	var held;

	for (s = 0; s < SEEDS.length; s += 1) {
		held = lineSim(SEEDS[s]);
		Line.setSlot(held.bench, 1, WIDE.knobs, WIDE.wagons);
		Line.run(held.bench);
		runLiveLine(held.sim);
		assert.strictEqual(held.sim.line.cut, false, "seed " + SEEDS[s] + " finishes the line clean");
		assert.strictEqual(held.sim.line.net, held.bench.net[0], "seed " + SEEDS[s] + " replays its own row");
		console.log("  seed " + SEEDS[s] + " · live " + held.sim.line.net.toFixed(2) + " cr in "
			+ held.sim.line.seconds.toFixed(1) + " s · wide row " + held.bench.net[1].toFixed(2) + " cr in "
			+ held.bench.seconds[1].toFixed(1) + " s" + (held.bench.cut[1] ? " (cut)" : ""));
	}
}

function report() {
	var spec = [PLAIN, SMALL, WIDE, STALLED, { wagons: 6, knobs: [0.75, 0.25, 0.5] }];
	var held = lineSim(SEED);
	var bench = held.bench;
	var i;

	for (i = 0; i < spec.length && i < bench.slots; i += 1) Line.setSlot(bench, i, spec[i].knobs, spec[i].wagons);
	Line.setSlots(bench, Math.max(spec.length, Const.LINE_SLOT_MIN));
	for (i = 0; i < spec.length; i += 1) Line.setSlot(bench, i, spec[i].knobs, spec[i].wagons);
	Line.run(bench);
	console.log("seed " + SEED + ", line " + bench.meter.targetKm + " km, " + bench.slots + " rows");
	for (i = 0; i < bench.slots; i += 1) {
		if (!bench.used[i]) continue;
		console.log("  " + (i === 0 ? "live" : "#" + (i + 1)) + "  " + bench.wagons[i] + "W "
			+ Array.from(bench.knobs[i]).map(function (v) { return v.toFixed(2); }).join(" ")
			+ "  net " + bench.net[i].toFixed(2).padStart(9) + " cr  gross " + bench.gross[i].toFixed(2).padStart(8)
			+ "  capex " + bench.capex[i].toFixed(2).padStart(8) + "  time " + bench.seconds[i].toFixed(1).padStart(7)
			+ " s  " + bench.km[i].toFixed(1).padStart(6) + " km  " + String(bench.stops[i]).padStart(3) + " stops  "
			+ String(bench.units[i]).padStart(4) + " units" + (bench.cut[i] ? "  CUT" : ""));
	}
}

if (process.argv.indexOf("--report") >= 0) {
	report();
} else {
	testALineIsATotalNotARate();
	testALineEndsClean();
	testALineIsRepeatable();
	testTheTotalIgnoresTheSmoothingWindow();
	testALongerLineRunsLonger();
	testTheBenchSharesOneWorld();
	testARowIsAnExactLiveReplay();
	testTheBenchTellsTrainsApart();
	testDeadWeightIsPriced();
	testTheBenchLeavesTheSimAlone();
	testTheBenchRunsOnABudget();
	testCaptureFillsTheBench();
	testApplySlotTakesTheRowWhole();
	testSlotsAndLapsAreThePlayers();
	testTheModeIsAToggle();
	testEverySeedRunsTheLine();
	console.log("Line checks passed: a fixed-length line totalled rather than averaged, ending clean, repeatable, independent of the smoothing window, longer when it is longer; one world behind every row, a headless row an exact replay of the live line, trains told apart, dead weight priced, the sim left alone, a frame budget respected, capture and apply, rows and laps, the mode a toggle, and every seed running the line.");
}
