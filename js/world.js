(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var Rng = RR.Rng;
	var C = RR.Const;
	var World = RR.World || {};

	World.SRC = 0;
	World.CON = 1;

	World.wrap = function (x) {
		var r = x % C.RING_KM;
		return r < 0 ? r + C.RING_KM : r;
	};

	// shortest arc between two ring positions, in [0, RING_KM/2]
	World.distance = function (a, b) {
		var d = Math.abs(a - b) % C.RING_KM;
		return Math.min(d, C.RING_KM - d);
	};

	function placeNodes(rng, x) {
		var slot = C.RING_KM / C.NODE_N;
		var jitterMax = slot - C.MIN_GAP_KM;
		var i;

		// one node per slot plus bounded jitter keeps every pair, including the
		// wrap pair across x=0, at least MIN_GAP_KM apart by construction
		for (i = 0; i < C.NODE_N; i += 1) {
			x[i] = i * slot + Rng.nextFloat(rng) * jitterMax;
		}
	}

	function assignKinds(rng, kind) {
		var srcs = 0;
		var i;

		for (i = 0; i < C.NODE_N; i += 1) {
			kind[i] = Rng.nextFloat(rng) < 0.5 ? World.SRC : World.CON;
			if (kind[i] === World.SRC) srcs += 1;
		}
		if (srcs === 0) kind[0] = World.SRC;
		else if (srcs === C.NODE_N) kind[C.NODE_N - 1] = World.CON;
	}

	function fillSource(rng, world, i) {
		var res = C.RES_N;
		var emitted = Math.floor(Rng.nextFloat(rng) * res);
		var j;
		var cap;
		var base;

		for (j = 0; j < res; j += 1) {
			cap = C.CAP_MIN + Rng.nextFloat(rng) * (C.CAP_MAX - C.CAP_MIN);
			base = C.SRC_BASE_MIN + Rng.nextFloat(rng) * (C.SRC_BASE_MAX - C.SRC_BASE_MIN);
			world.cap[i * res + j] = cap;
			world.base[i * res + j] = base;
			world.stock[i * res + j] = 0;
		}
		world.inflow[i * res + emitted] = C.INFLOW_MIN + Rng.nextFloat(rng) * (C.INFLOW_MAX - C.INFLOW_MIN);
		world.stock[i * res + emitted] = world.cap[i * res + emitted] * (C.SRC_STOCK_MIN + Rng.nextFloat(rng) * (C.SRC_STOCK_MAX - C.SRC_STOCK_MIN));
	}

	function fillConsumer(rng, world, i) {
		var res = C.RES_N;
		var first = Math.floor(Rng.nextFloat(rng) * res);
		var second = (first + 1 + Math.floor(Rng.nextFloat(rng) * (res - 1))) % res;
		var twoBits = Rng.nextFloat(rng) < 0.5;
		var mask = (1 << first) | (twoBits ? 1 << second : 0);
		var j;
		var cap;
		var base;

		world.need[i] = mask;
		world.rate[i] = C.RATE_MIN + Rng.nextFloat(rng) * (C.RATE_MAX - C.RATE_MIN);
		for (j = 0; j < res; j += 1) {
			cap = C.CON_CAP_MIN + Rng.nextFloat(rng) * (C.CON_CAP_MAX - C.CON_CAP_MIN);
			base = C.CON_BASE_MIN + Rng.nextFloat(rng) * (C.CON_BASE_MAX - C.CON_BASE_MIN);
			world.cap[i * res + j] = cap;
			world.base[i * res + j] = base;
			world.stock[i * res + j] = 0;
			if (mask & (1 << j)) {
				world.stock[i * res + j] = cap * (C.CON_STOCK_MIN + Rng.nextFloat(rng) * (C.CON_STOCK_MAX - C.CON_STOCK_MIN));
			}
		}
	}

	World.generate = function (rng) {
		var n = C.NODE_N;
		var res = C.RES_N;
		var world = {
			nodeCount: n,
			ringKm: C.RING_KM,
			x: new Float32Array(n),
			kind: new Int8Array(n),
			need: new Int8Array(n),
			rate: new Float32Array(n),
			fragility: new Float32Array(n),
			stock: new Float32Array(n * res),
			cap: new Float32Array(n * res),
			inflow: new Float32Array(n * res),
			base: new Float32Array(n * res)
		};
		var i;

		placeNodes(rng, world.x);
		assignKinds(rng, world.kind);

		for (i = 0; i < n; i += 1) {
			world.fragility[i] = C.K_MIN + Rng.nextFloat(rng) * (C.K_MAX - C.K_MIN);
			if (world.kind[i] === World.SRC) fillSource(rng, world, i);
			else fillConsumer(rng, world, i);
		}

		return world;
	};

	RR.World = World;

	if (typeof module !== "undefined" && module.exports) module.exports = World;
})(globalThis);
