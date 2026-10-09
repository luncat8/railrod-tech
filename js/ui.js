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
	var displayedFps = null;
	var displayedTime = null;
	var displayedSteps = null;
	var displayedDropped = null;

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
		speedValue.value = label;
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

	RR.UI = UI;

	if (typeof module !== "undefined" && module.exports) module.exports = UI;
})(globalThis);
