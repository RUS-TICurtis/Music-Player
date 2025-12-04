// index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Import the cors middleware
require('dotenv').config();

const app = express();
const PORT = 3000;

// Serve static files from the root directory (where index.html is)
app.use(express.static('.'));

// Enable CORS for all routes
app.use(cors());

// --- Import API Modules ---
const { fetchJamendo } = require('./jamendo.js');
const { fetchAudioDB } = require('./theaudiodb.js');
const { fetchLastFM } = require('./lastfm.js');
const { fetchGenius } = require('./genius.js');
const { fetchMusicBrainz } = require('./musicbrainz.js');

// --- Unified Discover Route ---

app.get('/discover', async (req, res) => {
  try {
    // The 'q' parameter from the client will be used as the 'tags' parameter for Jamendo
    const query = req.query.q || 'popular'; // Default to 'popular' if no query
    const jamendoTracks = await fetchJamendo(query);
    
    // Directly return the tracks from Jamendo.
    // The client will be responsible for displaying them.
    // The original structure was too slow, making multiple API calls per track.
    // Enrichment can happen when a user decides to *add* a track to their library.
    res.json(jamendoTracks);
  } catch (error) {
    console.error('Discover error:', error);
    res.status(500).json({ error: 'Failed to fetch discover data' });
  }
});

// Download endpoint
app.get('/download/:id', async (req, res) => {
  try {
    const trackId = req.params.id;
    const response = await axios.get('https://api.jamendo.com/v3.0/tracks', {
      params: {
        client_id: process.env.JAMENDO_CLIENT_ID,
        format: 'json',
        id: trackId
      }
    });

    const track = response.data.results[0];
    if (track && track.audio) {
      // Return the direct audio URL to the client.
      // The frontend will handle the download.
      res.json({ audioUrl: track.audio, trackData: track });
    } else {
      res.status(404).json({ error: 'Track not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to download track' });
  }
});

app.listen(PORT, () => {
  console.log(`Genesis server running at http://localhost:${PORT}`);
});
