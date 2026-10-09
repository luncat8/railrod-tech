(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var Tech = RR.Tech || {};

	// knob slots in the knobs array
	Tech.GAUGE = 0;
	Tech.WHEEL = 1;
	Tech.ENGINE = 2;
	Tech.KNOB_N = 3;

	Tech.defaultKnobs = function () {
		var knobs = new Float64Array(Tech.KNOB_N);

		knobs[Tech.GAUGE] = C.KNOB_G;
		knobs[Tech.WHEEL] = C.KNOB_D;
		knobs[Tech.ENGINE] = C.KNOB_E;
		return knobs;
	};

	Tech.clampKnob = function (value) {
		if (value < C.KNOB_MIN) return C.KNOB_MIN;
		if (value > C.KNOB_MAX) return C.KNOB_MAX;
		return value;
	};

	// knobs → the physical build; allocated only when a knob changes
	Tech.derive = function (knobs) {
		var g = knobs[Tech.GAUGE];
		var d = knobs[Tech.WHEEL];
		var e = knobs[Tech.ENGINE];
		var mLoco = C.ML * (0.5 + e);
		var loco = C.CL * Math.pow(0.15 + 0.85 * e, 1.5);

		return {
			mLoco: mLoco,
			mWagon: C.M0 * (0.8 + 0.4 * g) + C.MW * d * d,
			vTrack: C.V0 * (0.7 + 0.6 * g) * (0.9 + 0.2 * d),
			power: C.P0 * Math.pow(0.15 + 0.85 * e, 1.8),
			cRR: C.C_RR0 * (1.3 - 0.7 * d),
			fTrac: C.MU * C.DRIVE_SHARE * mLoco * C.TRAIN_G,
			trackPerKm: C.K_TRACK * (0.6 + 1.4 * g * g),
			wagonCost: C.CW * (0.7 + 0.6 * g + 0.8 * d * d),
			locoCost: loco
		};
	};

	// capital tied up in the build, amortised over AMORT_S; the loop is the route
	Tech.capexRate = function (build, wagons) {
		var value = C.RING_KM * build.trackPerKm + wagons * build.wagonCost + build.locoCost;

		return value / C.AMORT_S;
	};

	// physical readouts for the sliders: gauge m, wheel m (loco mass comes from the build)
	Tech.gaugeM = function (g) {
		return C.GAUGE_MIN_M + (C.GAUGE_MAX_M - C.GAUGE_MIN_M) * g;
	};

	Tech.wheelM = function (d) {
		return C.WHEEL_MIN_M + (C.WHEEL_MAX_M - C.WHEEL_MIN_M) * d;
	};

	RR.Tech = Tech;

	if (typeof module !== "undefined" && module.exports) module.exports = Tech;
})(globalThis);
