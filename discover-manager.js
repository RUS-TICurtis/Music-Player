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

async function fetchDiscoverTracks(query = 'popular') {
    try {
        const response = await fetch(`/discover?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const tracks = await response.json();

        // Cache each enriched track for offline use
        if (tracks.length > 0) {
            const tracksToCache = tracks.map(track => ({
                id: track.id.toString(),
                name: track.name,
                artist: track.artist_name,
                album: track.album_name,
                coverURL: track.image,
                audioUrl: track.audio, // URL for streaming
                bio: track.bio,
                tags: track.tags,
                lyricsUrl: track.lyricsUrl,
                similarArtists: track.similarArtists,
            }));
            await db.tracks.bulkPut(tracksToCache);
        }
        return tracks;
    } catch (error) {
        console.error('Failed to fetch discover tracks:', error);
        config.showMessage('Could not connect to the discovery service. Make sure the server is running.');

        // Fallback: If offline, search the local cache
        config.showMessage('Offline. Searching local cache...');
        const cached = await db.tracks.where('name').equalsIgnoreCase(query).or('artist').equalsIgnoreCase(query).toArray();
        return cached.map(t => ({ ...t, image: t.coverURL, artist_name: t.artist, name: t.name })); // Normalize for rendering
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
        const coverURL = track.image ? track.image.replace('1.200x1200', '1.300x300') : 'https://via.placeholder.com/300';
        const tagsHTML = track.tags && track.tags.length > 0
            ? `<div class="card-tags">${track.tags.slice(0, 2).map(tag => `<span>${tag}</span>`).join('')}</div>`
            : '';

        return `
            <div class="recent-media-card" data-track-id="${track.id}">
                <div class="album-art" data-action="play">
                    <img src="${coverURL}" alt="${track.name}">
                </div>
                <div class="card-body">
                    ${tagsHTML}
                </div>
                <div class="card-footer">
                    <h5>${track.name}</h5>
                    <button class="control-btn small track-action-btn" title="Download" data-action="download"><i class="fas fa-download"></i></button>
                </div>
            </div>
        `;
    }).join('');

    config.discoverContent.querySelectorAll('.recent-media-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;

            const trackId = card.dataset.trackId;
            const trackData = tracks.find(t => t.id === trackId);

            if (action === 'play' && trackData) {
                // Create a track object compatible with our player
                const playerTrack = {
                    id: trackData.id,
                    name: trackData.name,
                    artist: trackData.artist_name,
                    album: trackData.album_name,
                    duration: trackData.duration,
                    coverURL: trackData.image,
                    objectURL: trackData.audio, // Direct audio URL
                    isURL: true, // Mark as a stream
                };
                config.startPlayback([playerTrack], 0);
            } else if (action === 'download' && trackData) {
                config.downloadAndCacheTrack(trackData);
            }
        });
    });
}