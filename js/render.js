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
	var TRAIN_RAIL = "rgba(169, 214, 142, 0.22)";
	var TICK = "#e8eee6";
	var PANEL_BG = "rgba(14, 18, 15, 0.86)";
	var PANEL_LINE = "rgba(183, 198, 183, 0.16)";
	var PANEL_TEXT = "#718075";
	var DOT = "rgba(169, 214, 142, 0.34)";
	var DOT_BEST = "#c0e9a6";
	var GAP = "rgba(217, 185, 120, 0.5)";

	var BAR_W = 4;
	var BAR_STEP = 5;
	var BAR_H = 22;
	var BAR_BASE = 27;
	var HIT_HALF = 20;
	var LOCO_W = 22;
	var WAGON_W = 12;
	var WAGON_GAP = 2;
	var WAGON_PITCH = WAGON_W + WAGON_GAP;
	var DWELL_H = 3;
	var SLOT_H = 4;
	var SLOT_W = WAGON_W - 4;

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
			cameraReady: false
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
		view.cameraX = sim.trains[0].x;
	};

	function updateCamera(view, sim, frameDt) {
		if (!view.cameraReady) {
			view.cameraReady = true;
			Render.snapCamera(view, sim);
			return;
		}
		view.cameraX = Render.cameraStep(view.cameraX, sim.trains[0].x, C.RING_KM, Math.min(1, C.CAMERA_FOLLOW * frameDt));
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

	function drawNode(view, sim, i) {
		var context = view.context;
		var world = sim.world;
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

	function consistHalf(wagons) {
		return (LOCO_W + wagons * WAGON_PITCH) * 0.5;
	}

	// one wagon: a stack of slots, one per unit the gauge allows it to carry. a slot
	// holds a unit or shows as empty; cargo left in a slot the gauge no longer offers
	// is drawn too, so nothing aboard is ever invisible
	function drawWagon(view, train, wx, w, color) {
		var context = view.context;
		var hold = train.build.wagonHold;
		var height = 4 + C.HOLD_MAX * SLOT_H;
		var top = view.trackY - 6 - height;
		var capacity = RR.Train.capacity(train);
		var slot;
		var k;
		var py;
		var resource;

		context.fillStyle = color;
		context.fillRect(wx, top, WAGON_W, height);
		for (k = 0; k < C.HOLD_MAX; k += 1) {
			slot = k * train.wagons + w;
			if (slot >= RR.Train.SLOT_MAX) break;
			resource = train.cargo[slot];
			py = top + 2 + k * SLOT_H;
			if (resource < 0) {
				if (slot >= capacity) continue;
				context.fillStyle = SKY;
				context.fillRect(wx + 2, py, SLOT_W, SLOT_H - 1);
				continue;
			}
			context.fillStyle = C.RES_COLORS[resource];
			context.globalAlpha = slot < capacity ? 1 : 0.45;
			context.fillRect(wx + 2, py, SLOT_W, SLOT_H - 1);
			context.globalAlpha = 1;
		}
	}

	// the train runs +x, so the loco leads on the right and wagons trail to the left
	function drawConsist(view, train, sx, color) {
		var context = view.context;
		var half = consistHalf(train.wagons);
		var head = sx + half - LOCO_W;
		var wx = head - WAGON_PITCH;
		var w;

		context.fillStyle = color;
		context.fillRect(head, view.trackY - 14, LOCO_W, 12);
		context.fillRect(head + LOCO_W - 9, view.trackY - 22, 9, 8);
		for (w = 0; w < train.wagons; w += 1) {
			drawWagon(view, train, wx, w, color);
			wx -= WAGON_PITCH;
		}
		context.fillRect(sx - half - 2, view.trackY - 4, 2 * half + 4, 3);
	}

	// dwell progress above the consist: the transfer time the stop needs
	function drawDwell(view, train, sx) {
		var context = view.context;
		var half = consistHalf(train.wagons);
		var done = 1 - train.dwellLeft / train.dwellTotal;
		var top = view.trackY - 30;

		if (done < 0) done = 0;
		else if (done > 1) done = 1;

		context.fillStyle = TRAIN_RAIL;
		context.fillRect(sx - half, top, 2 * half, DWELL_H);
		context.fillStyle = TRAIN_BODY;
		context.fillRect(sx - half, top, 2 * half * done, DWELL_H);
	}

	function drawTrain(view, sim, paused) {
		var train = sim.trains[0];
		var sx = Render.screenX(train.x, view.cameraX, view.pxPerKm, view.width, C.RING_KM);

		drawConsist(view, train, sx, paused ? TRAIN_DIM : TRAIN_BODY);
		if (train.state === RR.Train.DWELL) drawDwell(view, train, sx);
	}

	// ---- performance panel: measured net rate against train mass, from the sweep ----

	var PANEL_W = 176;
	var PANEL_H = 138;
	var PANEL_MARGIN = 14;
	var PANEL_IN = 13;
	var PANEL_HEAD = 18;
	var DOT_SIZE = 3;

	// one object, filled each frame: the draw path allocates nothing
	var panel = { x: 0, y: 0, w: 0, h: 0 };

	function panelBox(view) {
		panel.x = Math.max(PANEL_MARGIN, view.width - PANEL_MARGIN - PANEL_W);
		panel.y = PANEL_MARGIN;
		panel.w = Math.min(PANEL_W, view.width - 2 * PANEL_MARGIN);
		panel.h = PANEL_H;
		return panel;
	}

	function drawPanelFrame(view, box) {
		var context = view.context;

		context.fillStyle = PANEL_BG;
		context.fillRect(box.x, box.y, box.w, box.h);
		context.strokeStyle = PANEL_LINE;
		context.lineWidth = 1;
		context.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
		context.fillStyle = PANEL_TEXT;
		context.font = "8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
		context.textBaseline = "middle";
		context.fillText("MEASURED NET / S", box.x + PANEL_IN, box.y + 10);
		context.fillText("MASS", box.x + box.w - PANEL_IN - 26, box.y + box.h - 7);
	}

	// the sweep's dots, the best one ringed, the live build as a crosshair, and the
	// gap between the crosshair and the dot it should sit on
	function drawPanel(view, sim, sweep) {
		var context = view.context;
		var box;
		var plotX;
		var plotY;
		var plotW;
		var plotH;
		var midY;
		var massSpan;
		var scale;
		var i;
		var x;
		var y;
		var liveX;
		var liveY;
		var near;

		if (!sweep || sweep.massHi <= sweep.massLo) return;

		box = panelBox(view);
		plotX = box.x + PANEL_IN;
		plotY = box.y + PANEL_HEAD;
		plotW = box.w - 2 * PANEL_IN;
		plotH = box.h - PANEL_HEAD - PANEL_IN;
		midY = plotY + plotH * 0.5;
		massSpan = sweep.massHi - sweep.massLo;
		scale = plotH * 0.5 / sweep.yScale;

		drawPanelFrame(view, box);

		context.strokeStyle = PANEL_LINE;
		context.beginPath();
		context.moveTo(plotX, midY + 0.5);
		context.lineTo(plotX + plotW, midY + 0.5);
		context.stroke();

		for (i = 0; i < sweep.count; i += 1) {
			if (!sweep.mark[i]) continue;
			x = plotX + (sweep.mass[i] - sweep.massLo) / massSpan * plotW;
			y = midY - sweep.mean[i] * scale;
			context.fillStyle = i === sweep.best ? DOT_BEST : DOT;
			context.fillRect(x - DOT_SIZE * 0.5, y - DOT_SIZE * 0.5, DOT_SIZE, DOT_SIZE);
		}

		if (sweep.best >= 0 && sweep.mark[sweep.best]) {
			x = plotX + (sweep.mass[sweep.best] - sweep.massLo) / massSpan * plotW;
			y = midY - sweep.mean[sweep.best] * scale;
			context.strokeStyle = DOT_BEST;
			context.strokeRect(x - 4.5, y - 4.5, 9, 9);
		}

		liveX = plotX + (RR.Train.tareMass(sim.trains[0]) - sweep.massLo) / massSpan * plotW;
		liveY = midY - sim.netMean * scale;
		if (liveY < plotY - 3) liveY = plotY - 3;
		else if (liveY > plotY + plotH + 3) liveY = plotY + plotH + 3;

		near = RR.Sweep.comboFor(sweep, sim.knobs);
		if (sweep.mark[near]) {
			context.strokeStyle = GAP;
			context.beginPath();
			context.moveTo(liveX, liveY);
			context.lineTo(liveX, midY - sweep.mean[near] * scale);
			context.stroke();
		}

		context.strokeStyle = DOT_BEST;
		context.beginPath();
		context.moveTo(liveX - 5, liveY);
		context.lineTo(liveX + 5, liveY);
		context.moveTo(liveX, liveY - 5);
		context.lineTo(liveX, liveY + 5);
		context.stroke();

		context.fillStyle = PANEL_LINE;
		context.fillRect(plotX, box.y + box.h - 4, plotW * (sweep.done / sweep.count), 2);
	}

	// ---- build curves: the plot behind the control the player is touching ----

	var PLOT_BG = "rgba(12, 16, 13, 0.95)";
	var PLOT_GRID = "rgba(183, 198, 183, 0.10)";
	var PLOT_ZERO = "rgba(183, 198, 183, 0.26)";
	var PLOT_MARK = "rgba(217, 185, 120, 0.55)";
	var PLOT_TEXT = "#89958a";
	var PLOT_HEAD = "#dce4db";
	var PLOT_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
	var LEGEND_H = 11;
	var AXIS_H = 11;
	var HEAD_H = 26;
	var PAD = 9;

	// one chart: a box, a grid, a curve per series and the player's own build on it
	function drawChart(context, chart, box) {
		var plotH = box.h - chart.seriesN * LEGEND_H - AXIS_H;
		var top = box.y;
		var bottom = top + plotH;
		var zeroY = 0;
		var s;
		var i;
		var series;
		var span;
		var x;
		var y;
		var zeroDrawn = false;
		var mark = box.x + box.w * markerFraction(chart);

		context.strokeStyle = PLOT_GRID;
		context.lineWidth = 1;
		context.beginPath();
		for (i = 0; i <= 2; i += 1) {
			y = Math.round(top + plotH * i / 2) + 0.5;
			context.moveTo(box.x, y);
			context.lineTo(box.x + box.w, y);
		}
		context.stroke();

		for (s = 0; s < chart.seriesN; s += 1) {
			series = chart.series[s];
			span = series.hi - series.lo;
			if (span <= 0) span = 1;
			if (!zeroDrawn && series.lo < 0 && series.hi > 0) {
				zeroDrawn = true;
				zeroY = bottom + series.lo / span * plotH;
			}
		}
		if (zeroDrawn) {
			context.strokeStyle = PLOT_ZERO;
			context.beginPath();
			context.moveTo(box.x, Math.round(zeroY) + 0.5);
			context.lineTo(box.x + box.w, Math.round(zeroY) + 0.5);
			context.stroke();
		}

		if (chart.marker) {
			context.strokeStyle = PLOT_MARK;
			context.beginPath();
			context.moveTo(mark, top);
			context.lineTo(mark, bottom);
			context.stroke();
		}

		for (s = 0; s < chart.seriesN; s += 1) {
			series = chart.series[s];
			span = series.hi - series.lo;
			if (span <= 0) span = 1;
			context.strokeStyle = series.color;
			context.lineWidth = s === 0 ? 1.6 : 1.2;
			context.beginPath();
			for (i = 0; i < RR.Plot.SAMPLES; i += 1) {
				x = box.x + box.w * (i / (RR.Plot.SAMPLES - 1));
				y = bottom - (series.values[i] - series.lo) / span * plotH;
				if (i === 0) context.moveTo(x, y);
				else context.lineTo(x, y);
			}
			context.stroke();

			if (!chart.marker) continue;
			y = bottom - (series.at - series.lo) / span * plotH;
			context.fillStyle = series.color;
			context.fillRect(mark - 1.5, y - 1.5, 3, 3);
		}

		drawLegend(context, chart, box.x, bottom + 2, box.w);
		drawAxis(context, chart, box.x, bottom + 2 + chart.seriesN * LEGEND_H, box.w);
	}

	function markerFraction(chart) {
		var span = chart.x1 - chart.x0;

		return span <= 0 ? 0 : (chart.markerX - chart.x0) / span;
	}

	// one row per series: its colour, its value under the marker, and its range
	function drawLegend(context, chart, x, y, w) {
		var s;
		var series;
		var row;

		context.textBaseline = "middle";
		context.font = "9px " + PLOT_FONT;
		for (s = 0; s < chart.seriesN; s += 1) {
			series = chart.series[s];
			row = y + s * LEGEND_H + 6;
			context.fillStyle = series.color;
			context.fillRect(x, row - 2.5, 5, 5);
			context.fillStyle = PLOT_HEAD;
			context.textAlign = "left";
			context.fillText(series.name, x + 10, row);
			context.fillStyle = PLOT_TEXT;
			context.textAlign = "right";
			context.fillText(series.lo.toFixed(series.digits) + "–" + series.hi.toFixed(series.digits) + " " + series.unit, x + w, row);
			if (!chart.marker) continue;
			context.fillStyle = PLOT_HEAD;
			context.fillText(series.at.toFixed(series.digits) + " " + series.unit, x + w * 0.60, row);
		}
		context.textAlign = "left";
	}

	function drawAxis(context, chart, x, y, w) {
		context.fillStyle = PLOT_TEXT;
		context.font = "8px " + PLOT_FONT;
		context.textBaseline = "top";
		context.textAlign = "left";
		context.fillText(chart.x0.toFixed(chart.xDigits), x, y);
		context.textAlign = "right";
		context.fillText(chart.x1.toFixed(chart.xDigits) + " " + chart.xLabel, x + w, y);
		context.textAlign = "left";
	}

	// the whole popover: a title, one or two charts, from a filled Plot
	Render.drawPlot = function (context, plot, width, height) {
		var chartH = (height - HEAD_H - PAD) / plot.chartN;
		var c;

		context.clearRect(0, 0, width, height);
		context.fillStyle = PLOT_BG;
		context.fillRect(0, 0, width, height);
		context.strokeStyle = PANEL_LINE;
		context.lineWidth = 1;
		context.strokeRect(0.5, 0.5, width - 1, height - 1);

		context.fillStyle = PLOT_HEAD;
		context.font = "9px " + PLOT_FONT;
		context.textBaseline = "top";
		context.fillText(plot.title, PAD, PAD - 2);
		context.fillStyle = PLOT_TEXT;
		context.font = "8px " + PLOT_FONT;
		context.fillText(plot.note, PAD, PAD + 11);

		for (c = 0; c < plot.chartN; c += 1) {
			drawChart(context, plot.charts[c], {
				x: PAD,
				y: HEAD_H + c * chartH,
				w: width - 2 * PAD,
				h: chartH - 2
			});
		}
	};

	Render.plotHeight = function (chartN) {
		return HEAD_H + PAD + chartN * (58 + 3 * LEGEND_H + AXIS_H + 6);
	};

	// ---- sparkline: the smoothed net rate over the sim's last window ----

	var GRAPH_UP = "#a9d68e";
	var GRAPH_DOWN = "#d98a78";
	var GRAPH_FLAT = "#89958a";
	var GRAPH_LIVE = "#d9b978";

	// the history is a ring: oldest sample first, whatever the head is
	Render.drawGraph = function (context, sim, width, height) {
		var history = sim.history;
		var count = sim.historyCount;
		var head = sim.historyHead;
		var lo = 0;
		var hi = 0;
		var span;
		var color = sim.netTrend > C.TREND_EPS ? GRAPH_UP : (sim.netTrend < -C.TREND_EPS ? GRAPH_DOWN : GRAPH_FLAT);
		var zeroY;
		var i;
		var index;
		var v;
		var x;
		var y;

		context.clearRect(0, 0, width, height);
		if (count < 2) return;

		for (i = 0; i < count; i += 1) {
			v = history[i];
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
		if (hi <= 0) hi = 0;
		if (lo >= 0) lo = 0;
		span = hi - lo;
		if (span <= 0) span = 1;
		zeroY = height - 2 - (0 - lo) / span * (height - 4);

		context.strokeStyle = PLOT_ZERO;
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(0, Math.round(zeroY) + 0.5);
		context.lineTo(width, Math.round(zeroY) + 0.5);
		context.stroke();

		context.strokeStyle = color;
		context.lineWidth = 1.4;
		context.beginPath();
		for (i = 0; i < count; i += 1) {
			index = (head - count + i + C.HISTORY_N * 2) % C.HISTORY_N;
			v = history[index];
			x = width * (i / (count - 1));
			y = height - 2 - (v - lo) / span * (height - 4);
			if (i === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.stroke();
	};

	// ---- bench bars: one bar a row, the same totals the bench panel reads ----

	// In LINE mode the sparkline is not a rate over a window, because the mode is not about
	// a window: it is the bench, one bar a measured row, the tallest the best line. the bars
	// are scaled on the rows that finished clean — a row that ran to the cutoff is priced as
	// the dead weight it is, and its total would flatten every line that actually trades
	// In LINE mode the sparkline is not a rate over a window, because the mode is not about
	// a window: it is the bench, one bar a row, the tallest the best line. the scale is set
	// by the rows that finished clean — a row that ran to the cutoff is priced as the dead
	// weight it is, and its total would flatten every line that actually trades
	Render.drawBenchGraph = function (context, bench, width, height) {
		var slots = bench ? bench.slots : 0;
		var top = 2;
		var bottom = height - 2;
		var lo = 0;
		var hi = 0;
		var barW;
		var zeroY;
		var i;
		var v;
		var y;

		context.clearRect(0, 0, width, height);
		if (!bench) return;

		for (i = 0; i < slots; i += 1) {
			if (!bench.used[i] || bench.queued[i] || bench.cut[i]) continue;
			if (bench.net[i] < lo) lo = bench.net[i];
			if (bench.net[i] > hi) hi = bench.net[i];
		}
		if (hi <= lo) hi = lo + 1;
		zeroY = bottom - (0 - lo) / (hi - lo) * (bottom - top);

		context.strokeStyle = PLOT_ZERO;
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(0, Math.round(zeroY) + 0.5);
		context.lineTo(width, Math.round(zeroY) + 0.5);
		context.stroke();

		barW = width / slots;
		for (i = 0; i < slots; i += 1) {
			if (!bench.used[i]) continue;
			v = bench.net[i];
			y = bench.queued[i] ? zeroY : bottom - (v - lo) / (hi - lo) * (bottom - top);
			if (y < top) y = top;
			else if (y > bottom) y = bottom;
			context.fillStyle = barColor(bench, i);
			if (bench.queued[i]) {
				context.fillRect(i * barW + 1, zeroY - 1, barW - 2, 2);
				continue;
			}
			context.fillRect(i * barW + 1, Math.min(y, zeroY), barW - 2, Math.max(1, Math.abs(zeroY - y)));
		}
	};

	// the live row is the warm one, the best measured row the bright one, a row that ran to
	// the cutoff the falling one
	function barColor(bench, i) {
		if (bench.cut[i]) return GRAPH_DOWN;
		if (i === bench.best) return GRAPH_UP;
		if (i === 0) return GRAPH_LIVE;
		return GRAPH_FLAT;
	}

	Render.draw = function (view, sim, paused, frameDt, sweep) {
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

		for (i = 0; i < world.nodeCount; i += 1) drawNode(view, sim, i);
		drawTrain(view, sim, paused);
		// in LINE mode the sweep is idle and the bench panel (DOM) holds the corner: the
		// measured grid and the measured line are both instruments, and only one is asked
		if (!sim.lineOn) drawPanel(view, sim, sweep);
	};

	RR.Render = Render;

	if (typeof module !== "undefined" && module.exports) module.exports = Render;
})(globalThis);
