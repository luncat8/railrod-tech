(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var World = RR.World;
	var Tech = RR.Tech;
	var Trade = RR.Trade;
	var Train = RR.Train || {};

	Train.CRUISE = 0;
	Train.DWELL = 1;

	// the train runs +x around the loop; it only ever stops where a stop pays
	Train.create = function (build, wagons) {
		return {
			x: 0,
			v: 0,
			state: Train.CRUISE,
			at: -1,
			last: -1,
			stopNode: -1,
			stopKm: 0,
			dwellLeft: 0,
			dwellTotal: 0,
			wagons: wagons,
			cargo: new Int8Array(C.WAGON_MAX).fill(-1), // -1 = empty wagon; 0 is R1
			cargoUnits: 0,
			cash: 0,
			build: build,
			capexRate: Tech.capexRate(build, wagons)
		};
	};

	Train.mass = function (train) {
		return train.build.mLoco + train.wagons * train.build.mWagon + train.cargoUnits * C.UNIT_T;
	};

	// signed net acceleration; resistance may exceed traction and slow the train
	Train.accel = function (train, v) {
		var build = train.build;
		var mass = Train.mass(train);
		var force = Math.min(build.fTrac, build.power / Math.max(v, C.V_EPS));
		var resistance = build.cRR * mass * C.TRAIN_G + C.C_DRAG * v * v * v;

		return (force - resistance) / mass;
	};

	// above the cap the brakes act, at least BRAKE_DECEL and harder if needed to
	// stop exactly at the stop: the cap curve falls faster than BRAKE_DECEL once the
	// train is above it, so a constant brake would overshoot. below the cap,
	// traction and resistance act and the cap is never exceeded
	function nextSpeed(train, dt, vCap, stopKm) {
		var v = train.v;
		var decel;
		var next;

		if (v > vCap) {
			decel = stopKm > 0 ? v * v / (2 * stopKm) : 0;
			if (decel < C.BRAKE_DECEL) decel = C.BRAKE_DECEL;
			next = v - decel * dt;
			return next > 0 ? next : 0;
		}
		next = v + Train.accel(train, v) * dt;
		if (next > vCap) next = vCap;
		return next > 0 ? next : 0;
	}

	// one kinematics step under a speed cap and a stop distance (0 = no stop ahead);
	// returns km covered, x stays wrapped
	Train.advance = function (train, dt, vCap, stopKm) {
		var v0 = train.v;
		var v1 = nextSpeed(train, dt, vCap, stopKm);
		var ds = 0.5 * (v0 + v1) * dt;

		train.v = v1;
		train.x = World.wrap(train.x + ds);
		return ds;
	};

	// nearest node ahead that wants a stop. the node just left is ignored until the
	// train is STOP_EPS_KM clear of it, so an approach to a stop is never skipped
	function scanStop(train, world) {
		var best = -1;
		var bestKm = Infinity;
		var i;
		var d;

		if (train.last >= 0 && World.wrap(train.x - world.x[train.last]) > C.STOP_EPS_KM) {
			train.last = -1;
		}
		for (i = 0; i < world.nodeCount; i += 1) {
			if (i === train.last) continue;
			d = World.wrap(world.x[i] - train.x);
			if (d >= bestKm) continue;
			if (!Trade.wantsStop(train, world, i)) continue;
			best = i;
			bestKm = d;
		}
		train.stopNode = best;
		train.stopKm = best >= 0 ? bestKm : 0;
	}

	function depart(train) {
		train.state = Train.CRUISE;
		train.last = train.at;
		train.at = -1;
		train.dwellLeft = 0;
		train.dwellTotal = 0;
	}

	// the stop is real: the train is captured at the node, trades, and dwells for
	// as long as the transfers take. a stop that moves nothing is not a stop
	function arrive(train, world, node) {
		var moved;

		train.x = world.x[node];
		train.v = 0;
		train.at = node;
		train.stopNode = -1;
		moved = Trade.transact(train, world, node);
		if (moved === 0) {
			depart(train);
			return;
		}
		train.state = Train.DWELL;
		train.dwellTotal = moved / C.UNITS_PER_S;
		train.dwellLeft = train.dwellTotal;
	}

	function cruise(train, world, dt) {
		var vCap;
		var ds;

		scanStop(train, world);
		vCap = train.build.vTrack;
		if (train.stopNode >= 0) {
			vCap = Math.min(vCap, Math.sqrt(2 * C.BRAKE_DECEL * train.stopKm));
		}
		ds = Train.advance(train, dt, vCap, train.stopNode >= 0 ? train.stopKm : 0);
		if (train.stopNode >= 0 && ds >= train.stopKm) arrive(train, world, train.stopNode);
	}

	function dwell(train, dt) {
		train.dwellLeft -= dt;
		if (train.dwellLeft > 0) return;
		depart(train);
	}

	Train.step = function (train, world, dt) {
		if (train.state === Train.DWELL) dwell(train, dt);
		else cruise(train, world, dt);
	};

	// new world: the train parks at node 0 and trades there like at any stop
	Train.reset = function (train, world) {
		var w;

		train.x = world.x[0];
		train.v = 0;
		train.stopNode = -1;
		train.stopKm = 0;
		train.last = -1;
		train.cash = 0;
		train.cargoUnits = 0;
		for (w = 0; w < train.cargo.length; w += 1) train.cargo[w] = -1;
		depart(train);
		arrive(train, world, 0);
	};

	Train.setBuild = function (train, build) {
		train.build = build;
		train.capexRate = Tech.capexRate(build, train.wagons);
	};

	// the highest loaded wagon sets the floor: cargo is never dropped from a wagon
	function loadedFloor(train) {
		var w;

		for (w = train.cargo.length - 1; w >= 0; w -= 1) {
			if (train.cargo[w] >= 0) return w + 1;
		}
		return 0;
	}

	Train.setWagons = function (train, count) {
		var min = Math.max(C.WAGON_MIN, loadedFloor(train));
		var wagons = Math.round(count);

		if (wagons < min) wagons = min;
		else if (wagons > C.WAGON_MAX) wagons = C.WAGON_MAX;
		if (wagons === train.wagons) return;

		train.wagons = wagons;
		train.capexRate = Tech.capexRate(train.build, wagons);
	};

	RR.Train = Train;

	if (typeof module !== "undefined" && module.exports) module.exports = Train;
})(globalThis);
