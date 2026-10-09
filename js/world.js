(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var Rng = RR.Rng;
	var C = RR.Const;
	var World = RR.World || {};
	var TERRAIN_WEIGHT = [0.42, 0.27, 0.18, 0.09];

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

	World.terrainHeightAt = function (world, x) {
		var terrain = world.terrain;
		var stepKm = C.RING_KM / terrain.length;
		var position = World.wrap(x) / stepKm;
		var index = Math.floor(position);
		var next = (index + 1) % terrain.length;
		var fraction = position - index;

		return terrain[index] + (terrain[next] - terrain[index]) * fraction;
	};

	// Signed tangent angle in radians along +x, averaged over one sample either side.
	World.terrainSlopeAt = function (world, x) {
		var stepKm = C.RING_KM / world.terrain.length;
		var rise = World.terrainHeightAt(world, x + stepKm) - World.terrainHeightAt(world, x - stepKm);

		return Math.atan(rise / (2 * stepKm * 1000));
	};

	function fillTerrain(rng, terrain) {
		var phases = [
			Rng.nextFloat(rng) * Math.PI * 2,
			Rng.nextFloat(rng) * Math.PI * 2,
			Rng.nextFloat(rng) * Math.PI * 2,
			Rng.nextFloat(rng) * Math.PI * 2
		];
		var scale = C.TERRAIN_RELIEF_M;
		var angleStep = Math.PI * 2 / terrain.length;
		var angle;
		var i;

		for (i = 0; i < terrain.length; i += 1) {
			angle = i * angleStep;
			terrain[i] = scale * (
				TERRAIN_WEIGHT[0] * Math.sin(angle + phases[0])
				+ TERRAIN_WEIGHT[1] * Math.sin(angle * 2 + phases[1])
				+ TERRAIN_WEIGHT[2] * Math.sin(angle * 4 + phases[2])
				+ TERRAIN_WEIGHT[3] * Math.sin(angle * 8 + phases[3])
			);
		}
	}

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

	// a ring missing one side of the market has dead cargo or nothing to sell into, so
	// both kinds are floored at one node per resource before the random pass is kept
	function assignKinds(rng, kind) {
		var res = C.RES_N;
		var n = C.NODE_N;
		var srcs = 0;
		var cons;
		var i;

		for (i = 0; i < n; i += 1) {
			kind[i] = Rng.nextFloat(rng) < 0.5 ? World.SRC : World.CON;
			if (kind[i] === World.SRC) srcs += 1;
		}
		cons = n - srcs;
		for (i = n - 1; i >= 0 && srcs < res; i -= 1) {
			if (kind[i] !== World.CON) continue;
			kind[i] = World.SRC;
			srcs += 1;
			cons -= 1;
		}
		for (i = 0; i < n && cons < res; i += 1) {
			if (kind[i] !== World.SRC) continue;
			kind[i] = World.CON;
			srcs -= 1;
			cons += 1;
		}
	}

	// sources hand out their resource in turn, so every resource has roughly the same
	// number of emitters: a seed then decides where the cargo is and what it is worth,
	// not whether a market for it exists at all
	function fillSource(rng, world, i, ordinal) {
		var res = C.RES_N;
		var emitted = ordinal % res;
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

	// yards hunger for the resources in turn as well, for the same reason, and may take
	// a second input on top
	function fillConsumer(rng, world, i, ordinal) {
		var res = C.RES_N;
		var first = ordinal % res;
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

	// the flat arrays of a ring, in one place so a headless fixture and the
	// generated world are always the same shape
	World.blank = function (n) {
		var res = C.RES_N;

		return {
			nodeCount: n,
			ringKm: C.RING_KM,
			terrain: new Float32Array(C.TERRAIN_N),
			x: new Float32Array(n),
			kind: new Int8Array(n),
			need: new Int8Array(n),
			rate: new Float32Array(n),
			fragility: new Float32Array(n),
			// stock and the ledger are float64: a float32 running sum drifts by a
			// few units over an hour of trade, and the mass balance must close exactly
			stock: new Float64Array(n * res),
			cap: new Float32Array(n * res),
			inflow: new Float32Array(n * res),
			base: new Float32Array(n * res),
			price: new Float32Array(n * res),
			consumed: new Float64Array(n * res),
			produced: new Float64Array(n * res),
			overflow: new Float64Array(n * res)
		};
	};

	// one array per field: dst ends up holding the same world, in its own memory
	World.copyInto = function (dst, src) {
		dst.terrain.set(src.terrain);
		dst.x.set(src.x);
		dst.kind.set(src.kind);
		dst.need.set(src.need);
		dst.rate.set(src.rate);
		dst.fragility.set(src.fragility);
		dst.stock.set(src.stock);
		dst.cap.set(src.cap);
		dst.inflow.set(src.inflow);
		dst.base.set(src.base);
		dst.price.set(src.price);
		dst.consumed.set(src.consumed);
		dst.produced.set(src.produced);
		dst.overflow.set(src.overflow);
	};

	World.generate = function (rng) {
		var n = C.NODE_N;
		var world = World.blank(n);
		var srcs = 0;
		var cons = 0;
		var i;

		placeNodes(rng, world.x);
		assignKinds(rng, world.kind);

		for (i = 0; i < n; i += 1) {
			world.fragility[i] = C.K_MIN + Rng.nextFloat(rng) * (C.K_MAX - C.K_MIN);
			if (world.kind[i] === World.SRC) fillSource(rng, world, i, srcs++);
			else fillConsumer(rng, world, i, cons++);
		}
		fillTerrain(rng, world.terrain);

		return world;
	};

	RR.World = World;

	if (typeof module !== "undefined" && module.exports) module.exports = World;
})(globalThis);
