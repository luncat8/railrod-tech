(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var UI = RR.UI || {};
	var controller = null;
	var seedInput = null;
	var speedInput = null;
	var speedValue = null;
	var speedControl = null;
	var smoothInput = null;
	var smoothValue = null;
	var animateInput = null;
	var lineInput = null;
	var lapsInput = null;
	var lapsValue = null;
	var slotsInput = null;
	var slotsValue = null;
	var benchPanel = null;
	var benchLine = null;
	var benchRows = null;
	var benchStatus = null;
	var benchBar = null;
	var rows = [];
	var rowsBuilt = 0;
	var netLabel = null;
	var netUnit = null;
	var profitLabel = null;
	var profitUnit = null;
	var capexLabel = null;
	var capexUnit = null;
	var avgLabel = null;
	var avgUnit = null;
	var displayedAvgUnit = "";
	var optimumLabel = null;
	var optimumUnit = null;
	var optimumBuildLabel = null;
	var smoothControl = null;
	var wagonsInput = null;
	var wagonsValue = null;
	var knobInputs = null;
	var knobValues = null;
	var trainSpeedValue = null;
	var cargoValue = null;
	var netItem = null;
	var netValue = null;
	var netDelta = null;
	var netGraph = null;
	var graphContext = null;
	var profitValue = null;
	var capexValue = null;
	var avgValue = null;
	var rateValue = null;
	var optimumValue = null;
	var optimumBuildValue = null;
	var pauseButton = null;
	var pauseIcon = null;
	var pauseLabel = null;
	var fpsValue = null;
	var timeValue = null;
	var stepsValue = null;
	var droppedValue = null;
	var runtimeStatus = null;
	var nodeLabel = null;
	var plotBox = null;
	var plotCanvas = null;
	var plotContext = null;
	var plot = null;
	var plotControl = -1;
	var plotTimer = 0;
	var plotW = 0;
	var plotH = 0;
	var graphW = 0;
	var graphH = 0;
	var boundSim = null;
	var displayedFps = null;
	var displayedTime = null;
	var displayedSteps = null;
	var displayedDropped = null;
	var displayedTrainSpeed = null;
	var displayedCargo = "";
	var displayedNet = "";
	var displayedTrend = "";
	var displayedClass = "";
	var displayedAvg = "";
	var displayedRate = "";
	var displayedProfit = "";
	var displayedCapex = "";
	var displayedOptimum = "";
	var displayedOptimumBuild = "";
	var displayedNetUnit = "";
	var displayedBenchHead = "";
	var displayedBenchStatus = "";
	var displayedBenchBar = -1;

	var RES_NAMES = ["R1", "R2", "R3"];

	function emittedIndex(world, i) {
		var res = RR.Const.RES_N;
		var r;

		for (r = 0; r < res; r += 1) {
			if (world.inflow[i * res + r] > 0) return r;
		}
		return -1;
	}

	function recipeNames(mask) {
		var res = RR.Const.RES_N;
		var names = [];
		var r;

		for (r = 0; r < res; r += 1) {
			if (mask & (1 << r)) names.push(RES_NAMES[r]);
		}
		return names.join("+");
	}

	function onSeedChange() {
		var value = Number(seedInput.value);
		if (!Number.isSafeInteger(value) || value < 0 || value > 4294967295) {
			UI.setSeed(controller.getSeed());
			return;
		}
		controller.setSeed(value);
	}

	function onNewSeed() {
		controller.newSeed();
	}

	function onSpeedInput() {
		controller.setSpeed(Number(speedInput.value));
	}

	function onSmoothInput() {
		controller.setSmooth(Number(smoothInput.value));
	}

	function onAnimateChange() {
		controller.setAnimate(animateInput.checked);
	}

	function onLineChange() {
		controller.setLineMode(lineInput.checked);
	}

	function onLapsInput() {
		controller.setLaps(Number(lapsInput.value));
	}

	function onSlotsInput() {
		controller.setSlots(Number(slotsInput.value));
	}

	function onBenchAdd() {
		controller.captureBench();
	}

	function onBenchRun() {
		controller.runLine();
	}

	// a row is a build the player put on the bench; clicking it runs it
	function onBenchRowClick(event) {
		controller.applySlot(Number(event.currentTarget.dataset.slot));
	}

	function onPauseClick() {
		controller.togglePause();
	}

	function onWagonsInput() {
		controller.setWagons(Number(wagonsInput.value));
		showControlPlot(wagonsInput);
	}

	// the plot for the control under the player's hand; the control names its own plot
	function showControlPlot(target) {
		UI.showPlot(Number(target.dataset.plot), target);
	}

	function onControl(event) {
		showControlPlot(event.target);
	}

	// knob slot is carried by the input element itself, one handler for all three
	function onKnobInput(event) {
		controller.setKnob(Number(event.target.dataset.slot), Number(event.target.value));
		showControlPlot(event.target);
	}

	function bindKnob(slot, inputId, valueId) {
		var input = document.getElementById(inputId);

		input.dataset.slot = String(slot);
		input.dataset.plot = String(RR.Plot.controlOf(slot));
		input.addEventListener("input", onKnobInput);
		input.addEventListener("pointerdown", onControl);
		input.addEventListener("focus", onControl);
		knobInputs[slot] = input;
		knobValues[slot] = document.getElementById(valueId);
	}

	UI.bind = function (main, sim, speed, bench) {
		controller = main;
		knobInputs = [];
		knobValues = [];
		seedInput = document.getElementById("seed-input");
		speedInput = document.getElementById("speed-input");
		speedValue = document.getElementById("speed-value");
		speedControl = speedInput.closest(".speed-control");
		smoothInput = document.getElementById("smooth-input");
		smoothValue = document.getElementById("smooth-value");
		smoothControl = smoothInput.closest(".speed-control");
		animateInput = document.getElementById("animate-input");
		lineInput = document.getElementById("line-input");
		lapsInput = document.getElementById("laps-input");
		lapsValue = document.getElementById("laps-value");
		slotsInput = document.getElementById("slots-input");
		slotsValue = document.getElementById("slots-value");
		benchPanel = document.getElementById("bench-panel");
		benchLine = document.getElementById("bench-line");
		benchRows = document.getElementById("bench-rows");
		benchStatus = document.getElementById("bench-status");
		benchBar = document.getElementById("bench-bar");
		netLabel = document.getElementById("net-label");
		netUnit = document.getElementById("net-unit");
		profitLabel = document.getElementById("profit-label");
		profitUnit = document.getElementById("profit-unit");
		capexLabel = document.getElementById("capex-label");
		capexUnit = document.getElementById("capex-unit");
		avgLabel = document.getElementById("avg-label");
		avgUnit = document.getElementById("avg-unit");
		optimumLabel = document.getElementById("optimum-label");
		optimumUnit = document.getElementById("optimum-unit");
		optimumBuildLabel = document.getElementById("optimum-build-label");
		wagonsInput = document.getElementById("wagons-input");
		wagonsValue = document.getElementById("wagons-value");
		trainSpeedValue = document.getElementById("train-speed-value");
		cargoValue = document.getElementById("cargo-value");
		netItem = document.getElementById("net-item");
		netValue = document.getElementById("net-value");
		netDelta = document.getElementById("net-delta");
		netGraph = document.getElementById("net-graph");
		graphContext = netGraph.getContext("2d");
		profitValue = document.getElementById("profit-value");
		capexValue = document.getElementById("capex-value");
		avgValue = document.getElementById("avg-value");
		rateValue = document.getElementById("rate-value");
		optimumValue = document.getElementById("optimum-value");
		optimumBuildValue = document.getElementById("optimum-build");
		plotBox = document.getElementById("build-plot");
		plotCanvas = document.getElementById("plot-canvas");
		plotContext = plotCanvas.getContext("2d");
		plot = RR.Plot.create();
		sizeGraph();
		pauseButton = document.getElementById("pause-button");
		pauseIcon = document.getElementById("pause-icon");
		pauseLabel = document.getElementById("pause-label");
		fpsValue = document.getElementById("fps-value");
		timeValue = document.getElementById("time-value");
		stepsValue = document.getElementById("steps-value");
		droppedValue = document.getElementById("dropped-value");
		runtimeStatus = document.getElementById("runtime-status").parentNode;
		nodeLabel = document.getElementById("node-label");

		seedInput.addEventListener("change", onSeedChange);
		document.getElementById("new-seed").addEventListener("click", onNewSeed);
		speedInput.addEventListener("input", onSpeedInput);
		smoothInput.addEventListener("input", onSmoothInput);
		animateInput.addEventListener("change", onAnimateChange);
		lineInput.addEventListener("change", onLineChange);
		lapsInput.addEventListener("input", onLapsInput);
		slotsInput.addEventListener("input", onSlotsInput);
		document.getElementById("bench-add").addEventListener("click", onBenchAdd);
		document.getElementById("bench-run").addEventListener("click", onBenchRun);
		wagonsInput.addEventListener("input", onWagonsInput);
		wagonsInput.addEventListener("pointerdown", onControl);
		wagonsInput.addEventListener("focus", onControl);
		pauseButton.addEventListener("click", onPauseClick);
		bindKnob(RR.Tech.GAUGE, "gauge-input", "gauge-value");
		bindKnob(RR.Tech.WHEEL, "wheel-input", "wheel-value");
		bindKnob(RR.Tech.ENGINE, "engine-input", "engine-value");

		bindRange(speedInput, RR.Const.MIN_SPEED, RR.Const.MAX_SPEED);
		bindRange(smoothInput, RR.Const.SMOOTH_MIN_S, RR.Const.SMOOTH_MAX_S);
		bindRange(lapsInput, RR.Const.LINE_LAPS_MIN, RR.Const.LINE_LAPS_MAX);
		bindRange(slotsInput, RR.Const.LINE_SLOT_MIN, RR.Const.LINE_SLOT_MAX);
		wagonsInput.dataset.plot = String(RR.Plot.WAGONS);
		UI.setSeed(sim.seed);
		UI.setSpeed(speed);
		UI.setSmooth(sim.smoothS);
		UI.setBuild(sim);
		UI.setPaused(false);
		UI.setAnimate(false);
		UI.setLineMode(sim, bench);
	};

	// the sliders read their own range off the constants, so the page cannot drift
	function bindRange(input, min, max) {
		input.min = String(min);
		input.max = String(max);
	}

	// the build controls mirror the sim; called on every build change, never per frame
	UI.setBuild = function (sim) {
		var train = sim.trains[0];
		var build = train.build;
		var knobs = sim.knobs;

		if (!wagonsInput) return;
		boundSim = sim;
		wagonsInput.value = String(train.wagons);
		wagonsValue.textContent = String(train.wagons);
		setKnobReadout(RR.Tech.GAUGE, knobs, RR.Tech.gaugeM(knobs[RR.Tech.GAUGE]).toFixed(2) + " M");
		setKnobReadout(RR.Tech.WHEEL, knobs, RR.Tech.wheelM(knobs[RR.Tech.WHEEL]).toFixed(2) + " M");
		setKnobReadout(RR.Tech.ENGINE, knobs, build.mLoco.toFixed(0) + " T");
	};

	function setKnobReadout(slot, knobs, label) {
		knobInputs[slot].value = String(knobs[slot]);
		knobValues[slot].textContent = label;
	}

	UI.setSeed = function (seed) {
		if (seedInput) seedInput.value = String(seed >>> 0);
	};

	UI.setSpeed = function (speed) {
		if (!speedInput) return;
		speedInput.value = String(speed);
		speedValue.textContent = Number(speed).toFixed(2) + "×";
	};

	// animation off is the default: the speed row belongs to the animation, so it
	// reads MAX and steps aside until there is something to be slow about
	UI.setAnimate = function (animate) {
		if (!speedInput) return;
		animateInput.checked = !!animate;
		speedInput.disabled = !animate;
		speedControl.classList.toggle("is-off", !animate);
		speedValue.textContent = animate ? Number(speedInput.value).toFixed(2) + "×" : "MAX";
		UI.hidePlot();
	};

	UI.setSmooth = function (seconds) {
		if (!smoothInput) return;
		smoothInput.value = String(seconds);
		smoothValue.textContent = Math.round(seconds) + " S";
	};

	// ---- LINE mode: one line totalled, and the bench of N of them ----

	// the readouts keep their places and change their meaning: the same footer row that
	// carried a rate per second carries a total over the line, so nothing moves while the
	// player compares two builds
	UI.setLineMode = function (sim, bench) {
		var on = sim.lineOn;

		if (!lineInput) return;
		lineInput.checked = on;
		benchPanel.hidden = !on;
		// the smoothing window is the rolling average's; a total has no window to choose
		smoothInput.disabled = on;
		smoothControl.classList.toggle("is-off", on);
		setReadout(netLabel, netUnit, on ? "LINE NET" : "NET / S", on ? " CR" : " CR/S");
		setReadout(profitLabel, profitUnit, on ? "LINE TRADE" : "PROFIT / S", on ? " CR" : " CR/S");
		setReadout(capexLabel, capexUnit, on ? "LINE CAPEX" : "CAPEX / S", on ? " CR" : " CR/S");
		setReadout(avgLabel, avgUnit, on ? "LINE TIME" : "AVG / S", on ? " SEC" : " CR/S");
		setReadout(optimumLabel, optimumUnit, on ? "BENCH BEST" : "OPTIMUM / S", on ? " CR" : " CR/S");
		optimumBuildLabel.textContent = on ? "BEST LINE W·G·D·E" : "OPTIMUM BUILD G·D·E";
		displayedNetUnit = "";
		displayedAvgUnit = "";
		UI.hidePlot();
		UI.setBench(sim, bench);
	};

	function setReadout(label, unit, labelText, unitText) {
		label.textContent = labelText;
		unit.textContent = unitText;
	}

	// the bench's own controls: called when the mode, the length, the row count or the
	// fixture moves, never per frame
	UI.setBench = function (sim, bench) {
		if (!benchPanel || !bench) return;
		if (rowsBuilt !== bench.slots) buildRows(bench.slots);
		lapsInput.value = String(bench.laps);
		lapsValue.textContent = bench.meter.targetKm + " KM";
		slotsInput.value = String(bench.slots);
		slotsValue.textContent = String(bench.slots);
		displayedBenchHead = "";
		displayedBenchStatus = "";
		displayedBenchBar = -1;
		UI.updateBench(sim, bench);
	};

	function cell(parent, className) {
		var el = document.createElement("span");

		el.className = className;
		parent.appendChild(el);
		return el;
	}

	// the rows are elements built when the bench changes size and filled in place after
	// that: a table read four times a second is not a table to rebuild every time
	function buildRows(count) {
		var i;
		var el;

		benchRows.textContent = "";
		rows.length = 0;
		rowsBuilt = count;
		for (i = 0; i < count; i += 1) {
			el = document.createElement(i === 0 ? "div" : "button");
			el.className = "bench-row";
			if (i > 0) {
				el.type = "button";
				el.dataset.slot = String(i);
				el.addEventListener("click", onBenchRowClick);
			}
			rows.push({
				el: el,
				mark: cell(el, "bench-mark"),
				build: cell(el, "bench-build"),
				net: cell(el, "bench-net"),
				rate: cell(el, "bench-rate"),
				time: cell(el, "bench-time"),
				state: "",
				titleShown: "",
				markShown: "",
				buildShown: "",
				netShown: "",
				rateShown: "",
				timeShown: ""
			});
			benchRows.appendChild(el);
		}
	}

	// what the row is made of: the build the player reads off the sliders, in their units
	function buildText(bench, slot) {
		var knobs = bench.knobs[slot];

		return bench.wagons[slot] + "W " + RR.Tech.gaugeM(knobs[RR.Tech.GAUGE]).toFixed(2)
			+ " " + RR.Tech.wheelM(knobs[RR.Tech.WHEEL]).toFixed(2)
			+ " " + RR.Tech.mLocoOf(knobs[RR.Tech.ENGINE]).toFixed(0);
	}

	// the row's own rate: its total over its own seconds, which is the unit the swept grid
	// measures a dot in, so a bench row and a dot for the same build can be read together
	function rateOf(bench, slot) {
		return bench.seconds[slot] > 0 ? (bench.net[slot] / bench.seconds[slot]).toFixed(2) : "—";
	}

	// pending rows show no number: the one they hold was measured on the build before the
	// slider moved, and a stale total next to a new build is a lie
	function rowState(bench, slot) {
		if (!bench.used[slot]) return "is-empty";
		if (bench.queued[slot]) return "is-pending";
		if (bench.cut[slot]) return "is-cut";
		if (slot === bench.best) return "is-best";
		return slot === 0 ? "is-live" : "";
	}

	// what the row ran, behind it: a line is the fixed length plus whatever it took to
	// finish clean, and that distance is the part of the total worth checking. the pace
	// is there for the same reason — a line that ran further is slower in seconds and
	// not in speed, and a build is only called slow by one of those two
	function rowTitle(bench, slot) {
		var move = bench.move[slot];
		var run = bench.km[slot].toFixed(1) + " KM RUN · " + bench.stops[slot] + " STOPS · "
			+ bench.units[slot] + " UNITS · "
			+ (move > 0 ? (bench.km[slot] / move).toFixed(2) + " KM/S UNDER WAY · " : "")
			+ (bench.seconds[slot] - move).toFixed(1) + " S AT STOPS";

		if (!bench.used[slot]) return "AN EMPTY ROW: + ROW PUTS THE LIVE BUILD HERE";
		if (bench.queued[slot]) return slot === 0 ? "MEASURING THE BUILD YOU ARE RUNNING" : "MEASURING";
		if (bench.cut[slot]) return "RAN TO THE CUTOFF WITHOUT LEAVING A STOP EMPTY · " + run;
		return run + (slot === 0 ? "" : " · CLICK TO RUN THIS BUILD");
	}

	function updateRow(bench, slot) {
		var row = rows[slot];
		var pending = !bench.used[slot] || bench.queued[slot];
		var state = rowState(bench, slot);
		var title = rowTitle(bench, slot);
		var mark = bench.used[slot] ? (slot === 0 ? "LIVE" : "#" + (slot + 1)) : "—";
		var build = bench.used[slot] ? buildText(bench, slot) : "EMPTY";
		var net = pending ? (bench.used[slot] ? "…" : "—") : signed(bench.net[slot]);
		var rate = pending ? (bench.used[slot] ? "…" : "—") : rateOf(bench, slot);
		var time = pending ? (bench.used[slot] ? "…" : "—") : bench.seconds[slot].toFixed(1);

		if (state !== row.state) {
			row.el.className = "bench-row" + (state ? " " + state : "");
			row.state = state;
		}
		if (title !== row.titleShown) {
			row.el.title = title;
			row.titleShown = title;
		}
		if (mark !== row.markShown) {
			row.mark.textContent = mark;
			row.markShown = mark;
		}
		if (build !== row.buildShown) {
			row.build.textContent = build;
			row.buildShown = build;
		}
		if (net !== row.netShown) {
			row.net.textContent = net;
			row.netShown = net;
		}
		if (rate !== row.rateShown) {
			row.rate.textContent = rate;
			row.rateShown = rate;
		}
		if (time !== row.timeShown) {
			row.time.textContent = time;
			row.timeShown = time;
		}
	}

	// the panel's head, rows and progress; four times a second while the mode is on
	UI.updateBench = function (sim, bench) {
		var head = bench.meter.targetKm + " KM · SEED " + bench.seed;
		var used = RR.Line.rowsUsed(bench);
		var status = "MEASURED " + bench.measured + "/" + used;
		var bar = used > 0 ? Math.round(bench.measured * 100 / used) : 0;
		var i;

		if (!benchPanel || benchPanel.hidden) return;
		if (head !== displayedBenchHead) {
			benchLine.textContent = head;
			displayedBenchHead = head;
		}
		for (i = 0; i < rows.length; i += 1) updateRow(bench, i);
		if (status !== displayedBenchStatus) {
			benchStatus.textContent = status;
			displayedBenchStatus = status;
		}
		if (bar !== displayedBenchBar) {
			benchBar.style.width = bar + "%";
			displayedBenchBar = bar;
		}
	};

	// the comparison the mode exists for: the live line against the best build the player
	// put on the bench beside it
	function benchGap(sim, bench) {
		if (!bench || bench.bestCaptured < 0) return null;
		return RR.Line.net(sim.line, sim.trains[0]) - bench.net[bench.bestCaptured];
	}

	function benchDeltaText(sim, bench) {
		var gap = benchGap(sim, bench);

		if (gap === null) return "NO OTHER LINE";
		if (Math.abs(gap) < 0.005) return "LEVEL WITH BENCH";
		return (gap > 0 ? "\u25B2 +" : "\u25BC ") + gap.toFixed(2) + " VS BENCH";
	}

	function benchDeltaClass(sim, bench) {
		var gap = benchGap(sim, bench);

		if (gap === null || Math.abs(gap) < 0.005) return "";
		return gap > 0 ? "is-up" : "is-down";
	}

	UI.setPaused = function (paused) {
		if (!pauseButton) return;
		pauseButton.setAttribute("aria-pressed", paused ? "true" : "false");
		pauseIcon.textContent = paused ? "▶" : "Ⅱ";
		pauseLabel.textContent = paused ? "RESUME" : "PAUSE";
		runtimeStatus.classList.toggle("is-paused", paused);
		document.getElementById("runtime-status").textContent = paused ? "PAUSED" : "RUNNING";
	};

	// the plot behind the control under the player's hand
	UI.showPlot = function (control, target) {
		if (!plotBox) return;

		plotControl = control;
		plotBox.hidden = false;
		if (target) alignPlot(target);
		UI.drawPlot();
		if (plotTimer) root.clearTimeout(plotTimer);
		plotTimer = root.setTimeout(UI.hidePlot, RR.Const.PLOT_HOLD_MS);
	};

	UI.hidePlot = function () {
		if (!plotBox) return;
		if (plotTimer) {
			root.clearTimeout(plotTimer);
			plotTimer = 0;
		}
		plotBox.hidden = true;
		plotControl = -1;
	};

	// over the control it belongs to, and inside the footer whatever the control is
	function alignPlot(target) {
		var host = target.closest(".speed-control") || target;
		var left = host.offsetLeft - 88;

		if (left < 8) left = 8;
		plotBox.style.left = left + "px";
	}

	// one canvas, resized only when the plot needs a different number of charts
	function sizePlot(chartN) {
		var dpr = root.devicePixelRatio || 1;
		var w = 300;
		var h = RR.Render.plotHeight(chartN);

		if (w === plotW && h === plotH) return;
		plotW = w;
		plotH = h;
		plotCanvas.style.width = w + "px";
		plotCanvas.style.height = h + "px";
		plotCanvas.width = Math.round(w * dpr);
		plotCanvas.height = Math.round(h * dpr);
		plotContext.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	UI.drawPlot = function () {
		if (!plotBox || plotBox.hidden || !boundSim || plotControl < 0) return;

		RR.Plot.fill(plot, plotControl, boundSim);
		sizePlot(plot.chartN);
		RR.Render.drawPlot(plotContext, plot, plotW, plotH);
	};

	// the trend is the fast window against the slow one: ▲ climbing, ▼ falling
	function trendText(sim) {
		var delta = sim.netTrend;

		if (delta > RR.Const.TREND_EPS) return "\u25B2 +" + delta.toFixed(2);
		if (delta < -RR.Const.TREND_EPS) return "\u25BC " + delta.toFixed(2);
		return "FLAT";
	}

	function trendClass(sim) {
		if (sim.netTrend > RR.Const.TREND_EPS) return "is-up";
		if (sim.netTrend < -RR.Const.TREND_EPS) return "is-down";
		return "";
	}

	// signed money, two decimals; "+" only on gains so a zero reads as "0.00". the same
	// formatter reads a rate per second and a total over a line: both are credits
	function signed(value) {
		var rounded = Math.round(value * 100) / 100;

		if (rounded > 0) return "+" + rounded.toFixed(2);
		return rounded.toFixed(2);
	}

	// which cell the ring is on; "PASS n%" while the first pass is still filling the grid
	function optimumBuildText(sweep) {
		var cell;

		if (sweep.done < sweep.count) return "PASS " + Math.round(sweep.done * 100 / sweep.count) + "%";
		cell = RR.Sweep.cellOf(sweep, sweep.best);
		return RR.Sweep.knobAt(cell[0], RR.Const.SWEEP_G_N).toFixed(2)
			+ " · " + RR.Sweep.knobAt(cell[1], RR.Const.SWEEP_D_N).toFixed(2)
			+ " · " + RR.Sweep.knobAt(cell[2], RR.Const.SWEEP_E_N).toFixed(2);
	}

	// One write path, two meanings: in LINE mode the same rows carry the totals of the line
	// the player is running and the best of the bench beside it, instead of the rolling
	// rates and the swept grid. Nothing moves, so two builds can be read against each other
	// without learning a second footer
	UI.updateTelemetry = function (fps, sim, clock, sweep, rate, bench) {
		var train = sim.trains[0];
		var line = sim.line;
		var onLine = sim.lineOn;
		var nextFps = fps < 1 ? -1 : Math.round(fps);
		var nextTime = Math.round(sim.time * 10) / 10;
		var nextDropped = Math.round(clock.droppedSeconds * 100) / 100;
		var nextTrainSpeed = Math.round(train.v * 100) / 100;
		var nextCargo = String(train.cargoUnits) + "/" + String(RR.Train.capacity(train));
		var nextNet = onLine ? signed(RR.Line.net(line, train)) : signed(sim.netRate);
		var nextNetUnit = onLine ? lineUnit(line, train, bench) : " CR/S";
		var nextTrend = onLine ? benchDeltaText(sim, bench) : trendText(sim);
		var nextClass = onLine ? benchDeltaClass(sim, bench) : trendClass(sim);
		var nextProfit = onLine ? signed(RR.Line.gross(line, train)) : signed(sim.profitRate);
		var nextCapex = onLine ? signed(-RR.Line.capex(line, train)) : signed(-sim.capexRate);
		var nextAvg = onLine ? RR.Line.seconds(line).toFixed(1) : signed(sim.netMean);
		// the line's pace beside its clock: a line that ran further to finish clean is
		// slower in seconds and not in speed, and only the pace says which it was
		var nextAvgUnit = onLine ? " S · " + RR.Line.speed(line, train).toFixed(2) + " KM/S" : " CR/S";
		var nextRate = rate >= 100 ? String(Math.round(rate / 10) * 10) : String(Math.round(rate));
		var measured = !!sweep && sweep.best >= 0;
		var nextOptimum = "—";
		var nextOptimumBuild = "—";
		var benchUsed = onLine ? RR.Line.rowsUsed(bench) : 0;
		boundSim = sim;

		if (onLine) {
			if (bench.bestCaptured >= 0) {
				nextOptimum = signed(bench.net[bench.bestCaptured]);
				nextOptimumBuild = buildText(bench, bench.bestCaptured);
			} else if (bench.measured < benchUsed) {
				nextOptimumBuild = "MEASURING " + bench.measured + "/" + benchUsed;
			}
		} else if (measured) {
			nextOptimum = signed(sweep.mean[sweep.best]);
			nextOptimumBuild = optimumBuildText(sweep);
		}

		if (nextFps !== displayedFps) {
			fpsValue.textContent = nextFps < 0 ? "—" : String(nextFps);
			displayedFps = nextFps;
		}
		if (nextTime !== displayedTime) {
			timeValue.textContent = nextTime.toFixed(1);
			displayedTime = nextTime;
		}
		if (sim.steps !== displayedSteps) {
			stepsValue.textContent = String(sim.steps);
			displayedSteps = sim.steps;
		}
		if (nextDropped !== displayedDropped) {
			droppedValue.textContent = nextDropped.toFixed(2);
			displayedDropped = nextDropped;
		}
		if (nextTrainSpeed !== displayedTrainSpeed) {
			trainSpeedValue.textContent = nextTrainSpeed.toFixed(2);
			displayedTrainSpeed = nextTrainSpeed;
		}
		if (nextCargo !== displayedCargo) {
			cargoValue.textContent = nextCargo;
			displayedCargo = nextCargo;
		}
		if (nextNet !== displayedNet) {
			netValue.textContent = nextNet;
			displayedNet = nextNet;
		}
		if (nextNetUnit !== displayedNetUnit) {
			netUnit.textContent = nextNetUnit;
			displayedNetUnit = nextNetUnit;
		}
		if (nextClass !== displayedClass) {
			netItem.classList.toggle("is-up", nextClass === "is-up");
			netItem.classList.toggle("is-down", nextClass === "is-down");
			displayedClass = nextClass;
		}
		if (nextTrend !== displayedTrend) {
			netDelta.textContent = nextTrend;
			displayedTrend = nextTrend;
		}
		if (nextAvg !== displayedAvg) {
			avgValue.textContent = nextAvg;
			displayedAvg = nextAvg;
		}
		if (nextAvgUnit !== displayedAvgUnit) {
			avgUnit.textContent = nextAvgUnit;
			displayedAvgUnit = nextAvgUnit;
		}
		if (nextRate !== displayedRate) {
			rateValue.textContent = nextRate;
			displayedRate = nextRate;
		}
		if (nextProfit !== displayedProfit) {
			profitValue.textContent = nextProfit;
			displayedProfit = nextProfit;
		}
		if (nextCapex !== displayedCapex) {
			capexValue.textContent = nextCapex;
			displayedCapex = nextCapex;
		}
		if (nextOptimum !== displayedOptimum) {
			optimumValue.textContent = nextOptimum;
			displayedOptimum = nextOptimum;
		}
		if (nextOptimumBuild !== displayedOptimumBuild) {
			optimumBuildValue.textContent = nextOptimumBuild;
			displayedOptimumBuild = nextOptimumBuild;
		}

		if (onLine) {
			UI.updateBench(sim, bench);
			RR.Render.drawBenchGraph(graphContext, bench, graphW, graphH);
		} else {
			RR.Render.drawGraph(graphContext, sim, graphW, graphH);
		}
		UI.drawPlot();
	};

	// the line's own progress rides beside its total: how much of the fixed length the train
	// has covered, and how much it ran once it finished clean past the end of it
	function lineUnit(line, train, bench) {
		var target = bench ? bench.meter.targetKm : line.targetKm;

		return " CR · " + Math.round(RR.Line.km(line, train)) + "/" + target + " KM";
	}

	function pixelRatio() {
		return root.devicePixelRatio || 1;
	}

	// the sparkline is a css-sized box; its backing store has to be told, or the
	// browser stretches a default canvas over it
	function sizeGraph() {
		var dpr = pixelRatio();

		graphW = netGraph.clientWidth || 184;
		graphH = netGraph.clientHeight || 38;
		netGraph.width = Math.round(graphW * dpr);
		netGraph.height = Math.round(graphH * dpr);
		graphContext.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	UI.resize = function () {
		if (!netGraph) return;
		sizeGraph();
	};

	// hover panel for one node; all formatting lives here, in the event path
	UI.showNodeLabel = function (world, i, x, y) {
		if (!nodeLabel) return;

		var res = RR.Const.RES_N;
		var isSrc = world.kind[i] === RR.World.SRC;
		var sub;
		var html = "";
		var r;
		var idx;
		var buy;
		var sell;
		var w;
		var h;
		var left;
		var top;

		if (isSrc) {
			r = emittedIndex(world, i);
			sub = "EMITS " + RES_NAMES[r] + " · " + world.inflow[i * res + r].toFixed(2) + " UNITS/S";
		} else {
			sub = "NEEDS " + recipeNames(world.need[i]) + " · " + world.rate[i].toFixed(2) + " BASKETS/S";
		}

		html += '<div class="nl-head">' + (isSrc ? "SOURCE" : "CONSUMER") + " · NODE " + i + "</div>";
		html += '<div class="nl-sub">' + sub + "</div>";
		for (r = 0; r < res; r += 1) {
			idx = i * res + r;
			buy = world.stock[idx] >= 1 ? "B " + RR.Economy.buyQuote(world, i, r).toFixed(2) : "B —";
			sell = world.stock[idx] < world.cap[idx] ? "S " + RR.Economy.sellQuote(world, i, r).toFixed(2) : "S —";
			html += '<div class="nl-row">'
				+ '<span class="nl-res" style="color:' + RR.Const.RES_COLORS[r] + '">' + RES_NAMES[r] + "</span>"
				+ '<span class="nl-stock">' + Math.round(world.stock[idx]) + "/" + Math.round(world.cap[idx]) + "</span>"
				+ '<span class="nl-quote">' + buy + "</span>"
				+ '<span class="nl-quote">' + sell + "</span>"
				+ "</div>";
		}

		nodeLabel.innerHTML = html;
		nodeLabel.hidden = false;

		w = nodeLabel.offsetWidth;
		h = nodeLabel.offsetHeight;
		left = x + 14;
		top = y + 16;
		if (left + w > root.innerWidth - 8) left = x - w - 14;
		if (top + h > root.innerHeight - 8) top = y - h - 14;
		if (left < 8) left = 8;
		if (top < 8) top = 8;
		nodeLabel.style.left = left + "px";
		nodeLabel.style.top = top + "px";
	};

	UI.hideNodeLabel = function () {
		if (nodeLabel) nodeLabel.hidden = true;
	};

	RR.UI = UI;

	if (typeof module !== "undefined" && module.exports) module.exports = UI;
})(globalThis);
