(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var sim = null;
	var clock = null;
	var view = null;
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

	function frame(timestamp) {
		var elapsed = 0;
		var fpsInterval = timestamp - fpsWindowTimestamp;

		if (lastTimestamp !== null) elapsed = (timestamp - lastTimestamp) / 1000;
		lastTimestamp = timestamp;
		if (elapsed < 0) elapsed = 0;
		if (elapsed > RR.Const.MAX_FRAME_SECONDS) elapsed = RR.Const.MAX_FRAME_SECONDS;

		if (paused) clock.lastSteps = 0;
		else RR.Clock.advance(clock, elapsed, speed, RR.Sim.step, sim);

		RR.Render.draw(view, sim, paused, elapsed);
		framesInWindow += 1;

		if (fpsInterval >= RR.Const.FPS_WINDOW_MS) {
			measuredFps = framesInWindow * 1000 / fpsInterval;
			framesInWindow = 0;
			fpsWindowTimestamp = timestamp;
		}

		if (timestamp - telemetryTimestamp >= RR.Const.TELEMETRY_INTERVAL_MS) {
			RR.UI.updateTelemetry(measuredFps, sim, clock);
			telemetryTimestamp = timestamp;
		}

		root.requestAnimationFrame(frame);
	}

	Main.init = function () {
		sim = RR.Sim.create(RR.Const.DEFAULT_SEED);
		clock = RR.Clock.create();
		view = RR.Render.create(document.getElementById("c"));
		RR.UI.bind(Main, sim.seed, speed);
		root.addEventListener("resize", onResize);
		onResize();
		RR.Render.draw(view, sim, paused, 0);
		root.requestAnimationFrame(frame);
	};

	Main.setSeed = function (seed) {
		if (!sim) return;
		RR.Sim.reset(sim, seed);
		RR.Clock.reset(clock);
		RR.UI.setSeed(sim.seed);
		RR.UI.updateTelemetry(measuredFps, sim, clock);
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
