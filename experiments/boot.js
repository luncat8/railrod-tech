"use strict";

// Boot smoke test: stub just enough DOM for main.js to init and run frames
// headlessly, then exercise hover, pause, speed, seed, and build controls.

var assert = require("assert");
var fs = require("fs");

function fakeContext() {
	var target = {};

	return new Proxy(target, {
		get: function (t, prop) {
			if (prop in t) return t[prop];
			return function () {};
		},
		set: function (t, prop, value) {
			t[prop] = value;
			return true;
		}
	});
}

function fakeElement(id) {
	var el = {
		id: id,
		value: "",
		dataset: {},
		textContent: "",
		innerHTML: "",
		hidden: true,
		style: {},
		handlers: {},
		offsetWidth: 220,
		offsetHeight: 96,
		classList: {
			toggle: function () {},
			add: function () {},
			remove: function () {}
		},
		setAttribute: function () {},
		addEventListener: function (type, fn) {
			if (!el.handlers[type]) el.handlers[type] = [];
			el.handlers[type].push(fn);
		},
		getBoundingClientRect: function () {
			return { left: 0, top: 0, width: 1200, height: 700 };
		},
		getContext: function () {
			return fakeContext();
		}
	};

	el.parentNode = {
		classList: {
			toggle: function () {},
			add: function () {},
			remove: function () {}
		}
	};
	return el;
}

var elements = {};
var rafCallback = null;

globalThis.document = {
	getElementById: function (id) {
		if (!elements[id]) elements[id] = fakeElement(id);
		return elements[id];
	}
};
globalThis.requestAnimationFrame = function (cb) {
	rafCallback = cb;
	return 1;
};
globalThis.addEventListener = function () {};
globalThis.devicePixelRatio = 2;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;

// the script order is read out of index.html rather than repeated here, so a module the
// page forgets to load — or loads in an order that breaks it — fails here first
var scripts = [];
var tag = /<script src="\.\/(js\/[^"]+)"><\/script>/g;
var found;

while ((found = tag.exec(fs.readFileSync(__dirname + "/../index.html", "utf8"))) !== null) scripts.push(found[1]);
assert(scripts.length >= 12, "index.html lists the scripts: " + scripts.length);
assert.strictEqual(scripts[scripts.length - 1], "js/main.js", "main.js loads last, onto a complete RR");
scripts.forEach(function (file) { require("../" + file); });
var Main = globalThis.RR.Main; // main.js booted on require: document was defined

var canvas = elements["c"];
var label = elements["node-label"];
var t = 0;
var i;

function frame() {
	t += 16.7;
	rafCallback(t);
}

// a control's input event, the way the browser delivers it
function input(id, value) {
	var el = elements[id];

	el.value = String(value);
	el.handlers["input"][0]({ target: el });
}

function readNumber(id) {
	return Number(elements[id].textContent);
}

assert.strictEqual(typeof rafCallback, "function", "main loop registered");

for (i = 0; i < 120; i += 1) frame();

assert(Number(elements["steps-value"].textContent) > 0, "frames advanced the fixed-step sim");
assert(Number(elements["time-value"].textContent) > 0, "sim time telemetry advanced");

// reset, then one frame: the camera snaps to the parked train at node 0,
// which then sits at the horizontal center of the 1200 px stub viewport
Main.setSeed(424242);
frame();

canvas.handlers["mousemove"][0]({ clientX: 600, clientY: 500 });
assert.strictEqual(label.hidden, false, "hover shows the node label");
assert(label.innerHTML.indexOf("NODE 0") !== -1, "label names the hovered node");
assert(label.innerHTML.indexOf("/") !== -1, "label lists yard stock");
assert(label.style.left !== "" && label.style.top !== "", "label is positioned");

canvas.handlers["mousemove"][0]({ clientX: 4, clientY: 4 });
assert.strictEqual(label.hidden, true, "hover miss hides the label");

canvas.handlers["mouseleave"][0]();
assert.strictEqual(label.hidden, true, "mouseleave keeps the label hidden");

