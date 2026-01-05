import { showMessage, showConfirmation, showInputModal, switchSection } from './ui-manager.js';
import { renderDetailTrackList, clearSelection } from './library-manager.js';

let playlists = {};
const PLAYLISTS_KEY = 'genesis_playlists';

// Dependencies
let startPlaybackFn = null;
let closeContextMenuFn = null; // We need this from UI manager ideally

export function setPlaylistDependencies(startPlayback, closeContextMenu) {
    startPlaybackFn = startPlayback;
    closeContextMenuFn = closeContextMenu;
}

export function loadPlaylists() {
    try {
        const stored = localStorage.getItem(PLAYLISTS_KEY);
        playlists = stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error('Error loading playlists:', e);
        playlists = {};
    }
}

export function savePlaylists() {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

export function getPlaylists() {
    return playlists;
}

export function createPlaylist(name, doRender = true) {
    if (!name || name.trim().length === 0) {
        showMessage('Playlist name cannot be empty.');
        return null;
    }
    const id = Date.now().toString();
    playlists[id] = { id, name: name.trim(), trackIds: [] };
    savePlaylists();
    if (doRender) renderPlaylists();
    return id;
}

export async function deletePlaylist(id) {
    const confirmed = await showConfirmation(
        'Delete Playlist',
        `Are you sure you want to permanently delete the playlist "<strong>${playlists[id].name}</strong>"?`
    );
    if (confirmed) {
        delete playlists[id];
        savePlaylists();
        renderPlaylists();
        const playlistDetailView = document.getElementById('playlist-detail-view');
        if (!playlistDetailView.classList.contains('hidden')) openPlaylistView(null);
    }
}

export async function editPlaylist(id) {
    const playlist = playlists[id];
    const newName = await showInputModal('Edit Playlist', 'New Playlist Name:', playlist.name, 'Enter name...');
    if (newName && newName.trim().length > 0) {
        playlist.name = newName.trim();
        savePlaylists();
        renderPlaylists();
    }
}

function getPlaylistArtHTML(playlist) {
    const trackIds = playlist.trackIds || [];
    const tracksWithArt = [];

    // Find up to 4 tracks with unique artwork
    const seenArt = new Set();
    for (const id of trackIds) {
        const track = playerContext.libraryTracks.find(t => t.id === id);
        if (track && track.coverURL && !seenArt.has(track.coverURL)) {
            tracksWithArt.push(track);
            seenArt.add(track.coverURL);
            if (tracksWithArt.length === 4) break;
        }
    }

    if (tracksWithArt.length === 0) {
        return `<div class="playlist-card-art placeholder"><i class="fas fa-list-ul"></i></div>`;
    }

    if (tracksWithArt.length < 4) {
        // Single image (or less than 4 unique)
        return `<div class="playlist-card-art single"><img src="${tracksWithArt[0].coverURL}" alt="${playlist.name}"></div>`;
    } else {
        // 2x2 Grid
        return `
            <div class="playlist-card-art grid">
                ${tracksWithArt.map(t => `<img src="${t.coverURL}" alt="">`).join('')}
            </div>
        `;
    }
}

export function renderPlaylists() {
    const playlistsList = document.getElementById('playlists-list');
    const playlistIds = Object.keys(playlists);

    if (playlistIds.length === 0) {
        playlistsList.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><i class="fas fa-compact-disc" style="font-size: 48px; color: #ddd; margin-bottom: 10px;"></i><p>No playlists yet. Create one to get started!</p></div>`;
    } else {
        playlistsList.innerHTML = playlistIds.map(id => {
            const playlist = playlists[id];
            const trackCount = playlist.trackIds.length;
            const artHTML = getPlaylistArtHTML(playlist);
            return `
                <div class="playlist-card" data-id="${id}">
                    ${artHTML}
                    <div class="playlist-card-name">${playlist.name}</div>
                    <div class="playlist-card-count">${trackCount} track${trackCount !== 1 ? 's' : ''}</div>
                    <button class="control-btn small playlist-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                </div>`;
        }).join('');
    }

    playlistsList.querySelectorAll('.playlist-card').forEach(card => {
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

function renderSidebarPlaylists() {
    const sidebarPlaylistsContainer = document.getElementById('sidebar-playlists');
    const playlistIds = Object.keys(playlists);

    if (playlistIds.length === 0) {
        sidebarPlaylistsContainer.innerHTML = '<div style="padding: 10px 15px; color: #999; font-size: 12px;">No playlists yet</div>';
        return;
    }

    sidebarPlaylistsContainer.innerHTML = playlistIds.map(id => {
        const playlist = playlists[id];
        return `<div class="sidebar-playlist-item" data-id="${id}"><i class="fas fa-list-ul"></i><span>${playlist.name}</span></div>`;
    }).join('');

    sidebarPlaylistsContainer.querySelectorAll('.sidebar-playlist-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            openPlaylistView(id);
            sidebarPlaylistsContainer.querySelectorAll('.sidebar-playlist-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

export function openPlaylistView(idOrObj) {
    const playlistsList = document.getElementById('playlists-list');
    const playlistDetailView = document.getElementById('playlist-detail-view');

    if (!idOrObj) {
        playlistDetailView.classList.add('hidden');
        document.getElementById('playlists-section').classList.remove('hidden');
        playlistsList.classList.remove('hidden');
        return;
    }

    let playlist;
    if (typeof idOrObj === 'object') {
        playlist = idOrObj;
        // Ensure trackIds exist if only tracks are provided
        if (!playlist.trackIds && playlist.tracks) {
            // We might need to handle the case where tracks aren't in library
            // For now, map IDs
            playlist.trackIds = playlist.tracks.map(t => t.id);
            // Hack: Push these tracks to a temporary context check or rely on renderDetailTrackList finding them?
            // If renderDetailTrackList looks in library/discover, and these are new objects (History), it will fail.
            // We'll handle this by passing the tracks directly to renderDetailTrackList if we update it, 
            // OR we just assume they are in library for LastAdded/MostPlayed.
            // For History, they might not be.
            // For DiscoverMix, they are in discoverTracks (set in context).

            // NOTE: I will update renderDetailTrackList signature in library-manager next to accept tracks array.
        }
    } else {
        playlist = playlists[idOrObj];
    }

    // Hide Playlists Section (parent)
    document.getElementById('playlists-section').classList.add('hidden');

    // Show Detail
    playlistDetailView.classList.remove('hidden');
    playlistDetailView.innerHTML = '';

    const headerHTML = `<div class="playlist-detail-header"><button id="playlist-detail-back-btn" class="btn-secondary" style="padding: 10px 15px;"><i class="fas fa-arrow-left"></i> Back</button><div class="playlist-info"><h2 style="font-size: 28px; color: var(--dark-color); margin: 0;">${playlist.name}</h2><p style="color: var(--text-color); margin: 0;">${playlist.description || (playlist.trackIds.length + ' tracks')}</p></div><div class="playlist-actions" style="margin-left: auto;"><button id="playlist-play-all-btn" class="btn-primary"><i class="fas fa-play"></i> Play All</button></div></div><div class="track-list-header"><input type="checkbox" class="select-all-checkbox" title="Select all tracks"><span>#</span><span>Title</span><span>Artist</span><span>Duration</span><span title="Actions"></span></div><div id="playlist-track-list"></div>`;
    playlistDetailView.innerHTML = headerHTML;

    document.getElementById('playlist-detail-back-btn').addEventListener('click', () => {
        playlistDetailView.classList.add('hidden');
        if (playlist.isSystem || playlist.isVirtual) {
            // Go back to Home if it was a system playlist from home
            switchSection('home-section');
        } else {
            document.getElementById('playlists-section').classList.remove('hidden');
            playlistsList.classList.remove('hidden');
        }
    });

    document.getElementById('playlist-play-all-btn').addEventListener('click', () => {
        const tracksToPlay = playlist.tracks ? playlist.tracks.map(t => t.id) : playlist.trackIds;
        // If we have track objects that aren't in library, startPlayback might fail if it tries to lookup ID.
        // I should also update startPlayback to accept objects?
        // Or ensure these tracks are in a context.
        if (tracksToPlay.length > 0) {
            if (startPlaybackFn) startPlaybackFn(tracksToPlay, 0);
        }
    });

    const trackListContainer = document.getElementById('playlist-track-list');
    // Pass tracks if available, otherwise IDs
    renderDetailTrackList(
        playlist.tracks || playlist.trackIds,
        trackListContainer,
        { isFromPlaylist: true, playlistId: playlist.id, virtual: !!playlist.tracks }
    );

    switchSection('playlist-detail-view', playlist.id);
}

export function addTrackToPlaylist(playlistId, trackId) {
    if (!playlists[playlistId]) return false;
    if (playlists[playlistId].trackIds.includes(trackId)) return false;
    playlists[playlistId].trackIds.push(trackId);
    savePlaylists();
    return true;
}

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

export function refresh(playlistId) {
    renderPlaylists();
    if (playlistId) {
        const playlistDetailView = document.getElementById('playlist-detail-view');
        if (!playlistDetailView.classList.contains('hidden')) {
            openPlaylistView(playlistId);
        }
    }
}

function renderPlaylistContextMenu(playlistId, buttonElement) {
    if (closeContextMenuFn) closeContextMenuFn();
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
            if (closeContextMenuFn) closeContextMenuFn();
        });
        menu.appendChild(itemEl);
    });

    const card = buttonElement.closest('.playlist-card');
    card.appendChild(menu);
    setTimeout(() => {
        menu.classList.add('active');
        // We need to inform the UI manager about the open menu if we want global click-away to work
        // Ideally UI manager exposes a 'registerActiveMenu' function.
        // For now, we rely on the click-away listener in script.js or ui-manager.
        if (window.setActiveContextMenu) window.setActiveContextMenu(menu);
    }, 10);
}

// Add these exports for modals
export function openAddToPlaylistModal(trackIds) {
    if (!trackIds || trackIds.length === 0) return;

    const modal = document.getElementById('add-to-playlist-modal');
    const list = document.getElementById('playlist-selection-list');
    const cancelBtn = document.getElementById('playlist-modal-cancel-btn');
    const newBtn = document.getElementById('playlist-modal-new-btn');

    if (!modal || !list) return;

    const currentPlaylists = getPlaylists();
    list.innerHTML = Object.values(currentPlaylists).map(p => `
        <div class="playlist-selection-item" data-id="${p.id}">
            <i class="fas fa-list-ul"></i>
            <span>${p.name}</span>
        </div>
    `).join('');

    list.querySelectorAll('.playlist-selection-item').forEach(item => {
        item.addEventListener('click', () => {
            const playlistId = item.dataset.id;
            let addedCount = 0;
            trackIds.forEach(tid => {
                if (addTrackToPlaylist(playlistId, tid)) addedCount++;
            });
            // showMessage(`Added ${addedCount} track(s) to "${currentPlaylists[playlistId].name}".`);
            refresh(playlistId);
            modal.classList.add('hidden');
            clearSelection();
        });
    });

    // Replace buttons to clear old listeners
    if (newBtn) {
        const newBtnClone = newBtn.cloneNode(true);
        newBtn.parentNode.replaceChild(newBtnClone, newBtn);
        newBtnClone.onclick = async () => {
            const newName = await showInputModal('New Playlist', 'Enter playlist name:', '', 'My Awesome Playlist');
            if (newName && newName.trim()) {
                const newId = createPlaylist(newName.trim(), true);
                if (newId) {
                    trackIds.forEach(tid => addTrackToPlaylist(newId, tid));
                    // showMessage(`Created playlist "${newName.trim()}" and added ${trackIds.length} track(s).`);
                    refresh();
                    modal.classList.add('hidden');
                    clearSelection();
                }
            }
        };
    }

    if (cancelBtn) {
        const cancelBtnClone = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(cancelBtnClone, cancelBtn);
        cancelBtnClone.onclick = () => modal.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}
