// index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Import the cors middleware
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 1552;

// Use CORS middleware to allow requests from your front-end
app.use(cors());

// Serve static files from the root directory (where index.html is)
app.use(express.static('.'));

const { fetchJamendoTracks } = require('./jamendo');
const { fetchTopTracks, fetchTrackInfo } = require('./lastfm');
const { fetchTrending } = require('./theaudiodb');
const { fetchHearThisTracks } = require('./hearthis');
const { fetchMusicBrainzTrending } = require('./musicbrainz');
const { fetchGeniusLyrics } = require('./genius');

// New Endpoint: Genre
app.get('/api/genre', async (req, res) => {
  try {
    const { title, artist } = req.query;
    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }
    const info = await fetchTrackInfo(artist, title);
    let genre = 'Unknown Genre';

    if (info && info.toptags && info.toptags.tag && info.toptags.tag.length > 0) {
      genre = info.toptags.tag[0].name;
    }

    res.json({ genre });
  } catch (error) {
    console.error('Genre endpoint error:', error);
    res.json({ genre: 'Unknown Genre' });
  }
});

// API endpoint to proxy Jamendo requests
app.get('/api/discover', async (req, res) => {
  try {
    const { search, order } = req.query;
    const data = await fetchJamendoTracks(search, order || 'popularity_week');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data from Jamendo' });
  }
});

// New Endpoint: LastFM Top Tracks
app.get('/api/discover/lastfm', async (req, res) => {
  try {
    const tracks = await fetchTopTracks();
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch LastFM data' });
  }
});

// New Endpoint: TheAudioDB Trending
app.get('/api/discover/theaudiodb', async (req, res) => {
  try {
    const trending = await fetchTrending();
    res.json(trending);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch AudioDB data' });
  }
});

// New Endpoint: HearThis.at Popular Feed
app.get('/api/discover/hearthis', async (req, res) => {
  try {
    const page = req.query.page || 1;
    const count = req.query.count || 20;
    const { fetchHearThisTracks } = require('./hearthis'); // Import here or at top
    const tracks = await fetchHearThisTracks(page, count);
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch HearThis.at data' });
  }
});

// New Endpoint: MusicBrainz Trending (Releases)
app.get('/api/discover/musicbrainz', async (req, res) => {
  try {
    const limit = req.query.limit || 20;
    // fetchMusicBrainzTrending is imported at top
    const tracks = await fetchMusicBrainzTrending(limit);
    res.json(tracks);
  } catch (error) {
    console.error("MusicBrainz Content Error:", error.response ? error.response.data : error.message);
    // Return empty array so frontend doesn't show error, just shows other content
    res.json([]);
  }
});

// New Endpoint: Lyrics
app.get('/api/lyrics', async (req, res) => {
  try {
    const { title, artist, album, year, lang, skipIds } = req.query;
    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }

    // Convert skipIds to array if it's a string
    const skipIdsArray = skipIds ? (Array.isArray(skipIds) ? skipIds : [skipIds]) : [];

    // fetchGeniusLyrics imported at top
    const result = await fetchGeniusLyrics(title, artist, album, year, lang || 'en', skipIdsArray);
    res.json(result || { lyrics: null, id: null });
  } catch (error) {
    console.error('Lyrics endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch lyrics' });
  }
});

app.listen(PORT, () => {
  console.log(`Genesis server running at http://localhost:${PORT}`);
});
