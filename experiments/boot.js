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
		disabled: false,
		checked: false,
		dataset: {},
		textContent: "",
		innerHTML: "",
		hidden: true,
		style: {},
		handlers: {},
		offsetWidth: 220,
		offsetHeight: 96,
		offsetLeft: 240,
		clientWidth: 184,
		clientHeight: 38,
		width: 300,
		height: 150,
		classList: {
			toggle: function () {},
			add: function () {},
			remove: function () {}
		},
		setAttribute: function () {},
		classList: {
			flags: {},
			toggle: function (name, on) { el.classList.flags[name] = !!on; },
			add: function (name) { el.classList.flags[name] = true; },
			remove: function (name) { el.classList.flags[name] = false; }
		},
		addEventListener: function (type, fn) {
			if (!el.handlers[type]) el.handlers[type] = [];
			el.handlers[type].push(fn);
		},
		closest: function () { return el; },
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
globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};
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
var RR = globalThis.RR;
var Const = require("../js/const.js");
var Tech = require("../js/tech.js");
var Train = require("../js/train.js");
var inspect = Main.inspect;
var c;
var target;

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

// reset: the camera snaps to the parked train at node 0, which then sits at the
// horizontal center of the 1200 px stub viewport. in MAX mode the camera does not
// follow — the canvas is a still — so the hover is read before the clock moves on
Main.setSeed(424242);

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

// a parked train at seed reset reads zero speed on the first telemetry tick, which
// the seed change publishes itself: no frame needed, and none may move the train
Main.setSeed(424242);
assert.strictEqual(elements["train-speed-value"].textContent, "0.00", "a train parked at the source reads zero speed");

// ---- run modes ----
// MAX is the default: a flat step budget a frame, and a frozen canvas. the draw
// count is what says "frozen" — the clock advances without touching the world view
var draws = 0;
var realDraw = RR.Render.draw;
var stepsBefore = inspect().sim.steps;

RR.Render.draw = function () { draws += 1; return realDraw.apply(null, arguments); };
Main.setAnimate(false);
assert.strictEqual(Main.isAnimating(), false, "the page opens in MAX mode, animation is opt-in");
assert.strictEqual(elements["animate-input"].checked, false, "and the checkbox says so");
assert.strictEqual(elements["speed-input"].disabled, true, "the speed slider belongs to the animation");
assert.strictEqual(elements["speed-value"].textContent, "MAX", "and reads MAX while the world is not animated");
frame();                      // the mode change itself is drawn once, as a still
draws = 0;
stepsBefore = inspect().sim.steps;
for (i = 0; i < 10; i += 1) frame();
assert.strictEqual(draws, 0, "MAX mode does not redraw the canvas");
assert.strictEqual(inspect().sim.steps - stepsBefore, 10 * Const.MAX_MODE_STEPS,
	"MAX mode runs a flat budget of fixed steps a frame");
assert.strictEqual(elements["dropped-value"].textContent, "0.00", "with no target rate, no sim time is dropped");

// ticking the checkbox hands the sim back to the clock, at 2x…30x
elements["animate-input"].checked = true;
elements["animate-input"].handlers["change"][0]({ target: elements["animate-input"] });
assert.strictEqual(Main.isAnimating(), true, "the checkbox turns the animation on");
assert.strictEqual(elements["speed-input"].disabled, false, "and gives the speed slider back");
assert.strictEqual(Number(elements["speed-input"].min), Const.MIN_SPEED, "the slider runs from");
assert.strictEqual(Number(elements["speed-input"].max), Const.MAX_SPEED, "the slowest to the fastest animation");
Main.setSpeed(30);
stepsBefore = inspect().sim.steps;
for (i = 0; i < 30; i += 1) frame();
assert(inspect().sim.steps - stepsBefore > 30 * 30 * Const.DT * 60 * 0.8,
	"an animated frame advances the clock at the speed it was set to");
assert(inspect().sim.steps - stepsBefore < 30 * 30 * Const.DT * 60 * 1.2,
	"and not faster than the clock allows");
assert(draws >= 30, "and the canvas is drawn again");
Main.setAnimate(false);

// ---- smoothing and the trend ----
input("smooth-input", 600);
assert.strictEqual(elements["smooth-value"].textContent, "600 S", "the smoothing slider reads its window");
input("smooth-input", 5);
assert.strictEqual(elements["smooth-value"].textContent, "5 S", "and follows the slider down");
input("smooth-input", 60);
for (i = 0; i < 200; i += 1) frame();
assert(/^[+-]?\d+\.\d\d$/.test(elements["avg-value"].textContent), "the long average reads as a signed rate");
assert(/^(FLAT|\u25B2 [+-]\d+\.\d\d|\u25BC [+-]\d+\.\d\d)$/.test(elements["net-delta"].textContent),
	"the trend reads flat, up or down");
assert.strictEqual(typeof elements["net-item"].classList.flags["is-up"], "boolean", "the net row carries the trend");
assert(Number(elements["rate-value"].textContent) > 1, "the measured sim rate is reported");
assert(elements["net-graph"].width > 0, "the sparkline canvas is sized");

// ---- build curves ----
// every control has a plot, and touching the control is what shows it
var plotBox = elements["build-plot"];
var plotCanvas = elements["plot-canvas"];
var plotsDrawn = 0;
var realDrawPlot = RR.Render.drawPlot;

RR.Render.drawPlot = function () { plotsDrawn += 1; return realDrawPlot.apply(null, arguments); };
assert.strictEqual(plotBox.hidden, true, "no plot is shown until a control is touched");
for (c = 0; c < 4; c += 1) {
	target = c === 0 ? elements["wagons-input"] : elements[["gauge-input", "wheel-input", "engine-input"][c - 1]];
	target.handlers["pointerdown"][0]({ target: target });
	assert.strictEqual(plotBox.hidden, false, "touching a build control shows its plot");
	assert(plotsDrawn > 0, "and the plot is drawn");
	if (c === 2) assert(plotCanvas.height > plotCanvas.width * 0.7, "the wheel plot stacks a second chart");
}
Main.setKnob(Tech.GAUGE, 1);
assert(plotsDrawn > 4, "the plot follows the knob while it is being dragged");
RR.UI.hidePlot();
assert.strictEqual(plotBox.hidden, true, "and goes away when the hand leaves");
RR.Render.drawPlot = realDrawPlot;

// cargo is units over the hold the gauge allows, not over the wagon count
Main.setSeed(424242);
Main.setWagons(4);
frame();
assert.strictEqual(elements["cargo-value"].textContent.split("/")[1], String(Train.capacity(inspect().sim.trains[0])),
	"cargo reads against the consist's hold");

console.log("Boot checks passed: page boots headless from the script list in index.html, MAX and animated modes, the smoothing slider and the trend, a plot for every build control, hover label, wagons and knob sliders respond, capex, cargo and the sweep's optimum readout update, the loop trades.");
