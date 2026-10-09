(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var sim = null;
	var clock = null;
	var view = null;
	var sweep = null;
	var bench = null;
	var speed = C.DEFAULT_SPEED;
	var animate = false;
	var paused = false;
	var dirty = true;
	var lastTimestamp = null;
	var telemetryTimestamp = 0;
	var fpsWindowTimestamp = 0;
	var framesInWindow = 0;
	var measuredFps = 0;
	var measuredRate = 0;
	var Main = RR.Main || {};

	function onResize() {
		RR.Render.resize(view);
		RR.UI.resize();
		dirty = true;
	}

	function onMouseLeave() {
		RR.UI.hideNodeLabel();
	}

	function nodeAt(event) {
		var rect = view.canvas.getBoundingClientRect();

		return RR.Render.hitNode(view, sim, event.clientX - rect.left, event.clientY - rect.top);
	}

	function onMouseMove(event) {
		var i = nodeAt(event);

		if (i < 0) {
			RR.UI.hideNodeLabel();
			return;
		}
		RR.UI.showNodeLabel(sim.world, i, event.clientX, event.clientY);
	}

	// Two ways to run the same fixed step. ANIMATE is the clock: a time scale on the
	// wall clock, with a step cap so a lagging frame cannot build a backlog. MAX is a
	// step budget: every frame runs the same number of steps, whatever the machine,
	// and the rate is measured rather than asked for.
	//
	// The headless measurement beside it is one or the other, never both: the sweep maps
	// every build as a rate, the bench totals the builds the player put beside each other
	// over one fixed line. LINE mode hands the frame budget from one to the other.
	function runFrame(elapsed) {
		var steps;

		if (animate) steps = RR.Clock.advance(clock, elapsed, speed, RR.Sim.step, sim);
		else steps = RR.Clock.runSteps(clock, C.MAX_MODE_STEPS, RR.Sim.step, sim);

		if (sim.lineOn) {
			RR.Line.step(bench, animate ? C.LINE_BUDGET_ANIM : C.LINE_BUDGET_MAX);
		} else {
			RR.Sweep.step(sweep, animate ? C.SWEEP_BUDGET_ANIM : C.SWEEP_BUDGET_MAX);
			// a finished pass is only re-run once the market has gone through a cycle
			if (!sweep.running && sim.time - sweep.armedAt >= C.SWEEP_REFRESH_S) RR.Sweep.arm(sweep, sim, false);
		}
		RR.Sim.setFrameSeconds(sim, steps * C.DT);
		return steps;
	}

	function frame(timestamp) {
		var elapsed = 0;
		var fpsInterval = timestamp - fpsWindowTimestamp;
		var steps = 0;

		if (lastTimestamp !== null) elapsed = (timestamp - lastTimestamp) / 1000;
		lastTimestamp = timestamp;
		if (elapsed < 0) elapsed = 0;
		if (elapsed > C.MAX_FRAME_SECONDS) elapsed = C.MAX_FRAME_SECONDS;

		if (paused) clock.lastSteps = 0;
		else steps = runFrame(elapsed);

		// MAX mode freezes the world: the canvas is drawn when something other than
		// the clock has changed it, and the live story is told by the readouts
		if (animate || dirty) {
			RR.Render.draw(view, sim, paused, elapsed, sweep);
			dirty = false;
			framesInWindow += 1;
		}

		if (elapsed > 0 && !paused) {
			measuredRate += (steps * C.DT / elapsed - measuredRate) * 0.1;
		}

		if (fpsInterval >= C.FPS_WINDOW_MS) {
			measuredFps = framesInWindow * 1000 / fpsInterval;
			framesInWindow = 0;
			fpsWindowTimestamp = timestamp;
		}

		if (timestamp - telemetryTimestamp >= C.TELEMETRY_INTERVAL_MS) {
			RR.UI.updateTelemetry(measuredFps, sim, clock, sweep, measuredRate, bench);
			telemetryTimestamp = timestamp;
		}

		root.requestAnimationFrame(frame);
	}

	Main.init = function () {
		sim = RR.Sim.create(C.DEFAULT_SEED);
		clock = RR.Clock.create();
		view = RR.Render.create(document.getElementById("c"));
		sweep = RR.Sweep.create();
		bench = RR.Line.create();
		RR.Sweep.arm(sweep, sim, true);
		RR.UI.bind(Main, sim, speed, bench);
		root.addEventListener("resize", onResize);
		view.canvas.addEventListener("mousemove", onMouseMove);
		view.canvas.addEventListener("mouseleave", onMouseLeave);
		onResize();
		RR.Render.draw(view, sim, paused, 0, sweep);
		root.requestAnimationFrame(frame);
	};

	Main.setSeed = function (seed) {
		if (!sim) return;
		RR.Sim.reset(sim, seed);
		RR.Clock.reset(clock);
		// a new world is a new fixture: whichever instrument is live measures it again
		if (sim.lineOn) RR.Line.arm(bench, sim);
		else RR.Sweep.arm(sweep, sim, true);
		RR.Render.snapCamera(view, sim);
		dirty = true;
		RR.UI.setSeed(sim.seed);
		RR.UI.setBuild(sim);
		RR.UI.setBench(sim, bench);
		publish();
	};

	Main.newSeed = function () {
		var seed;
		if (!sim) return;

		if (root.crypto && typeof root.crypto.getRandomValues === "function") {
			var values = new Uint32Array(1);
			root.crypto.getRandomValues(values);
			seed = values[0];
		} else {
			seed = Date.now() >>> 0;
		}

		if (seed === sim.seed) seed = (seed + 1) >>> 0;
		Main.setSeed(seed);
	};

	// wagons change every sample in the grid, so the pass restarts; the three build knobs
	// do not, and the panel keeps its dots while the player drags them. a line is a total
	// over one run, so on the bench any build change starts the live row and the live run
	// over: the number on screen is the new build's and not the one before the slider moved
	Main.setWagons = function (value) {
		if (!sim || !Number.isFinite(value)) return;
		RR.Sim.setWagons(sim, value);
		if (sim.lineOn) RR.Line.liveChanged(bench, sim);
		else RR.Sweep.arm(sweep, sim, true);
		dirty = true;
		RR.UI.setBuild(sim);
		publish();
	};

	// slot is a Tech knob index (GAUGE, WHEEL, ENGINE); the build changes at once
	Main.setKnob = function (slot, value) {
		if (!sim || !Number.isFinite(value)) return;
		RR.Sim.setKnob(sim, slot, value);
		if (sim.lineOn) RR.Line.liveChanged(bench, sim);
		dirty = true;
		RR.UI.setBuild(sim);
		publish();
	};

	// ---- LINE mode: the fixed-length line and the bench of N of them ----

	// the sweep hands its corner over to the bench, and the readouts become totals over one
	// line instead of rates over a window. leaving the mode gives the world back to the
	// clock where the line left it, with the rolling readouts anchored again
	Main.setLineMode = function (value) {
		var on = !!value;

		if (!sim || on === sim.lineOn) return;
		if (on) RR.Line.enable(bench, sim);
		else {
			RR.Line.disable(bench, sim);
			RR.Sweep.arm(sweep, sim, false);
		}
		dirty = true;
		RR.UI.setLineMode(sim, bench);
		publish();
	};

	Main.setLaps = function (value) {
		if (!sim || !sim.lineOn || !Number.isFinite(value)) return;
		RR.Line.setLaps(bench, value);
		RR.Line.restartLive(bench, sim);
		dirty = true;
		RR.UI.setBench(sim, bench);
		publish();
	};

	Main.setSlots = function (value) {
		if (!sim || !Number.isFinite(value)) return;
		RR.Line.setSlots(bench, value);
		RR.UI.setBench(sim, bench);
		publish();
	};

	Main.captureBench = function () {
		var slot;

		if (!sim || !sim.lineOn) return -1;
		slot = RR.Line.capture(bench, sim);
		RR.UI.setBench(sim, bench);
		publish();
		return slot;
	};

	// a row becomes the live build, and the live line runs it
	Main.applySlot = function (slot) {
		if (!sim || !sim.lineOn) return false;
		if (!RR.Line.applySlot(bench, sim, slot)) return false;
		dirty = true;
		RR.UI.setBuild(sim);
		RR.UI.setBench(sim, bench);
		publish();
		return true;
	};

	// the live line again, from the fixture, on the build that is already running
	Main.runLine = function () {
		if (!sim || !sim.lineOn) return;
		RR.Line.liveChanged(bench, sim);
		dirty = true;
		publish();
	};

	function publish() {
		RR.UI.updateTelemetry(measuredFps, sim, clock, sweep, measuredRate, bench);
	}

	Main.setSpeed = function (value) {
		if (!Number.isFinite(value)) return;
		var bounded = Math.max(C.MIN_SPEED, Math.min(C.MAX_SPEED, value));
		speed = Math.round(bounded * 2) / 2;
		RR.UI.setSpeed(speed);
	};

	// animation is opt-in: without it the page is a calculator and the canvas is a
	// still of the world, refreshed only when something other than time moves
	Main.setAnimate = function (value) {
		animate = !!value;
		dirty = true;
		if (animate) RR.Clock.reset(clock);
		RR.UI.setAnimate(animate);
		if (animate) RR.UI.setSpeed(speed);
	};

	// the smoothing window is the rolling average's: LINE mode has no window to smooth
	Main.setSmooth = function (value) {
		if (!sim || !Number.isFinite(value)) return;
		RR.Sim.setSmooth(sim, value);
		RR.UI.setSmooth(sim.smoothS);
	};

	Main.togglePause = function () {
		paused = !paused;
		dirty = true;
		RR.UI.setPaused(paused);
	};

	Main.isAnimating = function () {
		return animate;
	};

	// the node experiments drive the page from the outside; this is their handle on it
	Main.inspect = function () {
		return { sim: sim, clock: clock, sweep: sweep, bench: bench, view: view, animate: animate, paused: paused, speed: speed };
	};

	Main.getSeed = function () {
		return sim ? sim.seed : RR.Const.DEFAULT_SEED;
	};

	RR.Main = Main;

	if (typeof module !== "undefined" && module.exports) module.exports = Main;
	if (typeof document !== "undefined") Main.init();
})(globalThis);
