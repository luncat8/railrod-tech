(function (root) {
	"use strict";

	var RR = root.RR || (root.RR = {});
	var Render = RR.Render || {};

	Render.create = function (canvas) {
		return {
			canvas: canvas,
			context: canvas.getContext("2d", { alpha: false }),
			width: 0,
			height: 0,
			dpr: 1,
			glow: null
		};
	};

	Render.resize = function (view) {
		var bounds = view.canvas.getBoundingClientRect();
		var dpr = root.devicePixelRatio || 1;
		var width = Math.max(1, bounds.width);
		var height = Math.max(1, bounds.height);
		var radius;

		view.width = width;
		view.height = height;
		view.dpr = dpr;
		view.canvas.width = Math.round(width * dpr);
		view.canvas.height = Math.round(height * dpr);
		view.context.setTransform(dpr, 0, 0, dpr, 0, 0);

		radius = Math.max(width, height) * 0.72;
		view.glow = view.context.createRadialGradient(width * 0.8, height * 0.48, 0, width * 0.8, height * 0.48, radius);
		view.glow.addColorStop(0, "rgba(60, 100, 70, 0.17)");
		view.glow.addColorStop(0.45, "rgba(36, 62, 46, 0.08)");
		view.glow.addColorStop(1, "rgba(17, 22, 19, 0)");
	};

	Render.draw = function (view, simTime, paused) {
		var context = view.context;
		var width = view.width;
		var height = view.height;
		var centerX = width * 0.79;
		var centerY = height * 0.51;
		var maxRadius = Math.min(width * 0.31, height * 0.58);
		var radius;
		var x;
		var y;
		var tick;
		var angle;
		var sweep;

		context.fillStyle = "#111613";
		context.fillRect(0, 0, width, height);
		context.fillStyle = view.glow;
		context.fillRect(0, 0, width, height);

		context.beginPath();
		for (x = 0.5; x < width; x += 48) {
			context.moveTo(x, 0);
			context.lineTo(x, height);
		}
		for (y = 0.5; y < height; y += 48) {
			context.moveTo(0, y);
			context.lineTo(width, y);
		}
		context.lineWidth = 1;
		context.strokeStyle = "rgba(188, 204, 188, 0.035)";
		context.stroke();

		context.beginPath();
		context.moveTo(0, height * 0.77 + 0.5);
		context.lineTo(width, height * 0.77 + 0.5);
		context.strokeStyle = "rgba(180, 201, 177, 0.07)";
		context.stroke();

		for (radius = 28; radius <= maxRadius; radius += 28) {
			context.beginPath();
			context.arc(centerX, centerY, radius, 0, Math.PI * 2);
			context.strokeStyle = "rgba(158, 196, 154, 0.075)";
			context.lineWidth = 1;
			context.stroke();
		}

		for (tick = 0; tick < 24; tick += 1) {
			angle = tick * Math.PI / 12;
			context.beginPath();
			context.moveTo(centerX + Math.cos(angle) * (maxRadius - 5), centerY + Math.sin(angle) * (maxRadius - 5));
			context.lineTo(centerX + Math.cos(angle) * (maxRadius + (tick % 6 === 0 ? 8 : 3)), centerY + Math.sin(angle) * (maxRadius + (tick % 6 === 0 ? 8 : 3)));
			context.strokeStyle = tick % 6 === 0 ? "rgba(169, 214, 142, 0.3)" : "rgba(169, 214, 142, 0.12)";
			context.stroke();
		}

		sweep = simTime * 0.28;
		context.beginPath();
		context.moveTo(centerX, centerY);
		context.lineTo(centerX + Math.cos(sweep) * maxRadius, centerY + Math.sin(sweep) * maxRadius);
		context.strokeStyle = paused ? "rgba(217, 185, 120, 0.24)" : "rgba(169, 214, 142, 0.33)";
		context.lineWidth = 1;
		context.stroke();

		context.beginPath();
		context.arc(centerX + Math.cos(sweep) * maxRadius, centerY + Math.sin(sweep) * maxRadius, 3, 0, Math.PI * 2);
		context.fillStyle = paused ? "#d9b978" : "#b9e69a";
		context.fill();
	};

	RR.Render = Render;

	if (typeof module !== "undefined" && module.exports) module.exports = Render;
})(globalThis);
