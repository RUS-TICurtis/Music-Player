const axios = require('axios');

async function fetchGenius(query) {
  const res = await axios.get('https://api.genius.com/search', {
    headers: { Authorization: `Bearer ${process.env.GENIUS_ACCESS_TOKEN}` },
    params: { q: query }
  });
  return res.data.response.hits[0]?.result || null;
}

module.exports = { fetchGenius };