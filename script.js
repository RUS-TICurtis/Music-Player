import * as PlaylistManager from './playlist-manager.js';
import * as LibraryManager from './library-manager.js';
import * as PlaybackManager from './playback-manager.js';
import * as AlbumManager from './album-manager.js';
import * as ArtistManager from './artist-manager.js';
import * as QueueManager from './queue-manager.js';
import * as DiscoverManager from './discover-manager.js';
import { db } from './db.js'; // Import the new Dexie DB instance

// --- Shared Context & State ---
// This object will hold state and functions to be shared across the module scope
const playerContext = {
    libraryTracks: [],
    trackQueue: [],
    currentTrackIndex: -1,
    isPlaying: false,
    isShuffled: false,
    selectedTrackIds: new Set(),
    repeatState: 0, // 0: no-repeat, 1: repeat-all, 2: repeat-one
    dbInstance: db, // Use the Dexie instance
    loadTrack: () => {},
    renderTrackContextMenu: () => {},
    // Add a reference for showMessage to the context
    showMessage: () => {},
};
const PLAYBACK_STATE_KEY = 'genesis_playback_state';

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
    const libraryGrid = document.getElementById('library-grid');
    // Playlist View Elements
    const albumsContent = document.querySelector('#albums-section .albums-content');
    const albumsSection = document.getElementById('albums-section');
    const artistsContent = document.querySelector('#artists-section .artists-content');
    const playlistsListContainer = document.getElementById('playlists-section');
    const playlistsList = document.getElementById('playlists-list');
    const playlistDetailView = document.getElementById('playlist-detail-view');
    
    // Navigation & Menu
    const menuItems = document.querySelectorAll('.menu-item');
    const bottomNavItems = document.querySelectorAll('.bottom-nav .nav-item');
    const mainSections = document.querySelectorAll('.main-section');
    
    const openMenuBtn = document.getElementById('open-menu-btn');
    const openMenuDropdown = document.getElementById('open-menu-dropdown');
    const openFilesOption = document.getElementById('open-files-option');
    const openFolderOption = document.getElementById('open-folder-option');
    const openUrlOption = document.getElementById('open-url-option');
    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    const searchInput = document.getElementById('search-input');
    
    const profilePicInput = document.getElementById('profile-pic-input');
    const profilePic = document.getElementById('profile-pic');

    // Modals
    const urlModal = document.getElementById('url-modal');
    const urlInput = document.getElementById('url-input');
    const urlLoadBtn = document.getElementById('url-load-btn');
    const urlCancelBtn = document.getElementById('url-cancel-btn');
    
    const msgModal = document.getElementById('message-modal');
    const msgText = document.getElementById('modal-text');
    const msgCloseBtn = document.getElementById('msg-close-btn');

    // Confirmation Modal
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

    // Library View Toggles
    const libraryGridViewBtn = document.getElementById('library-grid-view-btn');
    const libraryListViewBtn = document.getElementById('library-list-view-btn');
    const libraryPlayAllBtn = document.getElementById('library-play-all-btn');

    // Selection Bar
    const selectionBar = document.getElementById('selection-action-bar');
    const selectionCount = document.getElementById('selection-count');
    const selectionAddToPlaylistBtn = document.getElementById('selection-add-to-playlist-btn');
    const selectionRemoveBtn = document.getElementById('selection-remove-btn');
    const selectionClearBtn = document.getElementById('selection-clear-btn');

    // Extended Info Panel
    const mainContent = document.querySelector('.main-content');
    const extendedInfoPanel = document.getElementById('extended-info-panel');
    const closeExtendedPanelBtn = document.getElementById('close-extended-panel-btn');
    const playbackBarTrackInfo = document.getElementById('playback-bar-track-info');
    const extendedInfoArt = document.getElementById('extended-info-art');
    const extendedInfoTitle = document.getElementById('extended-info-title');
    const extendedInfoArtist = document.getElementById('extended-info-artist');

    const lyricsContainer = document.getElementById('lyrics-container');
    let currentLyricIndex = -1; // For tracking synchronized lyrics

