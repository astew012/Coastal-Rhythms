require('dotenv').config();
const express = require('express');
const https = require('https');

const app = express();
const PORT = 3000;
const API_KEY = process.env.API_KEY;
const API_BASE = 'https://coastalmonitoring.org/observations';

app.use(express.static(__dirname));

// Allow requests from Live Server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.get('/tides', (req, res) => {
  const url = API_BASE + '/tides/latest?key=' + API_KEY + '&sensor=Penarth';

  https.get(url, {
    headers: {
      'Accept': 'application/json',
      'Referer': 'https://coastalmonitoring.org/'
    }
  }, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => res.json(JSON.parse(data)));
  }).on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

app.get('/wind', (_req, res) => {
  const url = API_BASE + '/met/latest?key=' + API_KEY + '&sensor=Penarth';
  console.log('Fetching wind from:', url);

  https.get(url, {
    headers: {
      'Accept': 'application/json',
      'Referer': 'https://coastalmonitoring.org/'
    }
  }, (apiRes) => {
    console.log('Wind API status:', apiRes.statusCode);
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      if (apiRes.statusCode !== 200) {
        console.error('Wind API error body:', data.slice(0, 200));
        return res.status(apiRes.statusCode).json({ error: 'Upstream API returned ' + apiRes.statusCode });
      }
      try {
        res.json(JSON.parse(data));
      } catch (e) {
        console.error('Wind JSON parse error:', data.slice(0, 200));
        res.status(500).json({ error: 'Invalid JSON from upstream' });
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

app.listen(PORT, () => {
  console.log('Proxy server running at http://localhost:' + PORT);
});
