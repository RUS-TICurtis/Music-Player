
// --- Dexie DB Definition (from db.js) ---
const db = new Dexie('genesisDB');
db.version(5).stores({
  tracks: `
    id,
    &[artist+album+title],
    title,
    artist,
    album,
    lyrics,
    audioBlob,
    coverBlob
  `
}).upgrade(tx => {
  // Migration logic for future versions can go here.
  // Dexie automatically handles adding new properties to existing objects.
});

// --- Shared Context & State ---
// This object will hold state and functions to be shared across the module scope
const playerContext = {
    libraryTracks: [],
    discoverTracks: [], // For tracks from APIs like Jamendo
    trackQueue: [],
    currentTrackIndex: -1,
    isPlaying: false,
    isShuffled: false,
    selectedTrackIds: new Set(),
    repeatState: 0, // 0: no-repeat, 1: repeat-all, 2: repeat-one
    dbInstance: db, // Use the Dexie instance
};

// --- Playback State (from playback-manager.js) ---
let repeatState = 0; // 0: no-repeat, 1: repeat-all, 2: repeat-one
let isShuffled = false;

// --- Playlist State (from playlist-manager.js) ---
const PLAYLISTS_KEY = 'genesis_playlists';
let playlists = {};
const PLAYBACK_STATE_KEY = 'genesis_playback_state';

