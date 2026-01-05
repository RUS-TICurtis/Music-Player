import { playerContext } from './state.js';
import { formatTime } from './utils.js';
import { startPlayback, loadTrack, removeFromQueue } from './playback-manager.js';
import { renderQueueTable } from './queue-manager.js';
import { handleRemoveTrack } from './library-manager.js';
import { removeTrackFromPlaylist, openAddToPlaylistModal, refresh } from './playlist-manager.js';
import { showMessage, showConfirmation } from './ui-manager.js';

let openContextMenu = null;

// Helper to close any open menu
export function closeContextMenu() {
    if (openContextMenu) {
        openContextMenu.remove();
        openContextMenu = null;
    }
}

// Allow others to register the active menu (e.g. playlist manager)
export function setActiveContextMenu(menu) {
    if (openContextMenu && openContextMenu !== menu) {
        openContextMenu.remove();
    }
    openContextMenu = menu;
}

export function renderTrackContextMenu(trackId, buttonElement, options = {}) {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const track = playerContext.libraryTracks.find(t => t.id === trackId);
    if (!track) return;

    const menuItems = [];
    menuItems.push({ action: 'play', icon: 'fas fa-play', text: 'Play Song' });
    menuItems.push({ action: 'play-next', icon: 'fas fa-step-forward', text: 'Play Next' });
    if (options.isFromLibrary) menuItems.push({ action: 'add-to-queue', icon: 'fas fa-list-ol', text: 'Add to Play Queue' });
    if (options.isFromPlaylist) menuItems.push({ action: 'remove-from-playlist', icon: 'fas fa-minus-circle', text: 'Remove from this Playlist' });
    if (options.isFromQueue) menuItems.push({ action: 'remove-from-queue', icon: 'fas fa-times', text: 'Remove from Queue' });
    if (options.isFromLibrary) menuItems.push({ action: 'remove-from-library', icon: 'fas fa-trash', text: 'Remove from Library' });

    menuItems.push({ type: 'separator' });
    // menuItems.push({ action: 'edit-info', icon: 'fas fa-edit', text: 'Edit Info' }); // Needs edit modal logic
    menuItems.push({ action: 'properties', icon: 'fas fa-info-circle', text: 'Properties' });
    menuItems.push({ action: 'add-to-playlist', icon: 'fas fa-plus', text: 'Add to Playlist' });

    menuItems.forEach(item => {
        if (item.type === 'separator') {
            menu.appendChild(document.createElement('hr'));
            return;
        }

        const itemEl = document.createElement('div');
        itemEl.className = 'context-menu-item';
        itemEl.innerHTML = `<i class="${item.icon}"></i> <span>${item.text}</span>`;

        if (item.action === 'add-to-playlist') {
            itemEl.addEventListener('click', () => {
                openAddToPlaylistModal([trackId]);
                closeContextMenu();
            });
        } else {
            itemEl.addEventListener('click', () => {
                handleContextMenuAction(item.action, trackId, options, track); // Pass track object too
                closeContextMenu();
            });
        }
        menu.appendChild(itemEl);
    });

    document.body.appendChild(menu);

    const rect = buttonElement.getBoundingClientRect();
    const menuHeight = 200; // specific height approx
    const menuWidth = 200;

    // Better positioning logic
    // We append first to measure? For now use approx or just rect logic
    // In script.js it used strict logic. copying logic:
    // Actually we can't measure it until rendered. 
    // We'll use the script.js logic assuming standard size or update style after.

    let top = rect.bottom + window.scrollY;
    let left = rect.left + window.scrollX;

    // Use viewport checks
    if (rect.bottom + menuHeight > window.innerHeight) top = rect.top + window.scrollY - menuHeight;
    // ... simpler logic for now

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    setTimeout(() => {
        menu.classList.add('active');
        openContextMenu = menu;
    }, 10);
}

async function handleContextMenuAction(action, trackId, options, track) {
    // Re-find track to be sure
    const currentTrack = playerContext.libraryTracks.find(t => t.id === trackId) || track;

    switch (action) {
        case 'play':
            startPlayback([trackId]);
            break;
        case 'play-next':
            if (!currentTrack) return;
            if (playerContext.currentTrackIndex === -1) {
                playerContext.trackQueue.unshift(currentTrack);
                loadTrack(0);
            } else {
                playerContext.trackQueue.splice(playerContext.currentTrackIndex + 1, 0, currentTrack);
            }
            renderQueueTable();
            // showMessage(`"${currentTrack.title}" will play next.`);
            break;
        case 'add-to-queue':
            if (!currentTrack) return;
            playerContext.trackQueue.push(currentTrack);
            if (playerContext.currentTrackIndex === -1) loadTrack(playerContext.trackQueue.length - 1);
            renderQueueTable();
            // showMessage(`Added "${currentTrack.title}" to queue.`);
            break;
        case 'remove-from-library':
            // Logic handled in library-manager? Yes: handleRemoveTrack
            const confirmed = await showConfirmation(
                'Remove Track',
                `Are you sure you want to permanently remove "<strong>${currentTrack.title}</strong>" from your library?`
            );
            if (confirmed) {
                await handleRemoveTrack(trackId);
                // showMessage(`Removed track.`);
            }
            break;
        case 'remove-from-queue':
            const queueIndex = playerContext.trackQueue.findIndex(t => t.id === trackId);
            if (queueIndex > -1) {
                removeFromQueue(queueIndex); // This is from playback manager
            }
            break;
        case 'remove-from-playlist':
            if (options.playlistId) {
                if (removeTrackFromPlaylist(options.playlistId, trackId)) {
                    refresh(options.playlistId);
                    // showMessage(`Removed track from playlist.`);
                }
            }
            break;
        case 'properties':
            showMessage(`<b>${currentTrack.title}</b><br>Artist: ${currentTrack.artist || 'N/A'}<br>Album: ${currentTrack.album || 'N/A'}<br>Duration: ${formatTime(currentTrack.duration)}`);
            break;
        // case 'edit-info': openEditModal(track); break;
    }
}
