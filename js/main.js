(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var sim = null;
	var clock = null;
	var view = null;
	var sweep = null;
	var speed = RR.Const.DEFAULT_SPEED;
	var paused = false;
	var lastTimestamp = null;
	var telemetryTimestamp = 0;
	var fpsWindowTimestamp = 0;
	var framesInWindow = 0;
	var measuredFps = 0;
	var Main = RR.Main || {};

	function onResize() {
		RR.Render.resize(view);
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

	function frame(timestamp) {
		var elapsed = 0;
		var fpsInterval = timestamp - fpsWindowTimestamp;

		if (lastTimestamp !== null) elapsed = (timestamp - lastTimestamp) / 1000;
		lastTimestamp = timestamp;
		if (elapsed < 0) elapsed = 0;
		if (elapsed > RR.Const.MAX_FRAME_SECONDS) elapsed = RR.Const.MAX_FRAME_SECONDS;

		if (paused) clock.lastSteps = 0;
		else {
			RR.Clock.advance(clock, elapsed, speed, RR.Sim.step, sim);
			// the sweep runs on its own copy of the world, so it never delays the sim;
			// a finished pass is only re-run once the market has gone through a cycle
			if (!sweep.running && sim.time - sweep.armedAt >= RR.Const.SWEEP_REFRESH_S) RR.Sweep.arm(sweep, sim, false);
			RR.Sweep.step(sweep, RR.Const.SWEEP_BUDGET_STEPS);
		}

		RR.Render.draw(view, sim, paused, elapsed, sweep);
		framesInWindow += 1;

		if (fpsInterval >= RR.Const.FPS_WINDOW_MS) {
			measuredFps = framesInWindow * 1000 / fpsInterval;
			framesInWindow = 0;
			fpsWindowTimestamp = timestamp;
		}

		if (timestamp - telemetryTimestamp >= RR.Const.TELEMETRY_INTERVAL_MS) {
			RR.UI.updateTelemetry(measuredFps, sim, clock, sweep);
			telemetryTimestamp = timestamp;
		}

		root.requestAnimationFrame(frame);
	}

	Main.init = function () {
		sim = RR.Sim.create(RR.Const.DEFAULT_SEED);
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
		RR.UI.setSeed(sim.seed);
		RR.UI.setBuild(sim);
		RR.UI.updateTelemetry(measuredFps, sim, clock, sweep);
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
		RR.UI.setBuild(sim);
		RR.UI.updateTelemetry(measuredFps, sim, clock, sweep);
	};

	// slot is a Tech knob index (GAUGE, WHEEL, ENGINE); the build changes at once
	Main.setKnob = function (slot, value) {
		if (!sim || !Number.isFinite(value)) return;
		RR.Sim.setKnob(sim, slot, value);
		RR.UI.setBuild(sim);
		RR.UI.updateTelemetry(measuredFps, sim, clock, sweep);
	};

	Main.setSpeed = function (value) {
		if (!Number.isFinite(value)) return;
		var bounded = Math.max(RR.Const.MIN_SPEED, Math.min(RR.Const.MAX_SPEED, value));
		speed = Math.round(bounded * 4) / 4;
		RR.UI.setSpeed(speed);
	};

	Main.togglePause = function () {
		paused = !paused;
		RR.UI.setPaused(paused);
	};

	Main.getSeed = function () {
		return sim ? sim.seed : RR.Const.DEFAULT_SEED;
	};

	RR.Main = Main;

	if (typeof module !== "undefined" && module.exports) module.exports = Main;
	if (typeof document !== "undefined") Main.init();
})(globalThis);