document.addEventListener('DOMContentLoaded', function() {
    // --- DOM Elements ---
    const audioPlayer = document.getElementById('audio-player');
    const playBtn = document.getElementById('play-btn');
    const playIcon = document.getElementById('play-icon');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    const progressBarContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const progressHead = document.getElementById('progress-head');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeBtn = document.getElementById('volume-btn');
    const volumePopup = document.getElementById('volume-popup');
    const volumePercentage = document.getElementById('volume-percentage');
    const muteBtn = document.getElementById('mute-btn');
    const volumeIcon = document.getElementById('volume-icon');
    const songTitle = document.getElementById('song-title');
    const artistName = document.getElementById('artist-name');
    const queueList = document.getElementById('queue-list');
    const recentMediaGrid = document.getElementById('recent-media-grid');
    const discoverGrid = document.getElementById('discover-grid');
    const libraryGrid = document.getElementById('library-grid');
    const albumsContent = document.querySelector('#albums-section .albums-content');
    const albumsSection = document.getElementById('albums-section');
    const artistsContent = document.querySelector('#artists-section .artists-content');
    const playlistsListContainer = document.getElementById('playlists-section');
    const playlistsList = document.getElementById('playlists-list');
    const playlistDetailView = document.getElementById('playlist-detail-view');
    const menuItems = document.querySelectorAll('.menu-item');
    const bottomNavItems = document.querySelectorAll('.bottom-nav .nav-item');
    const mainSections = document.querySelectorAll('.main-section');
    const openMenuBtn = document.getElementById('open-menu-btn');
    const openMenuDropdown = document.getElementById('open-menu-dropdown');
    const openFilesOption = document.getElementById('open-files-option');
    const openFolderOption = document.getElementById('open-folder-option');
    const openUrlOption = document.getElementById('open-url-option');
    const fileInput = document.getElementById('file-input');
    const discoverSearchInput = document.getElementById('discover-search-input');
    const discoverSearchBtn = document.getElementById('discover-search-btn');
    const folderInput = document.getElementById('folder-input');
    const searchInput = document.getElementById('search-input');
    const profilePicInput = document.getElementById('profile-pic-input');
    const profilePic = document.getElementById('profile-pic');
    const urlModal = document.getElementById('url-modal');
    const urlInput = document.getElementById('url-input');
    const urlLoadBtn = document.getElementById('url-load-btn');
    const urlCancelBtn = document.getElementById('url-cancel-btn');
    const msgModal = document.getElementById('message-modal');
    const msgText = document.getElementById('modal-text');
    const msgCloseBtn = document.getElementById('msg-close-btn');
    const addToPlaylistModal = document.getElementById('add-to-playlist-modal');
    const playlistSelectionList = document.getElementById('playlist-selection-list');
    const playlistModalCancelBtn = document.getElementById('playlist-modal-cancel-btn');
    const playlistModalNewBtn = document.getElementById('playlist-modal-new-btn');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalText = document.getElementById('confirm-modal-text');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const editModal = document.getElementById('edit-modal');
    const editTrackIdInput = document.getElementById('edit-track-id');
    const editTitleInput = document.getElementById('edit-title-input');
    const editArtistInput = document.getElementById('edit-artist-input');
    const editAlbumInput = document.getElementById('edit-album-input');
    const editLyricsInput = document.getElementById('edit-lyrics-input');
    const editSaveBtn = document.getElementById('edit-save-btn');
    const editCancelBtn = document.getElementById('edit-cancel-btn');
    const albumDetailView = document.getElementById('album-detail-view');
    const artistDetailView = document.getElementById('artist-detail-view');
    const libraryGridViewBtn = document.getElementById('library-grid-view-btn');
    const libraryListViewBtn = document.getElementById('library-list-view-btn');
    const libraryPlayAllBtn = document.getElementById('library-play-all-btn');
    const selectionBar = document.getElementById('selection-action-bar');
    const selectionCount = document.getElementById('selection-count');
    const selectionAddToPlaylistBtn = document.getElementById('selection-add-to-playlist-btn');
    const selectionRemoveBtn = document.getElementById('selection-remove-btn');
    const selectionClearBtn = document.getElementById('selection-clear-btn');
    const mainContent = document.querySelector('.main-content');
    const extendedInfoPanel = document.getElementById('extended-info-panel');
    const closeExtendedPanelBtn = document.getElementById('close-extended-panel-btn');
    const playbackBarTrackInfo = document.getElementById('playback-bar-track-info');
    const extendedInfoArt = document.getElementById('extended-info-art');
    const extendedInfoTitle = document.getElementById('extended-info-title');
    const extendedInfoArtist = document.getElementById('extended-info-artist');
    const lyricsContainer = document.getElementById('lyrics-container');
    let currentLyricIndex = -1; // For tracking synchronized lyrics
    let openContextMenu = null; // To hold the currently open context menu element

    // Assign state arrays to the context
    let libraryTracks = playerContext.libraryTracks;
    let trackQueue = playerContext.trackQueue;
    let dbInstance = playerContext.dbInstance; // This is now the Dexie instance

    function isValidString(str) {
        if (!str || typeof str !== 'string' || str.trim() === '') {
            return false;
        }
        // Check for the Unicode Replacement Character, which often indicates decoding errors.
        if (str.includes('\uFFFD')) {
            return false;
        }
        return true;
    }

    function savePlaybackState() {
        if (playerContext.currentTrackIndex < 0 || !playerContext.trackQueue[playerContext.currentTrackIndex]) {
            localStorage.removeItem(PLAYBACK_STATE_KEY); // Clear state if no track is active
            return;
        }
        const state = {
            trackId: playerContext.trackQueue[playerContext.currentTrackIndex].id, // Save by ID for robustness
            currentTime: audioPlayer.currentTime,
            volume: audioPlayer.volume,
            isShuffled: playerContext.isShuffled,
            repeatState: playerContext.repeatState,
            // isPlaying is not saved, to prevent auto-play on refresh
        };
        localStorage.setItem(PLAYBACK_STATE_KEY, JSON.stringify(state));
    }

    async function restoreSession() {
        try {
            // Restore Library directly from Dexie
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
                playerContext.trackQueue = [...playerContext.libraryTracks]; // Default play queue to the full library
                renderHomeGrid(); // Render the library on home
                renderLibraryGrid(); // Also render the full library
                // We can load the first library track for display, but not play it.
                if (playerContext.libraryTracks.length > 0) {
                    // Try to restore playback state AFTER library is loaded
                    const savedState = localStorage.getItem(PLAYBACK_STATE_KEY);
                    if (savedState) {
                        const { trackId, currentTime, volume, isShuffled: savedShuffle, repeatState: savedRepeat } = JSON.parse(savedState);
                        const restoredIndex = playerContext.trackQueue.findIndex(t => t.id === trackId);

                        if (restoredIndex > -1) {
                            // Set the state without auto-playing
                            playerContext.currentTrackIndex = restoredIndex;
                            const track = playerContext.trackQueue[restoredIndex];
                            audioPlayer.src = track.objectURL;
                            
                            // Wait for metadata to load before setting currentTime
                            audioPlayer.onloadedmetadata = () => {
                                audioPlayer.currentTime = currentTime; // Set time after metadata loads
                                updateProgressBarUI(currentTime, audioPlayer.duration);
                                audioPlayer.onloadedmetadata = null; // Clean up listener
                            };

                            updatePlaybackBar(track);
                            renderQueueTable();

                            // Restore controls state
                            audioPlayer.volume = volume;
                            volumeSlider.value = volume;
                            playerContext.isShuffled = savedShuffle;
                            setShuffleState(playerContext.isShuffled);
                            setRepeatState(savedRepeat);
                            updateRepeatButtonUI();
                        }
                    } else {
                        // If no saved state, just show the first track
                        updatePlaybackBar(playerContext.libraryTracks[0]);
                    }
                }
            }
        } catch (e) {
            console.error("Error restoring session", e);
        }
        
        // Restore profile pic
        const savedPic = localStorage.getItem('genesis_profile_pic');
        if (savedPic && profilePic) profilePic.src = savedPic;
    }

    // --- Navigation & Theme (now handled by UI Manager) ---
    applyTheme(localStorage.getItem('genesis_theme') || 'light');
    menuItems.forEach(item => item.addEventListener('click', () => switchSection(item.dataset.target)));
    // Special handling for discover tab to fetch data on first click
    document.querySelector('.menu-item[data-target="discover-section"]')?.addEventListener('click', () => {
        if (playerContext.discoverTracks.length === 0) renderDiscoverGrid();
    });
    bottomNavItems.forEach(item => item.addEventListener('click', () => switchSection(item.dataset.target)));

    async function handleRemoveTrack(trackId, confirmed = false) {
        const index = playerContext.libraryTracks.findIndex(t => t.id === trackId);
        if (index === -1) return;
        
        const track = playerContext.libraryTracks[index];
        const isCurrentlyPlaying = playerContext.currentTrackIndex > -1 && playerContext.trackQueue[playerContext.currentTrackIndex]?.id === trackId;

        if (isCurrentlyPlaying) {
            audioPlayer.src = '';
            songTitle.textContent = "No Track Selected";
            artistName.textContent = "Load files to begin";
            // hide album art
            const artImg = document.getElementById('album-art-img');
            const placeholder = document.getElementById('album-art-placeholder');
            if (artImg) { artImg.src = ''; artImg.classList.add('hidden'); }
            if (placeholder) placeholder.classList.remove('hidden');
        }
        // Also remove from play queue if it exists there
        const queueIndex = playerContext.trackQueue.findIndex(t => t.id === trackId);
        if (queueIndex > -1) {
            playerContext.trackQueue.splice(queueIndex, 1);
            if (queueIndex < playerContext.currentTrackIndex) {
                    playerContext.currentTrackIndex--; // This is correct
            } else if (queueIndex === playerContext.currentTrackIndex) {
                // If it was the current track, stop playback and try to play next
                    pauseTrack();
                if (playerContext.trackQueue.length > 0) {
                    // Play the next available track
                        loadTrack(playerContext.currentTrackIndex % playerContext.trackQueue.length);
                } else {
                    playerContext.currentTrackIndex = -1;
                }
            }
        }

        await removeTrack(trackId);
        renderQueueTable();
    }

    function toggleTrackSelection(trackId) {
        if (playerContext.selectedTrackIds.has(trackId)) {
            playerContext.selectedTrackIds.delete(trackId);
        } else {
            playerContext.selectedTrackIds.add(trackId);
        }
        updateSelectionBar();
    }

    function clearSelection() {
        playerContext.selectedTrackIds.clear();
        document.querySelectorAll('.track-select-checkbox:checked').forEach(cb => cb.checked = false);
        document.querySelectorAll('.track-list-row.selected').forEach(row => row.classList.remove('selected'));
        document.querySelectorAll('.recent-media-card.selected').forEach(card => card.classList.remove('selected'));
        updateSelectionBar();
    }

    async function handleContextMenuAction(action, trackId, options) {
        const libraryIndex = playerContext.libraryTracks.findIndex(t => t.id === trackId);
        if (libraryIndex === -1) return;
        const track = playerContext.libraryTracks[libraryIndex];

        switch (action) {
            case 'play':
                startPlayback([trackId]);
                break;
            case 'play-next':
                // Find the track object from the library
                const trackToPlayNext = playerContext.libraryTracks.find(t => t.id === trackId);
                if (!trackToPlayNext) return;

                if (playerContext.currentTrackIndex === -1) {
                    // If nothing is playing, just start playing this track.
                    playerContext.trackQueue.unshift(trackToPlayNext);
                    loadTrack(0);
                } else {
                    playerContext.trackQueue.splice(playerContext.currentTrackIndex + 1, 0, trackToPlayNext);
                }
                renderQueueTable();
                showMessage(`"${trackToPlayNext.title}" will play next.`);
                break;
            case 'add-to-queue':
                // Find the track object from the library
                const trackToAdd = playerContext.libraryTracks.find(t => t.id === trackId);
                if (!trackToAdd) return;
                
                playerContext.trackQueue.push(trackToAdd);

                // If nothing is playing, load the first track in the queue.
                if (playerContext.currentTrackIndex === -1) loadTrack(playerContext.trackQueue.length - 1);
                renderQueueTable();
                showMessage(`Added "${trackToAdd.title}" to queue.`);
                break;
            case 'remove-from-library':
                handleRemoveTrack(trackId); // Confirmation is now inside handleRemoveTrack
                break;
            case 'remove-from-queue':
                const queueIndex = playerContext.trackQueue.findIndex(t => t.id === trackId);
                if (queueIndex > -1) {
                    playerContext.trackQueue.splice(queueIndex, 1);
                    if (queueIndex < playerContext.currentTrackIndex) playerContext.currentTrackIndex--;
                }
                renderQueueTable();
                break;
            case 'remove-from-playlist':
                if (options.playlistId) {
                    removeTrackFromPlaylist(options.playlistId, trackId);
                    refresh(options.playlistId); // Refresh the view
                    showMessage(`Removed track from playlist.`);
                }
                break;
            case 'properties':
                showMessage(`<b>${track.title}</b><br>Artist: ${track.artist || 'N/A'}<br>Album: ${track.album || 'N/A'}<br>Duration: ${formatTime(track.duration)}`);
                break;
            case 'edit-info':
                openEditModal(track);
                break;
        }
    }

    function saveTrackChanges() {
        const trackId = editTrackIdInput.value;
        const track = playerContext.libraryTracks.find(t => t.id === trackId);
        if (!track) return;

        const updatedMetadata = {
            title: editTitleInput.value.trim(),
            artist: editArtistInput.value.trim(),
            album: editAlbumInput.value.trim(),
            lyrics: editLyricsInput.value,
        };

        // Re-parse lyrics in case they were changed to LRC format
        const syncedLyrics = parseLRC(updatedMetadata.lyrics);

        // Update the track object in the main library
        Object.assign(track, updatedMetadata, { syncedLyrics });

        // Update the same track if it's in the play queue
        const queueTrack = playerContext.trackQueue.find(t => t.id === trackId);
        if (queueTrack) {
            // Ensure the queue track also gets all the new properties
            Object.assign(queueTrack, updatedMetadata, { syncedLyrics });
        }

        // Persist changes and update UI
        db.tracks.put(track); // Save changes to the database
        renderHomeGrid();
        renderLibraryGrid();
        renderQueueTable();
        if (playerContext.currentTrackIndex > -1 && playerContext.trackQueue[playerContext.currentTrackIndex].id === trackId) {
            updatePlaybackBar(track);
        }
        editModal.classList.add('hidden');
    }

    async function handleFiles(fileList, options = {}) {
        if (!fileList.length) return;

        const openMenuText = document.getElementById('open-menu-text');
        const originalText = openMenuText.textContent;
        openMenuBtn.disabled = true;
        if (!options.isFromDiscover) openMenuText.textContent = 'Processing...';

        const newTracksForMemory = [];
        try {
            const isAudioFile = (file) => {
                if (file.type.startsWith('audio/')) {
                    return true;
                }
                // Fallback check for files without a proper MIME type from the OS
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

            // Use a single transaction for batch processing for performance and atomicity
            await db.transaction('rw', db.tracks, async () => {
                for (const file of audioFiles) {
                    try {
                        const metadata = await extractMetadata(file);
                        if (metadata) {
                            const trackForDB = {
                                ...metadata,
                                audioBlob: file,
                                // coverBlob is already in metadata
                            };

                            // Use 'put' which will add or update based on the primary key.
                            // Because of our new compound index, this will prevent duplicates.
                            await db.tracks.put(trackForDB);

                            // Create a version for the in-memory library with usable object URLs
                            const trackForMemory = { ...trackForDB, objectURL: URL.createObjectURL(file) };
                            if (trackForMemory.coverBlob) {
                                trackForMemory.coverURL = URL.createObjectURL(trackForMemory.coverBlob);
                            }
                            newTracksForMemory.push(trackForMemory);
                        }
                    } catch (err) {
                        // Dexie's ConstraintError will be caught here if a duplicate is found
                        if (err.name === 'ConstraintError') {
                            console.warn(`Skipping duplicate track: ${file.name}`);
                        } else {
                            console.error(`Failed to process file: ${file.name}`, err);
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
                showMessage(message);
                renderHomeGrid();
                renderLibraryGrid();
                renderArtistsGrid();
                renderAlbumsGrid();
            } else {
                showMessage("No new valid audio files were added.");
            }
        } catch (error) {
            console.error("Error handling files:", error);
            showMessage("An unexpected error occurred while adding files.");
        } finally {
            openMenuBtn.disabled = false;
            openMenuText.textContent = originalText;
        }
    }

// =======================================================
    // --- MISSING FUNCTIONS FIX (Paste this into script.js) ---
    // =======================================================

    /**
     * Extracts metadata (title, artist, album, art) from an audio file.
     * Uses the 'music-metadata-browser' library included in your HTML.
     */
    async function extractMetadata(file) {
        let metadata = {
            id: file.name + '-' + file.lastModified, // Create a more stable but non-guaranteed ID
            title: file.name.replace(/\.[^/.]+$/, ""), // Default to filename without extension
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            lyrics: null,
            duration: 0,
            coverBlob: null
        };

        try {
            // Ensure the library is loaded
            if (window.musicMetadata) {
                const result = await window.musicMetadata.parseBlob(file);
                const { common, format } = result;

                if (common.title) metadata.title = common.title;
                if (common.artist) metadata.artist = common.artist;
                if (common.album) metadata.album = common.album;
                if (format.duration) metadata.duration = format.duration;
                if (common.lyrics) metadata.lyrics = common.lyrics.toString();

                // Extract Album Art
                if (common.picture && common.picture.length > 0) {
                    const picture = common.picture[0];
                    metadata.coverBlob = new Blob([picture.data], { type: picture.format });
                }
            }
        } catch (error) {
            console.error(`Metadata extraction failed for ${file.name}.`, error);
            return null; // Return null on critical failure to indicate an invalid file
        }

        return metadata;
    }

    /**
     * Renders the current play queue into the visual table.
     */
    function renderQueueTable() {
        if (!queueList) return;
        
        // Update the header count if you want (optional)
        const headerTitle = document.getElementById('queue-header-title');
        if(headerTitle) headerTitle.textContent = `Play Queue (${playerContext.trackQueue.length})`;

        if (playerContext.trackQueue.length === 0) {
            queueList.innerHTML = '<div class="empty-state">Queue is empty</div>';
            return;
        }

        queueList.innerHTML = playerContext.trackQueue.map((track, index) => {
            const isPlaying = index === playerContext.currentTrackIndex;
            const duration = formatTime(track.duration);
            const activeClass = isPlaying ? 'active' : '';
            
            // Handle Album Art display
            let imgTag = `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`;
            if (track.coverURL) {
                imgTag = `<img src="${track.coverURL}" alt="Art">`;
            }

            return `
            <div class="queue-item ${activeClass}" draggable="true" data-index="${index}">
                <div class="queue-item-art">${imgTag}</div>
                <div class="queue-item-details">
                    <span class="col-title" style="font-weight:600; ${isPlaying ? 'color:var(--primary-color);' : ''}">${track.title}</span>
                    <span class="col-artist" style="font-size:12px; color:var(--text-color);">${track.artist || 'Unknown'}</span>
                </div>
                <div class="col-duration">${duration}</div>
                <div class="col-actions">
                    <button class="control-btn small remove-queue-btn" title="Remove from Queue"><i class="fas fa-times"></i></button>
                </div>
            </div>
            `;
        }).join('');

        // Add Event Listeners for Queue Items (Click to Play & Remove)
        queueList.querySelectorAll('.queue-item').forEach(item => {
            const index = parseInt(item.dataset.index);
            
            item.addEventListener('click', (e) => {
                if (e.target.closest('.remove-queue-btn')) return; // Ignore if clicking remove
                loadTrack(index);
            });

            item.querySelector('.remove-queue-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                removeFromQueue(index);
            });
        });
        
        // Scroll active track into view
        const activeItem = queueList.querySelector('.queue-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function removeFromQueue(index) {
        playerContext.trackQueue.splice(index, 1);
        // Adjust current index if necessary
        if (index < playerContext.currentTrackIndex) {
            playerContext.currentTrackIndex--;
        } else if (index === playerContext.currentTrackIndex) {
            // If we removed the playing track, try to play the next one or stop
            if (playerContext.trackQueue.length > 0) {
                // Determine new index (ensure it doesn't overflow)
                let newIndex = index;
                if(newIndex >= playerContext.trackQueue.length) newIndex = 0;
                loadTrack(newIndex, false); // Don't auto play, just load
            } else {
                playerContext.currentTrackIndex = -1;
                updatePlaybackBar(null);
            }
        }
        renderQueueTable();
    }

    /**
     * Helper to get track data for Detailed Views (Playlists/Albums).
     */
    async function getTrackDetailsFromId(id) {
        // 1. Check Memory (fastest)
        let track = playerContext.libraryTracks.find(t => t.id === id);
        if (track) return track;

        // 2. Check Database (if not in current memory snapshot)
        track = await db.tracks.get(id);
        return track || { title: 'Unknown Track', duration: 0 };
    }

    /**
     * Remove a track permanently from DB and Library.
     */
    async function removeTrack(id) {
        // Remove from DB
        await db.tracks.delete(id);
        
        // Remove from Memory
        const index = playerContext.libraryTracks.findIndex(t => t.id === id);
        if (index > -1) {
            playerContext.libraryTracks.splice(index, 1);
        }

        // Clean up Playlists that might contain this track
        const playlistIds = Object.keys(playlists);
        let playlistsChanged = false;
        playlistIds.forEach(pId => {
            const p = playlists[pId];
            if (p.trackIds.includes(id)) {
                p.trackIds = p.trackIds.filter(tid => tid !== id);
                playlistsChanged = true;
            }
        });
        if (playlistsChanged) savePlaylists();

        // Refresh UIs
        renderHomeGrid();
        renderLibraryGrid();
        renderArtistsGrid();
        renderAlbumsGrid();
    }

    // =======================================================
    // --- END OF FIXES ---
    // =======================================================

    // --- Event Listeners ---
    openMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenuDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => openMenuDropdown.classList.add('hidden'));

    openFilesOption.addEventListener('click', () => fileInput.click());
    openFolderOption.addEventListener('click', () => folderInput.click());
    openUrlOption.addEventListener('click', () => {
        urlModal.classList.remove('hidden');
        urlInput.focus();
    });

    urlModal.addEventListener('click', (e) => {
        if (e.target === urlModal) { // Click on backdrop
            urlModal.classList.add('hidden');
        }
    });

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files, {}));
    folderInput.addEventListener('change', (e) => handleFiles(e.target.files, {}));

    urlCancelBtn.addEventListener('click', () => urlModal.classList.add('hidden'));
    urlLoadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        const newTrack = {
            id: Date.now().toString(), // URL tracks don't need persistent IDs
            name: url.split('/').pop() || "Stream",
            title: url.split('/').pop() || "Stream",
            duration: 0, 
            isURL: true,
            objectURL: url,
            coverURL: null
        };
        playerContext.libraryTracks.push(newTrack);
        // Note: URL tracks are not saved to the DB.
        renderHomeGrid(); // Update UI
        renderLibraryGrid();
        urlModal.classList.add('hidden');
        urlInput.value = '';
        // Do not auto-play
    });

    // --- Drag and Drop File Handling ---
    document.addEventListener('dragover', (e) => {
        e.preventDefault(); // Prevent default behavior (opening file in browser)
        e.stopPropagation();
        // Optional: Add a class to the body to show a visual indicator
        document.body.classList.add('dragover');
    });
    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.body.classList.remove('dragover');
    });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.body.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFiles(files, {});
        }
    });

    // Profile Picture Handling
    profilePicInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const createPlaylistBtn = document.getElementById('create-playlist-btn');
        const sidebarPlaylistsContainer = document.getElementById('sidebar-playlists');
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const result = e.target.result;
                profilePic.src = result;
                localStorage.setItem('genesis_profile_pic', result);
            };
            reader.readAsDataURL(file);
        }
    });

    msgCloseBtn.addEventListener('click', () => msgModal.classList.add('hidden'));

    // Edit Modal Listeners
    editSaveBtn.addEventListener('click', saveTrackChanges);
    editCancelBtn.addEventListener('click', () => editModal.classList.add('hidden'));

    editModal.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target === editModal) { // Click on backdrop
            editModal.classList.add('hidden');
        }
    });

    // Selection Bar Listeners
    if (selectionClearBtn) {
        selectionClearBtn.addEventListener('click', clearSelection);
    }

    if (selectionRemoveBtn) {
        selectionRemoveBtn.addEventListener('click', async () => {
            const count = playerContext.selectedTrackIds.size;
            const confirmed = await showConfirmation(
                'Remove Tracks',
                `Are you sure you want to permanently remove ${count} selected track(s) from your library?`
            );
            if (confirmed) {
                const removalPromises = Array.from(playerContext.selectedTrackIds).map(id => handleRemoveTrack(id));
                await Promise.all(removalPromises);
                showMessage(`Removed ${count} track(s).`);
                clearSelection();
            }
        });
    }

    if (selectionAddToPlaylistBtn) {
        selectionAddToPlaylistBtn.addEventListener('click', () => {
            openAddToPlaylistModal(Array.from(playerContext.selectedTrackIds)); // This function is now local
        });
    }

    function handleTimeUpdate() {
        const { currentTime, duration } = audioPlayer;
        if (!isNaN(duration)) {
            const pct = (currentTime / duration) * 100;
            updateProgressBarUI(currentTime, duration);
            savePlaybackState(); // Periodically save progress
            updateLyrics(currentTime); // Sync lyrics
        }
    }

    // --- Drag and Click to Seek ---
    let isDragging = false;

    const seek = (e) => {
        if (!audioPlayer.duration) return;
        const rect = progressBarContainer.getBoundingClientRect();
        // Use touch event if available, otherwise mouse event
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let position = (clientX - rect.left) / rect.width;
        position = Math.max(0, Math.min(1, position)); // Clamp between 0 - 1
        
        audioPlayer.currentTime = position * audioPlayer.duration;
        
        // We can also manually update the UI here for a snappier feel
        // as timeupdate can have a slight delay.
        const pct = position * 100;
        progressFill.style.width = `${pct}%`;
        if(progressHead) progressHead.style.left = `${pct}%`;
        currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    };

    progressBarContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        seek(e);
        e.preventDefault(); // Prevents text selection
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            seek(e);
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    progressBarContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
        seek(e);
        e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            seek(e);
            e.preventDefault(); // Prevent scrolling while dragging
        }
    });

    document.addEventListener('touchend', () => {
        isDragging = false;
    });

    volumeSlider.addEventListener('input', (e) => {
        const volumeValue = parseFloat(e.target.value);
        audioPlayer.volume = volumeValue;
        audioPlayer.muted = false; // Unmute when slider is used
        volumePercentage.textContent = Math.round(volumeValue * 100);
        savePlaybackState();

        const muteIcon = muteBtn.querySelector('i');

        if (volumeValue > 0.5) {
            volumeIcon.className = 'fas fa-volume-up';
        } else if (volumeValue > 0) {
            volumeIcon.className = 'fas fa-volume-down';
        } else {
            volumeIcon.className = 'fas fa-volume-mute';
        }
        // Sync mute button icon
        if (muteIcon) {
            muteIcon.className = volumeIcon.className;
        }
    });

    muteBtn.addEventListener('click', () => {
        audioPlayer.muted = !audioPlayer.muted;
        const muteIcon = muteBtn.querySelector('i');
        if (audioPlayer.muted) {
            muteIcon.className = 'fas fa-volume-mute';
            volumeIcon.className = 'fas fa-volume-mute';
            volumePercentage.textContent = '0';
            muteBtn.title = "Unmute";
        } else {
            // Restore icon based on current volume
            volumePercentage.textContent = Math.round(audioPlayer.volume * 100);
            const volumeValue = audioPlayer.volume;
            if (volumeValue > 0.5) {
                volumeIcon.className = 'fas fa-volume-up';
                muteIcon.className = 'fas fa-volume-up';
            } else if (volumeValue > 0) {
                volumeIcon.className = 'fas fa-volume-down';
                muteIcon.className = 'fas fa-volume-down';
            } else {
                volumeIcon.className = 'fas fa-volume-mute';
                muteIcon.className = 'fas fa-volume-mute';
            }
            muteBtn.title = "Mute";
        }
    });

    volumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        volumePopup.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!volumePopup.contains(e.target) && !volumeBtn.contains(e.target)) {
            volumePopup.classList.remove('active');
        }
    });

    // Sidebar Toggle
    const sidebar = document.querySelector('.sidebar'); // Already defined
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 992 && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        });
    }

    // --- Playlist Logic (from playlist-manager.js) ---
    loadPlaylists();
    renderPlaylists();

    const createPlaylistBtn = document.getElementById('create-playlist-btn');
    if (createPlaylistBtn) {
        createPlaylistBtn.addEventListener('click', () => {
            const name = prompt('Enter playlist name:');
            if (name) createPlaylist(name, true);
        });
    }
    // --- End of Playlist Logic Integration ---


    // Initialize
    restoreSession();
    renderDiscoverGrid(); // Initial fetch for discover page
    // Discover functionality removed

    const searchDropdown = document.getElementById('search-dropdown');

    let highlightedSearchIndex = -1;

    // Simple debounce helper
    function debounce(fn, ms = 200) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    function renderSearchDropdown() {
        const query = searchInput.value.trim().toLowerCase();
        if (!query) {
            searchDropdown.classList.add('hidden');
            highlightedSearchIndex = -1;
            searchDropdown.innerHTML = '';
            return;
        }

        const results = playerContext.libraryTracks
            .filter(track => 
                (track.title && track.title.toLowerCase().includes(query)) || 
                (track.artist && track.artist.toLowerCase().includes(query)))
            .slice(0, 10);

        if (results.length === 0) {
            searchDropdown.innerHTML = `<div class="no-results">No results found for "${query}"</div>`;
            highlightedSearchIndex = -1;
            searchDropdown.classList.remove('hidden'); // Show "no results"
            return;
        }

        searchDropdown.innerHTML = results.map(track => {
            const duration = track.duration ? formatTime(track.duration) : '';
            const icon = track.isURL ? '<i class="fas fa-globe"></i>' : '<i class="fas fa-music"></i>';
            return `
                <div class="result-item" data-track-id="${track.id}" role="option">
                    ${icon}
                    <div class="label">${track.title} <span class="search-artist-label">- ${track.artist || 'Unknown'}</span></div>
                    <div class="meta">${duration}</div>
                </div>
            `;
        }).join('');
        highlightedSearchIndex = -1; // Reset on new render
        searchDropdown.classList.remove('hidden');

        // Attach click handlers for results
        searchDropdown.querySelectorAll('.result-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const trackId = el.dataset.trackId;
                startPlayback([trackId]);
                searchDropdown.classList.add('hidden');
                searchInput.value = '';
            });
        });

        highlightedSearchIndex = -1;
    }

    const handleSearchInput = debounce(() => {
        renderSearchDropdown();
    }, 180);

    // Replace earlier single listener with combined behavior
    // searchInput.removeEventListener && searchInput.removeEventListener('input', renderQueue);
    searchInput.addEventListener('input', handleSearchInput);

    // Hide dropdown when clicking outside search bar / dropdown
    document.addEventListener('click', (e) => {
        const withinSearch = e.target.closest('.search-bar') || e.target.closest('#search-dropdown');
        if (!withinSearch) searchDropdown.classList.add('hidden');
    });

    // Prevent document click handlers from closing dropdown when interacting within search
    searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
        renderSearchDropdown();
    });

    // Keyboard navigation for search dropdown
    searchInput.addEventListener('keydown', (e) => {
        const items = searchDropdown.querySelectorAll('.result-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (highlightedSearchIndex < items.length - 1) {
                highlightedSearchIndex++;
            } else {
                highlightedSearchIndex = 0; // Wrap to top
            }
            updateSearchHighlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (highlightedSearchIndex > 0) {
                highlightedSearchIndex--;
            } else {
                highlightedSearchIndex = items.length - 1; // Wrap to bottom
            }
            updateSearchHighlight(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedSearchIndex > -1 && items[highlightedSearchIndex]) {
                items[highlightedSearchIndex].click(); // Trigger click on the highlighted item
            }
        } else if (e.key === 'Escape') {
            searchDropdown.classList.add('hidden');
        }
    });

    function updateSearchHighlight(items) {
        items.forEach((item, index) => {
            if (index === highlightedSearchIndex) {
                item.classList.add('highlighted');
                // Ensure the highlighted item is visible in the dropdown
                item.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                });
            } else {
                item.classList.remove('highlighted');
            }
        });
    }

    // Add event listener for the discover search input
    if (discoverSearchInput) {
        const performDiscoverSearch = () => {
            const query = discoverSearchInput.value.trim();
            // Re-render the grid with the new search query.
            // An empty query will fetch popular tracks again.
            renderDiscoverGrid(query);
        };

        discoverSearchBtn.addEventListener('click', performDiscoverSearch);
        discoverSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                performDiscoverSearch();
            }
        });
    }

    // ===================================
    // 5. Jamendo Discover Feature
    // ===================================

    async function fetchJamendoTracks(query = '') {
        // Call our own server's proxy endpoint
        const url = query ? `/api/discover?search=${encodeURIComponent(query)}` : '/api/discover';

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Jamendo API request failed with status ${response.status}`);
            }
            const data = await response.json();
            
            // Map Jamendo track data to our application's track format and store it
            playerContext.discoverTracks = data.results.map(track => ({
                id: `jamendo-${track.id}`, // Unique ID for discover tracks
                title: track.name,
                artist: track.artist_name,
                album: track.album_name,
                duration: track.duration,
                coverURL: track.image.replace('width=200', 'width=400'), // Get a larger image
                objectURL: track.audio, // This is the streamable URL
                isURL: true,
                isFromDiscover: true // Custom flag
            }));

            return playerContext.discoverTracks;
        } catch (error) {
            console.error("Error fetching from discover endpoint:", error);
            if (discoverGrid) discoverGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Could not load tracks from Jamendo. Please check your connection or API key.</div>`;
            return [];
        }
    }

    function renderDiscoverCards(tracks) {
        if (!discoverGrid) return;

        if (tracks.length === 0) {
            discoverGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No tracks found.</div>`;
            return;
        }

        discoverGrid.innerHTML = tracks.map(track => `
            <div class="recent-media-card" data-track-id="${track.id}" tabindex="0">
                <div class="album-art">
                    <img src="${track.coverURL}" alt="${track.title}">
                </div>
                <div class="card-footer">
                    <button class="control-btn small card-footer-play-btn" title="Play"><i class="fas fa-play"></i></button>
                    <h5>${track.title}</h5>
                </div>
            </div>
        `).join('');

        discoverGrid.querySelectorAll('.card-footer-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.currentTarget.closest('.recent-media-card').dataset.trackId;
                startPlayback([trackId]);
            });
        });
    }

    async function renderDiscoverGrid(query = '') {
        if (!discoverGrid) return;
        const loadingMessage = query ? `Searching for "${query}"...` : 'Loading popular tracks...';
        discoverGrid.innerHTML = `<div class="loading-spinner" style="grid-column: 1 / -1;">${loadingMessage}</div>`;
        const tracks = await fetchJamendoTracks(query);
        renderDiscoverCards(tracks);
    }

    // ===================================
    // 4. Keyboard Shortcuts Feature
    // ===================================

    document.addEventListener('keydown', (event) => {
        // Prevent key controls from firing if the user is typing in an input field (e.g., in a modal)
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (event.key) {
            case ' ': // Spacebar for Play/Pause
                event.preventDefault(); // Prevents the page from scrolling down
                if (audioPlayer.paused) {
                    playTrack();
                } else {
                    pauseTrack();
                }
                break;
            
            case 'ArrowRight': // Right Arrow for Next Track
                event.preventDefault(); 
                if (nextBtn) nextTrack();
                break;

            case 'ArrowLeft': // Left Arrow for Previous Track
                event.preventDefault();
                if (prevBtn) prevTrack();
                break;

            case 'ArrowUp': // Up Arrow for Volume Up
                event.preventDefault();
                // Ensure volume is between 0.0 and 1.0
                audioPlayer.volume = Math.min(1.0, audioPlayer.volume + 0.1);
                volumeSlider.value = audioPlayer.volume; // Update the UI slider
                break;

            case 'ArrowDown': // Down Arrow for Volume Down
                event.preventDefault();
                // Ensure volume is between 0.0 and 1.0
                audioPlayer.volume = Math.max(0.0, audioPlayer.volume - 0.1);
                volumeSlider.value = audioPlayer.volume; // Update the UI slider
                break;

            // Optional: 'M' for Mute
            case 'm':
            case 'M':
                event.preventDefault();
                // Toggle mute status
                audioPlayer.muted = !audioPlayer.muted;
                // You may want to update a mute button's icon here
                break;

            default:
                // Do nothing for other keys
                return;
        }
    });

    if (libraryPlayAllBtn) {
        libraryPlayAllBtn.addEventListener('click', () => {
            const sortedTracks = [...playerContext.libraryTracks].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            if (sortedTracks.length > 0) {
                // Use the sorted list of tracks to ensure playback matches the displayed order.
                const trackIds = sortedTracks.map(t => t.id);
                startPlayback(trackIds, 0, false);
                showMessage(`Playing all ${playerContext.libraryTracks.length} tracks from your library.`);
            }
        });
    }

    // --- UI Functions moved back from ui-manager.js ---

    function applyTheme(theme) {
        const themeToggle = document.getElementById('theme-toggle-checkbox');
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            if (themeToggle) themeToggle.checked = true;
        } else {
            document.body.classList.remove('dark-theme');
            if (themeToggle) themeToggle.checked = false;
        }
    }

    function switchSection(targetId) {
        mainSections.forEach(section => section.classList.add('hidden'));
        if (albumDetailView) albumDetailView.classList.add('hidden');
        if (artistDetailView) artistDetailView.classList.add('hidden');

        const target = document.getElementById(targetId);
        if (target) target.classList.remove('hidden');

        [...menuItems, ...bottomNavItems].forEach(item => {
            item.classList.toggle('active', item.dataset.target === targetId);
        });
    }

    function showMessage(msg) {
        msgText.innerHTML = msg;
        msgModal.classList.remove('hidden');
    }

    function showConfirmation(title, text) {
        return new Promise(resolve => {
            confirmModalTitle.textContent = title;
            confirmModalText.innerHTML = text;
            confirmModal.classList.remove('hidden');

            confirmOkBtn.onclick = () => {
                confirmModal.classList.add('hidden');
                resolve(true);
            };
            confirmCancelBtn.onclick = () => {
                confirmModal.classList.add('hidden');
                resolve(false);
            };
        });
    }

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function renderHomeGrid() {
        if (!recentMediaGrid) return;
        const recentTracks = [...playerContext.libraryTracks].reverse().slice(0, 12);

        if (recentTracks.length === 0) {
            recentMediaGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Your recent media will appear here.</div>`;
            return;
        }

        recentMediaGrid.innerHTML = recentTracks.map(track => `
            <div class="recent-media-card" data-track-id="${track.id}" tabindex="0">
                <div class="album-art">
                    ${track.coverURL ? `<img src="${track.coverURL}" alt="${track.title}">` : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`}
                </div>
                <div class="card-footer">
                    <button class="control-btn small card-footer-play-btn" title="Play"><i class="fas fa-play"></i></button>
                    <h5>${track.title || 'Unknown Title'}</h5>
                    <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                </div>
            </div>
        `).join('');

        recentMediaGrid.querySelectorAll('.recent-media-card').forEach(card => {
            const trackId = card.dataset.trackId;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.track-action-btn') || e.target.closest('.card-footer-play-btn')) return;
                startPlayback([trackId]);
            });
            card.querySelector('.card-footer-play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                startPlayback([trackId]);
            });
            card.querySelector('.track-action-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                renderTrackContextMenu(trackId, e.currentTarget, { isFromLibrary: true }); // Corrected
            });
        });
    }

    function renderLibraryGrid() {
        if (!libraryGrid) return;
        const sortedTracks = [...playerContext.libraryTracks].sort((a, b) => (a.title || '').localeCompare(b.title || ''));

        if (sortedTracks.length === 0) {
            libraryGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Your library is empty. Open some files to get started.</div>`;
            return;
        }

        libraryGrid.innerHTML = sortedTracks.map(track => `
            <div class="recent-media-card" data-track-id="${track.id}" tabindex="0">
                <div class="album-art">
                    ${track.coverURL ? `<img src="${track.coverURL}" alt="${track.title}">` : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`}
                </div>
                <div class="card-footer">
                    <button class="control-btn small card-footer-play-btn" title="Play"><i class="fas fa-play"></i></button>
                    <h5>${track.title || 'Unknown Title'}</h5>
                    <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                </div>
            </div>
        `).join('');

        libraryGrid.querySelectorAll('.recent-media-card').forEach(card => {
            const trackId = card.dataset.trackId;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.track-action-btn') || e.target.closest('.card-footer-play-btn')) return;
                startPlayback([trackId]);
            });
            card.querySelector('.card-footer-play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                startPlayback([trackId]);
            });
            card.querySelector('.track-action-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                renderTrackContextMenu(trackId, e.currentTarget, { isFromLibrary: true }); // Corrected
            });
        });
    }

    async function renderDetailTrackList(trackIds, container, options = {}) {
        if (trackIds.length === 0) {
            container.innerHTML = '<p style="padding: 20px;">No tracks found.</p>';
            return;
        }

        const trackRows = await Promise.all(trackIds.map(async (trackId, index) => {
            try {
                const trackData = await getTrackDetailsFromId(trackId);
                const row = document.createElement('div');
                row.className = 'track-list-row';
                row.dataset.id = trackId;
                let secondaryInfo = options.showAlbum ? trackData.album || 'N/A' : trackData.artist || 'Unknown Artist';
                
                row.innerHTML = `
                    <button class="control-btn small row-play-btn" title="Play"><i class="fas fa-play"></i></button>
                    <input type="checkbox" class="track-select-checkbox" data-id="${trackId}">
                    <span class="track-title">${trackData.title || 'Unknown Title'}</span>
                    <span class="track-album">${secondaryInfo}</span>
                    <span class="track-duration">${formatTime(trackData.duration)}</span>
                    <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                `;

                row.addEventListener('click', e => {
                    if (e.target.closest('.track-action-btn') || e.target.closest('.row-play-btn') || e.target.type === 'checkbox') return;
                    startPlayback([trackId]);
                });
                row.querySelector('.row-play-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    startPlayback([trackId]);
                });
                row.querySelector('.track-action-btn').addEventListener('click', e => {
                    e.stopPropagation();
                    renderTrackContextMenu(trackId, e.currentTarget, { isFromLibrary: true });
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
    }

    function updatePlaybackBar(track) {
        if (!track) {
            songTitle.textContent = "No Track Selected";
            artistName.textContent = "Load files to begin";
            document.getElementById('album-art-img').src = '';
            document.getElementById('album-art-img').classList.add('hidden');
            document.getElementById('album-art-placeholder').classList.remove('hidden');
            return;
        }

        songTitle.textContent = track.title || 'Unknown Title';
        artistName.textContent = track.artist || (track.isURL ? 'Web Stream' : 'Unknown Artist');

        if (track.coverURL) {
            document.getElementById('album-art-img').src = track.coverURL;
            document.getElementById('album-art-img').classList.remove('hidden');
            document.getElementById('album-art-placeholder').classList.add('hidden');
        } else {
            document.getElementById('album-art-img').src = '';
            document.getElementById('album-art-img').classList.add('hidden');
            document.getElementById('album-art-placeholder').classList.remove('hidden');
        }

        if (extendedInfoPanel.classList.contains('active')) {
            updateExtendedInfoPanel(track);
        }
    }

    function updateExtendedInfoPanel(track) {
        if (!track) return;

        extendedInfoArt.innerHTML = track.coverURL
            ? `<img src="${track.coverURL}" alt="Album Art">`
            : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`;
        extendedInfoTitle.textContent = track.title || 'Unknown Title';
        extendedInfoArtist.textContent = track.artist || 'Unknown Artist';

        currentLyricIndex = -1;

        if (track.syncedLyrics && track.syncedLyrics.length > 0) {
            lyricsContainer.innerHTML = track.syncedLyrics.map((line, index) =>
                `<p class="lyric-line" data-index="${index}">${line.text || '&nbsp;'}</p>`
            ).join('');
        } else if (track.lyrics) {
            lyricsContainer.innerHTML = track.lyrics.replace(/\n/g, '<br>');
        } else {
            lyricsContainer.innerHTML = '<p class="lyric-line" style="font-style: italic;">No lyrics found for this track.</p>';
        }
    }

    function updateProgressBarUI(currentTime, duration) {
        if (isNaN(duration) || duration <= 0) return;
        const pct = (currentTime / duration) * 100;
        progressFill.style.width = `${pct}%`;
        progressHead.style.left = `${pct}%`;
        currentTimeEl.textContent = formatTime(currentTime);
        durationEl.textContent = formatTime(duration);
    }

    function updateLyrics(currentTime) {
        if (!playerContext.trackQueue || playerContext.currentTrackIndex < 0) return;

        const track = playerContext.trackQueue[playerContext.currentTrackIndex];
        if (!track || !track.syncedLyrics || track.syncedLyrics.length === 0) return;

        let newLyricIndex = -1;
        for (let i = track.syncedLyrics.length - 1; i >= 0; i--) {
            if (currentTime >= track.syncedLyrics[i].time) {
                newLyricIndex = i;
                break;
            }
        }

        if (newLyricIndex !== currentLyricIndex) {
            currentLyricIndex = newLyricIndex;
            const lyricLines = document.querySelectorAll('#lyrics-container .lyric-line');
            lyricLines.forEach((line, index) => {
                line.classList.remove('active', 'past', 'upcoming');
                if (index === currentLyricIndex) {
                    line.classList.add('active');
                    line.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (index < currentLyricIndex) {
                    line.classList.add('past');
                } else {
                    line.classList.add('upcoming');
                }
            });
        }
    }

    function closeContextMenu() {
        if (openContextMenu) {
            openContextMenu.remove();
            openContextMenu = null;
        }
    }

    function renderTrackContextMenu(trackId, buttonElement, options = {}) {
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
        menuItems.push({ action: 'edit-info', icon: 'fas fa-edit', text: 'Edit Info' });
        menuItems.push({ action: 'properties', icon: 'fas fa-info-circle', text: 'Properties' });

        menuItems.push({ action: 'add-to-playlist', icon: 'fas fa-plus', text: 'Add to Playlist' });

        menuItems.forEach(item => {
            if (item.condition === false) return;

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
                    handleContextMenuAction(item.action, trackId, options);
                    closeContextMenu();
                });
            }
            menu.appendChild(itemEl);
        });

        document.body.appendChild(menu);
        
        const rect = buttonElement.getBoundingClientRect();
        const menuHeight = menu.offsetHeight;
        const menuWidth = menu.offsetWidth;
        let top = rect.bottom + window.scrollY;
        let left = rect.left + window.scrollX;

        if (top + menuHeight > window.innerHeight + window.scrollY) top = rect.top + window.scrollY - menuHeight;
        if (left + menuWidth > window.innerWidth + window.scrollX) left = rect.right + window.scrollX - menuWidth;
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;

        setTimeout(() => {
            menu.classList.add('active');
            openContextMenu = menu;
        }, 10);
    }

    function openAddToPlaylistModal(trackIds) {
        if (!trackIds || trackIds.length === 0) return;

        const playlists = getPlaylists();
        playlistSelectionList.innerHTML = Object.values(playlists).map(p => `
            <div class="playlist-selection-item" data-id="${p.id}">
                <i class="fas fa-list-ul"></i>
                <span>${p.name}</span>
            </div>
        `).join('');

        // Add click handlers for each existing playlist
        playlistSelectionList.querySelectorAll('.playlist-selection-item').forEach(item => {
            item.addEventListener('click', () => {
                const playlistId = item.dataset.id;
                let addedCount = 0;
                trackIds.forEach(trackId => {
                    if (addTrackToPlaylist(playlistId, trackId)) {
                        addedCount++;
                    }
                });
                showMessage(`Added ${addedCount} track(s) to "${playlists[playlistId].name}".`);
                // Refresh the main playlists list and the detail view if it's open
                refresh(playlistId);
                addToPlaylistModal.classList.add('hidden');
                clearSelection();
            });
        });

        // Handler for "New Playlist" button
        playlistModalNewBtn.onclick = () => {
            const newName = prompt('Enter new playlist name:');
            if (newName && newName.trim()) {
                const newPlaylistId = createPlaylist(newName.trim(), true);
                if (newPlaylistId) {
                    trackIds.forEach(trackId => addTrackToPlaylist(newPlaylistId, trackId));
                    showMessage(`Created playlist "${newName.trim()}" and added ${trackIds.length} track(s).`);
                    // Refresh to update all playlist views
                    refresh();
                    addToPlaylistModal.classList.add('hidden');
                    clearSelection();
                }
            }
        };

        // Handler for cancel button
        playlistModalCancelBtn.onclick = () => {
            addToPlaylistModal.classList.add('hidden');
        };

        addToPlaylistModal.classList.remove('hidden');
    }

    function openEditModal(track) {
        editTrackIdInput.value = track.id;
        editTitleInput.value = track.title || '';
        editArtistInput.value = track.artist || '';
        editAlbumInput.value = track.album || '';
        editLyricsInput.value = track.lyrics || '';
        editModal.classList.remove('hidden');
    }

    function updateSelectionBar() {
        const count = playerContext.selectedTrackIds.size;
        if (count > 0) {
            selectionCount.textContent = count;
            selectionBar.classList.remove('hidden');
        } else {
            selectionBar.classList.add('hidden');
        }
    }

    function clearSelection() {
        playerContext.selectedTrackIds.clear();
        document.querySelectorAll('.track-select-checkbox:checked').forEach(cb => cb.checked = false);
        document.querySelectorAll('.track-list-row.selected').forEach(row => row.classList.remove('selected'));
        updateSelectionBar();
    }

    // --- UI Event Listeners moved back from ui-manager.js ---

    const themeToggle = document.getElementById('theme-toggle-checkbox');
    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            const newTheme = themeToggle.checked ? 'dark' : 'light';
            localStorage.setItem('genesis_theme', newTheme);
            applyTheme(newTheme);
        });
    }

    if (libraryGridViewBtn && libraryListViewBtn && libraryGrid) {
        libraryGridViewBtn.addEventListener('click', () => switchLibraryView('grid'));
        libraryListViewBtn.addEventListener('click', () => switchLibraryView('list'));
    }

    if (playbackBarTrackInfo && extendedInfoPanel && closeExtendedPanelBtn && mainContent) {
        playbackBarTrackInfo.addEventListener('click', () => {
            if (playerContext.currentTrackIndex > -1) {
                updateExtendedInfoPanel(playerContext.trackQueue[playerContext.currentTrackIndex]);
                extendedInfoPanel.classList.add('active');
                mainContent.classList.add('panel-active');
            }
        });

        closeExtendedPanelBtn.addEventListener('click', () => {
            extendedInfoPanel.classList.remove('active');
            mainContent.classList.remove('panel-active');
        });
    }

    document.addEventListener('click', (event) => {
        if (openContextMenu && !openContextMenu.contains(event.target) && !event.target.closest('.track-action-btn')) {
            closeContextMenu();
        }

    });

    // Add listeners for the message modal
    if (msgModal && msgCloseBtn) {
        // Listener for the close button
        msgCloseBtn.addEventListener('click', () => msgModal.classList.add('hidden'));

        // Listener for clicking the backdrop (click-away)
        msgModal.addEventListener('click', (e) => {
            if (e.target === msgModal) { // Check if the click is on the backdrop itself
                msgModal.classList.add('hidden');
            }
        });
    }

    // --- Playback Event Listeners (from playback-manager.js) ---
    playBtn.addEventListener('click', () => (playerContext.isPlaying ? pauseTrack() : playTrack()));
    nextBtn.addEventListener('click', nextTrack);
    prevBtn.addEventListener('click', prevTrack);
    shuffleBtn.addEventListener('click', toggleShuffle);
    repeatBtn.addEventListener('click', toggleRepeat);

    audioPlayer.addEventListener('timeupdate', handleTimeUpdate);
    audioPlayer.addEventListener('ended', nextTrack);

    function switchLibraryView(view) {
        if (view === 'grid') {
            libraryGrid.classList.remove('list-view');
            libraryGridViewBtn.classList.add('active');
            libraryListViewBtn.classList.remove('active');
        } else {
            libraryGrid.classList.add('list-view');
            libraryListViewBtn.classList.add('active');
            libraryGridViewBtn.classList.remove('active');
        }
        localStorage.setItem('genesis_library_view', view);
    }


