(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var Rng = RR.Rng || {};

	Rng.normalizeSeed = function (seed) {
		var value = Number(seed);
		if (!Number.isFinite(value)) return 0;
		return value >>> 0;
	};

	Rng.create = function (seed) {
		return { state: Rng.normalizeSeed(seed) };
	};

	Rng.seed = function (rng, seed) {
		rng.state = Rng.normalizeSeed(seed);
	};

	Rng.nextUint = function (rng) {
		var value = (rng.state + 0x6D2B79F5) >>> 0;
		var mixed = value;

		rng.state = value;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return (mixed ^ (mixed >>> 14)) >>> 0;
	};

	Rng.nextFloat = function (rng) {
		return Rng.nextUint(rng) / 4294967296;
	};

	RR.Rng = Rng;

	if (typeof module !== "undefined" && module.exports) module.exports = Rng;
})(globalThis);
