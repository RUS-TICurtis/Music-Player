const axios = require('axios');

async function fetchJamendoTracks(search = '', order = 'popularity_week', limit = 50) {
    const JAMENDO_CLIENT_ID = process.ENV.env.JAMENDO_CLIENT_ID || 'd32b0311';
    let url = `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=jsonpretty&limit=${limit}`;

    if (search) {
        url += `&namesearch=${encodeURIComponent(search)}`;
    } else {
        url += `&order=${order}`;
    }

    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Jamendo API error:', error.message);
        throw error;
    }
}

module.exports = { fetchJamendoTracks };
