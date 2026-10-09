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

		// build knobs: g gauge, d wheel, e engine; each in [0, 1]
		KNOB_G: 0.5,
		KNOB_D: 0.5,
		KNOB_E: 0.5,
		KNOB_MIN: 0,
		KNOB_MAX: 1,
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
		BRAKE_DECEL: 0.6,   // km/s², constant service braking for stops
		UNITS_PER_S: 2,     // transfers per second across the whole train
		STOP_EPS_KM: 0.01, // the node just left counts as behind until the train is this far clear
		// money: unbounded, so only rates count. capex is amortised, not charged
		PROFIT_TAU_S: 60,  // about one loop: shorter windows read the lumps of trade, not the rate
		AMORT_S: 1200,     // horizon over which the build's value is recovered, s
		K_TRACK: 10,       // track cr/km at g = 0
		CW: 60,            // wagon cr at g = d = 0
		CL: 300,           // loco cr at e = 0
		GAUGE_MIN_M: 0.6,  // readouts only: gauge = 0.6 + 3.4g m
		GAUGE_MAX_M: 4.0,
		WHEEL_MIN_M: 0.4,  // readouts only: wheel = 0.4 + 1.2d m
		WHEEL_MAX_M: 1.6,

		// camera / view
		CAMERA_FOLLOW: 2.5,
		KM_VISIBLE: 26,
		TIE_KM: 0.5
	};

	if (typeof module !== "undefined" && module.exports) module.exports = RR.Const;
})(globalThis);
