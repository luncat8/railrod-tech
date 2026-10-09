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

	// one slot per unit the widest wagon could hold, per wagon. a slot is the unit of
	// trade, not the wagon: free space in the consist takes any resource, so a
	// half-full train is never stuck holding room it cannot offer to the cargo the
	// market actually wants
	Train.SLOT_MAX = C.WAGON_MAX * C.HOLD_MAX;

	// the train runs +x around the loop; it only ever stops where a stop pays. km, stops,
	// units and cycle are its trip ledger: what a fixed-length line is measured against,
	// carried by the train so the live line and a headless one read the same counters
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
			km: 0,
			stops: 0,
			units: 0,
			cycle: 0,
			wagons: wagons,
			cargo: new Int8Array(Train.SLOT_MAX).fill(-1), // slot → resource; -1 = empty, 0 is R1
			cargoUnits: 0,
			cash: 0,
			build: build,
			capexRate: Tech.capexRate(build, wagons)
		};
	};

	// slots are dealt round the consist, one to each wagon before any wagon gets a
	// second: the train loads evenly, and the picture says so
	Train.wagonOfSlot = function (train, slot) {
		return slot % train.wagons;
	};

	Train.tierOfSlot = function (train, slot) {
		return Math.floor(slot / train.wagons);
	};

	// the slots the consist offers are the lowest ones, so a widening opens one more
	// slot at a time. cargo in a slot the gauge no longer offers stays aboard until
	// it is sold somewhere
	Train.slotIsOpen = function (train, slot) {
		return slot < Train.capacity(train);
	};

	// the empty consist: what the performance panel plots against net rate
	Train.tareMass = function (train) {
		return train.build.mLoco + train.wagons * train.build.mWagon;
	};

	Train.mass = function (train) {
		return train.build.mLoco + train.wagons * train.build.mWagon + train.cargoUnits * C.UNIT_T;
	};

	// payload: how many slots the consist offers, rounded down to whole units. cargo
	// loaded under a wider gauge stays aboard if the gauge is then narrowed, and
	// simply counts against the hold while it does
	Train.capacity = function (train) {
		return Math.round(train.wagons * train.build.wagonHold);
	};

	Train.freeSpace = function (train) {
		var free = Train.capacity(train) - train.cargoUnits;

		return free > 0 ? free : 0;
	};

	// the first empty slot the consist offers, or -1 when there is none
	Train.emptySlot = function (train) {
		var top = Train.capacity(train);
		var slot;

		for (slot = 0; slot < top; slot += 1) {
			if (train.cargo[slot] < 0) return slot;
		}
		return -1;
	};

	// signed net acceleration; resistance may exceed traction and slow the train
	Train.accel = function (train, v) {
		var build = train.build;
		var mass = Train.mass(train);
		var force = Math.min(build.fTrac, build.power / Math.max(v, C.V_EPS));
		var resistance = build.cRR * mass * C.TRAIN_G + C.C_DRAG * build.dragArea * v * v * v;

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
	// returns km covered, x stays wrapped and the odometer does not
	Train.advance = function (train, dt, vCap, stopKm) {
		var v0 = train.v;
		var v1 = nextSpeed(train, dt, vCap, stopKm);
		var ds = 0.5 * (v0 + v1) * dt;

		train.v = v1;
		train.x = World.wrap(train.x + ds);
		train.km += ds;
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
		train.stops += 1;
		train.units += moved;
		train.state = Train.DWELL;
		train.dwellTotal = moved / train.build.transferRate;
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

	// leaving a stop with nothing aboard closes a trade cycle: every unit bought has been
	// sold, so money counted between two of these is not carrying cargo in transit. the
	// count is what a line and a swept dot both end on
	function dwell(train, dt) {
		train.dwellLeft -= dt;
		if (train.dwellLeft > 0) return;
		if (train.cargoUnits === 0) train.cycle += 1;
		depart(train);
	}

	Train.step = function (train, world, dt) {
		if (train.state === Train.DWELL) dwell(train, dt);
		else cruise(train, world, dt);
	};

	// new world: the train parks at node 0 and trades there like at any stop. a build given
	// here is taken while the consist is still empty, so its wagon count is the one asked
	// for and not one clamped by the cargo a previous build left aboard
	Train.reset = function (train, world, build, wagons) {
		train.cash = 0;
		train.cargoUnits = 0;
		train.cargo.fill(-1);
		train.km = 0;
		train.stops = 0;
		train.units = 0;
		train.cycle = 0;
		if (build) Train.setBuild(train, build);
		if (wagons) Train.setWagons(train, wagons);
		train.x = world.x[0];
		train.v = 0;
		train.stopNode = -1;
		train.stopKm = 0;
		train.last = -1;
		depart(train);
		arrive(train, world, 0);
	};

	Train.setBuild = function (train, build) {
		train.build = build;
		train.capexRate = Tech.capexRate(build, train.wagons);
	};

	// the consist cannot shrink below the wagons its cargo needs at the hold the gauge
	// allows, nor below the highest wagon that cargo is dealt into: cargo is never
	// dropped from a slot
	function loadedFloor(train) {
		var need = Math.ceil(train.cargoUnits / train.build.wagonHold);
		var slot;
		var wagon;

		for (slot = Train.SLOT_MAX - 1; slot >= 0; slot -= 1) {
			if (train.cargo[slot] < 0) continue;
			wagon = Train.wagonOfSlot(train, slot) + 1;
			return wagon > need ? wagon : need;
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
