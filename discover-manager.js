import { db } from './db.js';

let config = {
    discoverContent: null,
    showMessage: () => {},
    startPlayback: () => {},
    downloadAndCacheTrack: () => {},
};

/**
 * Initializes the discover manager.
 * @param {object} dependencies - The dependencies from the main script.
 */
export async function init(dependencies) {
    config = { ...config, ...dependencies };
    if (config.discoverContent) {
        // Load popular tracks on initial view
        await renderDiscoverGrid('popular');

        const searchInput = document.getElementById('discover-search-input');
        const searchBtn = document.getElementById('discover-search-btn');

        searchBtn.addEventListener('click', () => renderDiscoverGrid(searchInput.value));
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') renderDiscoverGrid(searchInput.value);
        });
    }
}

async function cacheEnrichedData(track) {
  // Cache the track object
  await db.tracks.put({
    id: track.id.toString(),
    title: track.title,
    artist: track.artist,
    album: track.album,
    audioUrl: track.audioUrl,
    albumArt: track.albumArt,
    bio: track.bio,
    tags: track.tags,
    lyricsUrl: track.lyricsUrl,
    mbid: track.mbid,
    downloaded: false // Initially, only metadata is cached, not the audio file
  });

  // Cache the artist object separately for the 'Artists' view
  // Use 'put' to add or update the artist info
  if (track.artist) {
    await db.artists.put({
      name: track.artist,
      genre: track.tags?.[0] || '',
      bio: track.bio,
      imageUrl: track.albumArt, // Use track album art as a proxy for artist image
      similarArtists: track.similarArtists
    });
  }
}

async function fetchDiscoverTracks(query = 'popular') {
    try {
        const response = await fetch(`/discover?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const enrichedTracks = await response.json();

        // Cache each enriched track for offline use
        if (enrichedTracks.length > 0) {
            for (const track of enrichedTracks) {
                await cacheEnrichedData(track);
            }
        }
        return enrichedTracks;
    } catch (error) {
        console.error('Failed to fetch discover tracks:', error);
        config.showMessage('Offline. Searching your local cache...');

        // Fallback: If offline, search the local cache
        const qLower = query.toLowerCase();
        const cached = await db.tracks.filter(track => 
            track.title.toLowerCase().includes(qLower) || 
            track.artist.toLowerCase().includes(qLower)
        ).toArray();
        return cached;
    }
}

async function renderDiscoverGrid(query) {
    const searchQuery = query.trim();
    if (!searchQuery) {
        config.showMessage("Please enter a search term.");
        return;
    }
    config.discoverContent.innerHTML = `<div class="empty-state">Searching for "${searchQuery}"...</div>`;
    const tracks = await fetchDiscoverTracks(searchQuery);

    if (!tracks || tracks.length === 0) {
        config.discoverContent.innerHTML = `<div class="empty-state">Could not load any tracks.</div>`;
        return;
    }

    config.discoverContent.innerHTML = tracks.map(track => {
        // Jamendo API provides different image sizes, let's pick a medium one
        const coverURL = track.albumArt ? track.albumArt.replace('1.200x1200', '1.300x300') : 'https://via.placeholder.com/300';
        const tagsHTML = track.tags && track.tags.length > 0
            ? `<div class="card-tags">${track.tags.slice(0, 2).map(tag => `<span>${tag}</span>`).join('')}</div>`
            : '';

        return `
            <div class="recent-media-card" data-track-id="${track.id}">
                <div class="album-art">
                    <img src="${coverURL}" alt="${track.title}">
                </div>
                <div class="card-body">
                    ${tagsHTML}
                </div>
                <div class="card-footer">
                    <button class="control-btn small card-footer-play-btn" title="Play"><i class="fas fa-play"></i></button>
                    <h5>${track.title}</h5>
                    <button class="control-btn small track-action-btn" title="Download" data-action="download"><i class="fas fa-download"></i></button>
                </div>
            </div>
        `;
    }).join('');

    config.discoverContent.querySelectorAll('.recent-media-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // If a button was clicked, let its specific handler work.
            if (e.target.closest('[data-action="download"]') || e.target.closest('.card-footer-play-btn')) return;

            const trackId = card.dataset.trackId;
            const trackData = tracks.find(t => t.id.toString() === trackId);

            // Any other click on the card should trigger playback.
            if (trackData) {
                const playerTrack = {
                    id: trackData.id,
                    name: trackData.title,
                    artist: trackData.artist,
                    album: trackData.album,
                    duration: trackData.duration, // duration is often in seconds
                    coverURL: trackData.albumArt,
                    objectURL: trackData.audioUrl, // Direct audio URL for streaming
                    isURL: true, // Mark as a stream (important for playback-manager)
                };
                config.startPlayback([playerTrack]); // This call is now to the function passed from script.js
            }
        });

        // Add a specific listener for the new play button
        card.querySelector('.card-footer-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const trackId = card.dataset.trackId;
            const trackData = tracks.find(t => t.id.toString() === trackId);
            if (trackData) {
                const playerTrack = {
                    id: trackData.id,
                    name: trackData.title,
                    artist: trackData.artist,
                    album: trackData.album,
                    duration: trackData.duration,
                    coverURL: trackData.albumArt,
                    objectURL: trackData.audioUrl,
                    isURL: true,
                };
                config.startPlayback([playerTrack]); // This call is now to the function passed from script.js
            }
        });

        // Keep a separate, more specific listener for the download button.
        card.querySelector('[data-action="download"]').addEventListener('click', (e) => {
            const trackId = card.dataset.trackId;
            const trackData = tracks.find(t => t.id.toString() === trackId);
            if (trackData) {
                config.downloadAndCacheTrack(trackData);
            }
        });
    });
}