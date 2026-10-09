(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var World = RR.World;
	var Economy = RR.Economy;
	var Trade = RR.Trade || {};

	// a consumer buys a resource while its recipe takes it, its yard has room, and it is
	// not already the abundant half of the recipe. A half-fed yard goes on taking the
	// input it lacks and refuses the one it is drowning in, so an unbalanced trader
	// starves visibly instead of piling up cargo nobody will ever eat
	Trade.wantsUnload = function (world, i, r) {
		var res = C.RES_N;
		var idx = i * res + r;
		var mask = world.need[i];
		var stock = world.stock;
		var scarce = Infinity;
		var j;

		if (world.kind[i] !== World.CON) return false;
		if (!(mask & (1 << r))) return false;
		if (stock[idx] > world.cap[idx] - 1) return false;
		for (j = 0; j < res; j += 1) {
			if ((mask & (1 << j)) && stock[i * res + j] < scarce) scarce = stock[i * res + j];
		}
		return stock[idx] <= scarce + 1;
	};

	// the best price the train can realise right now. A consumer counts only while it
	// would accept the unit: quoting a full yard is how the loop ends up carrying
	// cargo nobody can take, and a full wagon that cannot be emptied stops the train
	Trade.bestSell = function (world, r) {
		var best = 0;
		var i;
		var quote;

		for (i = 0; i < world.nodeCount; i += 1) {
			if (!Trade.wantsUnload(world, i, r)) continue;
			quote = Economy.sellQuote(world, i, r);
			if (quote > best) best = quote;
		}
		return best;
	};

	// margin of buying one unit of r at node i and selling it at the best consumer
	Trade.loadMargin = function (world, i, r) {
		if (world.kind[i] !== World.SRC) return -Infinity;
		if (world.stock[i * C.RES_N + r] < 1) return -Infinity;
		return Trade.bestSell(world, r) - Economy.buyQuote(world, i, r);
	};

	// the resource a free wagon should take at node i, or -1 when nothing pays
	Trade.pickLoad = function (world, i) {
		var best = -1;
		var bestMargin = 0;
		var r;
		var margin;

		for (r = 0; r < C.RES_N; r += 1) {
			margin = Trade.loadMargin(world, i, r);
			if (margin > bestMargin) {
				bestMargin = margin;
				best = r;
			}
		}
		return best;
	};

	function carriesFor(train, world, i) {
		var w;
		var r;

		for (w = 0; w < train.wagons; w += 1) {
			r = train.cargo[w];
			if (r >= 0 && Trade.wantsUnload(world, i, r)) return true;
		}
		return false;
	}

	// the stop rule: a node is worth stopping at if the train can unload there,
	// or it has a free wagon and something profitable to load there
	Trade.wantsStop = function (train, world, i) {
		if (carriesFor(train, world, i)) return true;
		return train.cargoUnits < train.wagons && Trade.pickLoad(world, i) >= 0;
	};

	function sell(train, world, i, w, r) {
		var idx = i * C.RES_N + r;

		train.cash += Economy.sellQuote(world, i, r);
		world.stock[idx] += 1;
		train.cargo[w] = -1;
		train.cargoUnits -= 1;
	}

	function buy(train, world, i, w, r) {
		var idx = i * C.RES_N + r;

		train.cash -= Economy.buyQuote(world, i, r);
		world.stock[idx] -= 1;
		train.cargo[w] = r;
		train.cargoUnits += 1;
	}

	// one stop: unload first, then load into the freed and empty wagons.
	// every unit is quoted after the previous one has moved stock. returns units moved
	Trade.transact = function (train, world, i) {
		var moved = 0;
		var w;
		var r;

		for (w = 0; w < train.wagons; w += 1) {
			r = train.cargo[w];
			if (r < 0 || !Trade.wantsUnload(world, i, r)) continue;
			sell(train, world, i, w, r);
			moved += 1;
		}
		for (w = 0; w < train.wagons; w += 1) {
			if (train.cargo[w] >= 0) continue;
			r = Trade.pickLoad(world, i);
			if (r < 0) break;
			buy(train, world, i, w, r);
			moved += 1;
		}
		return moved;
	};

	RR.Trade = Trade;

	if (typeof module !== "undefined" && module.exports) module.exports = Trade;
})(globalThis);