// --- Album and Artist Functions (from album-manager.js and artist-manager.js) ---

function renderAlbumsGrid() {
    const albumsContent = document.querySelector('#albums-section .albums-content');
    if (!albumsContent) return;

    const albums = {};

    playerContext.libraryTracks.forEach(track => {
        if (track.album) {
            const albumKey = `${track.album}|${track.artist || 'Unknown Artist'}`;
            if (!albums[albumKey]) {
                albums[albumKey] = {
                    name: track.album,
                    artist: track.artist || 'Unknown Artist',
                    coverURL: track.coverURL,
                    trackIds: []
                };
            }
            albums[albumKey].trackIds.push(track.id);
            if (track.coverURL && !albums[albumKey].coverURL) {
                albums[albumKey].coverURL = track.coverURL;
            }
        }
    });

    const albumList = Object.values(albums).sort((a, b) => a.name.localeCompare(b.name));

    if (albumList.length === 0) {
        albumsContent.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No albums found in your library.</p></div>`;
        return;
    }

    albumsContent.innerHTML = albumList.map(album => `
        <div class="album-card">
            <div class="album-art-circular">
                ${album.coverURL ? `<img src="${album.coverURL}" alt="${album.name}">` : `<div class="placeholder-icon"><i class="fas fa-compact-disc"></i></div>`}
            </div>
            <div class="album-name">${album.name}</div>
            <div class="album-artist">${album.artist}</div>
        </div>
    `).join('');

    albumsContent.querySelectorAll('.album-card').forEach((card, index) => {
        card.addEventListener('click', () => {
            const album = albumList[index];
            openAlbumView(album);
        });
    });
}

function openAlbumView(album) {
    const albumsSection = document.getElementById('albums-section');
    const albumDetailView = document.getElementById('album-detail-view');
    albumsSection.classList.add('hidden');
    albumDetailView.classList.remove('hidden');
    albumDetailView.innerHTML = `
        <div class="playlist-detail-header">
            <button id="album-detail-back-btn" class="btn-secondary" style="padding: 10px 15px;"><i class="fas fa-arrow-left"></i> Back</button>
            <div class="detail-view-art">
                 ${album.coverURL ? `<img src="${album.coverURL}" alt="${album.name}">` : `<div class="placeholder-icon"><i class="fas fa-compact-disc"></i></div>`}
            </div>
            <div class="playlist-info">
                <h2 style="font-size: 28px; color: var(--dark-color); margin: 0;">${album.name}</h2>
                <p style="color: var(--text-color); margin: 0;">${album.artist}</p>
                <p style="color: var(--text-color); margin: 0; font-size: 14px;">${album.trackIds.length} track${album.trackIds.length !== 1 ? 's' : ''}</p>
            </div>
            <div class="playlist-actions" style="margin-left: auto; display: flex; gap: 10px;">
                <button id="album-shuffle-btn" class="btn-secondary"><i class="fas fa-random"></i> Shuffle</button>
                <button id="album-play-all-btn" class="btn-primary"><i class="fas fa-play"></i> Play All</button>
            </div>
        </div>
        <div class="track-list-header">
            <input type="checkbox" class="select-all-checkbox" title="Select all tracks">
            <span style="grid-column: 2;">#</span><span>Title</span><span>Album</span><span>Duration</span><span></span>
        </div>
        <div id="album-track-list"></div>
    `;

    document.getElementById('album-detail-back-btn').addEventListener('click', () => {
        albumDetailView.classList.add('hidden');
        albumsSection.classList.remove('hidden');
    });

    document.getElementById('album-play-all-btn').addEventListener('click', () => {
        startPlayback(album.trackIds, 0, false);
        showMessage(`Playing album: ${album.name}`);
    });

    document.getElementById('album-shuffle-btn').addEventListener('click', () => {
        startPlayback(album.trackIds, 0, true);
        showMessage(`Shuffling album: ${album.name}`);
    });

    renderDetailTrackList(album.trackIds, document.getElementById('album-track-list'), { showAlbum: false });
}

function renderArtistsGrid() {
    const artistsContent = document.querySelector('#artists-section .artists-content');
    if (!artistsContent) return;

    const artists = {};

    playerContext.libraryTracks.forEach(track => {
        const artistName = track.artist || 'Unknown Artist';
        if (!artists[artistName]) {
            artists[artistName] = {
                name: artistName,
                trackIds: [],
                coverURL: null
            };
        }
        artists[artistName].trackIds.push(track.id);
        if (track.coverURL && !artists[artistName].coverURL) {
            artists[artistName].coverURL = track.coverURL;
        }
    });

    const artistList = Object.values(artists).sort((a, b) => a.name.localeCompare(b.name));

    if (artistList.length === 0) {
        artistsContent.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No artists found in your library.</p></div>`;
        return;
    }

    artistsContent.innerHTML = artistList.map(artist => `
        <div class="artist-card" data-artist-name="${artist.name}">
            <div class="album-art-circular">
                ${artist.coverURL ? `<img src="${artist.coverURL}" alt="${artist.name}">` : `<div class="placeholder-icon"><i class="fas fa-user"></i></div>`}
            </div>
            <div class="album-name">${artist.name}</div>
        </div>
    `).join('');

    artistsContent.querySelectorAll('.artist-card').forEach((card, index) => {
        card.addEventListener('click', () => {
            const artist = artistList[index];
            openArtistView(artist);
        });
    });
}

