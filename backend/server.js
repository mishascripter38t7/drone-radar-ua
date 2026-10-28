const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Раздача фронтенда из папки frontend
app.use(express.static(path.join(__dirname, '../frontend')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let activeTargets = [];

// Точный баллистический расчет (высота, скорость, азимут -> падение с точностью до метров)
function calculateImpactPoint(lat, lon, altitude, speedKmh, headingDeg) {
  const g = 9.81;
  const speedMs = speedKmh / 3.6;
  const timeFall = Math.sqrt((2 * altitude) / g);
  const distanceMeters = speedMs * timeFall;

  const headingRad = (headingDeg * Math.PI) / 180;
  const deltaLat = (distanceMeters * Math.cos(headingRad)) / 111320;
  const deltaLon = (distanceMeters * Math.sin(headingRad)) / (111320 * Math.cos(lat * (Math.PI / 180)));

  return {
    lat: Number((lat + deltaLat).toFixed(6)),
    lon: Number((lon + deltaLon).toFixed(6)),
    distance_meters: Math.round(distanceMeters),
    time_to_impact_sec: Number(timeFall.toFixed(1))
  };
}

// REST API для ESP32
app.get('/api/v1/targets/nearest', (req, res) => {
  if (activeTargets.length === 0) {
    return res.status(404).json({ status: "clear", message: "No active targets in feed" });
  }
  const target = activeTargets[0];
  const impact = calculateImpactPoint(target.lat, target.lon, target.altitude, target.speed, target.heading);

  res.json({
    status: "tracking",
    target_id: target.id,
    telemetry: { lat: target.lat, lon: target.lon, altitude_m: target.altitude, speed_kmh: target.speed, frequency_mhz: target.frequency },
    predicted_impact: impact
  });
});

// Инъекция реальных OSINT-данных
app.post('/api/v1/targets', (req, res) => {
  const { id, lat, lon, altitude, speed, heading, frequency, city } = req.body;
  if (lat === undefined || lon === undefined) {
    return res.status(400).json({ error: "Coordinates (lat, lon) are required" });
  }

  const target = {
    id: id || `UAV-${Math.floor(Math.random() * 9000 + 1000)}`,
    city: city || "Україна",
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    altitude: parseFloat(altitude) || 300,
    speed: parseFloat(speed) || 120,
    heading: parseFloat(heading) || 0,
    frequency: parseFloat(frequency) || 915.0,
    timestamp: Date.now()
  };

  const index = activeTargets.findIndex(t => t.id === target.id);
  if (index >= 0) {
    activeTargets[index] = target;
  } else {
    activeTargets.push(target);
  }

  res.json({ success: true, target });
});

// WebSocket стрим (30 FPS)
wss.on('connection', (ws) => {
  const intervalId = setInterval(() => {
    const data = activeTargets.map(t => ({
      ...t,
      impact: calculateImpactPoint(t.lat, t.lon, t.altitude, t.speed, t.heading)
    }));

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "live_radar", timestamp: Date.now(), data }));
    }
  }, 33);

  ws.on('close', () => clearInterval(intervalId));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Drone Radar Server running at http://localhost:${PORT}`);
});
