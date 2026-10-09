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

		// economy
		PRICE_FLOOR: 0.2,
		SPREAD: 0.08,

		// resources: R1 amber, R2 slate-blue, R3 teal
		RES_COLORS: ["#d9b978", "#7f9fc4", "#63c0ae"],

		// train: knobs fixed at the starting build, 0.1.6 wires live sliders
		KNOB_G: 0.5,
		KNOB_D: 0.5,
		KNOB_E: 0.5,
		ML: 40,          // m_loco  = ML * (0.5 + e)
		M0: 18,          // m_wagon = M0 * (0.8 + 0.4g) + MW * d*d
		MW: 12,
		V0: 1.6,         // v_track = V0 * (0.7 + 0.6g) * (0.9 + 0.2d)
		P0: 160,         // P       = P0 * pow(0.15 + 0.85e, 1.8)
		C_RR0: 0.01,     // c_rr    = C_RR0 * (1.3 - 0.7d)
		C_DRAG: 2.4,
		MU: 0.3,         // wheel/rail adhesion
		DRIVE_SHARE: 0.65,
		// scaled gravity: the visual band is 1-2 km/s, so adhesion and rolling
		// resistance are scaled to land acceleration in 0.1-0.8 km/s², not SI
		TRAIN_G: 6,
		UNIT_T: 12,      // cargo mass per unit, t
		V_EPS: 0.01,     // speed floor guarding P / v
		WAGON_MIN: 1,
		WAGON_MAX: 8,
		WAGON_DEFAULT: 4,
		DWELL_S: 1.5,    // stop time at a waypoint, s (0.1.4: transfer time)
		PROFILE_DT: 1 / 240,
		PROFILE_MAX_S: 120,

		// camera / view
		CAMERA_FOLLOW: 2.5,
		KM_VISIBLE: 26,
		TIE_KM: 0.5
	};

	if (typeof module !== "undefined" && module.exports) module.exports = RR.Const;
})(globalThis);