function openArtistView(artist) {
    const artistsSection = document.getElementById('artists-section');
    const artistDetailView = document.getElementById('artist-detail-view');
    artistsSection.classList.add('hidden');
    artistDetailView.classList.remove('hidden');
    artistDetailView.innerHTML = `
        <div class="playlist-detail-header">
            <button id="artist-detail-back-btn" class="btn-secondary" style="padding: 10px 15px;"><i class="fas fa-arrow-left"></i> Back</button>
            <div class="detail-view-art" style="border-radius: 50%;">
                ${artist.coverURL ? `<img src="${artist.coverURL}" alt="${artist.name}">` : `<div class="placeholder-icon"><i class="fas fa-user" style="font-size: 48px;"></i></div>`}
            </div>
            <div class="playlist-info">
                <h2 style="font-size: 28px; color: var(--dark-color); margin: 0;">${artist.name}</h2>
                <p style="color: var(--text-color); margin: 0; font-size: 14px;">${artist.trackIds.length} track${artist.trackIds.length !== 1 ? 's' : ''}</p>
            </div>
            <div class="playlist-actions" style="margin-left: auto; display: flex; gap: 10px;">
                <button id="artist-shuffle-btn" class="btn-secondary"><i class="fas fa-random"></i> Shuffle</button>
                <button id="artist-play-all-btn" class="btn-primary"><i class="fas fa-play"></i> Play All</button>
            </div>
        </div>
        <div class="track-list-header">
            <input type="checkbox" class="select-all-checkbox" title="Select all tracks"><span>#</span><span>Title</span><span>Album</span><span>Duration</span><span title="Actions"></span>
        </div>
        <div id="artist-track-list"></div>
    `;

    document.getElementById('artist-detail-back-btn').addEventListener('click', () => {
        artistDetailView.classList.add('hidden');
        artistsSection.classList.remove('hidden');
    });

    document.getElementById('artist-play-all-btn').addEventListener('click', () => {
        startPlayback(artist.trackIds, 0, false);
        showMessage(`Playing all tracks by ${artist.name}`);
    });

    document.getElementById('artist-shuffle-btn').addEventListener('click', () => {
        startPlayback(artist.trackIds, 0, true); // Pass true for shuffle
        showMessage(`Shuffling tracks by ${artist.name}`);
    });

    renderDetailTrackList(artist.trackIds, document.getElementById('artist-track-list'), { showArtist: false, showAlbum: true });
}

