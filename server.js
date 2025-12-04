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
const { fetchJamendo } = require('./apis/jamendo');
const { fetchAudioDB } = require('./apis/theaudiodb');
const { fetchLastFM } = require('./apis/lastfm');
const { fetchGenius } = require('./apis/genius');
const { fetchMusicBrainz } = require('./apis/musicbrainz');

// --- Unified Discover Route ---

app.get('/discover', async (req, res) => {
  try {
    const { q } = req.query;
    const jamendoTracks = await fetchJamendo(q || 'popular');

    // Enrich each track with data from other APIs
    const enriched = await Promise.all(
      jamendoTracks.map(async track => {
        const artistName = track.artist_name;

        const [audioDB, lastFM, genius, mb] = await Promise.all([
          fetchAudioDB(artistName),
          fetchLastFM(artistName),
          fetchGenius(track.name + ' ' + artistName),
          fetchMusicBrainz(artistName)
        ]);

        return {
          id: track.id,
          title: track.name,
          artist: artistName,
          album: track.album_name,
          audioUrl: track.audio,
          albumArt: track.album_image || audioDB?.strArtistThumb,
          bio: audioDB?.strBiographyEN || lastFM?.bio?.summary || null,
          tags: lastFM?.tags?.tag?.map(t => t.name) || [],
          similarArtists: lastFM?.similar?.artist?.map(a => a.name) || [],
          lyricsUrl: genius?.url || null,
          mbid: mb?.id || null
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error('Discover error:', error.message);
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
