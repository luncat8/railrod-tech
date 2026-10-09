(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var sim = null;
	var clock = null;
	var view = null;
	var sweep = null;
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
	function runFrame(elapsed) {
		var steps;

		if (animate) {
			steps = RR.Clock.advance(clock, elapsed, speed, RR.Sim.step, sim);
			RR.Sweep.step(sweep, C.SWEEP_BUDGET_ANIM);
		} else {
			steps = RR.Clock.runSteps(clock, C.MAX_MODE_STEPS, RR.Sim.step, sim);
			RR.Sweep.step(sweep, C.SWEEP_BUDGET_MAX);
		}
		// a finished pass is only re-run once the market has gone through a cycle
		if (!sweep.running && sim.time - sweep.armedAt >= C.SWEEP_REFRESH_S) RR.Sweep.arm(sweep, sim, false);
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
			RR.UI.updateTelemetry(measuredFps, sim, clock, sweep, measuredRate);
			telemetryTimestamp = timestamp;
		}

		root.requestAnimationFrame(frame);
	}

	Main.init = function () {
		sim = RR.Sim.create(C.DEFAULT_SEED);
		clock = RR.Clock.create();
		view = RR.Render.create(document.getElementById("c"));
		sweep = RR.Sweep.create();
		RR.Sweep.arm(sweep, sim, true);
		RR.UI.bind(Main, sim, speed);
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
		RR.Sweep.arm(sweep, sim, true);
		RR.Render.snapCamera(view, sim);
		dirty = true;
		RR.UI.setSeed(sim.seed);
		RR.UI.setBuild(sim);
		RR.UI.updateTelemetry(measuredFps, sim, clock, sweep, measuredRate);
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

	// wagons change every sample in the grid, so the pass restarts; the three build
	// knobs do not, and the panel keeps its dots while the player drags them
	Main.setWagons = function (value) {
		if (!sim || !Number.isFinite(value)) return;
		RR.Sim.setWagons(sim, value);
		RR.Sweep.arm(sweep, sim, true);
		dirty = true;
		RR.UI.setBuild(sim);
		RR.UI.updateTelemetry(measuredFps, sim, clock, sweep, measuredRate);
	};

	// slot is a Tech knob index (GAUGE, WHEEL, ENGINE); the build changes at once
	Main.setKnob = function (slot, value) {
		if (!sim || !Number.isFinite(value)) return;
		RR.Sim.setKnob(sim, slot, value);
		dirty = true;
		RR.UI.setBuild(sim);
		RR.UI.updateTelemetry(measuredFps, sim, clock, sweep, measuredRate);
	};

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
		return { sim: sim, clock: clock, sweep: sweep, view: view, animate: animate, paused: paused, speed: speed };
	};

	Main.getSeed = function () {
		return sim ? sim.seed : RR.Const.DEFAULT_SEED;
	};

	RR.Main = Main;

	if (typeof module !== "undefined" && module.exports) module.exports = Main;
	if (typeof document !== "undefined") Main.init();
})(globalThis);
