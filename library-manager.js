import db from './db.js';
import { playerContext } from './state.js';
import { extractMetadata } from './metadata-extractor.js';
import { showMessage, updateSelectionBar } from './ui-manager.js';
import { formatTime, parseLRC, truncate } from './utils.js';

// placeholders for dependencies to be injected or imported
let startPlaybackFn = null;
let renderTrackContextMenuFn = null;

export function setLibraryDependencies(startPlayback, renderTrackContextMenu) {
    startPlaybackFn = startPlayback;
    renderTrackContextMenuFn = renderTrackContextMenu;
}

export async function loadLibraryFromDB() {
    try {
        const storedTracks = await db.tracks.toArray();
        if (storedTracks) {
            const restorationPromises = storedTracks.map(async (track) => {
                let trackData = { ...track, objectURL: null };

                if (track.audioBlob) {
                    trackData.objectURL = URL.createObjectURL(track.audioBlob);
                    // Create a fresh objectURL for the cover art from its blob
                    if (track.coverBlob) {
                        trackData.coverURL = URL.createObjectURL(track.coverBlob);
                    }
                }

                // Parse lyrics if they exist
                if (trackData.lyrics) {
                    trackData.syncedLyrics = parseLRC(trackData.lyrics);
                }
                return trackData;
            });

            playerContext.libraryTracks = await Promise.all(restorationPromises);
            // Default play queue to component library is usually done in main script or here?
            // "playerContext.trackQueue = [...playerContext.libraryTracks];" 
            // We'll leave queue management to playback restoration logic or initial set up.

            renderHomeGrid();
            renderLibraryGrid();
        }
    } catch (e) {
        console.error("Error restoring library", e);
    }
}

export async function handleFiles(fileList, options = {}) {
    if (!fileList.length) return;

    const openMenuBtn = document.getElementById('open-menu-btn');
    const openMenuText = document.getElementById('open-menu-text');
    const originalText = openMenuText ? openMenuText.textContent : '';
    if (openMenuBtn) openMenuBtn.disabled = true;
    if (openMenuText && !options.isFromDiscover) openMenuText.textContent = 'Processing...';

    const newTracksForMemory = [];
    try {
        const isAudioFile = (file) => {
            if (file.type.startsWith('audio/')) {
                return true;
            }
            const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.weba'];
            const fileName = file.name.toLowerCase();
            return audioExtensions.some(ext => fileName.endsWith(ext));
        };

        const audioFiles = Array.from(fileList).filter(file => {
            const isValidAudio = isAudioFile(file);
            if (!isValidAudio) {
                console.warn(`Skipping non-audio file: ${file.name} (type: ${file.type})`);
                return false;
            }
            return true;
        });

        // Step 1: Extract Metadata (Outside Transaction)
        const detailedTracks = [];
        for (const file of audioFiles) {
            try {
                const metadata = await extractMetadata(file);
                if (metadata) {
                    // Fetch genre from API if missing or generic
                    if (!metadata.genre || metadata.genre === 'Unknown Genre') {
                        try {
                            const genreRes = await fetch(`/api/genre?title=${encodeURIComponent(metadata.title)}&artist=${encodeURIComponent(metadata.artist)}`);
                            if (genreRes.ok) {
                                const genreData = await genreRes.json();
                                if (genreData.genre && genreData.genre !== 'Unknown Genre') {
                                    metadata.genre = genreData.genre;
                                }
                            }
                        } catch (apiErr) {
                            console.warn("Failed to fetch genre from API", apiErr);
                        }
                    }

                    detailedTracks.push({
                        ...metadata,
                        audioBlob: file
                    });
                }
            } catch (err) {
                console.error(`Failed to extract metadata for: ${file.name}`, err);
            }
        }

        // Step 2: Database Storage (Inside Transaction)
        await db.transaction('rw', db.tracks, async () => {
            for (const trackForDB of detailedTracks) {
                try {
                    await db.tracks.put(trackForDB);

                    // Update Memory State (only if DB write succeeds)
                    const trackForMemory = { ...trackForDB, objectURL: URL.createObjectURL(trackForDB.audioBlob) };
                    if (trackForMemory.coverBlob) {
                        trackForMemory.coverURL = URL.createObjectURL(trackForMemory.coverBlob);
                    }
                    newTracksForMemory.push(trackForMemory);
                } catch (err) {
                    if (err.name === 'ConstraintError') {
                        console.warn(`Skipping duplicate track in DB: ${trackForDB.title}`);
                    } else {
                        console.error(`Failed to save track to DB: ${trackForDB.title}`, err);
                    }
                }
            }
        });

        if (newTracksForMemory.length > 0) {
            playerContext.libraryTracks.push(...newTracksForMemory);
            const totalFiles = audioFiles.length;
            const successCount = newTracksForMemory.length;
            const failCount = totalFiles - successCount;
            let message = `Added ${successCount} new track(s).`;
            if (failCount > 0) {
                message += ` ${failCount} file(s) failed to process.`;
            }
            // showMessage(message);
            renderHomeGrid();
            renderLibraryGrid();
            if (window.refreshLibraryViews) window.refreshLibraryViews();
        } else {
            showMessage("No new valid audio files were added.");
        }
    } catch (error) {
        console.error("Error handling files:", error);
        showMessage("An unexpected error occurred while adding files.");
    } finally {
        if (openMenuBtn) openMenuBtn.disabled = false;
        if (openMenuText) openMenuText.textContent = originalText;
    }
}

