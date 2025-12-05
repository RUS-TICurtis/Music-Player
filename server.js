// index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Import the cors middleware
require('dotenv').config();

const app = express();
const PORT = 3000;

// Use CORS middleware to allow requests from your front-end
app.use(cors());

// Serve static files from the root directory (where index.html is)
app.use(express.static('.'));

// API endpoint to proxy Jamendo requests
app.get('/api/discover', async (req, res) => {
  try {
    const { search } = req.query;
    // IMPORTANT: It's better to store your client_id in a .env file for security
    const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID || 'd32b0311'; // Fallback for simplicity
    let url = `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=jsonpretty&limit=50`;

    if (search) {
      url += `&namesearch=${encodeURIComponent(search)}`;
    } else {
      url += `&order=popularity_week`;
    }
    
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    console.error('Error proxying Jamendo request:', error.message);
    res.status(500).json({ error: 'Failed to fetch data from Jamendo' });
  }
});

app.listen(PORT, () => {
  console.log(`Genesis server running at http://localhost:${PORT}`);
});
