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

	// the knob curves, one scalar each: the plots and the build read the same source,
	// so a curve on screen is the model the sim runs, and no build object is needed
	// to answer "what would this knob do"
	Tech.mLocoOf = function (e) {
		return C.ML * (0.5 + e);
	};

	Tech.mWagonOf = function (g, d) {
		return C.M0 * (0.8 + 0.4 * g) + C.MW * d * d;
	};

	Tech.vTrackOf = function (g, d) {
		return C.V0 * (0.7 + 0.6 * g) * (0.9 + 0.2 * d);
	};

	Tech.powerOf = function (e) {
		return C.P0 * Math.pow(0.15 + 0.85 * e, 1.8);
	};

	Tech.cRROf = function (d) {
		return C.C_RR0 * (1.3 - 0.7 * d);
	};

	Tech.fTracOf = function (e) {
		return C.MU * C.DRIVE_SHARE * Tech.mLocoOf(e) * C.TRAIN_G;
	};

	// the payload gauge buys, in units per wagon. it is a scale, not a count: the
	// consist rounds it into whole slots, so a small widening buys one more slot
	// somewhere in the train instead of a whole tier for every wagon at once
	Tech.holdPerWagon = function (g) {
		return 1 + (C.HOLD_MAX - 1) * g;
	};

	// a bigger wagon carries more and also empties and fills faster, so load and
	// unload time grows with the wagon count and only creeps up with the wagon size
	Tech.transferRateOf = function (g) {
		return C.UNITS_PER_S * (1 + C.TRANSFER_SIZE_GAIN * (Tech.holdPerWagon(g) - 1));
	};

	// knobs → the physical build, written in place. allocated only when a knob changes
	Tech.deriveInto = function (build, knobs) {
		var g = knobs[Tech.GAUGE];
		var d = knobs[Tech.WHEEL];
		var e = knobs[Tech.ENGINE];

		build.mLoco = Tech.mLocoOf(e);
		build.mWagon = Tech.mWagonOf(g, d);
		build.vTrack = Tech.vTrackOf(g, d);
		build.power = Tech.powerOf(e);
		build.cRR = Tech.cRROf(d);
		build.fTrac = Tech.fTracOf(e);
		build.wagonHold = Tech.holdPerWagon(g);
		build.transferRate = Tech.transferRateOf(g);
		build.trackPerKm = C.K_TRACK * (C.TRACK_BASE + C.TRACK_GAIN * g * g);
		build.wagonCost = C.CW * (0.7 + 0.6 * g + 0.8 * d * d)
			* (1 + C.WAGON_HOLD_COST * (Tech.holdPerWagon(g) - 1));
		build.locoCost = C.CL * Math.pow(0.15 + 0.85 * e, C.LOCO_COST_EXP);
		return build;
	};

	Tech.derive = function (knobs) {
		return Tech.deriveInto({}, knobs);
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
