(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var World = RR.World;
	var Economy = RR.Economy || {};

	// value curve at an arbitrary stock level; quotes pass fractional levels
	Economy.priceAt = function (world, i, r, s) {
		var idx = i * C.RES_N + r;
		var f = s / world.cap[idx];

		if (f < 0) f = 0;
		else if (f > 1) f = 1;

		return world.base[idx] * (C.PRICE_FLOOR + (1 - C.PRICE_FLOOR) * Math.pow(1 - f, world.fragility[i]));
	};

	Economy.price = function (world, i, r) {
		return Economy.priceAt(world, i, r, world.stock[i * C.RES_N + r]);
	};

	// train buys one unit: node stock s → s-1, quoted at the midpoint s-0.5
	Economy.buyQuote = function (world, i, r) {
		return Economy.priceAt(world, i, r, world.stock[i * C.RES_N + r] - 0.5) * (1 + C.SPREAD);
	};

	// train sells one unit: node stock s → s+1, quoted at the midpoint s+0.5
	Economy.sellQuote = function (world, i, r) {
		return Economy.priceAt(world, i, r, world.stock[i * C.RES_N + r] + 0.5) * (1 - C.SPREAD);
	};

	Economy.refreshPrices = function (world) {
		var n = world.nodeCount;
		var res = C.RES_N;
		var i;
		var r;

		for (i = 0; i < n; i += 1) {
			for (r = 0; r < res; r += 1) {
				world.price[i * res + r] = Economy.price(world, i, r);
			}
		}
	};

	function tickSource(world, i, dt) {
		var res = C.RES_N;
		var r;
		var idx;
		var add;
		var room;

		for (r = 0; r < res; r += 1) {
			idx = i * res + r;
			add = world.inflow[idx] * dt;
			if (add <= 0) continue;
			world.produced[idx] += add;
			room = world.cap[idx] - world.stock[idx];
			if (add > room) {
				world.overflow[idx] += add - room;
				world.stock[idx] = world.cap[idx];
			} else {
				world.stock[idx] += add;
			}
		}
	}

	// a consumer eats only while every recipe resource holds at least one unit
	function tickConsumer(world, i, dt) {
		var res = C.RES_N;
		var mask = world.need[i];
		var c = world.rate[i] * dt;
		var r;
		var idx;

		for (r = 0; r < res; r += 1) {
			if ((mask & (1 << r)) && world.stock[i * res + r] < 1) return;
		}
		for (r = 0; r < res; r += 1) {
			if (mask & (1 << r)) {
				idx = i * res + r;
				world.stock[idx] -= c;
				world.consumed[idx] += c;
			}
		}
	}

	Economy.tick = function (world, dt) {
		var n = world.nodeCount;
		var res = C.RES_N;
		var i;
		var r;

		for (i = 0; i < n; i += 1) {
			if (world.kind[i] === World.SRC) tickSource(world, i, dt);
			else tickConsumer(world, i, dt);
			for (r = 0; r < res; r += 1) {
				world.price[i * res + r] = Economy.price(world, i, r);
			}
		}
	};

	RR.Economy = Economy;

	if (typeof module !== "undefined" && module.exports) module.exports = Economy;
})(globalThis);
