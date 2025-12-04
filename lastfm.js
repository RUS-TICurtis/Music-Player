const axios = require('axios');

async function fetchLastFM(artist) {
  const res = await axios.get('http://ws.audioscrobbler.com/2.0/', {
    params: {
      method: 'artist.getinfo',
      artist,
      api_key: process.env.LASTFM_API_KEY,
      format: 'json'
    }
  });
  return res.data.artist || null;
}

module.exports = { fetchLastFM };