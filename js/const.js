(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});

	RR.Const = {
		// fixed-step clock. two run modes share one step function:
		// ANIMATE is the accumulator below a time scale, MAX is a flat step budget
		DT: 1 / 60,
		MAX_STEPS: 96,       // animation only: the most a lagging frame may catch up
		MAX_MODE_STEPS: 3000, // MAX: 50 sim s a frame, ~3000x real time at 60 Hz
		MAX_FRAME_SECONDS: 0.25,
		MIN_SPEED: 2,
		MAX_SPEED: 30,
		DEFAULT_SPEED: 8,
		DEFAULT_SEED: 731421,
		FPS_WINDOW_MS: 500,
		TELEMETRY_INTERVAL_MS: 250,

		// ring world
		RING_KM: 64,
		NODE_N: 14,
		RES_N: 3,
		MIN_GAP_KM: 2.5,
		TERRAIN_N: 256,
		TERRAIN_RELIEF_M: 60,
		TERRAIN_Y_PX_PER_M: 0.34,
		TERRAIN_BED_PX: 8,
		TERRAIN_SLOPE_MAX_DEG: 4,
		SRC_BASE_MIN: 6,
		SRC_BASE_MAX: 14,
		CON_BASE_MIN: 18,
		CON_BASE_MAX: 36,
		INFLOW_MIN: 0.1,
		INFLOW_MAX: 0.3,
		RATE_MIN: 0.08,
		RATE_MAX: 0.32,
		CAP_MIN: 16,
		CAP_MAX: 40,
		CON_CAP_MIN: 10,
		CON_CAP_MAX: 28,
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
		// c_drag is per unit of frontal area: the air a build pushes is the area the
		// loading gauge gives it, times this. see Tech.areaOf
		C_DRAG: 8.4,
		C_SKIN: 0.04,    // aerodynamic drag coefficient per locomotive / wagon length unit
		LOCO_LENGTH_UNITS: 1,
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
		UNITS_PER_S: 2,     // transfers per second across a one-unit wagon
		TRANSFER_SIZE_GAIN: 0.5, // a bigger wagon also empties faster: rate × (1 + gain·(hold−1))
		HOLD_MAX: 2,        // units one wagon holds on the widest gauge, one on the narrowest
		STOP_EPS_KM: 0.01, // the node just left counts as behind until the train is this far clear
		// money: unbounded, so only rates count. capex is amortised, not charged
		SMOOTH_MIN_S: 5,    // the player's smoothing window: 5 s twitches, 600 s is the steady rate
		SMOOTH_MAX_S: 600,
		SMOOTH_STEP_S: 5,
		SMOOTH_DEFAULT_S: 60, // about one loop: shorter windows read the lumps of trade, not the rate
		TREND_SLOW: 4,      // the trend is the fast window against one this many times slower
		TREND_EPS: 0.005,   // below this the trend reads as flat, not as green or red
		HISTORY_N: 96,      // sparkline samples
		HISTORY_DIV: 8,     // one sample per smooth / this; the window is HISTORY_N times that
		HISTORY_PER_FRAME: 4, // and never more than this many per frame, however big the frame is
		NET_MEAN_S: 600,   // the rate window a swept dot is worth comparing against

		// fixed-length line: the test-track mode. a line is a whole distance run from a
		// standing start and totalled, not averaged, so two builds read as two totals of
		// the same kind. the bench runs N of them on one world, one train each
		LINE_LAPS_MIN: 1,
		LINE_LAPS_MAX: 4,
		LINE_LAPS_DEFAULT: 2,
		LINE_SLOT_MIN: 2,
		LINE_SLOT_MAX: 8,
		LINE_SLOT_DEFAULT: 4,
		LINE_CUTOFF_KM: 384,   // a line that never ends empty is dead weight by here
		LINE_CUTOFF_S: 1800,   // and a consist that cannot move is dead weight by here
		LINE_BUDGET_ANIM: 2000, // bench steps a frame while the world is animated
		LINE_BUDGET_MAX: 6000,  // and a frame in MAX, where no frame is drawn at all

		AMORT_S: 1200,     // horizon over which the build's value is recovered, s
		K_TRACK: 10,       // track cr/km scale
		TRACK_BASE: 0.4,   // track cr/km = K_TRACK · (base + gain · g²): the roadbed
		TRACK_GAIN: 3,     // of a gauge that carries wider wagons is not a linear bill
		CW: 60,            // wagon cr at g = d = 0
		WAGON_HOLD_COST: 1, // wagon cr follows the hold it carries, not only its own iron
		CL: 450,           // loco cr at e = 1
		LOCO_COST_EXP: 2.2,
		GAUGE_MIN_M: 0.6,  // readouts only: gauge = 0.6 + 3.4g m
		GAUGE_MAX_M: 4.0,
		WHEEL_MIN_M: 0.4,  // readouts only: wheel = 0.4 + 1.2d m
		WHEEL_MAX_M: 1.6,

		// build sweep: the measured grid behind the performance panel
		SWEEP_G_N: 9,
		SWEEP_D_N: 9,
		SWEEP_E_N: 3,
		SWEEP_STRIDE: 122,         // coprime with 9*9*3, so a pass scatters over the panel
		SWEEP_MIN_S: 150,          // a sample is at least this long and ends with the train empty
		SWEEP_MAX_S: 600,          // and if it never gets there, this cutoff prices it as dead weight
		SWEEP_EMA: 0.4,            // weight of a new pass in a dot's running average
		SWEEP_BUDGET_ANIM: 4000,   // sweep steps per frame while the world is animated
		SWEEP_BUDGET_MAX: 6000,    // and per frame in MAX, where no frame is drawn at all
		SWEEP_REFRESH_S: 1200,     // one market cycle: the next pass samples another phase of it

		// build curves: one plot per build control, sampled from the model
		PLOT_SAMPLES: 40,
		PLOT_HOLD_MS: 2200,    // a touched control keeps its plot up this long

		// camera / view
		CAMERA_FOLLOW: 2.5,
		KM_VISIBLE: 26,
		TIE_KM: 0.5
	};

	if (typeof module !== "undefined" && module.exports) module.exports = RR.Const;
})(globalThis);