document.addEventListener('DOMContentLoaded', function() {
    // Assign showMessage to the context so other functions can use it
    playerContext.showMessage = showMessage;
    playerContext.loadTrack = PlaybackManager.loadTrack;
    playerContext.renderTrackContextMenu = renderTrackContextMenu;
    // Assign state arrays to the context
    let libraryTracks = playerContext.libraryTracks;
    let trackQueue = playerContext.trackQueue;
    let dbInstance = playerContext.dbInstance; // This is now the Dexie instance

    // Initialize the Playlist Manager
    PlaylistManager.init({
        playlistsListContainer,
        playlistDetailView,
        playlistsList,
        sidebarPlaylistsContainer: document.getElementById('sidebar-playlists'), // Removed duplicate
        createPlaylistBtn: document.getElementById('create-playlist-btn'),
        getLibraryTracks: () => playerContext.libraryTracks, // Use context
        loadTrack: loadTrack,
        showMessage: showMessage, // Removed duplicate
        renderTrackContextMenu: renderTrackContextMenu,
        getTrackDetailsFromId: LibraryManager.getTrackDetailsFromId,
        startPlayback: startPlayback, // Pass startPlayback
        showConfirmation: showConfirmation // Pass the confirmation function
    });

    // --- Helpers ---
    function showMessage(msg) {
        msgText.innerHTML = msg; // Use innerHTML to allow basic formatting
        msgModal.classList.remove('hidden');
    }

    /**
     * Shows a confirmation modal and returns a Promise that resolves on user action.
     * @param {string} title - The title for the modal.
     * @param {string} text - The confirmation message.
     * @returns {Promise<boolean>} - Resolves with true if confirmed, false if cancelled.
     */
    function showConfirmation(title, text) {
        return new Promise(resolve => {
            confirmModalTitle.textContent = title;
            confirmModalText.innerHTML = text; // Use innerHTML for formatting
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
            repeatState: repeatState,
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

                    if (track.isURL) {
                        trackData.objectURL = track.url;
                    } else {
                        // The audioBlob is already part of the track object from Dexie
                        if (track.audioBlob) {
                            trackData.objectURL = URL.createObjectURL(track.audioBlob);
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
                                audioPlayer.currentTime = currentTime;
                                updateProgressBarUI(currentTime, audioPlayer.duration);
                                audioPlayer.onloadedmetadata = null; // Clean up listener
                            };

                            updatePlaybackBar(track);
                            renderQueueTable();

                            // Restore controls state
                            audioPlayer.volume = volume;
                            volumeSlider.value = volume;
                            playerContext.isShuffled = savedShuffle;
                            shuffleBtn.style.color = playerContext.isShuffled ? 'var(--primary-color)' : 'var(--text-color)';
                            repeatState = savedRepeat;
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

    // Initialize the Library Manager
    LibraryManager.init({
        getDB: () => db, // Pass Dexie instance
        saveTrackToDB: (track) => db.tracks.put(track),
        deleteTrackFromDB: (id) => db.tracks.delete(id),
        showMessage: showMessage,
        getLibrary: () => playerContext.libraryTracks,
        setLibrary: (newLibrary) => { playerContext.libraryTracks = newLibrary; },
        onLibraryUpdate: () => {
            renderHomeGrid();
            renderLibraryGrid();
            ArtistManager.renderArtistsGrid();
            AlbumManager.renderAlbumsGrid();
        }
    });

    // Initialize the Playback Manager
    PlaybackManager.init({
        audioPlayer,
        playerContext,
        playIcon,
        shuffleBtn,
        repeatBtn,
        playBtn,
        nextBtn,
        prevBtn,
        updatePlaybackBar,
        renderQueueTable: QueueManager.renderQueueTable,
        savePlaybackState,
        handleTimeUpdate,
    });

    // Initialize Album and Artist Managers
    AlbumManager.init({
        playerContext, albumsContent, albumDetailView, albumsSection,
        startPlayback: PlaybackManager.startPlayback,
        showMessage,
        renderDetailTrackList,
    });

    ArtistManager.init({
        playerContext, artistsContent, artistDetailView,
        artistsSection: document.getElementById('artists-section'),
        startPlayback: PlaybackManager.startPlayback,
        showMessage,
        renderDetailTrackList,
    });

    // Initialize Queue and Discover Managers
    QueueManager.init({
        playerContext,
        queueList,
        queueHeaderTitle: document.getElementById('queue-header-title'),
        queueClearBtn: document.getElementById('queue-clear-btn'),
        queueSavePlaylistBtn: document.getElementById('queue-save-playlist-btn'),
        showMessage,
        showConfirmation,
        formatTime,
        loadTrack: PlaybackManager.loadTrack,
        renderTrackContextMenu,
        PlaylistManager,
    });

    DiscoverManager.init({
        discoverContent: document.querySelector('#discover-section .discover-content'),
        showMessage,
        startPlayback: PlaybackManager.startPlayback, // For streaming
        downloadAndCacheTrack: downloadAndCacheTrack, // For caching
    });

    /**
     * Downloads a track from the Discover section and adds it to the library.
     * @param {object} track - The track object from the Jamendo API.
     */
    async function downloadAndCacheTrack(track) {
        if (!track || !track.id) {
            showMessage('Invalid track data provided.');
            return;
        }

        // Check if track is already in the library
        if (playerContext.libraryTracks.some(t => t.id === track.id.toString())) {
            showMessage(`"${track.name}" is already in your library.`);
            return;
        }

        showMessage(`Downloading "${track.name}"...`);

        try {
            const response = await fetch(`/download/${track.id}`);
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            
            const { audioUrl, trackData } = await response.json();
            if (!audioUrl) throw new Error('No audio URL returned from server.');

            // Fetch the actual audio file as a blob
            // We use CORS here because the audioUrl is from a different domain (jamendo.com)
            const audioResponse = await fetch(audioUrl, { mode: 'cors' });
            if (!audioResponse.ok) throw new Error(`Failed to fetch audio from Jamendo. Status: ${audioResponse.status}`);
            const audioBlob = await audioResponse.blob();

            // Create a File-like object to pass to handleFiles
            // Use the original filename from Jamendo if available, otherwise construct one
            const fileName = trackData.name ? `${trackData.name}.mp3` : `${track.id}.mp3`;
            const audioFile = new File([audioBlob], fileName, { type: 'audio/mpeg' });
            
            // Use the existing file handling logic to process and save the track
            await handleFiles([audioFile], { isFromDiscover: true, discoverData: trackData });
            showMessage(`Successfully added "${track.name}" to your library!`);
        } catch (error) {
            console.error('Error downloading or caching track:', error);
            showMessage(`Failed to add "${track.name}" to library. Please try again.`);
        }
    }

    // --- Theme Toggle Logic ---
    const themeToggle = document.getElementById('theme-toggle-checkbox');
    const THEME_KEY = 'genesis_theme';

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            if (themeToggle) themeToggle.checked = true;
        } else {
            document.body.classList.remove('dark-theme');
            if (themeToggle) themeToggle.checked = false;
        }
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            const newTheme = themeToggle.checked ? 'dark' : 'light';
            localStorage.setItem(THEME_KEY, newTheme);
            applyTheme(newTheme);
        });
    }
    applyTheme(localStorage.getItem(THEME_KEY) || 'light'); // Apply saved or default theme

    // --- Navigation Logic ---
    function switchSection(targetId) {
        // Hide all sections
        mainSections.forEach(section => section.classList.add('hidden'));
        
        // Also hide detail views when switching main sections
        if (albumDetailView) albumDetailView.classList.add('hidden');
        if (artistDetailView) artistDetailView.classList.add('hidden');

        // Show target section
        const target = document.getElementById(targetId);
        if (target) target.classList.remove('hidden');

        // Update active state in Sidebar
        menuItems.forEach(item => {
            if (item.dataset.target === targetId) item.classList.add('active');
            else item.classList.remove('active');
        });

        // Update active state in Bottom Nav
        bottomNavItems.forEach(item => {
            if (item.dataset.target === targetId) item.classList.add('active');
            else item.classList.remove('active');
        });
    }

    menuItems.forEach(item => {
        item.addEventListener('click', () => switchSection(item.dataset.target));
    });
    
    bottomNavItems.forEach(item => {
        item.addEventListener('click', () => switchSection(item.dataset.target));
    });

    // --- Player Core ---
    function renderQueue() {
        // This function now renders both the main queue table and the home grid
        renderQueueTable(); // Renders the play queue
        renderHomeGrid();
        renderLibraryGrid();
    }

    function renderHomeGrid() {
        if (!recentMediaGrid) return;
        
        // Show the last 12 items as "recent"
        const recentTracks = [...playerContext.libraryTracks].reverse().slice(0, 12);

        if (recentTracks.length === 0) {
            recentMediaGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Your recent media will appear here.</div>`;
            return;
        }

        recentMediaGrid.innerHTML = recentTracks.map((track) => {
            const libraryIndex = playerContext.libraryTracks.findIndex(t => t.id === track.id);
            return `
                <div class="recent-media-card" data-track-id="${track.id}">
                    <div class="album-art">
                        ${track.coverURL ? `<img src="${track.coverURL}" alt="${track.name}">` : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`}
                    </div>
                    <div class="card-footer">
                        <h5>${track.name}</h5>
                        <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners
        recentMediaGrid.querySelectorAll('.recent-media-card').forEach(card => {
            const trackId = card.dataset.trackId;
            const libraryIndex = playerContext.libraryTracks.findIndex(t => t.id === trackId);

            card.addEventListener('click', (e) => {
                if (e.target.closest('.track-action-btn')) return;
                // Clicking a home item now adds it to the queue and plays it.
                if (libraryIndex > -1 && playerContext.libraryTracks[libraryIndex].objectURL) {
                    playerContext.trackQueue = [playerContext.libraryTracks[libraryIndex]]; // Replace queue with this track
                    loadTrack(0); // Play the first (and only) track in the new queue
                }
            });

            card.querySelector('.track-action-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                renderTrackContextMenu(trackId, e.currentTarget, { isFromLibrary: true });
            });
        });
    }

    function renderLibraryGrid() {
        if (!libraryGrid) return;

        // Show all tracks, sorted alphabetically by name
        const sortedTracks = [...playerContext.libraryTracks].sort((a, b) => a.name.localeCompare(b.name));

        if (sortedTracks.length === 0) {
            libraryGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Your library is empty. Open some files to get started.</div>`;
            return;
        }

        libraryGrid.innerHTML = sortedTracks.map((track) => {
            return `
                <div class="recent-media-card" data-track-id="${track.id}">
                    <div class="album-art">
                        ${track.coverURL ? `<img src="${track.coverURL}" alt="${track.name}">` : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`}
                    </div>
                    <div class="card-footer">
                        <h5>${track.name}</h5>
                        <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners
        libraryGrid.querySelectorAll('.recent-media-card').forEach(card => {
            const trackId = card.dataset.trackId;
            const libraryIndex = playerContext.libraryTracks.findIndex(t => t.id === trackId);

            card.addEventListener('click', (e) => {
                if (e.target.closest('.track-action-btn')) return;
                if (libraryIndex > -1 && playerContext.libraryTracks[libraryIndex].objectURL) {
                    // Create a new sorted queue from the library
                    const newQueue = [...playerContext.libraryTracks].sort((a, b) => a.name.localeCompare(b.name));
                    // Find the index of the clicked track in the new sorted queue
                    const newQueueIndex = newQueue.findIndex(t => t.id === trackId);
                    if (newQueueIndex > -1) {
                        playerContext.trackQueue = newQueue; // Set the global queue
                        loadTrack(newQueueIndex); // Play from the correct index
                    }
                }
            });

            card.querySelector('.track-action-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                renderTrackContextMenu(trackId, e.currentTarget, { isFromLibrary: true });
            });
        });
    }

    async function handleRemoveTrack(trackId) {
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

        await LibraryManager.removeTrack(trackId);
        // Also remove from play queue if it exists there
        const queueIndex = playerContext.trackQueue.findIndex(t => t.id === trackId);
        if (queueIndex > -1) {
            playerContext.trackQueue.splice(queueIndex, 1);
            if (queueIndex < playerContext.currentTrackIndex) {
                playerContext.currentTrackIndex--;
            } else if (queueIndex === playerContext.currentTrackIndex) {
                // If it was the current track, stop playback and try to play next
                pauseTrack();
                if (playerContext.trackQueue.length > 0) {
                    // Play the next available track
                    PlaybackManager.loadTrack(playerContext.currentTrackIndex % playerContext.trackQueue.length);
                } else {
                    playerContext.currentTrackIndex = -1;
                }
            }
        }

        QueueManager.renderQueueTable();
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
                    <input type="checkbox" class="track-select-checkbox" data-id="${trackId}">
                    <span class="track-num">${index + 1}</span>
                    <span class="track-title">${trackData.name || 'Unknown Title'}</span>
                    <span class="track-album">${secondaryInfo}</span>
                    <span class="track-duration">${formatTime(trackData.duration)}</span>
                    <button class="control-btn small track-action-btn" title="More options"><i class="fas fa-ellipsis-v"></i></button>
                `;

                row.addEventListener('click', e => {
                    if (e.target.closest('.track-action-btn') || e.target.type === 'checkbox') {
                        return;
                    }
                    PlaybackManager.startPlayback(trackIds, index);
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

        // Add event listener for the "Select All" checkbox in the header
        const selectAllCheckbox = container.previousElementSibling.querySelector('.select-all-checkbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const isChecked = e.currentTarget.checked;
                const trackCheckboxes = container.querySelectorAll('.track-select-checkbox');
                
                trackCheckboxes.forEach(checkbox => {
                    const trackId = checkbox.dataset.id;
                    // Only change state if it's not already in the desired state
                    if (checkbox.checked !== isChecked) {
                        checkbox.checked = isChecked;
                        checkbox.closest('.track-list-row').classList.toggle('selected', isChecked);
                        toggleTrackSelection(trackId); // This will add/remove from the Set
                    }
                });
            });
        }
    }

    function toggleTrackSelection(trackId) {
        if (playerContext.selectedTrackIds.has(trackId)) {
            playerContext.selectedTrackIds.delete(trackId);
        } else {
            playerContext.selectedTrackIds.add(trackId);
        }
        updateSelectionBar();
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

    function updatePlaybackBar(track) {
        const titleEl = document.getElementById('song-title');
        const trackName = track.name;
        titleEl.textContent = trackName;
        artistName.textContent = track.artist || (track.isURL ? 'Web Stream' : 'Unknown Artist'); // Keep artist on a separate line for clarity
        
        // Update album art
        const artImg = document.getElementById('album-art-img');
        const placeholder = document.getElementById('album-art-placeholder');
        if (track.coverURL && artImg) {
            artImg.src = track.coverURL;
            artImg.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
        } else {
            if (artImg) { artImg.src = ''; artImg.classList.add('hidden'); }
            if (artImg) {
                artImg.classList.add('hidden'); // Hide the image tag
                artImg.src = ''; // Clear the source
            }
            if (placeholder) placeholder.classList.remove('hidden');
        }

        // Update extended info panel if it's open
        if (extendedInfoPanel.classList.contains('active')) {
            updateExtendedInfoPanel(track);
        }
    }

    function updateExtendedInfoPanel(track) {
        if (track) {
            extendedInfoArt.innerHTML = track.coverURL 
                ? `<img src="${track.coverURL}" alt="Album Art">`
                : `<div class="placeholder-icon"><i class="fas fa-music"></i></div>`;
            extendedInfoTitle.textContent = track.name;
            extendedInfoArtist.textContent = track.artist || 'Unknown Artist';
            // In a real scenario, you would also fetch and display lyrics here.
            
            // Reset lyric state for the new track
            currentLyricIndex = -1;

            // Update lyrics display
            if (track.syncedLyrics && track.syncedLyrics.length > 0) {
                // Render LRC lyrics as individual lines
                lyricsContainer.innerHTML = track.syncedLyrics.map((line, index) => 
                    `<p class="lyric-line" data-index="${index}">${line.text || '&nbsp;'}</p>`
                ).join('');
            } else if (track.lyrics) {
                // Format lyrics by replacing newlines with <br> tags for HTML display
                lyricsContainer.innerHTML = track.lyrics.replace(/\n/g, '<br>');
            } else {
                lyricsContainer.innerHTML = '<p class="lyric-line" style="color: var(--text-color); font-style: italic;">No lyrics found for this track.</p>';
            }
        }
    }


    // --- Context Menu Functions ---
    
    function closeContextMenu() {
        if (openContextMenu) { // Use local `openContextMenu`
            openContextMenu.classList.remove('active');
            openContextMenu.remove(); // Clean up from DOM
            openContextMenu = null;
        }
    }

    // Global click listener to close the menu when clicking anywhere else
    document.addEventListener('click', (event) => {
        if (openContextMenu && !openContextMenu.contains(event.target) && !event.target.closest('.track-action-btn')) { // Use local `openContextMenu`
            closeContextMenu();
        }
    });

    function renderTrackContextMenu(trackId, buttonElement, options = {}) {
        closeContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu';

        const menuItems = [];

        // Standard Actions
        menuItems.push({ action: 'play', icon: 'fas fa-play', text: 'Play Song' });
        menuItems.push({ action: 'play-next', icon: 'fas fa-step-forward', text: 'Play Next' });
        
        const submenu = document.createElement('div');
        submenu.className = 'context-menu-submenu';

        // Option to create a new playlist
        const createNewPlaylistItem = document.createElement('div');
        createNewPlaylistItem.className = 'context-menu-item';
        createNewPlaylistItem.innerHTML = `<i class="fas fa-plus-circle"></i> <span>Create New Playlist</span>`;
        createNewPlaylistItem.addEventListener('click', () => {
            const newName = prompt('Enter new playlist name:');
            if (newName && newName.trim()) {
                const newPlaylistId = PlaylistManager.createPlaylist(newName, false); // Create without re-rendering everything yet
                if (newPlaylistId) {
                    PlaylistManager.addTrackToPlaylist(newPlaylistId, trackId);
                    showMessage(`Added track to new playlist "${newName.trim()}".`);
                    PlaylistManager.refresh(); // Now render all playlist views
                }
            }
            closeContextMenu();
        });
        submenu.appendChild(createNewPlaylistItem);

        const playlistIds = Object.keys(PlaylistManager.getPlaylists());
        if (playlistIds.length > 0) {
            playlistIds.forEach(pId => {
                const p = PlaylistManager.getPlaylists()[pId];
                const submenuItem = document.createElement('div');
                submenuItem.className = 'context-menu-item';
                submenuItem.innerHTML = `<i class="fas fa-list-ul"></i> <span>${p.name}</span>`;
                submenuItem.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent parent menu item click
                    PlaylistManager.addTrackToPlaylist(pId, trackId);
                    showMessage(`Added track to "${p.name}".`);
                    closeContextMenu();
                });
                submenu.appendChild(submenuItem);
            });
        } else {
            // No need for a "No playlists" message if "Create New" is always there
        }

        // Add other actions based on context
        if (options.isFromPlaylist) {
            menuItems.push({ 
                action: 'remove-from-playlist', 
                icon: 'fas fa-minus-circle', 
                text: 'Remove from this Playlist' 
            });
        }

        if (options.isFromLibrary) {
            menuItems.push({ action: 'add-to-queue', icon: 'fas fa-list-ol', text: 'Add to Play Queue' });
            menuItems.push({ action: 'remove-from-library', icon: 'fas fa-trash', text: 'Remove from Library' });
        }
        if (options.isFromQueue) { // From the queue view
            menuItems.push({ action: 'remove-from-queue', icon: 'fas fa-times', text: 'Remove from Queue' });
        }

        // More info actions
        menuItems.push({ action: 'edit-info', icon: 'fas fa-edit', text: 'Edit Info' });
        menuItems.push({ action: 'properties', icon: 'fas fa-info-circle', text: 'Properties' });

        // Create and append the "Add to Playlist" item with its submenu
        const addToPlaylistItem = document.createElement('div');
        addToPlaylistItem.className = 'context-menu-item has-submenu';
        addToPlaylistItem.innerHTML = `<i class="fas fa-plus"></i> <span>Add to Playlist</span> <i class="fas fa-chevron-right submenu-arrow"></i>`;
        addToPlaylistItem.appendChild(submenu);
        menu.appendChild(addToPlaylistItem);

        menuItems.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = `context-menu-item ${item.disabled ? 'disabled' : ''}`;
            itemEl.innerHTML = `<i class="${item.icon}"></i> <span>${item.text}</span>`;
            itemEl.addEventListener('click', async () => { // Make the handler async to use await
                if (item.disabled) return;

                const libraryIndex = playerContext.libraryTracks.findIndex(t => t.id === trackId);
                if (libraryIndex === -1) return;
                const track = playerContext.libraryTracks[libraryIndex];

                if (item.action === 'play') {
                    playerContext.trackQueue = [track]; // Replace queue with this track
                    PlaybackManager.loadTrack(0);
                } else if (item.action === 'play-next') {
                    if (playerContext.currentTrackIndex === -1) {
                        // If nothing is playing, just add to queue and play
                        playerContext.trackQueue.unshift(track);
                        loadTrack(0);
                    } else {
                        // Insert after the current track
                        playerContext.trackQueue.splice(playerContext.currentTrackIndex + 1, 0, track);
                    }
                    QueueManager.renderQueueTable();
                    showMessage(`"${track.name}" will play next.`);
                } else if (item.action === 'add-to-queue') {
                    if (!playerContext.trackQueue.find(t => t.id === trackId)) {
                        playerContext.trackQueue.push(track);
                    }
                    if (playerContext.currentTrackIndex === -1) PlaybackManager.loadTrack(playerContext.trackQueue.length - 1);
                    QueueManager.renderQueueTable();
                    showMessage(`Added "${track.name}" to queue.`);
                } else if (item.action === 'remove-from-library') {
                    const confirmed = await showConfirmation(
                        'Remove from Library',
                        `Are you sure you want to permanently remove "<strong>${track.name}</strong>" from your library? This action cannot be undone.`
                    );
                    if (confirmed) {
                        handleRemoveTrack(trackId); // Use trackId for consistency
                    }
                } else if (item.action === 'remove-from-queue' && options.isFromQueue) {
                    const queueIndex = playerContext.trackQueue.findIndex(t => t.id === trackId);
                    if (queueIndex > -1) {
                        playerContext.trackQueue.splice(queueIndex, 1);
                        // If we removed a track that was before the current one,
                        // we need to decrement the current index.
                        if (queueIndex < playerContext.currentTrackIndex) {
                            playerContext.currentTrackIndex--;
                        }
                    }
                    QueueManager.renderQueueTable();
                } else if (item.action === 'remove-from-playlist' && options.playlistId) {
                    PlaylistManager.removeTrackFromPlaylist(options.playlistId, trackId);
                    PlaylistManager.refresh(options.playlistId); // Refresh the view
                    showMessage(`Removed track from playlist.`);
                } else if (item.action === 'properties') {
                    showMessage(`<b>${track.name}</b><br>Artist: ${track.artist || 'N/A'}<br>Album: ${track.album || 'N/A'}<br>Duration: ${formatTime(track.duration)}`);
                } else if (item.action === 'edit-info') {
                    openEditModal(trackId);
                }
                closeContextMenu();
            });
            menu.appendChild(itemEl);
        });

        // Append menu to the button's parent container
        buttonElement.closest('.track-list-row, .queue-item, .recent-media-card').appendChild(menu);

        setTimeout(() => {
            menu.classList.add('active');
            openContextMenu = menu;
        }, 10);
    }

    function openEditModal(trackId) {
        const track = playerContext.libraryTracks.find(t => t.id === trackId);
        if (!track) return;

        editTrackIdInput.value = track.id;
        editTitleInput.value = track.name || '';
        editArtistInput.value = track.artist || '';
        editAlbumInput.value = track.album || '';
        editLyricsInput.value = track.lyrics || '';

        editModal.classList.remove('hidden');
    }

    function saveTrackChanges() {
        const trackId = editTrackIdInput.value;
        const track = playerContext.libraryTracks.find(t => t.id === trackId);
        if (!track) return;

        // Update the track object in the main library
        track.name = editTitleInput.value.trim();
        track.artist = editArtistInput.value.trim();
        track.album = editAlbumInput.value.trim();
        track.lyrics = editLyricsInput.value;

        // Re-parse lyrics in case they were changed to LRC format
        track.syncedLyrics = parseLRC(track.lyrics);

        // Update the same track if it's in the play queue
        const queueTrack = playerContext.trackQueue.find(t => t.id === trackId);
        if (queueTrack) {
            Object.assign(queueTrack, track);
        }

        // Persist changes and update UI
        saveLibraryMetadata();
        renderHomeGrid();
        renderLibraryGrid();
        QueueManager.renderQueueTable();
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

        try {
            await LibraryManager.handleFiles(fileList, options);
        } catch (error) {
            console.error("Error handling files:", error);
        } finally {
            openMenuBtn.disabled = false;
            openMenuText.textContent = originalText;
        }
    }

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

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files, {}));
    folderInput.addEventListener('change', (e) => handleFiles(e.target.files, {}));

    urlCancelBtn.addEventListener('click', () => urlModal.classList.add('hidden'));
    urlLoadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        const newTrack = {
            id: Date.now().toString(), // URL tracks don't need persistent IDs
            name: url.split('/').pop() || "Stream",
            duration: 0, 
            isURL: true,
            objectURL: url,
            coverURL: null
        };
        playerContext.libraryTracks.push(track);
        LibraryManager.saveLibraryMetadata();
        renderHomeGrid(); // Update UI
        renderLibraryGrid();
        urlModal.classList.add('hidden');
        urlInput.value = '';
        // Do not auto-play
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
            // This is a simplified version. A proper implementation would show a playlist modal.
            const playlistId = prompt("Enter the ID of the playlist to add tracks to (for now).");
            if (playlistId) {
                playerContext.selectedTrackIds.forEach(trackId => PlaylistManager.addTrackToPlaylist(playlistId, trackId));
                showMessage(`Added ${playerContext.selectedTrackIds.size} tracks to the playlist.`);
                clearSelection();
            }
        });
    }

    function handleTimeUpdate() {
        const { currentTime, duration } = audioPlayer;
        if (!isNaN(duration)) {
            const pct = (currentTime / duration) * 100;
            progressFill.style.width = `${pct}%`;
            progressHead.style.left = `${pct}%`; // Update head position
            currentTimeEl.textContent = formatTime(currentTime);
            durationEl.textContent = formatTime(duration);
            savePlaybackState(); // Periodically save progress
            updateLyrics(currentTime); // Sync lyrics
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

    // Initialize
    restoreSession();

    const searchDropdown = document.getElementById('search-dropdown');

    const sidebarPlaylistsContainer = document.getElementById('sidebar-playlists');
    sidebarPlaylistsContainer.addEventListener('click', (e) => switchSection('queue-view-section'))

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

        const results = playerContext.trackQueue
            .map((t, idx) => ({ t, idx }))
            .filter(({ t }) => t.name.toLowerCase().includes(query))
            .slice(0, 8);

        if (results.length === 0) {
            searchDropdown.innerHTML = `<div class="no-results">No results found for "${query}"</div>`;
            highlightedSearchIndex = -1;
            searchDropdown.classList.remove('hidden');
            return;
        }

        searchDropdown.innerHTML = results.map(({ t, idx }) => {
            const duration = t.duration ? formatTime(t.duration) : '';
            const icon = t.isURL ? '<i class="fas fa-globe"></i>' : '<i class="fas fa-music"></i>';
            return `
                <div class="result-item" data-idx="${idx}" role="option">
                    ${icon}
                    <div class="label">${t.name}</div>
                    <div class="meta">${duration}</div>
                </div>
            `;
        }).join('');
        highlightedSearchIndex = -1; // Reset on new render
        searchDropdown.classList.remove('hidden');

        // Attach click handlers for results
        searchDropdown.querySelectorAll('.result-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const idx = parseInt(el.dataset.idx, 10);
                if (!isNaN(idx) && playerContext.trackQueue[idx]?.objectURL) {
                    loadTrack(idx);
                    searchDropdown.classList.add('hidden');
                    renderQueueTable();
                } else {
                    showMessage('Selected track is not available. Re-open the file.');
                }
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
                // Call your existing play/pause function
                if (audioPlayer.paused) {
                    playTrack();
                } else {
                    pauseTrack();
                }
                break;
            
            case 'ArrowRight': // Right Arrow for Next Track
                event.preventDefault(); 
                if (nextBtn) nextTrack(); // Assumes you have a nextTrack() function
                break;

            case 'ArrowLeft': // Left Arrow for Previous Track
                event.preventDefault();
                if (prevBtn) prevTrack(); // Assumes you have a prevTrack() function
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

    // Library View Toggle Logic
    if (libraryGridViewBtn && libraryListViewBtn && libraryGrid) {
        libraryGridViewBtn.addEventListener('click', () => {
            libraryGrid.classList.remove('list-view');
            libraryGridViewBtn.classList.add('active');
            libraryListViewBtn.classList.remove('active');
            localStorage.setItem('genesis_library_view', 'grid');
        });

        libraryListViewBtn.addEventListener('click', () => {
            libraryGrid.classList.add('list-view');
            libraryListViewBtn.classList.add('active');
            libraryGridViewBtn.classList.remove('active');
            localStorage.setItem('genesis_library_view', 'list');
        });
    }

    if (libraryPlayAllBtn) {
        libraryPlayAllBtn.addEventListener('click', () => {
            if (playerContext.libraryTracks.length > 0) {
                PlaybackManager.startPlayback(playerContext.libraryTracks.map(t => t.id), 0);
                showMessage(`Playing all ${playerContext.libraryTracks.length} tracks from your library.`);
            }
        });
    }

    // Extended Info Panel Logic
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

}); // close DOMContentLoaded listener
// --- Functions for other modules ---

/**
 * Parses LRC formatted text into an array of timed lyric objects.
 * @param {string} lrcText The raw LRC string.
 * @returns {Array<{time: number, text: string}>}
 */
export function parseLRC(lrcText) {
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

/**
 * Retrieves the full track object from the library by its ID.
 * @param {string} trackId The ID of the track to find.
 * @returns {Promise<object>} A promise that resolves with the track data.
 */

const startPlayback = PlaybackManager.startPlayback;
const loadTrack = PlaybackManager.loadTrack;

/**
 * Updates the active lyric line based on the current playback time.
 * @param {number} currentTime The current time of the audio player.
 */
export function updateLyrics(currentTime) {
    // Check if playerContext.trackQueue and playerContext.currentTrackIndex are valid
    if (!playerContext.trackQueue || playerContext.currentTrackIndex < 0 || playerContext.currentTrackIndex >= playerContext.trackQueue.length) return;

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
