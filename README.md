# Coastal Rhythms

A data - driven generative art installation by Anna Stewart as part of Computational Arts MA, Goldsmiths University (2026).

A living mixed media seascape of Lavernock Point, Wales. The sketch responds in real time to live tide height, wind speed, moon phase, and the time of day to create a relaxed natural scene scape.

---

## What it does

The base layer is a photograph of the shoreline at Lavernock Point, near Penarth on the Bristol Channel. On top of this, a p5.js sketch renders:

- **Digital waves** that rise and fall with the live tide reading from the Coastal Monitoring Centre sensor at Penarth. At low tide the pebble beach is exposed; at high tide the digital water covers it.
- **Wave movement** driven by live wind speed — stronger winds produce slightly faster, more active wave motion, always within a calm, meditative range.
- **A pebble beach** procedurally generated in sandy, slate and ochre tones matching the actual shoreline.
- **Background sea ripples** animating the photographic water above the horizon line.
- **A 3D moon** rendered with a NASA surface texture, lit by a directional light whose angle matches the real moon phase for today. Appears in the sky when the moon is above the horizon, within the east-facing camera frame, and after dark.
- **Day/night cycle** using precise sunrise and sunset times calculated for Penarth, transitioning through dawn and dusk colour overlays.

---

## Data sources

| Data | Source | How used |
|------|--------|----------|
| Tide height (m) | Coastal Monitoring Centre API — Penarth sensor | Controls how far digital water covers the beach |
| Wind speed (mph) | Coastal Monitoring Centre API — Penarth sensor | Scales wave movement speed and amplitude |
| Moon phase & illumination | `london_moon_p5_ready.json` (Mar–Aug 2026) | Drives directional lighting angle and strength on moon sphere |
| Moon position (azimuth/altitude) | SunCalc library | Places moon accurately in the sky for Lavernock Point coordinates |
| Sunrise / sunset times | SunCalc library | Drives the day/night overlay and gradient |

---

## Tech stack

- **p5.js** — canvas rendering, Perlin noise, animation loop
- **p5.WEBGL** — offscreen graphics buffer for the 3D moon sphere
- **SunCalc** — astronomical calculations (moon position, sunrise/sunset)
- **Node.js / Express** — local proxy server to forward API requests and hide the API key
- **dotenv** — keeps the API key out of version control

---

## Running locally

### 1. Install dependencies

```bash
npm install
```

### 2. Add your API key

Create a `.env` file in the project root:

```
API_KEY=your_coastal_monitoring_api_key
```

### 3. Start the proxy server

```bash
node server.js
```

### 4. Open in browser

Open `index.html` with Live Server (VS Code extension) or any local web server. The sketch fetches tide and wind data from `http://localhost:3000` every 30 minutes.

---

## Project structure

```
Coastal Rhythms/
├── sketch.js               # Main p5.js sketch
├── server.js               # Express proxy server
├── index.html              # Entry point
├── style.css               # Page styles
├── Lavernock_Point.jpg     # Base photograph
├── NASA_Moon_pic.jpg       # Moon texture
├── london_moon_p5_ready.json  # Pre-computed moon phase data Mar–Aug 2026
├── .env                    # API key (not in version control)
└── .gitignore
```

---

## Location

**Lavernock Point, Vale of Glamorgan, Wales**
Coordinates: `51.395°N, 3.185°W`
Camera bearing: facing east over the Bristol Channel

The Bristol Channel has one of the largest tidal ranges in the world — up to 11 metres — which is why the tide so dramatically changes the appearance of the sketch.

---

## Keyboard shortcut

Press **G** to record a 3-second GIF of the sketch (`lavernock.gif`).

## Attribution
Real time data (tidal and met) displayed on this page are from the Regional Coastal Monitoring Programme, made freely available under the terms of the Open Government Licence. Please note that these are real-time data and are not quality-controlled.

Moon surface texture courtesy of NASA's Lunar Reconnaissance Orbiter Camera (LROC), Arizona State University. The image is in the public domain, so it can be freely used for projects Source: svs.gsfc.nasa.gov