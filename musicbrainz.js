const axios = require('axios');

async function fetchMusicBrainz(artist) {
  const res = await axios.get('https://musicbrainz.org/ws/2/artist/', {
    params: { query: artist, fmt: 'json' }
  });
  return res.data.artists?.[0] || null;
}

module.exports = { fetchMusicBrainz };