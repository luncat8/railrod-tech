(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var UI = RR.UI || {};
	var controller = null;
	var seedInput = null;
	var speedInput = null;
	var speedValue = null;
	var pauseButton = null;
	var pauseIcon = null;
	var pauseLabel = null;
	var fpsValue = null;
	var timeValue = null;
	var stepsValue = null;
	var droppedValue = null;
	var runtimeStatus = null;
	var nodeLabel = null;
	var displayedFps = null;
	var displayedTime = null;
	var displayedSteps = null;
	var displayedDropped = null;

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

	function onPauseClick() {
		controller.togglePause();
	}

	UI.bind = function (main, seed, speed) {
		controller = main;
		seedInput = document.getElementById("seed-input");
		speedInput = document.getElementById("speed-input");
		speedValue = document.getElementById("speed-value");
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
		pauseButton.addEventListener("click", onPauseClick);

		UI.setSeed(seed);
		UI.setSpeed(speed);
		UI.setPaused(false);
	};

	UI.setSeed = function (seed) {
		if (seedInput) seedInput.value = String(seed >>> 0);
	};

	UI.setSpeed = function (speed) {
		var label = Number(speed).toFixed(2) + "×";
		if (!speedInput) return;
		speedInput.value = String(speed);
		speedValue.textContent = label;
	};

	UI.setPaused = function (paused) {
		if (!pauseButton) return;
		pauseButton.setAttribute("aria-pressed", paused ? "true" : "false");
		pauseIcon.textContent = paused ? "▶" : "Ⅱ";
		pauseLabel.textContent = paused ? "RESUME" : "PAUSE";
		runtimeStatus.classList.toggle("is-paused", paused);
		document.getElementById("runtime-status").textContent = paused ? "PAUSED" : "RUNNING";
	};

	UI.updateTelemetry = function (fps, sim, clock) {
		var nextFps = fps < 1 ? -1 : Math.round(fps);
		var nextTime = Math.round(sim.time * 10) / 10;
		var nextDropped = Math.round(clock.droppedSeconds * 100) / 100;

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
