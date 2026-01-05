import { playerContext } from './state.js';
import * as Utils from './utils.js';
import * as UI from './ui-manager.js';
import * as LibraryManager from './library-manager.js';
import * as PlaybackManager from './playback-manager.js';
import * as PlaylistManager from './playlist-manager.js';
import * as QueueManager from './queue-manager.js';
import * as AlbumManager from './album-manager.js';
import * as ArtistManager from './artist-manager.js';
import * as DiscoverManager from './discover-manager.js';
import * as ProfileManager from './profile-manager.js';
import * as ContextMenuManager from './context-menu-manager.js';
import { refreshLyrics, openManualLyricsSearch } from './lyrics-manager.js';

document.addEventListener('DOMContentLoaded', async function () {

    // --- 1. Dependency Injection / Wiring ---

    // Library needs Playback (for card clicks) and ContextMenu
    LibraryManager.setLibraryDependencies(
        PlaybackManager.startPlayback,
        ContextMenuManager.renderTrackContextMenu
    );

    // Playlist needs Playback and ContextMenu closure
    PlaylistManager.setPlaylistDependencies(
        PlaybackManager.startPlayback,
        ContextMenuManager.closeContextMenu
        // UI.openAddToPlaylistModal is used internally by importing it from playlist-manager itself if implemented there
        // or we need to expose it. For now, assuming internal imports work.
    );

    // Album and Artist need Playback
    AlbumManager.setAlbumDependencies(PlaybackManager.startPlayback);
    ArtistManager.setArtistDependencies(PlaybackManager.startPlayback);

    // Discover needs Playback
    DiscoverManager.setDiscoverDependencies(PlaybackManager.startPlayback);

    // Queue needs Playback actions
    QueueManager.setQueueActions(
        PlaybackManager.loadTrack,
        PlaybackManager.removeFromQueue
    );

    ProfileManager.initProfileListeners();

    // Context Menu registers itself to be closed by UI interactions
    // In ContextMenuManager, we export setActiveContextMenu. 
    // We can use a global click listener here to close it.
    window.setActiveContextMenu = ContextMenuManager.setActiveContextMenu;

    // --- 2. Initialization ---

    // Load Data
    await LibraryManager.loadLibraryFromDB();
    PlaylistManager.loadPlaylists();

    // Render Initial Views
    LibraryManager.renderHomeGrid();
    ProfileManager.renderProfile();

    // Restore Library View Mode
    const savedLibraryView = localStorage.getItem('genesis_library_view') || 'grid';
    UI.switchLibraryView(savedLibraryView);

    LibraryManager.renderLibraryGrid();
    AlbumManager.renderAlbumsGrid();
    ArtistManager.renderArtistsGrid();
    PlaylistManager.renderPlaylists();

    const discoverSearchInput = document.getElementById('discover-search-input');
    const discoverSearchBtn = document.getElementById('discover-search-btn');

    // Initial Discover Fetch (it handles storage check now)
    DiscoverManager.renderDiscoverGrid();

    // Restore Global Selection
    LibraryManager.restoreSelection();

    // Restore Search
    UI.restoreSearch();
    const discoverLastSearch = localStorage.getItem('genesis_discover_search');
    if (discoverLastSearch && discoverSearchInput) {
        discoverSearchInput.value = discoverLastSearch;
    }

    // Restore Playback State (depends on Library loaded)
    await PlaybackManager.restorePlaybackState();

    // Restore UI State (Last Section)
    const lastSection = localStorage.getItem('genesis_active_section');
    const lastDetailId = localStorage.getItem('genesis_active_detail_id');

    if (lastSection) {
        if (lastSection === 'playlist-detail-view' && lastDetailId) {
            PlaylistManager.openPlaylistView(lastDetailId);
        } else if (lastSection === 'album-detail-view' && lastDetailId) {
            AlbumManager.openAlbumByName(lastDetailId);
        } else if (lastSection === 'artist-detail-view' && lastDetailId) {
            ArtistManager.openArtistByName(lastDetailId);
        } else if (lastSection === 'favorites-section') {
            LibraryManager.renderFavoritesGrid();
            UI.switchSection('favorites-section');
        } else {
            UI.switchSection(lastSection);
        }
    } else {
        UI.switchSection('home-section');
    }


    // --- 3. Event Listeners ---

    // Navigation
    const menuItems = UI.elements.menuItems();
    const bottomNavItems = UI.elements.bottomNavItems();
    [...menuItems, ...bottomNavItems].forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            UI.switchSection(target);
            // Auto-hide sidebar on mobile
            if (window.innerWidth <= 768) {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) sidebar.classList.remove('active');
            }
            // Special handling for discover tab
            if (target === 'discover-section' && playerContext.discoverTracks.length === 0) {
                DiscoverManager.renderDiscoverGrid();
            }
            // Special handling for favorites
            if (target === 'favorites-section') {
                LibraryManager.renderFavoritesGrid();
            }
        });
    });

    // Theme
    if (UI.elements.themeToggle()) {
        UI.elements.themeToggle().addEventListener('change', () => {
            const newTheme = UI.elements.themeToggle().checked ? 'dark' : 'light';
            localStorage.setItem('genesis_theme', newTheme);
            UI.applyTheme(newTheme);
        });
    }
    // Apply initial theme
    UI.applyTheme(localStorage.getItem('genesis_theme') || 'light');

    // Sidebar
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle && sidebar) {
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

    // Audio Player Events
    const audioPlayer = document.getElementById('audio-player');
    if (audioPlayer) {
        audioPlayer.addEventListener('timeupdate', PlaybackManager.getTimeHandler());
        audioPlayer.addEventListener('ended', PlaybackManager.nextTrack);
    }

    // Playback Controls
    document.getElementById('play-btn')?.addEventListener('click', () => (playerContext.isPlaying ? PlaybackManager.pauseTrack() : PlaybackManager.playTrack()));
    document.getElementById('next-btn')?.addEventListener('click', PlaybackManager.nextTrack);
    document.getElementById('prev-btn')?.addEventListener('click', PlaybackManager.prevTrack);
    document.getElementById('shuffle-btn')?.addEventListener('click', PlaybackManager.toggleShuffle);
    document.getElementById('repeat-btn')?.addEventListener('click', PlaybackManager.toggleRepeat);
    document.getElementById('library-play-all-btn')?.addEventListener('click', () => {
        const tracks = [...playerContext.libraryTracks];
        if (tracks.length > 0) {
            PlaybackManager.startPlayback(tracks.map(t => t.id), 0, false);
        }
    });

    // Progress Bar Drag
    PlaybackManager.initProgressBarListeners();

    // Volume Controls
    const volumeBtn = document.getElementById('volume-btn');
    const volumePopup = document.getElementById('volume-popup');
    const volumeSlider = document.getElementById('volume-slider');
    const muteBtn = document.getElementById('mute-btn');

    if (volumeBtn && volumePopup) {
        volumeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (volumeSlider) volumeSlider.value = audioPlayer.volume;
            const volumePercentage = document.getElementById('volume-percentage');
            if (volumePercentage) volumePercentage.textContent = Math.round(audioPlayer.volume * 100);
            volumePopup.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!volumePopup.contains(e.target) && !volumeBtn.contains(e.target)) {
                volumePopup.classList.remove('active');
            }
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            audioPlayer.volume = val;
            audioPlayer.muted = false;
            PlaybackManager.savePlaybackState();
            // Update UI Icons (simplified here, ideal to move to UI manager)
            const volumePercentage = document.getElementById('volume-percentage');
            if (volumePercentage) volumePercentage.textContent = Math.round(val * 100);

            // ... icon updating logic ...
            // We can refactor this into ui-manager updateVolumeUI(val)
        });
    }

    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            audioPlayer.muted = !audioPlayer.muted;
            // ... update icon ...
        });
    }

    // Search
    const searchInput = UI.elements.searchInput();
    if (searchInput) {
        const handleSearchInput = Utils.debounce(() => {
            const query = searchInput.value.trim();
            localStorage.setItem('genesis_last_search', query);
            UI.renderSearchDropdown();
        }, 180);
        searchInput.addEventListener('input', handleSearchInput);
        searchInput.addEventListener('click', (e) => { e.stopPropagation(); UI.renderSearchDropdown(); });

        // Keyboard nav for search
        searchInput.addEventListener('keydown', (e) => {
            // ... move logic to ui-manager or utils? 
            // Logic deals with DOM elements in dropdown. 
            // Ideally UI.handleSearchKeydown(e);
            const items = UI.elements.searchDropdown().querySelectorAll('.result-item');
            if (items.length === 0) return;
            // ... implementation ...
        });

        document.addEventListener('click', (e) => {
            const withinSearch = e.target.closest('.search-bar') || e.target.closest('#search-dropdown');
            if (!withinSearch) UI.elements.searchDropdown().classList.add('hidden');
        });
    }

    // Discover Search
    if (discoverSearchInput && discoverSearchBtn) {
        const performSearch = () => {
            const query = discoverSearchInput.value.trim();
            localStorage.setItem('genesis_discover_search', query);
            DiscoverManager.renderDiscoverGrid(query);
        };
        discoverSearchBtn.addEventListener('click', performSearch);
        discoverSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(); });
    }

    // Open Menu (File Input)
    const openMenuBtn = document.getElementById('open-menu-btn');
    const openMenuDropdown = document.getElementById('open-menu-dropdown');
    if (openMenuBtn && openMenuDropdown) {
        openMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMenuDropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', () => openMenuDropdown.classList.add('hidden'));
    }

    const fileInput = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');
    if (fileInput) fileInput.addEventListener('change', (e) => LibraryManager.handleFiles(e.target.files));
    if (folderInput) folderInput.addEventListener('change', (e) => LibraryManager.handleFiles(e.target.files));

    document.getElementById('open-files-option')?.addEventListener('click', () => fileInput.click());
    document.getElementById('open-folder-option')?.addEventListener('click', () => folderInput.click());

    // Drag and Drop
    document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); document.body.classList.add('dragover'); });
    document.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); document.body.classList.remove('dragover'); });
    document.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation(); document.body.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) LibraryManager.handleFiles(e.dataTransfer.files);
    });

    // Modals
    // Message Modal Close
    const msgCloseBtn = document.getElementById('msg-close-btn');
    if (msgCloseBtn) {
        msgCloseBtn.addEventListener('click', () => {
            document.getElementById('message-modal').classList.add('hidden');
        });
    }

    // Global Modal Click-Away
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            // Special handling for confirmation modal to resolve its promise
            if (event.target.id === 'confirm-modal') {
                document.getElementById('confirm-cancel-btn')?.click();
            } else {
                event.target.classList.add('hidden');
            }
        }
    });

    // Open URL modal handlers...
    const urlModal = document.getElementById('url-modal');
    const urlInput = document.getElementById('url-input');
    const urlCancelBtn = document.getElementById('url-cancel-btn');
    if (urlCancelBtn) urlCancelBtn.addEventListener('click', () => urlModal.classList.add('hidden'));

    const urlLoadBtn = document.getElementById('url-load-btn');
    if (urlLoadBtn && urlInput) {
        urlLoadBtn.addEventListener('click', () => {
            const url = urlInput.value.trim();
            if (url) {
                PlaybackManager.startPlayback([url]);
                urlModal.classList.add('hidden');
                urlInput.value = '';
            }
        });
    }

    // Section Action Buttons (Arrows -> Open full views)
    // Artists
    const artistsArrow = document.querySelector('#home-section .section-header-row:nth-of-type(2) .section-action-btn');
    if (artistsArrow) artistsArrow.addEventListener('click', () => LibraryManager.openSectionModal('artists'));

    // Albums
    const albumsArrow = document.querySelector('#home-section .section-header-row:nth-of-type(3) .section-action-btn');
    if (albumsArrow) albumsArrow.addEventListener('click', () => LibraryManager.openSectionModal('albums'));

    // Suggestion Cards Click
    const suggestionContainer = document.getElementById('home-suggestions-container');
    if (suggestionContainer) {
        suggestionContainer.addEventListener('click', async (e) => {
            const card = e.target.closest('.suggestion-card');
            if (!card) return;

            const mixType = card.dataset.mixType;
            if (mixType) {
                const mixData = await DiscoverManager.fetchMix(mixType);
                if (mixData && mixData.tracks.length > 0) {
                    PlaylistManager.openPlaylistView({
                        id: `mix-${mixType}`,
                        name: mixData.name,
                        description: 'Curated mix based on your taste',
                        tracks: mixData.tracks,
                        isVirtual: true,
                        coverURL: mixData.tracks[0]?.coverURL
                    });
                }
            } else if (card.id === 'suggestion-quick-shuffle') {
                PlaybackManager.toggleShuffle();
                if (playerContext.libraryTracks.length) {
                    PlaybackManager.startPlayback(playerContext.libraryTracks.map(t => t.id), 0, true);
                }
            }
        });
    }
    // Edit Modal handlers...
    // Profile Pic handlers...
    const profilePicInput = document.getElementById('profile-pic-input');
    if (profilePicInput) {
        profilePicInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (eResult) {
                    const result = eResult.target.result;
                    localStorage.setItem('genesis_profile_pic', result);
                    ProfileManager.renderProfile();
                };
                reader.readAsDataURL(file);
            }
        });
    }
    const savedPic = localStorage.getItem('genesis_profile_pic');
    if (savedPic) {
        const profilePic = document.getElementById('profile-pic');
        if (profilePic) profilePic.src = savedPic;
    }

    // Global Keydown
    document.addEventListener('keydown', (event) => {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
        switch (event.key) {
            case ' ': event.preventDefault(); playerContext.isPlaying ? PlaybackManager.pauseTrack() : PlaybackManager.playTrack(); break;
            case 'ArrowRight': event.preventDefault(); PlaybackManager.nextTrack(); break;
            case 'ArrowLeft': event.preventDefault(); PlaybackManager.prevTrack(); break;
            case 'ArrowUp':
                event.preventDefault();
                audioPlayer.volume = Math.min(1.0, audioPlayer.volume + 0.1);
                if (volumeSlider) volumeSlider.value = audioPlayer.volume;
                break;
            case 'ArrowDown':
                event.preventDefault();
                audioPlayer.volume = Math.max(0.0, audioPlayer.volume - 0.1);
                if (volumeSlider) volumeSlider.value = audioPlayer.volume;
                break;
            case 'm':
            case 'M':
                event.preventDefault();
                audioPlayer.muted = !audioPlayer.muted;
                break;
        }
    });

    // Playlist Creation Button
    const createPlaylistBtn = document.getElementById('create-playlist-btn');
    if (createPlaylistBtn) {
        createPlaylistBtn.addEventListener('click', async () => {
            const name = await UI.showInputModal('New Playlist', 'Enter playlist name:', '', 'My Favorites');
            if (name && name.trim()) PlaylistManager.createPlaylist(name.trim(), true);
        });
    }

    // Floating Shuffle Button Logic
    const shuffleFab = document.getElementById('library-shuffle-fab');
    if (shuffleFab) {
        shuffleFab.addEventListener('click', () => {
            const tracks = [...playerContext.libraryTracks];
            if (tracks.length > 0) {
                // Shuffle logic
                for (let i = tracks.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
                }
                const trackIds = tracks.map(t => t.id);
                PlaybackManager.startPlayback(trackIds, 0, false);
            }
        });
    }

    // Suggestion Cards Actions
    document.getElementById('suggestion-quick-shuffle')?.addEventListener('click', () => {
        const tracks = [...playerContext.libraryTracks];
        if (tracks.length > 0) {
            for (let i = tracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
            }
            PlaybackManager.startPlayback(tracks.map(t => t.id), 0, false);
        }
    });

    document.getElementById('suggestion-recent-queue')?.addEventListener('click', () => {
        UI.switchSection('queue-view-section');
    });

    // Playback Bar Swiping (Gestures)
    const playbackBar = document.querySelector('.playback-bar');
    if (playbackBar) {
        let touchStartX = 0;
        playbackBar.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        playbackBar.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            const threshold = 50;
            if (touchEndX < touchStartX - threshold) {
                PlaybackManager.nextTrack(); // Swipe left -> Next
            } else if (touchEndX > touchStartX + threshold) {
                PlaybackManager.prevTrack(); // Swipe right -> Prev
            }
        }, { passive: true });
    }

    // Extended Info Panel Toggles
    const closeExtendedPanelBtn = document.getElementById('close-extended-panel-btn');
    const playbackBarTrackInfo = document.getElementById('playback-bar-track-info');
    const mainContent = document.querySelector('.main-content');
    const extendedInfoPanel = document.getElementById('extended-info-panel');

    if (playbackBarTrackInfo && extendedInfoPanel && closeExtendedPanelBtn && mainContent) {
        playbackBarTrackInfo.addEventListener('click', () => {
            // Update first!
            // We need a way to render extended info from here. 
            // PlaybackManager.updatePlaybackBar should handle it if active.
            // We can call it manually.
            extendedInfoPanel.classList.add('active');
            mainContent.classList.add('panel-active');

            const track = playerContext.trackQueue[playerContext.currentTrackIndex];
            if (track) PlaybackManager.updatePlaybackBar(track); // Re-trigger update to fill panel
        });

        closeExtendedPanelBtn.addEventListener('click', () => {
            extendedInfoPanel.classList.remove('active');
            mainContent.classList.remove('panel-active');
        });

        // Lyrics Controls
        const refreshLyricsBtn = document.getElementById('lyrics-refresh-btn');
        const searchLyricsBtn = document.getElementById('lyrics-search-btn');
        if (refreshLyricsBtn) refreshLyricsBtn.addEventListener('click', refreshLyrics);
        if (searchLyricsBtn) searchLyricsBtn.addEventListener('click', openManualLyricsSearch);
    }

    // Library View Toggles
    const gridViewBtn = document.getElementById('library-grid-view-btn');
    const listViewBtn = document.getElementById('library-list-view-btn');
    if (gridViewBtn && listViewBtn) {
        gridViewBtn.addEventListener('click', () => {
            UI.switchLibraryView('grid');
            LibraryManager.renderLibraryGrid();
        });
        listViewBtn.addEventListener('click', () => {
            UI.switchLibraryView('list');
            LibraryManager.renderLibraryGrid();
        });
    }

    // Play All Library (Removed/Redirected)
    const playAllLibBtn = document.getElementById('library-play-all-btn');
    if (playAllLibBtn) {
        playAllLibBtn.addEventListener('click', () => {
            document.getElementById('library-shuffle-fab')?.click();
        });
    }

    // Global Context Menu Closer
    document.addEventListener('click', (event) => {
        // If clicking outside the open context menu
        // We need access to the open menu element. 
        // ContextMenuManager manages it, but we can't easily access the DOM element to check 'contains' unless exposed.
        // Or ContextMenuManager sets a global handler.
        // But we want to avoid too many globals.
        // We added window.setActiveContextMenu. 
        // We can just call ContextMenuManager.closeContextMenu() if the click target is not a context menu.
        // But how to check?
        const menu = document.querySelector('.context-menu.active');
        if (menu && !menu.contains(event.target) && !event.target.closest('.track-action-btn') && !event.target.closest('.playlist-action-btn')) {
            ContextMenuManager.closeContextMenu();
        }
    });

    // Make refreshLibraryViews global for simple inter-module refreshing
    window.refreshLibraryViews = () => {
        LibraryManager.renderHomeGrid();
        LibraryManager.renderLibraryGrid();
        AlbumManager.renderAlbumsGrid();
        ArtistManager.renderArtistsGrid();
    };

});
