const axios = require('axios');

async function fetchJamendo(query) {
  const res = await axios.get('https://api.jamendo.com/v3.0/tracks', {
    params: {
      client_id: process.env.JAMENDO_CLIENT_ID,
      format: 'json',
      limit: 10,
      search: query
    }
  });
  return res.data.results || [];
}

module.exports = { fetchJamendo };