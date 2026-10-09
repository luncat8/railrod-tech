(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});

	RR.Const = {
		DT: 1 / 60,
		MAX_STEPS: 30,
		MAX_FRAME_SECONDS: 0.25,
		MIN_SPEED: 0.25,
		MAX_SPEED: 8,
		DEFAULT_SPEED: 1,
		DEFAULT_SEED: 731421,
		FPS_WINDOW_MS: 500,
		TELEMETRY_INTERVAL_MS: 250
	};

	if (typeof module !== "undefined" && module.exports) module.exports = RR.Const;
})(globalThis);