// click-to-route is gone: the loop is the only movement, so a click does nothing
assert.strictEqual(canvas.handlers["click"], undefined, "no click routing is bound");
assert(elements["trip-value"] === undefined, "no trip telemetry is published");

Main.setSpeed(4);
Main.togglePause();
Main.togglePause();
Main.setSeed(123456);
frame();
canvas.handlers["mousemove"][0]({ clientX: 600, clientY: 500 });
assert.strictEqual(label.hidden, false, "label works after a seed change");

// wagons: the slider resizes the consist, through the input event and directly
input("wagons-input", 7);
assert.strictEqual(elements["wagons-value"].textContent, "7", "the wagons slider resizes the consist");
Main.setWagons(2);
assert.strictEqual(elements["wagons-value"].textContent, "2", "the wagons field reports the consist");
Main.setWagons(4);

// build knobs: each slider reads in physical units and moves the capex telemetry
input("gauge-input", 1);
assert.strictEqual(elements["gauge-value"].textContent, "4.00 M", "the gauge slider reads 4.00 m at the top");
input("gauge-input", 0.5);
assert.strictEqual(elements["gauge-value"].textContent, "2.30 M", "the gauge slider reads 2.30 m at the middle");
input("wheel-input", 0);
assert.strictEqual(elements["wheel-value"].textContent, "0.40 M", "the wheel slider reads 0.40 m at the bottom");
input("wheel-input", 0.5);
assert.strictEqual(elements["wheel-value"].textContent, "1.00 M", "the wheel slider reads 1.00 m at the middle");
input("engine-input", 0.5);
assert.strictEqual(elements["engine-value"].textContent, "40 T", "the engine slider reads 40 t at the middle");

frame();
var capexBefore = readNumber("capex-value");
input("gauge-input", 1);
frame();
assert(readNumber("capex-value") < capexBefore, "a wider gauge raises the capex charge (more negative)");
input("gauge-input", 0.5);
frame();
assert.strictEqual(readNumber("capex-value"), capexBefore, "setting the knob back restores the capex charge");

input("engine-input", 1);
assert.strictEqual(elements["engine-value"].textContent, "60 T", "the largest engine is 60 t (m_loco = 40 * (0.5 + e))");
input("engine-input", 0.5);

// telemetry formats: net and profit are signed rates, cargo reads loaded/wagons
frame();
assert(/^[+-]?\d+\.\d\d$/.test(elements["net-value"].textContent), "net reads as a signed rate");
assert(/^[+-]?\d+\.\d\d$/.test(elements["profit-value"].textContent), "profit reads as a signed rate");
assert(/^\d+\/\d+$/.test(elements["cargo-value"].textContent), "cargo reads loaded/wagons");

// the loop runs: over a few sim minutes the cargo changes, so the train has traded
var cargoSeen = {};
var net;
Main.setSeed(424242);
Main.setSpeed(8);
for (i = 0; i < 2000; i += 1) {
	frame();
	cargoSeen[elements["cargo-value"].textContent] = true;
}
assert(Object.keys(cargoSeen).length >= 2, "the train loads and unloads on the loop");
net = elements["net-value"].textContent;
assert(/^[+-]?\d+\.\d\d$/.test(net), "net still reads as a signed rate after running");
assert(Number(elements["train-speed-value"].textContent) >= 0, "train speed telemetry reads out");

// the sweep panel is part of the page, not an extra: its readouts have to be filled in
assert(/^[+-]?\d+\.\d\d$/.test(elements["optimum-value"].textContent), "the measured optimum reads as a signed rate");
assert(/^\d\.\d\d · \d\.\d\d · \d\.\d\d$/.test(elements["optimum-build"].textContent) || /^PASS \d+%$/.test(elements["optimum-build"].textContent), "and names a grid cell of the sweep");

// a parked train at seed reset reads zero speed on the first telemetry tick
Main.setSeed(424242);
frame();
assert.strictEqual(elements["train-speed-value"].textContent, "0.00", "a train parked at the source reads zero speed");

console.log("Boot checks passed: page boots headless from the script list in index.html, frames tick the economy, hover label, wagons and knob sliders respond, capex, cargo and the sweep's optimum readout update, the loop trades.");
