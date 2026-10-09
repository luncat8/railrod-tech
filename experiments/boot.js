"use strict";

// Boot smoke test: stub just enough DOM for main.js to init and run frames
// headlessly, then exercise hover, pause, speed, and seed changes.

var assert = require("assert");

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

require("../js/rng.js");
require("../js/const.js");
require("../js/world.js");
require("../js/economy.js");
require("../js/sim.js");
require("../js/clock.js");
require("../js/render.js");
require("../js/ui.js");
var Main = require("../js/main.js"); // boots on require: document is defined

var canvas = elements["c"];
var label = elements["node-label"];
var t = 0;
var i;

function frame() {
	t += 16.7;
	rafCallback(t);
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

Main.setSpeed(4);
Main.togglePause();
Main.togglePause();
Main.setSeed(123456);
frame();
canvas.handlers["mousemove"][0]({ clientX: 600, clientY: 500 });
assert.strictEqual(label.hidden, false, "label works after a seed change");

console.log("Boot checks passed: page boots headless, frames tick the economy, hover label shows/hides, controls respond.");
