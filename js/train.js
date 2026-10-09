(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var World = RR.World;
	var Train = RR.Train || {};

	Train.WAIT = 0;
	Train.CRUISE = 1;
	Train.DWELL = 2;

	// knobs → performance. 0.1.6 replaces this with Tech.derive over live sliders
	function derive(g, d, e) {
		var mLoco = C.ML * (0.5 + e);

		return {
			mLoco: mLoco,
			mWagon: C.M0 * (0.8 + 0.4 * g) + C.MW * d * d,
			vTrack: C.V0 * (0.7 + 0.6 * g) * (0.9 + 0.2 * d),
			power: C.P0 * Math.pow(0.15 + 0.85 * e, 1.8),
			cRR: C.C_RR0 * (1.3 - 0.7 * d),
			fTrac: C.MU * C.DRIVE_SHARE * mLoco * C.TRAIN_G
		};
	}

	var build = derive(C.KNOB_G, C.KNOB_D, C.KNOB_E);

	Train.getBuild = function () {
		return build;
	};

	Train.setBuild = function (next) {
		build = next;
	};

	Train.create = function () {
		return {
			x: 0,
			v: 0,
			dir: 1,
			state: Train.WAIT,
			from: -1,
			to: -1,
			at: -1,
			dwellLeft: 0,
			wagons: C.WAGON_DEFAULT,
			cargo: new Int8Array(C.WAGON_MAX),
			cargoUnits: 0,
			mass: 0,
			profile: { T: 0, S: 0, v: 0 },
			tripKm: 0,
			tripTime: 0,
			tripEstimate: 0,
			lastTripKm: 0,
			lastTripTime: 0,
			lastTripEstimate: 0
		};
	};

	Train.reset = function (train, world) {
		var i;

		train.x = world.x[0];
		train.v = 0;
		train.at = 0;
		train.from = 0;
		train.to = nearestNode(world, train.x, 0);
		train.dwellLeft = 0;
		train.cargoUnits = 0;
		train.tripKm = 0;
		train.tripTime = 0;
		train.tripEstimate = 0;
		train.lastTripKm = 0;
		train.lastTripTime = 0;
		train.lastTripEstimate = 0;
		for (i = 0; i < train.cargo.length; i += 1) train.cargo[i] = -1;
		depart(train, world);
	};

	function nearestNode(world, x, skip) {
		var best = -1;
		var bestDist = Infinity;
		var i;
		var d;

		for (i = 0; i < world.nodeCount; i += 1) {
			if (i === skip) continue;
			d = World.distance(x, world.x[i]);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		return best;
	}

	Train.mass = function (train) {
		return build.mLoco + train.wagons * build.mWagon + train.cargoUnits * C.UNIT_T;
	};

	// signed net acceleration; resistance may exceed traction and slow the train
	Train.accel = function (train, v) {
		var force = Math.min(build.fTrac, build.power / Math.max(v, C.V_EPS));
		var resistance = build.cRR * train.mass * C.TRAIN_G + C.C_DRAG * v * v * v;

		return (force - resistance) / train.mass;
	};

	// one kinematics step; returns km covered. dir is applied, x stays wrapped
	Train.advance = function (train, dt) {
		var next = train.v + Train.accel(train, train.v) * dt;
		var ds;

		if (next > build.vTrack) next = build.vTrack;
		else if (next < 0) next = 0;
		ds = 0.5 * (train.v + next) * dt;
		train.v = next;
		train.x = World.wrap(train.x + train.dir * ds);
		return ds;
	};

	// the accel ODE integrated once per build change, never per planning call
	Train.refreshProfile = function (train) {
		var profile = train.profile;
		var dt = C.PROFILE_DT;
		var steps = Math.ceil(C.PROFILE_MAX_S / dt);
		var v = 0;
		var t = 0;
		var s = 0;
		var i;
		var a;
		var next;

		train.mass = Train.mass(train);
		for (i = 0; i < steps && v < build.vTrack; i += 1) {
			a = Train.accel(train, v);
			if (a <= 0) break;
			next = Math.min(build.vTrack, v + a * dt);
			s += 0.5 * (v + next) * dt;
			v = next;
			t += dt;
		}
		profile.T = t;
		profile.S = s;
		profile.v = v;
	};

	// closed form over the profile: exact at the junction, asymptotically exact
	Train.estimateTrip = function (train, km) {
		var profile = train.profile;

		if (km <= 0) return 0;
		if (profile.v <= 0) return Infinity;
		if (km <= profile.S) return profile.T * Math.sqrt(km / profile.S);
		return profile.T + (km - profile.S) / profile.v;
	};

	// remaining km to the destination along the current direction
	function legRemaining(train, world) {
		var delta = World.wrap(world.x[train.to] - train.x);

		return train.dir > 0 ? delta : C.RING_KM - delta;
	}

	// constant-acceleration solve for the moment inside the step the leg ends
	function timeToCover(v0, v1, dt, km) {
		var a = (v1 - v0) / dt;
		var disc;

		if (a > 1e-9) {
			disc = v0 * v0 + 2 * a * km;
			return (-v0 + Math.sqrt(disc > 0 ? disc : 0)) / a;
		}
		return v0 > 1e-9 ? km / v0 : 0;
	}

	function depart(train, world) {
		var delta = World.wrap(world.x[train.to] - train.x);

		train.dir = delta <= C.RING_KM * 0.5 ? 1 : -1;
		train.dwellLeft = 0;
		train.state = Train.CRUISE;
		Train.refreshProfile(train);
		train.tripKm = train.dir > 0 ? delta : C.RING_KM - delta;
		train.tripEstimate = Train.estimateTrip(train, train.tripKm);
		train.tripTime = 0;
	}

	// the HUD reports the last completed leg, so the numbers hold while it runs
	function arrive(train, world, v0, dt, remaining) {
		train.tripTime += timeToCover(v0, train.v, dt, remaining);
		train.lastTripKm = train.tripKm;
		train.lastTripTime = train.tripTime;
		train.lastTripEstimate = train.tripEstimate;
		train.x = world.x[train.to];
		train.v = 0;
		train.at = train.to;
		train.state = Train.DWELL;
		train.dwellLeft = C.DWELL_S;
	}

	function cruise(train, world, dt) {
		var remaining = legRemaining(train, world);
		var v0 = train.v;
		var ds = Train.advance(train, dt);

		if (ds < remaining) {
			train.tripTime += dt;
			return;
		}
		// the leg ends inside this step: capture the waypoint by stopping
		arrive(train, world, v0, dt, remaining);
	}

	function dwell(train, world, dt) {
		var swap;

		train.dwellLeft -= dt;
		if (train.dwellLeft > 0) return;

		swap = train.to;
		train.to = train.from;
		train.from = swap;
		depart(train, world);
	}

	Train.step = function (train, world, dt) {
		if (train.state === Train.CRUISE) {
			cruise(train, world, dt);
			return;
		}
		if (train.state === Train.DWELL) {
			dwell(train, world, dt);
			return;
		}
		train.v = 0;
	};

	Train.clearRoute = function (train) {
		train.to = -1;
		train.state = Train.WAIT;
		train.v = 0;
		train.dwellLeft = 0;
	};

	// click a node: go there now, then shuttle with the node we came from.
	// clicking the node the train stands on (or came from) parks it.
	Train.setDestination = function (train, world, i) {
		if (i < 0 || i === train.at || i === train.from) {
			Train.clearRoute(train);
			return;
		}
		if (train.at >= 0) train.from = train.at;
		train.to = i;
		train.at = -1;
		depart(train, world);
	};

	Train.setWagons = function (train, count) {
		var wagons = Math.round(count);

		if (wagons < C.WAGON_MIN) wagons = C.WAGON_MIN;
		else if (wagons > C.WAGON_MAX) wagons = C.WAGON_MAX;
		if (wagons === train.wagons) return;

		train.wagons = wagons;
		if (train.cargoUnits > wagons) train.cargoUnits = wagons;
		Train.refreshProfile(train);
		if (train.to >= 0) train.tripEstimate = Train.estimateTrip(train, train.tripKm);
	};

	RR.Train = Train;

	if (typeof module !== "undefined" && module.exports) module.exports = Train;
})(globalThis);