export async function removeTrack(id) {
    await db.tracks.delete(id);
    const index = playerContext.libraryTracks.findIndex(t => t.id === id);
    if (index > -1) {
        playerContext.libraryTracks.splice(index, 1);
    }
    renderHomeGrid();
    renderLibraryGrid();
    if (window.refreshLibraryViews) window.refreshLibraryViews();
}

export async function handleRemoveTrack(trackId) {
    // Assumption: callers handle playback stop if needed, or we implement checking here later
    // For now, this is a direct database removal.
    await removeTrack(trackId);
}

export function renderHomeGrid() {
    renderSuggestions();
    renderTopArtists();
    renderTopAlbums();
    renderRecentArtists();
    renderRecentAlbums();
    renderFavorites();
}

function renderSuggestions() {
    const container = document.getElementById('home-suggestions-container');
    if (!container) return;
    // Dynamic Suggestions based on Discovery
    const suggestions = [
        { type: 'trending', title: 'Trending Now', icon: 'fa-fire', color: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
        { type: 'pop', title: 'Pop Hits', icon: 'fa-music', color: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
        { type: 'rock', title: 'Rock Classics', icon: 'fa-guitar', color: 'linear-gradient(135deg, #29323c 0%, #485563 100%)' },
        { type: 'new', title: 'New Arrivals', icon: 'fa-clock', color: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)' }
    ];

    container.innerHTML = suggestions.map(s => `
        <div class="suggestion-card" data-mix-type="${s.type}">
            <div class="suggestion-card-bg" style="background: ${s.color}; height: 100%; display: flex; align-items: center; justify-content: center;">
                <i class="fas ${s.icon}" style="font-size: 40px; color: rgba(255,255,255,0.8);"></i>
            </div>
            <div class="suggestion-card-overlay">
                <span class="suggestion-card-title">${s.title}</span>
            </div>
        </div>
    `).join('');
}

function renderTopArtists() {
    const container = document.getElementById('home-top-artists-container');
    if (!container) return;

    // Get unique artists from library
    const artists = [...new Set(playerContext.libraryTracks.map(t => t.artist).filter(Boolean))].slice(0, 6);

    if (artists.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No artists found</div>';
        return;
    }

    container.innerHTML = artists.map(artist => {
        // Find a representative track for image
        const track = playerContext.libraryTracks.find(t => t.artist === artist && t.coverURL);
        const imgUrl = track ? track.coverURL : 'assets/logo-00.png';
        return `
            <div class="artist-circle-card" data-artist="${artist}">
                <div class="artist-img-container">
                    <img src="${imgUrl}" alt="${artist}" loading="lazy">
                </div>
                <span class="artist-name">${truncate(artist, 20)}</span>
            </div>
        `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.artist-circle-card').forEach(card => {
        card.addEventListener('click', () => {
            import('./artist-manager.js').then(m => m.openArtistByName(card.dataset.artist));
        });
    });
}

function renderTopAlbums() {
    const container = document.getElementById('home-top-albums-container');
    if (!container) return;

    // Get unique albums
    const albums = [];
    const seen = new Set();
    playerContext.libraryTracks.forEach(t => {
        if (t.album && !seen.has(t.album)) {
            seen.add(t.album);
            albums.push(t);
        }
    });

    if (albums.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No albums found</div>';
        return;
    }

    container.innerHTML = albums.slice(0, 6).map(track => {
        return `
            <div class="album-square-card" data-album="${track.album}" data-artist="${track.artist || ''}">
                <div class="album-img-wrapper">
                    <img src="${track.coverURL || 'assets/logo-00.png'}" alt="${track.album}" loading="lazy">
                </div>
                <span class="card-title-text">${truncate(track.album, 20)}</span>
                <span class="card-subtitle-text">${truncate(track.artist || 'Unknown', 20)}</span>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.album-square-card').forEach(card => {
        card.addEventListener('click', () => {
            import('./album-manager.js').then(m => m.openAlbum(card.dataset.album, card.dataset.artist));
        });
    });
}

function renderRecentArtists() {
    const container = document.getElementById('home-recent-artists-container');
    if (!container) return;

    // Just grab distinct artists from recent tracks (reverse order)
    const recent = [...playerContext.libraryTracks].reverse();
    const artists = [...new Set(recent.map(t => t.artist).filter(Boolean))].slice(0, 10);

    if (artists.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No recent artists</div>';
        return;
    }

    container.innerHTML = artists.map(artist => {
        const track = playerContext.libraryTracks.find(t => t.artist === artist && t.coverURL);
        const imgUrl = track ? track.coverURL : 'assets/logo-00.png';
        return `
            <div class="artist-circle-card">
                <div class="artist-img-container">
                    <img src="${imgUrl}" alt="${artist}" loading="lazy">
                </div>
                <span class="artist-name">${truncate(artist, 20)}</span>
            </div>
        `;
    }).join('');
}

function renderRecentAlbums() {
    const container = document.getElementById('home-recent-albums-container');
    if (!container) return;

    // Get unique albums in reverse order of addition
    const recent = [...playerContext.libraryTracks].reverse();
    const albums = [];
    const seen = new Set();
    recent.forEach(t => {
        if (t.album && !seen.has(t.album)) {
            seen.add(t.album);
            albums.push(t);
        }
    });

    if (albums.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No recent albums</div>';
        return;
    }

    container.innerHTML = albums.slice(0, 10).map(track => {
        return `
            <div class="album-square-card">
                <div class="album-img-wrapper">
                    <img src="${track.coverURL || 'assets/logo-00.png'}" alt="${track.album}" loading="lazy">
                </div>
                <span class="card-title-text">${truncate(track.album, 20)}</span>
                <span class="card-subtitle-text">${truncate(track.artist || 'Unknown', 20)}</span>
            </div>
        `;
    }).join('');
}

function renderFavorites() {
    const container = document.getElementById('home-favorites-container');
    if (!container) return;

    // For now, look for a playlist named 'Favorites' in localStorage since we don't have direct access here easily
    // or just use Most Played if we had counters. 
    // Let's use any tracks that might have been marked as favorites (if we had the UI).
    // As a fallback, we'll show the tracks from a playlist named 'Favorites' if it exists.

    let favoriteTracks = [];
    try {
        const storedPlaylists = JSON.parse(localStorage.getItem('genesis_playlists') || '{}');
        const favoritesPlaylist = Object.values(storedPlaylists).find(p => p.name.toLowerCase() === 'favorites');
        if (favoritesPlaylist && favoritesPlaylist.trackIds.length > 0) {
            favoriteTracks = favoritesPlaylist.trackIds.map(id => playerContext.libraryTracks.find(t => t.id === id)).filter(Boolean);
        }
    } catch (e) {
        console.error("Error loading favorites for home screen", e);
    }

    if (favoriteTracks.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:var(--text-color);">No favorites yet. Add some tracks to a "Favorites" playlist!</div>';
        return;
    }

    container.innerHTML = favoriteTracks.slice(0, 10).map(track => {
        return `
            <div class="album-square-card" data-track-id="${track.id}">
                <div class="album-img-wrapper">
                    <img src="${track.coverURL || 'assets/logo-00.png'}" alt="${track.title}" loading="lazy">
                </div>
                <span class="card-title-text">${truncate(track.title, 40)}</span>
                <span class="card-subtitle-text">${truncate(track.artist || 'Unknown', 20)}</span>
            </div>
        `;
    }).join('');

    // Attach simple click to play for these square cards
    container.querySelectorAll('.album-square-card').forEach(card => {
        card.addEventListener('click', () => {
            if (startPlaybackFn) startPlaybackFn([card.dataset.trackId]);
        });
    });
}

export function renderFavoritesGrid() {
    const container = document.getElementById('favorites-grid');
    if (!container) return;

    let favoriteTracks = [];
    try {
        const storedPlaylists = JSON.parse(localStorage.getItem('genesis_playlists') || '{}');
        const favoritesPlaylist = Object.values(storedPlaylists).find(p => p.name.toLowerCase() === 'favorites');
        if (favoritesPlaylist && favoritesPlaylist.trackIds.length > 0) {
            favoriteTracks = favoritesPlaylist.trackIds.map(id => playerContext.libraryTracks.find(t => t.id === id)).filter(Boolean);
        }
    } catch (e) {
        console.error("Error loading favorites grid", e);
    }

    if (favoriteTracks.length === 0) {
        container.innerHTML = '<div class="empty-state">No favorites yet. Add some tracks to a "Favorites" playlist!</div>';
        return;
    }

    container.innerHTML = favoriteTracks.map(track => createCardHTML(track)).join('');
    attachGridListeners(container);
}

export function renderLibraryGrid() {
    const libraryGrid = document.getElementById('library-grid');
    if (!libraryGrid) return;

    const isListView = libraryGrid.classList.contains('list-view');
    const sortedTracks = [...playerContext.libraryTracks].sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    if (sortedTracks.length === 0) {
        libraryGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Your library is empty. Open some files to get started.</div>`;
        return;
    }

    if (isListView) {
        // Render List View (Rows)
        libraryGrid.innerHTML = `
            <div class="track-list-header">
                <span class="status-icon-header"><input type="checkbox" id="select-all-library" title="Select All"></span>
                <span class="status-icon-header">#</span>
                <span>Title</span>
                <span>Artist</span>
                <span>Album</span>
                <span>Year</span>
                <span>Genre</span>
                <span style="text-align: right;">Duration</span>
            </div>
            <div id="library-list-rows"></div>
        `;

        const rowsContainer = document.getElementById('library-list-rows');
        renderDetailTrackList(sortedTracks.map(t => t.id), rowsContainer);

        // Handle select all
        setTimeout(() => {
            const selectAll = document.getElementById('select-all-library');
            if (selectAll) {
                selectAll.addEventListener('change', (e) => {
                    const checkboxes = rowsContainer.querySelectorAll('.track-select-checkbox');
                    checkboxes.forEach(cb => {
                        if (cb.checked !== e.target.checked) {
                            cb.checked = e.target.checked;
                            cb.dispatchEvent(new Event('change'));
                        }
                    });
                });
            }
        }, 0);
    } else {
        // Render Grid View (Cards)
        libraryGrid.innerHTML = sortedTracks.map(track => createCardHTML(track)).join('');
        attachGridListeners(libraryGrid);
    }
}

function createCardHTML(track) {
    const isCurrentlyPlaying = playerContext.currentTrack?.id === track.id;
    const playingClass = isCurrentlyPlaying ? 'currently-playing' : '';
    return `
        <div class="recent-media-card ${playingClass}" data-track-id="${track.id}" tabindex="0">
            <div class="album-art">
                ${track.coverURL ? `<img src="${track.coverURL}" alt="${track.title}">` : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`}
            </div>
            <div class="card-footer">
                <button class="control-btn small card-footer-play-btn" title="Play"><i class="fas fa-play"></i></button>
                <h5>${truncate(track.title || 'Unknown Title', 40)}</h5>
                <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
            </div>
        </div>
    `;
}

function attachGridListeners(container) {
    container.querySelectorAll('.recent-media-card').forEach(card => {
        const trackId = card.dataset.trackId;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.track-action-btn') || e.target.closest('.card-footer-play-btn')) return;
            if (startPlaybackFn) startPlaybackFn([trackId]);
        });
        card.querySelector('.card-footer-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (startPlaybackFn) startPlaybackFn([trackId]);
        });
        card.querySelector('.track-action-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (renderTrackContextMenuFn) renderTrackContextMenuFn(trackId, e.currentTarget, { isFromLibrary: true });
        });
    });
}

export async function getTrackDetailsFromId(id) {
    let track = playerContext.libraryTracks.find(t => t.id === id);
    if (track) return track;
    track = await db.tracks.get(id);
    return track || { title: 'Unknown Track', duration: 0 };
}

export function saveTrackChanges(trackId, updatedMetadata) {
    const track = playerContext.libraryTracks.find(t => t.id === trackId);
    if (!track) return;
    Object.assign(track, updatedMetadata);
    db.tracks.put(track);
}

export function toggleTrackSelection(trackId) {
    if (playerContext.selectedTrackIds.has(trackId)) {
        playerContext.selectedTrackIds.delete(trackId);
    } else {
        playerContext.selectedTrackIds.add(trackId);
    }
    updateSelectionBar();
    saveSelection();
}

function saveSelection() {
    localStorage.setItem('genesis_selected_track_ids', JSON.stringify([...playerContext.selectedTrackIds]));
}

export function restoreSelection() {
    const stored = localStorage.getItem('genesis_selected_track_ids');
    if (stored) {
        try {
            const ids = JSON.parse(stored);
            playerContext.selectedTrackIds = new Set(ids);
            updateSelectionBar();
        } catch (e) {
            console.error("Error restoring selection", e);
        }
    }
}

export function clearSelection() {
    playerContext.selectedTrackIds.clear();
    document.querySelectorAll('.track-select-checkbox:checked').forEach(cb => cb.checked = false);
    document.querySelectorAll('.track-list-row.selected').forEach(row => row.classList.remove('selected'));
    updateSelectionBar();
    saveSelection();
}

export async function renderDetailTrackList(tracksOrIds, container, options = {}) {
    if (!container) return;
    if (tracksOrIds.length === 0) {
        container.innerHTML = '<p style="padding: 20px;">No tracks found.</p>';
        return;
    }

    // Clear container before rendering (it was missing this clear, appending duplicates if called twice? openPlaylist removes innerHTML first so it's fine, but safer)
    container.innerHTML = '';

    const trackRows = await Promise.all(tracksOrIds.map(async (item, index) => {
        try {
            let trackData;
            let trackId;

            if (typeof item === 'object') {
                trackData = item;
                trackId = item.id;
            } else {
                trackId = item;
                trackData = await getTrackDetailsFromId(trackId);
            }

            const row = document.createElement('div');
            const isCurrentlyPlaying = playerContext.currentTrack?.id === trackId;
            const isSelected = playerContext.selectedTrackIds.has(trackId);
            const playingClass = isCurrentlyPlaying ? 'currently-playing' : '';
            const selectedClass = isSelected ? 'selected' : '';

            row.className = `track-list-row ${playingClass} ${selectedClass}`;
            row.dataset.id = trackId;

            row.innerHTML = `
                <div class="status-icon">
                    <input type="checkbox" class="track-select-checkbox" data-id="${trackId}" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="status-icon">
                    <button class="row-play-btn"><i class="fas fa-play"></i></button>
                    <div class="playing-bars">
                        <div class="bar bar1"></div>
                        <div class="bar bar2"></div>
                        <div class="bar bar3"></div>
                    </div>
                    <i class="fas fa-music row-index"></i>
                </div>
                <div class="track-title-col">
                    <span class="track-title">${truncate(trackData.title || 'Unknown Title', 40)}</span>
                </div>
                <div class="track-artist-col">
                    <span class="track-artist">${truncate(trackData.artist || 'Unknown Artist', 20)}</span>
                </div>
                <span class="track-album">${truncate(trackData.album || 'Unknown album', 20)}</span>
                <span class="track-year">${trackData.year || ''}</span>
                <span class="track-genre">${truncate(trackData.genre || 'Unknown genre', 20)}</span>
                <span class="track-duration">${formatTime(trackData.duration)}</span>
            `;

            row.addEventListener('click', e => {
                if (e.target.type === 'checkbox') return;
                // Pass the object if possible to ensure playback can start even if not in library
                if (startPlaybackFn) startPlaybackFn([typeof item === 'object' ? item : trackId]);
            });
            row.querySelector('.track-select-checkbox').addEventListener('change', (e) => {
                toggleTrackSelection(trackId);
                e.currentTarget.closest('.track-list-row').classList.toggle('selected', e.currentTarget.checked);
            });

            return row;
        } catch (error) {
            console.error("Error fetching track for detail view:", error);
            return null;
        }
    }));

    container.innerHTML = '';
    trackRows.filter(Boolean).forEach(row => container.appendChild(row));
    updateSelectionBar();
}

// Generic Full-Screen Grid Modal
export function openSectionModal(type) {
    let title = '';
    let items = [];
    let renderFn = null;

    const tracks = playerContext.libraryTracks;

    // Helper to filter by 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentTracks = tracks.filter(t => t.dateAdded && t.dateAdded > thirtyDaysAgo);

    switch (type) {
        case 'artists':
            title = 'All Artists';
            items = [...new Set(tracks.map(t => t.artist).filter(Boolean))].sort();
            renderFn = (artist) => {
                const track = tracks.find(t => t.artist === artist && t.coverURL);
                const imgUrl = track ? track.coverURL : 'assets/logo-00.png';
                return `
                    <div class="artist-circle-card" data-artist="${artist}">
                        <div class="artist-img-container"><img src="${imgUrl}" loading="lazy"></div>
                        <span class="artist-name">${truncate(artist, 20)}</span>
                    </div>`;
            };
            break;
        case 'albums':
            title = 'All Albums';
            const albums = [];
            const seen = new Set();
            tracks.forEach(t => {
                if (t.album && !seen.has(t.album)) { seen.add(t.album); albums.push(t); }
            });
            items = albums.sort((a, b) => a.album.localeCompare(b.album));
            renderFn = (track) => `
                <div class="album-square-card" data-album="${track.album}" data-artist="${track.artist}">
                    <div class="album-img-wrapper"><img src="${track.coverURL || 'assets/logo-00.png'}" loading="lazy"></div>
                    <span class="card-title-text">${truncate(track.album, 20)}</span>
                    <span class="card-subtitle-text">${truncate(track.artist || '', 20)}</span>
                </div>`;
            break;
    }

    if (!renderFn) return;

    // Create or Get Modal
    let modal = document.getElementById('generic-grid-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'generic-grid-modal';
        modal.className = 'main-section hidden';
        Object.assign(modal.style, {
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            zIndex: '460', backgroundColor: 'var(--surface-color)', display: 'flex', flexDirection: 'column',
            overflowY: 'auto'
        });
        document.querySelector('.main-content').appendChild(modal);
    }

    modal.innerHTML = `
        <div class="section-header" style="padding: 20px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display:flex; align-items:center;">
                 <button id="grid-modal-back-btn" class="btn-secondary" style="margin-right: 15px;"><i class="fas fa-arrow-left"></i></button>
                 <h2>${title}</h2>
            </div>
        </div>
        <div class="grid-modal-content" style="padding: 0 20px 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 20px;">
            ${items.map(renderFn).join('')}
        </div>
    `;

    modal.classList.remove('hidden');

    modal.querySelector('#grid-modal-back-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.querySelector('.grid-modal-content').addEventListener('click', (e) => {
        const artistCard = e.target.closest('.artist-circle-card');
        const albumCard = e.target.closest('.album-square-card');

        if (artistCard) {
            import('./artist-manager.js').then(m => m.openArtistByName(artistCard.dataset.artist));
            modal.classList.add('hidden');
        } else if (albumCard) {
            import('./album-manager.js').then(m => m.openAlbum(albumCard.dataset.album, albumCard.dataset.artist));
            modal.classList.add('hidden');
        }
    });
}

