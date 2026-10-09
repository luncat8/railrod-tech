(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var C = RR.Const;
	var Render = RR.Render || {};

	var SKY = "#141a16";
	var GROUND = "#0e120f";
	var TRACK = "#3a4a3e";
	var TIE = "#242e26";
	var NODE_BODY = "#1d2620";
	var SRC_CAP = "#d9b978";
	var CON_CAP = "#7f9fc4";
	var TRAIN_BODY = "#a9d68e";
	var TRAIN_DIM = "rgba(169, 214, 142, 0.35)";
	var TICK = "#e8eee6";

	var BAR_W = 4;
	var BAR_STEP = 5;
	var BAR_H = 22;
	var BAR_BASE = 27;
	var HIT_HALF = 20;

	Render.create = function (canvas) {
		return {
			canvas: canvas,
			context: canvas.getContext("2d", { alpha: false }),
			width: 0,
			height: 0,
			dpr: 1,
			cameraX: 0,
			pxPerKm: 1,
			trackY: 0,
			lastSimTime: null
		};
	};

	Render.resize = function (view) {
		var bounds = view.canvas.getBoundingClientRect();
		var dpr = root.devicePixelRatio || 1;
		var width = Math.max(1, bounds.width);
		var height = Math.max(1, bounds.height);

		view.width = width;
		view.height = height;
		view.dpr = dpr;
		view.pxPerKm = width / C.KM_VISIBLE;
		view.trackY = Math.round(height * 0.74);
		view.canvas.width = Math.round(width * dpr);
		view.canvas.height = Math.round(height * dpr);
		view.context.setTransform(dpr, 0, 0, dpr, 0, 0);
	};

	// ring copy of x nearest to the camera; keeps the wrap seam off screen
	Render.copyOffset = function (x, cameraX, ringKm) {
		return Math.round((cameraX - x) / ringKm) * ringKm;
	};

	Render.screenX = function (x, cameraX, pxPerKm, width, ringKm) {
		return (x + Render.copyOffset(x, cameraX, ringKm) - cameraX) * pxPerKm + width * 0.5;
	};

	// shortest-arc smoothing toward the anchor; the camera stays unwrapped
	Render.cameraStep = function (cameraX, target, ringKm, follow) {
		var delta = target - cameraX;
		delta -= ringKm * Math.round(delta / ringKm);
		return cameraX + delta * follow;
	};

	// nearest node whose screen column is within HIT_HALF of px, inside the node band
	Render.hitNode = function (view, sim, px, py) {
		var world = sim.world;
		var top = view.trackY - BAR_BASE - BAR_H - 3;
		var bottom = view.trackY + 4;
		var best = -1;
		var bestDist = HIT_HALF;
		var i;
		var sx;
		var d;

		if (py < top || py > bottom) return -1;

		for (i = 0; i < world.nodeCount; i += 1) {
			sx = Render.screenX(world.x[i], view.cameraX, view.pxPerKm, view.width, C.RING_KM);
			d = Math.abs(px - sx);
			if (d <= bestDist) {
				bestDist = d;
				best = i;
			}
		}
		return best;
	};

	Render.snapCamera = function (view, sim) {
		view.cameraX = sim.train.x;
		view.lastSimTime = sim.time;
	};

	function updateCamera(view, sim, frameDt) {
		if (view.lastSimTime === null) {
			Render.snapCamera(view, sim);
			return;
		}
		view.cameraX = Render.cameraStep(view.cameraX, sim.train.x, C.RING_KM, Math.min(1, C.CAMERA_FOLLOW * frameDt));
		view.lastSimTime = sim.time;
	}

	function drawTies(view) {
		var context = view.context;
		var halfKm = view.width * 0.5 / view.pxPerKm + C.TIE_KM;
		var first = Math.floor((view.cameraX - halfKm) / C.TIE_KM);
		var last = Math.ceil((view.cameraX + halfKm) / C.TIE_KM);
		var i;
		var sx;

		context.strokeStyle = TIE;
		context.lineWidth = 2;
		context.beginPath();
		for (i = first; i <= last; i += 1) {
			sx = (i * C.TIE_KM - view.cameraX) * view.pxPerKm + view.width * 0.5;
			context.moveTo(sx + 0.5, view.trackY - 7);
			context.lineTo(sx + 0.5, view.trackY + 7);
		}
		context.stroke();
	}

	function drawNode(view, world, i) {
		var context = view.context;
		var sx = Render.screenX(world.x[i], view.cameraX, view.pxPerKm, view.width, C.RING_KM);

		if (sx < -40 || sx > view.width + 40) return;

		context.fillStyle = NODE_BODY;
		context.fillRect(sx - 8, view.trackY - 20, 16, 20);
		context.fillStyle = world.kind[i] === RR.World.SRC ? SRC_CAP : CON_CAP;
		context.fillRect(sx - 8, view.trackY - 26, 16, 6);
		context.fillStyle = TIE;
		context.fillRect(sx - 16, view.trackY - 2, 32, 2);
		drawYardBars(view, world, i, sx);
	}

	// three yard bars above the node, one per resource, each with a price tick
	function drawYardBars(view, world, i, sx) {
		var context = view.context;
		var bottom = view.trackY - BAR_BASE;
		var res = C.RES_N;
		var r;
		var idx;
		var fill;
		var frac;
		var barX;

		for (r = 0; r < res; r += 1) {
			idx = i * res + r;
			barX = sx - 7 + r * BAR_STEP;
			fill = world.stock[idx] / world.cap[idx];
			if (fill < 0) fill = 0;
			else if (fill > 1) fill = 1;
			context.fillStyle = C.RES_COLORS[r];
			context.fillRect(barX, bottom - fill * BAR_H, BAR_W, fill * BAR_H);

			frac = world.price[idx] / (world.base[idx] * (1 + C.SPREAD));
			if (frac < 0) frac = 0;
			else if (frac > 1) frac = 1;
			context.fillStyle = TICK;
			context.fillRect(barX - 1, bottom - frac * BAR_H - 0.5, BAR_W + 2, 1);
		}
	}

	function drawTrain(view, sim, paused) {
		var context = view.context;
		var sx = Render.screenX(sim.train.x, view.cameraX, view.pxPerKm, view.width, C.RING_KM);

		context.fillStyle = paused ? TRAIN_DIM : TRAIN_BODY;
		context.fillRect(sx - 13, view.trackY - 14, 26, 12);
		context.fillRect(sx - 4, view.trackY - 22, 9, 8);
		context.fillRect(sx - 15, view.trackY - 4, 30, 3);
	}

	Render.draw = function (view, sim, paused, frameDt) {
		var context = view.context;
		var width = view.width;
		var height = view.height;
		var world = sim.world;
		var i;

		updateCamera(view, sim, frameDt);

		context.fillStyle = SKY;
		context.fillRect(0, 0, width, view.trackY);
		context.fillStyle = GROUND;
		context.fillRect(0, view.trackY, width, height - view.trackY);

		drawTies(view);

		context.strokeStyle = TRACK;
		context.lineWidth = 2;
		context.beginPath();
		context.moveTo(0, view.trackY + 0.5);
		context.lineTo(width, view.trackY + 0.5);
		context.stroke();

		for (i = 0; i < world.nodeCount; i += 1) drawNode(view, world, i);
		drawTrain(view, sim, paused);
	};

	RR.Render = Render;

	if (typeof module !== "undefined" && module.exports) module.exports = Render;
})(globalThis);