function prevTrack() {
    if (!playerContext.trackQueue || playerContext.trackQueue.length === 0) return;
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
        return;
    }
    const prevIndex = (playerContext.currentTrackIndex - 1 + playerContext.trackQueue.length) % playerContext.trackQueue.length;
    if (playerContext.trackQueue[prevIndex]?.objectURL) loadTrack(prevIndex);
}

// --- Playlist Functions (from playlist-manager.js) ---

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
        showMessage('Playlist name cannot be empty.');
        return null;
    }
    const id = Date.now().toString();
    playlists[id] = { id, name: name.trim(), trackIds: [] };
    savePlaylists();
    if (doRender) renderPlaylists();
    return id;
}

async function deletePlaylist(id) {
    const confirmed = await showConfirmation(
        'Delete Playlist',
        `Are you sure you want to permanently delete the playlist "<strong>${playlists[id].name}</strong>"?`
    );
    if (confirmed) {
        delete playlists[id];
        savePlaylists();
        renderPlaylists();
        if (!playlistDetailView.classList.contains('hidden')) openPlaylistView(null);
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

function renderPlaylists() {
    const playlistsList = document.getElementById('playlists-list');
    const playlistIds = Object.keys(playlists);

    if (playlistIds.length === 0) {
        playlistsList.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><i class="fas fa-compact-disc" style="font-size: 48px; color: #ddd; margin-bottom: 10px;"></i><p>No playlists yet. Create one to get started!</p></div>`;
    } else {
        playlistsList.innerHTML = playlistIds.map(id => {
            const playlist = playlists[id];
            const trackCount = playlist.trackIds.length;
            return `<div class="playlist-card" data-id="${id}"><div class="playlist-card-icon"><i class="fas fa-list-ul"></i></div><div class="playlist-card-name">${playlist.name}</div><div class="playlist-card-count">${trackCount} track${trackCount !== 1 ? 's' : ''}</div><button class="control-btn small playlist-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button></div>`;
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

function renderPlaylistContextMenu(playlistId, buttonElement) {
    closeContextMenu(); // Assumes a global closeContextMenu function
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
        openContextMenu = menu; // Assumes a global openContextMenu variable
    }, 10);
}

async function openPlaylistView(id) {
    const playlistsList = document.getElementById('playlists-list');
    const playlistDetailView = document.getElementById('playlist-detail-view');

    if (!id) {
        playlistDetailView.classList.add('hidden');
        document.getElementById('playlists-section').classList.remove('hidden'); // Show the main section
        playlistsList.classList.remove('hidden'); // Show the list of cards
        return;
    }
    const playlist = playlists[id];
    document.getElementById('playlists-section').classList.add('hidden'); // Hide the main section
    playlistDetailView.classList.remove('hidden');
    playlistDetailView.innerHTML = '';

    const headerHTML = `<div class="playlist-detail-header"><button id="playlist-detail-back-btn" class="btn-secondary" style="padding: 10px 15px;"><i class="fas fa-arrow-left"></i> Back</button><div class="playlist-info"><h2 style="font-size: 28px; color: var(--dark-color); margin: 0;">${playlist.name}</h2><p style="color: var(--text-color); margin: 0;">${playlist.trackIds.length} track${playlist.trackIds.length !== 1 ? 's' : ''}</p></div><div class="playlist-actions" style="margin-left: auto;"><button id="playlist-play-all-btn" class="btn-primary"><i class="fas fa-play"></i> Play All</button></div></div><div class="track-list-header"><input type="checkbox" class="select-all-checkbox" title="Select all tracks"><span>#</span><span>Title</span><span>Artist</span><span>Duration</span><span title="Actions"></span></div><div id="playlist-track-list"></div>`;
    playlistDetailView.innerHTML = headerHTML;

    document.getElementById('playlist-detail-back-btn').addEventListener('click', () => {
        playlistDetailView.classList.add('hidden');
        document.getElementById('playlists-section').classList.remove('hidden');
        playlistsList.classList.remove('hidden');
    });

    document.getElementById('playlist-play-all-btn').addEventListener('click', () => {
        if (playlist.trackIds.length > 0) {
            startPlayback(playlist.trackIds, 0);
            showMessage(`Playing all tracks from "${playlist.name}".`);
        }
    });

    const trackListContainer = document.getElementById('playlist-track-list');
    renderDetailTrackList(playlist.trackIds, trackListContainer, { isFromPlaylist: true, playlistId: id });
}

function addTrackToPlaylist(playlistId, trackId) {
    if (!playlists[playlistId]) return false;
    if (playlists[playlistId].trackIds.includes(trackId)) return false;
    playlists[playlistId].trackIds.push(trackId);
    savePlaylists();
    return true;
}

function removeTrackFromPlaylist(playlistId, trackId) {
    if (!playlists[playlistId]) return false;
    const initialLength = playlists[playlistId].trackIds.length;
    playlists[playlistId].trackIds = playlists[playlistId].trackIds.filter(id => id !== trackId);
    if (playlists[playlistId].trackIds.length < initialLength) {
        savePlaylists();
        return true;
    }
    return false;
}

function getPlaylists() {
    return playlists;
}

function refresh(playlistId) {
    renderPlaylists();
    if (playlistId && !playlistDetailView.classList.contains('hidden')) {
        const trackListContainer = document.getElementById('playlist-track-list');
        if (trackListContainer) openPlaylistView(playlistId);
    }
}

function playTrack() {
    if (!audioPlayer.src) return;
    playerContext.isPlaying = true;
    audioPlayer.play().then(() => {
        playIcon.className = 'fas fa-pause';
        document.querySelector('.playback-bar')?.classList.add('playing');
    }).catch(e => {
        console.error("Playback failed:", e);
        // If playback fails, revert the state
        pauseTrack();
    });
}
function pauseTrack() {
    const audioPlayer = document.getElementById('audio-player');
    const playIcon = document.getElementById('play-icon');
    audioPlayer.pause();
    playerContext.isPlaying = false;
    playIcon.className = 'fas fa-play';
    document.querySelector('.playback-bar')?.classList.remove('playing');
}

function loadTrack(index, autoPlay = true) {
    const audioPlayer = document.getElementById('audio-player');
    playerContext.currentTrackIndex = index;
    const track = playerContext.trackQueue[index];
    
    if (track) audioPlayer.src = track.objectURL;
    updatePlaybackBar(track);

    renderQueueTable();
    savePlaybackState();

    if (autoPlay) {
        const canPlayHandler = () => {
            playTrack();
            audioPlayer.removeEventListener('canplay', canPlayHandler);
        };
        audioPlayer.addEventListener('canplay', canPlayHandler);
    }
}

function startPlayback(tracksOrIds, startIndex = 0, shuffle = false) {
    if (!tracksOrIds || tracksOrIds.length === 0) return;

    let newQueue = tracksOrIds.map(item => {
        if (typeof item === 'string') {
            // Find from library first, then from discover tracks
            return playerContext.libraryTracks.find(t => t.id === item) || playerContext.discoverTracks.find(t => t.id === item);
        }
        return item; // It's already a full track object
    }).filter(Boolean);

    // Add discover tracks to the front of the queue without adding to library
    const discoverTracksInQueue = newQueue.filter(t => t.isFromDiscover);
    playerContext.trackQueue.unshift(...discoverTracksInQueue.filter(dt => !playerContext.trackQueue.some(qt => qt.id === dt.id)));

    if (newQueue.length === 0) {
        showMessage("Could not load the selected track for playback.");
        return;
    }

    if (shuffle) {
        for (let i = newQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
        }
        startIndex = 0;
    }

    playerContext.trackQueue = newQueue;
    loadTrack(startIndex);
}

function nextTrack() {
    if (!playerContext.trackQueue || playerContext.trackQueue.length === 0) return;
    let nextIndex = isShuffled 
        ? Math.floor(Math.random() * playerContext.trackQueue.length) 
        : playerContext.currentTrackIndex + 1;
    
    if (repeatState === 2) { // Repeat One
        if (playerContext.currentTrackIndex !== -1) loadTrack(playerContext.currentTrackIndex, true);
        return;
    }

    if (nextIndex >= playerContext.trackQueue.length) { // End of queue
        if (repeatState === 1) { // Repeat All
            nextIndex = 0;
        } else { // No repeat
            pauseTrack();
            return;
        }
    }
    
    if (playerContext.trackQueue[nextIndex]?.objectURL) {
        loadTrack(nextIndex);
    }
}

function toggleShuffle() {
    isShuffled = !isShuffled;
    playerContext.isShuffled = isShuffled;
    setShuffleState(isShuffled);
    savePlaybackState();
}

function toggleRepeat() {
    repeatState = (repeatState + 1) % 3;
    playerContext.repeatState = repeatState;
    updateRepeatButtonUI();
    savePlaybackState();
}

function setRepeatState(state) {
    repeatState = state;
    playerContext.repeatState = state;
}

function setShuffleState(shuffle) {
    playerContext.isShuffled = shuffle;
    const shuffleBtn = document.getElementById('shuffle-btn');
    if (shuffleBtn) {
        shuffleBtn.style.color = playerContext.isShuffled ? 'var(--primary-color)' : 'var(--text-color)';
        shuffleBtn.title = playerContext.isShuffled ? "Shuffle On" : "Shuffle Off";
    }
}

function updateRepeatButtonUI() {
    const repeatBtn = document.getElementById('repeat-btn');
    if (!repeatBtn) return;

    repeatBtn.classList.remove('repeat-one');
    repeatBtn.style.color = 'var(--text-color)';
    let title = "Repeat Off";

    if (playerContext.repeatState === 1) { // Repeat All
        repeatBtn.style.color = 'var(--primary-color)';
        title = "Repeat All";
    } else if (playerContext.repeatState === 2) { // Repeat One
        repeatBtn.style.color = 'var(--primary-color)';
        repeatBtn.classList.add('repeat-one');
        title = "Repeat One";
    }
    repeatBtn.title = title;
}

/**
 * Parses LRC formatted text into an array of timed lyric objects.
 * @param {string} lrcText The raw LRC string.
 * @returns {Array<{time: number, text: string}>}
 */
function parseLRC(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') return [];

    const lines = lrcText.split('\n');
    const syncedLyrics = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    lines.forEach(line => {
        const match = line.match(timeRegex);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = line.replace(timeRegex, '').trim();
            if (text) {
                syncedLyrics.push({ time, text });
            }
        }
    });

    return syncedLyrics.sort((a, b) => a.time - b.time);
}

}); // close DOMContentLoaded listener
