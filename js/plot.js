(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var Tech = RR.Tech;
	var Train = RR.Train;
	var Plot = RR.Plot || {};

	// the controls a plot can be shown for: the wagon slider first, then the three knobs
	Plot.WAGONS = 0;
	Plot.GAUGE = 1;
	Plot.WHEEL = 2;
	Plot.ENGINE = 3;
	Plot.CONTROL_N = 4;

	Plot.SAMPLES = C.PLOT_SAMPLES;

	var SAMPLES = Plot.SAMPLES;
	var SERIES_N = 3;   // most a chart draws
	var CHART_N = 2;    // most a plot stacks
	var INK = ["#a9d68e", "#d9b978", "#7f9fc4"];
	var FAINT = "#5b665d";

	function makeSeries() {
		return {
			name: "",
			unit: "",
			digits: 0,
			color: INK[0],
			values: new Float64Array(SAMPLES),
			lo: 0,
			hi: 0,
			at: 0
		};
	}

	function makeChart() {
		var made = {
			xLabel: "",
			xDigits: 2,
			x0: 0,
			x1: 1,
			marker: false,   // the marker is the player's build on this chart's x
			series: [makeSeries(), makeSeries(), makeSeries()],
			seriesN: 0
		};
		var i;

		for (i = 0; i < SERIES_N; i += 1) made.series[i].color = INK[i % INK.length];
		return made;
	}

	// One plot object, reused: the curves are written in place, so dragging a slider
	// and watching its plot costs no allocation per frame.
	Plot.create = function () {
		var plot = {
			control: -1,
			title: "",
			note: "",
			markerX: 0,
			marker: 0,
			charts: [makeChart(), makeChart()],
			chartN: 1,
			knobs: Tech.defaultKnobs(),
			build: Tech.derive(Tech.defaultKnobs()),
			train: null
		};

		plot.train = Train.create(plot.build, C.WAGON_DEFAULT);
		return plot;
	};

	// x of sample i, or the player's own reading once the samples are done. read is the
	// same function the slider readout uses, so the marker lands on their number
	function xAt(plot, i, x0, x1, read) {
		if (i < SAMPLES) return sampleX(x0, x1, i);
		return read(plot.knobs[plot.control === Plot.WHEEL ? Tech.WHEEL : Tech.GAUGE]);
	}

	// x of sample i over [x0, x1], both ends included: a preference for an end of the
	// slider has to read as being on it, not near it
	function sampleX(x0, x1, i) {
		return x0 + (x1 - x0) * (i / (SAMPLES - 1));
	}

	// the current build with one knob overridden; the probe is a scratch build, so this
	// costs no allocation
	function buildAt(plot, slot, value) {
		var held = plot.knobs[slot];

		plot.knobs[slot] = value;
		Tech.deriveInto(plot.build, plot.knobs);
		plot.knobs[slot] = held;
		return plot.build;
	}

	// sample i of a series, or the value under the marker when i is past the curve:
	// the builders run one step further than the curve, at the player's own x, so the
	// number the legend reads is their build and not the nearest sample to it
	function put(series, value, i) {
		if (i < SAMPLES) series.values[i] = value;
		else series.at = value;
	}

	// the slider's physical readout → the knob behind it
	function gaugeOf(m) {
		return (m - C.GAUGE_MIN_M) / (C.GAUGE_MAX_M - C.GAUGE_MIN_M);
	}

	function wheelOf(m) {
		return (m - C.WHEEL_MIN_M) / (C.WHEEL_MAX_M - C.WHEEL_MIN_M);
	}

	function locoOf(t) {
		return t / C.ML - 0.5;
	}

	function setChart(chart, xLabel, xDigits, x0, x1, marker, seriesN) {
		chart.xLabel = xLabel;
		chart.xDigits = xDigits;
		chart.x0 = x0;
		chart.x1 = x1;
		chart.marker = marker;
		chart.seriesN = seriesN;
	}

	function setSeries(target, name, unit, digits) {
		target.name = name;
		target.unit = unit;
		target.digits = digits;
	}

	// ---- the four plots -------------------------------------------------------
	// Every curve is the model the sim runs: tare and hold from Tech, acceleration from
	// Train.accel on a scratch train, transfer time from the build's own rate. Nothing
	// here is measured, and nothing here is a picture of something else.

	function wagonsPlot(plot, sim) {
		var train = sim.trains[0];
		var build = plot.build;
		var chart = plot.charts[0];
		var mass = chart.series[0];
		var loaded = chart.series[1];
		var swap = chart.series[2];
		var w;
		var hold;
		var m;
		var i;

		plot.title = "WAGONS · WEIGHT AND LOAD TIME";
		plot.note = "A FULL UNLOAD AND RELOAD AT " + build.transferRate.toFixed(1) + " UNITS/S";
		setChart(chart, "WAGONS", 0, C.WAGON_MIN, C.WAGON_MAX, true, 3);
		setSeries(mass, "MASS", "T", 0);
		setSeries(loaded, "LOADED", "T", 0);
		setSeries(swap, "LOAD+UNLOAD", "S", 1);

		for (i = 0; i <= SAMPLES; i += 1) {
			w = i < SAMPLES ? Math.round(sampleX(C.WAGON_MIN, C.WAGON_MAX, i)) : train.wagons;
			hold = Math.round(w * build.wagonHold);
			m = build.mLoco + w * build.mWagon;
			put(mass, m, i);
			put(loaded, m + hold * C.UNIT_T, i);
			put(swap, 2 * hold / build.transferRate, i);
		}
	}

	function gaugePlot(plot, sim) {
		var train = sim.trains[0];
		var chart = plot.charts[0];
		var hold = chart.series[0];
		var mass = chart.series[1];
		var air = chart.series[2];
		var i;
		var v;
		var m;

		plot.title = "GAUGE · CARGO HOLD, MASS AND AIR";
		plot.note = train.wagons + " WAGONS · THE WIDE END PAYS FOR ITS HOLD IN AIR";
		setChart(chart, "GAUGE M", 2, C.GAUGE_MIN_M, C.GAUGE_MAX_M, true, 3);
		setSeries(hold, "HOLD", "T", 0);
		setSeries(mass, "MASS", "T", 0);
		setSeries(air, "AIR", "KM/S²", 2);

		for (i = 0; i <= SAMPLES; i += 1) {
			buildAt(plot, Tech.GAUGE, gaugeOf(xAt(plot, i, C.GAUGE_MIN_M, C.GAUGE_MAX_M, Tech.gaugeM)));
			plot.train.wagons = train.wagons;
			put(hold, Train.capacity(plot.train) * C.UNIT_T, i);
			m = plot.build.mLoco + train.wagons * plot.build.mWagon;
			v = plot.build.vTrack;
			put(mass, m, i);
			// the deceleration the air costs at the build's own line speed: what the
			// gauge buys in hold it pays for here, and past the middle of the slider
			// that is what stops the train reaching the speed it is allowed
			put(air, C.C_DRAG * plot.build.dragArea * v * v * v / m, i);
		}
		buildAt(plot, Tech.GAUGE, plot.knobs[Tech.GAUGE]);
	}

	// the wheel: what it costs in mass, what it gives in rolling resistance, and how
	// far ahead a stop has to be seen at the line speed it allows
	function wheelPlot(plot, sim) {
		var train = sim.trains[0];
		var chart = plot.charts[0];
		var mass = chart.series[0];
		var accel = chart.series[1];
		var brake = chart.series[2];
		var probe = plot.train;
		var i;
		var vTop;

		plot.title = "WHEEL · FRICTION AND MASS";
		plot.note = "ACCEL OUT OF A STOP · BRAKE FROM LINE SPEED";
		setChart(chart, "WHEEL M", 2, C.WHEEL_MIN_M, C.WHEEL_MAX_M, true, 3);
		setSeries(mass, "MASS", "T", 0);
		setSeries(accel, "ACCEL", "KM/S²", 2);
		setSeries(brake, "BRAKE", "KM", 2);

		probe.wagons = train.wagons;
		probe.cargoUnits = 0;
		vTop = 0;
		for (i = 0; i <= SAMPLES; i += 1) {
			buildAt(plot, Tech.WHEEL, wheelOf(xAt(plot, i, C.WHEEL_MIN_M, C.WHEEL_MAX_M, Tech.wheelM)));
			put(mass, plot.build.mLoco + train.wagons * plot.build.mWagon, i);
			put(accel, Train.accel(probe, 0), i);
			put(brake, plot.build.vTrack * plot.build.vTrack / (2 * C.BRAKE_DECEL), i);
			if (plot.build.vTrack > vTop) vTop = plot.build.vTrack;
		}
		buildAt(plot, Tech.WHEEL, plot.knobs[Tech.WHEEL]);
		speedChart(plot, vTop);
	}

	// acceleration is a curve, not a number: the engine gives P / v, the rails give
	// adhesion, and the mass the engine has to move divides both
	function speedChart(plot, vTop) {
		var chart = plot.charts[1];
		var mine = chart.series[0];
		var narrow = chart.series[1];
		var wide = chart.series[2];
		var held = plot.knobs[Tech.WHEEL];
		var probe = plot.train;
		var i;
		var v;

		plot.chartN = 2;
		setChart(chart, "SPEED KM/S", 2, 0, vTop, false, 3);
		setSeries(mine, "ACCEL", "KM/S²", 2);
		setSeries(narrow, "AT " + C.WHEEL_MIN_M.toFixed(1) + " M", "KM/S²", 2);
		setSeries(wide, "AT " + C.WHEEL_MAX_M.toFixed(1) + " M", "KM/S²", 2);
		narrow.color = FAINT;
		wide.color = FAINT;

		for (i = 0; i < SAMPLES; i += 1) {
			v = sampleX(0, vTop, i);
			mine.values[i] = Train.accel(probe, v);
			buildAt(plot, Tech.WHEEL, C.KNOB_MIN);
			narrow.values[i] = Train.accel(probe, v);
			buildAt(plot, Tech.WHEEL, C.KNOB_MAX);
			wide.values[i] = Train.accel(probe, v);
			buildAt(plot, Tech.WHEEL, held);
		}
	}

	// the engine: the force the rails can take, and the force the engine can still
	// make at line speed. the usable force is the lower of the two, and where the
	// second line crosses the first is where more engine stops buying anything
	function enginePlot(plot, sim) {
		var train = sim.trains[0];
		var chart = plot.charts[0];
		var force = chart.series[0];
		var limited = chart.series[1];
		var mass = chart.series[2];
		var vTrack = plot.build.vTrack;
		var lo = Tech.mLocoOf(C.KNOB_MIN);
		var hi = Tech.mLocoOf(C.KNOB_MAX);
		var i;

		plot.title = "ENGINE · FORCE AND MASS";
		plot.note = "ADHESION LIMIT AGAINST THE POWER LEFT AT " + vTrack.toFixed(2) + " KM/S";
		setChart(chart, "LOCO T", 0, lo, hi, true, 3);
		setSeries(force, "FORCE", "MN", 1);
		setSeries(limited, "P / V", "MN", 1);
		setSeries(mass, "MASS", "T", 0);

		for (i = 0; i <= SAMPLES; i += 1) {
			buildAt(plot, Tech.ENGINE, locoOf(i < SAMPLES ? sampleX(lo, hi, i) : Tech.mLocoOf(plot.knobs[Tech.ENGINE])));
			put(force, plot.build.fTrac, i);
			put(limited, plot.build.power / vTrack, i);
			put(mass, plot.build.mLoco + train.wagons * plot.build.mWagon, i);
		}
		buildAt(plot, Tech.ENGINE, plot.knobs[Tech.ENGINE]);
	}

	var PLOTS = [wagonsPlot, gaugePlot, wheelPlot, enginePlot];

	// the marker: the player's build, on the x of the first chart
	function placeMarker(plot) {
		var chart = plot.charts[0];
		var index = Math.round((plot.markerX - chart.x0) / (chart.x1 - chart.x0) * (SAMPLES - 1));
		var c;
		var s;

		plot.marker = index < 0 ? 0 : (index > SAMPLES - 1 ? SAMPLES - 1 : index);
		chart.markerX = plot.markerX;
		for (c = 0; c < plot.chartN; c += 1) {
			if (plot.charts[c].marker) continue;   // the builders read those at the player's x
			for (s = 0; s < plot.charts[c].seriesN; s += 1) {
				plot.charts[c].series[s].at = plot.charts[c].series[s].values[plot.marker];
			}
		}
	}

	Plot.controlOf = function (slot) {
		return slot + 1;
	};

	// fill a plot for one control from the live build; the curve model only, no DOM
	Plot.fill = function (plot, control, sim) {
		var train = sim.trains[0];
		var c;
		var s;
		var v;
		var chart;
		var target;
		var lo;
		var hi;

		plot.control = control;
		plot.chartN = 1;
		plot.knobs.set(sim.knobs);
		Tech.deriveInto(plot.build, plot.knobs);
		plot.train.build = plot.build;
		plot.train.wagons = train.wagons;
		plot.train.cargoUnits = 0;

		PLOTS[control](plot, sim);

		plot.markerX = control === Plot.WAGONS ? train.wagons : markerValue(plot, control);
		placeMarker(plot);

		// each series is read against its own range, so curves of different units share
		// one box without a second axis lying about either of them
		for (c = 0; c < plot.chartN; c += 1) {
			chart = plot.charts[c];
			for (s = 0; s < chart.seriesN; s += 1) {
				target = chart.series[s];
				lo = Infinity;
				hi = -Infinity;
				for (v = 0; v < SAMPLES; v += 1) {
					if (target.values[v] < lo) lo = target.values[v];
					if (target.values[v] > hi) hi = target.values[v];
				}
				target.lo = lo;
				target.hi = hi;
			}
		}
		return plot;
	};

	function markerValue(plot, control) {
		if (control === Plot.GAUGE) return Tech.gaugeM(plot.knobs[Tech.GAUGE]);
		if (control === Plot.WHEEL) return Tech.wheelM(plot.knobs[Tech.WHEEL]);
		return Tech.mLocoOf(plot.knobs[Tech.ENGINE]);
	}

	RR.Plot = Plot;

	if (typeof module !== "undefined" && module.exports) module.exports = Plot;
})(globalThis);
