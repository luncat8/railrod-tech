(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var Clock = RR.Clock || {};

	Clock.create = function () {
		return {
			accumulator: 0,
			droppedSeconds: 0,
			lastSteps: 0,
			dt: RR.Const.DT,
			maxSteps: RR.Const.MAX_STEPS
		};
	};

	Clock.reset = function (clock) {
		clock.accumulator = 0;
		clock.droppedSeconds = 0;
		clock.lastSteps = 0;
	};

	Clock.advance = function (clock, realSeconds, speed, step, state) {
		var frameSeconds = realSeconds;
		var backlogLimit = clock.dt * clock.maxSteps;
		var steps = 0;

		if (frameSeconds < 0) frameSeconds = 0;
		if (frameSeconds > RR.Const.MAX_FRAME_SECONDS) {
			clock.droppedSeconds += (frameSeconds - RR.Const.MAX_FRAME_SECONDS) * speed;
			frameSeconds = RR.Const.MAX_FRAME_SECONDS;
		}

		clock.accumulator += frameSeconds * speed;
		if (clock.accumulator > backlogLimit) {
			clock.droppedSeconds += clock.accumulator - backlogLimit;
			clock.accumulator = backlogLimit;
		}

		while (clock.accumulator + 1e-12 >= clock.dt && steps < clock.maxSteps) {
			clock.accumulator -= clock.dt;
			if (clock.accumulator < 0) clock.accumulator = 0;
			step(state, clock.dt);
			steps += 1;
		}

		clock.lastSteps = steps;
		return steps;
	};

	RR.Clock = Clock;

	if (typeof module !== "undefined" && module.exports) module.exports = Clock;
})(globalThis);
