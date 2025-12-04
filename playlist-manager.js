// c:/Users/Curtis/Documents/#JavaScript/Music-Player - Copy/playlist-manager.js

const PLAYLISTS_KEY = 'genesis_playlists';
let playlists = {};

// Module-level variables to hold dependencies
let config = {
    // DOM elements
    playlistsListContainer: null,
    playlistDetailView: null,
    playlistsList: null,
    sidebarPlaylistsContainer: null,
    createPlaylistBtn: null,
    // Data Access
    getLibraryTracks: () => [],
    // Callbacks
    loadTrack: () => {},
    showMessage: () => {}, // Add showMessage
    renderTrackContextMenu: () => {},
    getTrackDetailsFromId: () => Promise.reject(),
    startPlayback: () => {},
    renderDetailTrackList: () => {}, // Add renderDetailTrackList
    showConfirmation: () => Promise.resolve(false) // Add showConfirmation
};

let openContextMenu = null; // Context menu is local to this manager now

function loadPlaylists() {
    try {
        const stored = localStorage.getItem(PLAYLISTS_KEY);
        playlists = stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error('Error loading playlists:', e);
        playlists = {};
    }
}

function savePlaylists() {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

function createPlaylist(name, doRender = true) {
    if (!name || name.trim().length === 0) {
        config.showMessage('Playlist name cannot be empty.');
        return null;
    }
    const id = Date.now().toString();
    playlists[id] = {
        id,
        name: name.trim(),
        trackIds: []
    };
    savePlaylists();
    if (doRender) renderPlaylists();
    return id;
}

async function deletePlaylist(id) {
    const confirmed = await config.showConfirmation(
        'Delete Playlist',
        `Are you sure you want to permanently delete the playlist "<strong>${playlists[id].name}</strong>"?`
    );
    if (confirmed) {
        delete playlists[id];
        savePlaylists();
        renderPlaylists();
        // If the detailed view of the deleted playlist was open, go back to the list
        if (!config.playlistDetailView.classList.contains('hidden')) openPlaylistView(null);
    }
}

function editPlaylist(id) {
    const playlist = playlists[id];
    const newName = prompt('Enter new playlist name:', playlist.name);
    if (newName && newName.trim().length > 0) {
        playlist.name = newName.trim();
        savePlaylists();
        renderPlaylists();
    }
}

function renderSidebarPlaylists() {
    const playlistIds = Object.keys(playlists);

    if (playlistIds.length === 0) {
        config.sidebarPlaylistsContainer.innerHTML = '<div style="padding: 10px 15px; color: #999; font-size: 12px;">No playlists yet</div>';
        return;
    }

    config.sidebarPlaylistsContainer.innerHTML = playlistIds.map(id => {
        const playlist = playlists[id];
        return `
            <div class="sidebar-playlist-item" data-id="${id}">
                <i class="fas fa-list-ul"></i>
                <span>${playlist.name}</span>
            </div>
        `;
    }).join('');

    config.sidebarPlaylistsContainer.querySelectorAll('.sidebar-playlist-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            openPlaylistView(id);
            config.sidebarPlaylistsContainer.querySelectorAll('.sidebar-playlist-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function renderPlaylists() {
    const playlistIds = Object.keys(playlists);

    if (playlistIds.length === 0) {
        config.playlistsList.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-compact-disc" style="font-size: 48px; color: #ddd; margin-bottom: 10px;"></i>
                <p>No playlists yet. Create one to get started!</p>
            </div>
        `;
    } else {
        config.playlistsList.innerHTML = playlistIds.map(id => {
            const playlist = playlists[id];
            const trackCount = playlist.trackIds.length;
            return `
                <div class="playlist-card" data-id="${id}">
                    <div class="playlist-card-icon"><i class="fas fa-list-ul"></i></div>
                    <div class="playlist-card-name">${playlist.name}</div>
                    <div class="playlist-card-count">${trackCount} track${trackCount !== 1 ? 's' : ''}</div>
                    <button class="control-btn small playlist-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                </div>
            `;
        }).join('');
    }

    config.playlistsList.querySelectorAll('.playlist-card').forEach(card => {
        const id = card.dataset.id;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.playlist-action-btn')) return;
            openPlaylistView(id);
        });

        const actionBtn = card.querySelector('.playlist-action-btn');
        if (actionBtn) {
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                renderPlaylistContextMenu(id, actionBtn);
            });
        }
    });

    renderSidebarPlaylists();
}

function closeContextMenu() {
    if (openContextMenu) {
        openContextMenu.remove();
        openContextMenu = null;
    }
}

function renderPlaylistContextMenu(playlistId, buttonElement) {
    closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    const menuItems = [
        { action: 'edit', icon: 'fas fa-edit', text: 'Edit Playlist' },
        { action: 'delete', icon: 'fas fa-trash', text: 'Delete Playlist' }
    ];
    menuItems.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'context-menu-item';
        itemEl.innerHTML = `<i class="${item.icon}"></i> <span>${item.text}</span>`;
        itemEl.addEventListener('click', () => {
            if (item.action === 'edit') editPlaylist(playlistId);
            else if (item.action === 'delete') deletePlaylist(playlistId);
            closeContextMenu();
        });
        menu.appendChild(itemEl);
    });

    const card = buttonElement.closest('.playlist-card');
    card.appendChild(menu);
    setTimeout(() => {
        menu.classList.add('active');
        openContextMenu = menu;
    }, 10);

    // Add a global click listener to close this specific menu
    const closeListener = (event) => {
        if (openContextMenu && !openContextMenu.contains(event.target) && !event.target.closest('.playlist-action-btn')) {
            closeContextMenu();
            document.removeEventListener('click', closeListener);
        }
    };
    document.addEventListener('click', closeListener);
}

async function openPlaylistView(id) {
    // If id is null, it means we are going back to the main list view
    if (!id) {
        config.playlistDetailView.classList.add('hidden');
        config.playlistsList.classList.remove('hidden');
        return;
    }
    const playlist = playlists[id];
    config.playlistsList.classList.add('hidden'); // Hide just the list of cards
    config.playlistDetailView.classList.remove('hidden'); // Show the detail view
    config.playlistDetailView.innerHTML = ''; // Clear previous content

    const headerHTML = `
        <div class="playlist-detail-header">
            <button id="playlist-detail-back-btn" class="btn-secondary" style="padding: 10px 15px;"><i class="fas fa-arrow-left"></i> Back</button>
            <div class="playlist-info">
                <h2 style="font-size: 28px; color: var(--dark-color); margin: 0;">${playlist.name}</h2>
                <p style="color: var(--text-color); margin: 0;">${playlist.trackIds.length} track${playlist.trackIds.length !== 1 ? 's' : ''}</p>
            </div>
            <div class="playlist-actions" style="margin-left: auto;">
                <button id="playlist-play-all-btn" class="btn-primary"><i class="fas fa-play"></i> Play All</button>
            </div>
        </div>
        <div class="track-list-header">
            <input type="checkbox" class="select-all-checkbox" title="Select all tracks"><span>#</span><span>Title</span><span>Artist</span><span>Duration</span><span title="Actions"></span>
        </div>
        <div id="playlist-track-list"></div>
    `;
    config.playlistDetailView.innerHTML = headerHTML;

    // Add event listener to the back button AFTER it's in the DOM
    const backButton = document.getElementById('playlist-detail-back-btn');
    if (backButton) {
        backButton.addEventListener('click', () => {
            config.playlistDetailView.classList.add('hidden'); // Hide the detail view
            config.playlistsList.classList.remove('hidden'); // Show the list of cards again
        });
    }

    // Add event listener for the "Play All" button
    const playAllButton = document.getElementById('playlist-play-all-btn');
    if (playAllButton) {
        playAllButton.addEventListener('click', () => {
            if (playlist.trackIds.length > 0) {
                config.startPlayback(playlist.trackIds, 0);
                config.showMessage(`Playing all tracks from "${playlist.name}".`);
            }
        });
    }

    const trackListContainer = document.getElementById('playlist-track-list');
    config.renderDetailTrackList(playlist.trackIds, trackListContainer, { isFromPlaylist: true, playlistId: id });
}

// --- Public API ---

/**
 * Adds a track to a specific playlist.
 * @param {string} playlistId - The ID of the playlist.
 * @param {string} trackId - The ID of the track to add.
 * @returns {boolean} - True if the track was added, false otherwise.
 */
export function addTrackToPlaylist(playlistId, trackId) {
    if (!playlists[playlistId]) return false;
    // Check if the track is already in the playlist
    if (playlists[playlistId].trackIds.includes(trackId)) {
        return false; // Indicate that the track was not added because it's a duplicate
    }
    playlists[playlistId].trackIds.push(trackId);
    savePlaylists();
    return true;
}

/**
 * Removes a track from a specific playlist.
 * @param {string} playlistId - The ID of the playlist.
 * @param {string} trackId - The ID of the track to remove.
 * @returns {boolean} - True if the track was removed, false otherwise.
 */
export function removeTrackFromPlaylist(playlistId, trackId) {
    if (!playlists[playlistId]) return false;
    const initialLength = playlists[playlistId].trackIds.length;
    playlists[playlistId].trackIds = playlists[playlistId].trackIds.filter(id => id !== trackId);
    if (playlists[playlistId].trackIds.length < initialLength) {
        savePlaylists();
        return true;
    }
    return false;
}

/**
 * Returns the current playlists object.
 * @returns {object} - The playlists object.
 */
export function getPlaylists() {
    return playlists;
}

/**
 * Refreshes the main playlist view and the playlist detail view if it's open.
 * @param {string} [playlistId] - Optional ID of a specific playlist to refresh.
 */
export function refresh(playlistId) {
    renderPlaylists(); // Always refresh the main and sidebar lists
    if (playlistId && !config.playlistDetailView.classList.contains('hidden')) {
        const trackListContainer = document.getElementById('playlist-track-list');
        if (trackListContainer) openPlaylistView(playlistId); // Re-render the view
    }
}

/**
 * Initializes the playlist manager with necessary dependencies.
 * @param {object} dependencies - The dependencies from the main script.
 */
export function init(dependencies) {
    // Merge provided dependencies with defaults
    config = { ...config, ...dependencies };

    loadPlaylists();
    renderPlaylists();

    if (config.createPlaylistBtn) {
        config.createPlaylistBtn.addEventListener('click', () => {
            const name = prompt('Enter playlist name:');
            if (name) createPlaylist(name, true);
        });
    }
}