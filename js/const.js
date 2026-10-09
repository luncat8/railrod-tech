(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});

	RR.Const = {
		// fixed-step clock
		DT: 1 / 60,
		MAX_STEPS: 30,
		MAX_FRAME_SECONDS: 0.25,
		MIN_SPEED: 0.25,
		MAX_SPEED: 8,
		DEFAULT_SPEED: 1,
		DEFAULT_SEED: 731421,
		FPS_WINDOW_MS: 500,
		TELEMETRY_INTERVAL_MS: 250,

		// ring world
		RING_KM: 64,
		NODE_N: 14,
		RES_N: 3,
		MIN_GAP_KM: 2.5,
		SRC_BASE_MIN: 6,
		SRC_BASE_MAX: 14,
		CON_BASE_MIN: 18,
		CON_BASE_MAX: 36,
		INFLOW_MIN: 0.04,
		INFLOW_MAX: 0.12,
		RATE_MIN: 0.02,
		RATE_MAX: 0.08,
		CAP_MIN: 60,
		CAP_MAX: 140,
		CON_CAP_MIN: 40,
		CON_CAP_MAX: 100,
		SRC_STOCK_MIN: 0.3,
		SRC_STOCK_MAX: 0.6,
		CON_STOCK_MIN: 0.05,
		CON_STOCK_MAX: 0.2,
		K_MIN: 0.5,
		K_MAX: 2,

		// placeholder train, replaced by the 0.1.3 force model
		TRAIN_V: 1.5,

		// camera / view
		CAMERA_FOLLOW: 2.5,
		KM_VISIBLE: 26,
		TIE_KM: 0.5
	};

	if (typeof module !== "undefined" && module.exports) module.exports = RR.Const;
})(globalThis);
