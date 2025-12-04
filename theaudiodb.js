const axios = require('axios');

async function fetchAudioDB(artist) {
  const res = await axios.get('https://theaudiodb.com/api/v1/json/2/search.php', {
    params: { s: artist }
  });
  return res.data.artists ? res.data.artists[0] : null;
}

module.exports = { fetchAudioDB };