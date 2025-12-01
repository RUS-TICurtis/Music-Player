document.addEventListener('DOMContentLoaded', function() {
    // --- State ---
    const LOCAL_STORAGE_KEY = 'genesis_offline_playlist';
    const DB_NAME = 'GenesisAudioDB';
    const DB_STORE = 'audioFiles';
    
    let trackQueue = [];
    let currentTrackIndex = -1;
    let isPlaying = false;
    let isShuffled = false;
    let repeatState = 0; // 0: no-repeat, 1: repeat-all, 2: repeat-one
    let dbInstance = null;

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
    const songTitle = document.getElementById('song-title');
    const artistName = document.getElementById('artist-name');
    const queueList = document.getElementById('queue-list');
    // --- New DOM Elements for Playlist View (Add around Line 30) ---
    const playlistsListContainer = document.getElementById('playlists-list');
    const playlistDetailView = document.getElementById('playlist-detail-view');
    
    // Global reference for context menu
    let openContextMenu = null;
    
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

    // --- IndexedDB Logic (For Persistent Audio) ---
    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE);
                }
            };
            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    }

    function saveFileToDB(id, fileBlob) {
        return new Promise((resolve, reject) => {
            if (!dbInstance) return reject("DB not initialized");
            const transaction = dbInstance.transaction([DB_STORE], "readwrite");
            const store = transaction.objectStore(DB_STORE);
            const request = store.put(fileBlob, id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    function getFileFromDB(id) {
        return new Promise((resolve) => {
            if (!dbInstance) return resolve(null);
            const transaction = dbInstance.transaction([DB_STORE], "readonly");
            const store = transaction.objectStore(DB_STORE);
            const request = store.get(id);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = () => resolve(null);
        });
    }

    function deleteFileFromDB(id) {
        return new Promise((resolve) => {
            if (!dbInstance) return resolve();
            const transaction = dbInstance.transaction([DB_STORE], "readwrite");
            const store = transaction.objectStore(DB_STORE);
            store.delete(id);
            resolve();
        });
    }

    // --- Helpers ---
    function showMessage(msg) {
        msgText.textContent = msg;
        msgModal.classList.remove('hidden');
    }
    
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function savePlaylistMetadata() {
        const meta = trackQueue.map(t => ({
            id: t.id,
            name: t.name,
            duration: t.duration,
            isURL: t.isURL,
            url: t.isURL ? t.objectURL : null,
            coverURL: t.coverURL || null
        }));
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(meta));
    }

    async function restoreSession() {
        await initDB();
        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) {
                const metaQueue = JSON.parse(stored);
                // Rehydrate queue
                const restorationPromises = metaQueue.map(async (t) => {
                    let objectURL = null;
                    let coverURL = null;
                    if (t.isURL) {
                        objectURL = t.url;
                    } else {
                        const blob = await getFileFromDB(t.id);
                        if (blob) {
                            objectURL = URL.createObjectURL(blob);
                            // try extract cover from stored blob using the unified extractor
                            try {
                                const arr = await blob.arrayBuffer();
                                const cover = extractCoverFromArrayBuffer(arr, t.name);
                                if (cover) {
                                    const imgBlob = new Blob([cover.bytes], { type: cover.mime });
                                    coverURL = URL.createObjectURL(imgBlob);
                                }
                            } catch (e) { /* ignore cover extraction errors */ }
                        }
                    }
                    return { ...t, objectURL: objectURL, coverURL: coverURL || null };
                });

                trackQueue = await Promise.all(restorationPromises);
                renderQueue();
                if (trackQueue.length > 0 && trackQueue[0].objectURL) {
                    loadTrack(0, false);
                }
            }
        } catch (e) {
            console.error("Error restoring session", e);
        }
        
        // Restore profile pic
        const savedPic = localStorage.getItem('genesis_profile_pic');
        if (savedPic && profilePic) profilePic.src = savedPic;
    }

    // --- Navigation Logic ---
    function switchSection(targetId) {
        // Hide all sections
        mainSections.forEach(section => section.classList.add('hidden'));
        
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
        queueList.innerHTML = '';
        const query = searchInput.value.toLowerCase();
        const filtered = trackQueue.filter(t => t.name.toLowerCase().includes(query));

        if (filtered.length === 0) {
            queueList.innerHTML = `<div style="padding:20px; text-align:center; color:#999;">${trackQueue.length === 0 ? 'Library is empty.' : 'No matches found.'}</div>`;
            return;
        }

        filtered.forEach((track) => {
            const index = trackQueue.findIndex(t => t.id === track.id);
            const isActive = index === currentTrackIndex;
            const isReady = !!track.objectURL;

            const div = document.createElement('div');
            div.className = `queue-item ${isActive ? 'active' : ''}`;
            
            let statusHtml = isReady 
                ? '<span class="queue-item-status status-ready">Ready</span>' 
                : '<span class="queue-item-status status-meta">Missing</span>';

            div.innerHTML = `
                <div class="queue-item-icon">
                    <i class="fas ${track.isURL ? 'fa-globe' : 'fa-music'}"></i>
                </div>
                <div class="queue-item-info">
                    <h4>${track.name}</h4>
                    <p>${track.isURL ? 'Stream' : 'Local File'}</p>
                </div>
                <div style="text-align:right; margin-right: 15px;">
                    <div class="queue-item-duration">${formatTime(track.duration)}</div>
                    ${statusHtml}
                </div>
                <button class="control-btn small track-action-btn" title="More options">
                    <i class="fas fa-ellipsis-v"></i>
                </button> 
            `;

            // Play Click
            div.addEventListener('click', (e) => {
                if (e.target.closest('.queue-remove-btn')) return;
                if (isReady) loadTrack(index);
                else showMessage(`File "${track.name}" is missing. Please re-open it.`);
            });

            // Context Menu Click
            div.querySelector('.track-action-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                renderQueueContextMenu(track.id, e.currentTarget);
            });

            queueList.appendChild(div);
        });
    }

    async function removeTrack(index) {
        const track = trackQueue[index];
        
        if (index === currentTrackIndex) {
            pauseTrack();
            audioPlayer.src = '';
            songTitle.textContent = "No Track Selected";
            artistName.textContent = "Load files to begin";
            // hide album art
            const artImg = document.getElementById('album-art-img');
            const placeholder = document.getElementById('album-art-placeholder');
            if (artImg) { artImg.src = ''; artImg.classList.add('hidden'); }
            if (placeholder) placeholder.classList.remove('hidden');
        }

        // DB Cleanup
        if (!track.isURL) await deleteFileFromDB(track.id);
        if (track.objectURL && !track.isURL) URL.revokeObjectURL(track.objectURL);
        if (track.coverURL) URL.revokeObjectURL(track.coverURL);

        trackQueue.splice(index, 1);
        
        if (index < currentTrackIndex) currentTrackIndex--;
        else if (index === currentTrackIndex) currentTrackIndex = -1;

        savePlaylistMetadata();
        renderQueue();
    }

    function loadTrack(index, autoPlay = true) {
        currentTrackIndex = index;
        const track = trackQueue[index];
        
        audioPlayer.src = track.objectURL;
        
        // Handle song title - simple display
        const titleEl = document.getElementById('song-title');
        const trackName = track.name;
        titleEl.textContent = trackName;
        
        artistName.textContent = track.isURL ? 'Web Stream' : 'Local Audio';
        
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

        renderQueue();
        if (autoPlay) playTrack();
    }
    // ===================================
// --- Core Playback Function ---
    function playCurrentTrack() {
        if (currentTrackIndex !== -1) loadTrack(currentTrackIndex, true);
    }

// 4. Playlist & Context Menu Core Logic
// ===================================

    // --- Data Retrieval Helper ---
    // (Resolves Issue 2: Missing getTrackDetailsFromId)
    function getTrackDetailsFromId(trackId) {
        // Find the track in the main global trackQueue, which holds all metadata
        const trackData = trackQueue.find(t => t.id === trackId);
        if (trackData) {
            // We return a Promise to make this function compatible with the existing async structure
            return Promise.resolve(trackData); 
        }
        return Promise.reject(new Error(`Track ID ${trackId} not found in global queue.`));
    }


    // --- Core Playback Function ---
    // (Resolves Issue 1: Missing startPlayback)
    function startPlayback(trackIds, startIndex = 0) {
        const startTrackId = trackIds[startIndex];
        
        // Find the global index of the selected track from the playlist
        const globalIndex = trackQueue.findIndex(t => t.id === startTrackId);
        
        if (globalIndex !== -1 && trackQueue[globalIndex]?.objectURL) {
            loadTrack(globalIndex);
        } else {
            showMessage("Could not load the selected track for playback.");
        }
    }


    // --- Context Menu Functions ---
    
    function closeContextMenu() {
        if (openContextMenu) {
            openContextMenu.classList.remove('active');
            openContextMenu.remove(); // Clean up from DOM
            openContextMenu = null;
        }
    }

    function handleTrackAction(trackId, action) {
        const trackInQueue = trackQueue.find(t => t.id === trackId);
        
        switch (action) {
            case 'add-to-new-playlist':
                const newName = prompt('Enter new playlist name:');
                if (newName) {
                    // Assumes createPlaylist and addToPlaylist exist in your playlist management section
                    const newPlaylistId = createPlaylist(newName); 
                    if (newPlaylistId && trackId) {
                        addToPlaylist(newPlaylistId, trackId); 
                        showMessage(`Added track to new playlist "${newName}".`);
                    }
                }
                break;
            
            case 'add-to-queue':
                if (trackInQueue) {
                    showMessage("Track is already in your library."); // Note: Assuming trackQueue is the main library
                    return;
                }
                // Add to the end of the global trackQueue
                getTrackDetailsFromId(trackId).then(trackData => {
                    trackQueue.push(trackData); 
                    savePlaylistMetadata();
                    renderQueue();
                    showMessage("Added track to queue/library.");
                }).catch(e => console.error(e));
                break;

            case 'view-details':
                getTrackDetailsFromId(trackId).then(trackData => {
                    showMessage(`
                        <h4 style="margin-bottom: 5px;">${trackData.name || 'Unknown Title'}</h4>
                        <p style="font-size: 14px; color: var(--text-color);">
                            Duration: ${formatTime(trackData.duration)}
                            <br>Status: ${trackData.isURL ? 'Web Stream' : 'Local File'}
                            <br>ID: ${trackId}
                        </p>
                    `);
                });
                break;
        }

        closeContextMenu();
    }

    function renderQueueContextMenu(trackId, buttonElement) {
        closeContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.dataset.trackId = trackId;

        const menuItems = [
            { action: 'add-to-playlist', icon: 'fas fa-plus', text: 'Add to Playlist' },
            { action: 'remove-from-queue', icon: 'fas fa-trash', text: 'Remove from Queue' }
        ];

        menuItems.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'context-menu-item';
            itemEl.innerHTML = `<i class="${item.icon}"></i> <span>${item.text}</span>`;
            itemEl.addEventListener('click', () => {
                const trackIndex = trackQueue.findIndex(t => t.id === trackId);
                if (trackIndex === -1) return;

                if (item.action === 'remove-from-queue') {
                    removeTrack(trackIndex);
                } else if (item.action === 'add-to-playlist') {
                    // This part can be expanded to show a list of playlists
                    alert("Functionality to add to a specific playlist coming soon!");
                }
                closeContextMenu();
            });
            menu.appendChild(itemEl);
        });

        buttonElement.parentElement.appendChild(menu);
        setTimeout(() => {
            menu.classList.add('active');
            openContextMenu = menu;
        }, 10);
    }
    function renderContextMenu(trackId, buttonElement) {
        closeContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.dataset.trackId = trackId;

        const menuItems = [
            { action: 'add-to-new-playlist', icon: 'fas fa-plus', text: 'Add to New Playlist' },
            { action: 'add-to-queue', icon: 'fas fa-list', text: 'Add to Library' },
            { action: 'view-details', icon: 'fas fa-info-circle', text: 'View Track Details' },
        ];

        menuItems.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'context-menu-item';
            itemEl.innerHTML = `<i class="${item.icon}"></i> <span>${item.text}</span>`;
            itemEl.addEventListener('click', () => {
                handleTrackAction(trackId, item.action);
            });
            menu.appendChild(itemEl);
        });

        // Insert menu into the DOM relative to the button
        buttonElement.parentElement.appendChild(menu);

        setTimeout(() => {
            menu.classList.add('active');
            openContextMenu = menu;
        }, 10);
    }

    // Global click listener to close the menu when clicking anywhere else
    document.addEventListener('click', (event) => {
        if (openContextMenu && !openContextMenu.contains(event.target) && !event.target.closest('.track-action-btn')) {
            closeContextMenu();
        }
    });

    function playTrack() {
        audioPlayer.play()
            .then(() => {
                isPlaying = true;
                playIcon.className = 'fas fa-pause';
                document.querySelector('.playback-bar')?.classList.add('playing');
            })
            .catch(e => {
                console.error(e);
                isPlaying = false;
                playIcon.className = 'fas fa-play';
            });
    }

    function pauseTrack() {
        audioPlayer.pause();
        isPlaying = false;
        playIcon.className = 'fas fa-play';
        document.querySelector('.playback-bar')?.classList.remove('playing');
    }

    function nextTrack() {
        if (!trackQueue.length) return;
        let nextIndex = isShuffled 
            ? Math.floor(Math.random() * trackQueue.length) 
            : currentTrackIndex + 1;
        
        if (repeatState === 2) { // Repeat One
            playCurrentTrack();
            return;
        }

        if (nextIndex >= trackQueue.length) { // End of queue
            if (repeatState === 1) { // Repeat All
                nextIndex = 0;
            } else { // No repeat
                return; // Stop playback
            }
        }
        
        if (trackQueue[nextIndex]?.objectURL) loadTrack(nextIndex);
    }

    function prevTrack() {
        if (!trackQueue.length) return;
        let prevIndex = currentTrackIndex - 1;
        if (prevIndex < 0) prevIndex = trackQueue.length - 1;
        if (trackQueue[prevIndex]?.objectURL) loadTrack(prevIndex);
    }

    // --- File Handling ---
    async function processFile(file) {
        // Accept all audio formats (not just common ones)
        if (!file.type.startsWith('audio/') && !isAudioFile(file.name)) return null;

        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const audio = new Audio(url);
            const id = Date.now() + Math.random().toString();
            
            audio.onloadedmetadata = async () => {
                let coverURL = null;
                // Extract cover AFTER metadata loads using unified extractor
                try {
                    const arr = await file.arrayBuffer();
                    if (arr && arr.byteLength > 0) {
                        const cover = extractCoverFromArrayBuffer(arr, file.name);
                        if (cover && cover.bytes && cover.bytes.length > 0) {
                            try {
                                const imgBlob = new Blob([cover.bytes], { type: cover.mime });
                                if (imgBlob.size > 0) {
                                    coverURL = URL.createObjectURL(imgBlob);
                                }
                            } catch (blobErr) {
                                console.warn(`Failed to create blob for ${file.name}:`, blobErr);
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`Cover extraction skipped for ${file.name}:`, e.message);
                }

                try { 
                    await saveFileToDB(id, file); 
                } catch(e) {
                    console.warn(`DB save failed for ${file.name}:`, e);
                }

                resolve({
                    id,
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    duration: audio.duration,
                    isURL: false,
                    objectURL: url,
                    coverURL: coverURL || null
                });
            };
            audio.onerror = () => {
                console.warn(`Failed to load audio: ${file.name}`);
                resolve(null);
            };
        });
    }

    // Helper function to check audio file by extension
    function isAudioFile(filename) {
        const audioExtensions = [
            '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', 
            '.wma', '.alac', '.ape', '.dsf', '.dsd', '.mpc', '.wv',
            '.tta', '.dff', '.aiff', '.aif', '.ac3', '.eac3', '.dts'
        ];
        const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
        return audioExtensions.includes(ext);
    }

    async function handleFiles(fileList) {
        if (!fileList.length) return;
        showMessage(`Processing ${fileList.length} files...`);
        if (!dbInstance) await initDB();

        const promises = Array.from(fileList).map(processFile);
        const newTracks = (await Promise.all(promises)).filter(t => t !== null);
        
        if (newTracks.length > 0) {
            trackQueue.push(...newTracks);
            savePlaylistMetadata();
            renderQueue();
            showMessage(`Added ${newTracks.length} tracks.`);
            if (currentTrackIndex === -1) loadTrack(trackQueue.length - newTracks.length);
        } else {
            showMessage("No valid audio files found.");
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

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    folderInput.addEventListener('change', (e) => handleFiles(e.target.files));

    urlCancelBtn.addEventListener('click', () => urlModal.classList.add('hidden'));
    urlLoadBtn.addEventListener('click', () => {
        const url = urlInput.value.trim();
        if (!url) return;
        const track = {
            id: Date.now().toString(),
            name: url.split('/').pop() || "Stream",
            duration: 0, 
            isURL: true,
            objectURL: url,
            coverURL: null
        };
        trackQueue.push(track);
        savePlaylistMetadata();
        renderQueue();
        urlModal.classList.add('hidden');
        urlInput.value = '';
        if (currentTrackIndex === -1) loadTrack(trackQueue.length - 1);
    });

    // Profile Picture Handling
    profilePicInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
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

    playBtn.addEventListener('click', () => isPlaying ? pauseTrack() : playTrack());
    nextBtn.addEventListener('click', nextTrack);
    prevBtn.addEventListener('click', prevTrack);
    
    shuffleBtn.addEventListener('click', () => {
        isShuffled = !isShuffled;
        shuffleBtn.style.color = isShuffled ? 'var(--primary-color)' : 'var(--text-color)';
    });
    
    repeatBtn.addEventListener('click', () => {
        repeatState = (repeatState + 1) % 3; // Cycle 0 -> 1 -> 2 -> 0
        
        switch (repeatState) {
            case 0: // Off
                repeatBtn.style.color = 'var(--text-color)';
                repeatBtn.classList.remove('repeat-one');
                repeatBtn.title = "Repeat Off";
                break;
            case 1: // Repeat All
                repeatBtn.style.color = 'var(--primary-color)';
                repeatBtn.classList.remove('repeat-one');
                repeatBtn.title = "Repeat All";
                break;
            case 2: // Repeat One
                repeatBtn.style.color = 'var(--primary-color)';
                repeatBtn.classList.add('repeat-one');
                repeatBtn.title = "Repeat One";
                break;
        }
    });

    audioPlayer.addEventListener('timeupdate', () => {
        const { currentTime, duration } = audioPlayer;
        if (!isNaN(duration)) {
            const pct = (currentTime / duration) * 100;
            progressFill.style.width = `${pct}%`;
            progressHead.style.left = `${pct}%`; // Update head position
            currentTimeEl.textContent = formatTime(currentTime);
            durationEl.textContent = formatTime(duration);
        }
    });
    audioPlayer.addEventListener('ended', nextTrack);
    
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
        
        const volumeIcon = document.getElementById('volume-icon');
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
        const volumeIcon = document.getElementById('volume-icon');
        if (audioPlayer.muted) {
            muteIcon.className = 'fas fa-volume-mute';
            volumeIcon.className = 'fas fa-volume-mute';
            volumePercentage.textContent = '0';
            muteBtn.title = "Unmute";
        } else {
            muteIcon.className = 'fas fa-volume-up';
            // Restore icon based on current volume
            volumePercentage.textContent = Math.round(audioPlayer.volume * 100);
            const volumeValue = audioPlayer.volume;
            if (volumeValue > 0.5) {
                volumeIcon.className = 'fas fa-volume-up';
            } else if (volumeValue > 0) {
                volumeIcon.className = 'fas fa-volume-down';
            } else {
                volumeIcon.className = 'fas fa-volume-mute';
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
            searchDropdown.innerHTML = '';
            return;
        }

        const results = trackQueue
            .map((t, idx) => ({ t, idx }))
            .filter(({ t }) => t.name.toLowerCase().includes(query))
            .slice(0, 8);

        if (results.length === 0) {
            searchDropdown.innerHTML = `<div class="no-results">No results</div>`;
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
        searchDropdown.classList.remove('hidden');

        // Attach click handlers for results
        searchDropdown.querySelectorAll('.result-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const idx = parseInt(el.dataset.idx, 10);
                if (!isNaN(idx) && trackQueue[idx]?.objectURL) {
                    loadTrack(idx);
                    searchDropdown.classList.add('hidden');
                    // Optionally clear search input
                    // searchInput.value = '';
                    renderQueue();
                } else {
                    showMessage('Selected track is not available. Re-open the file.');
                }
            });
        });
    }

    const handleSearchInput = debounce(() => {
        renderQueue();           // update queue list filter as before
        renderSearchDropdown();  // update dropdown live results
    }, 180);

    // Replace earlier single listener with combined behavior
    searchInput.removeEventListener && searchInput.removeEventListener('input', renderQueue);
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

    // ID3v2 APIC extractor (improved for ID3v2.3/2.4)
    function extractAPICFromArrayBuffer(arrayBuffer) {
        try {
            const data = new Uint8Array(arrayBuffer);
            
            if (data.length < 10) return null;
            
            // Check ID3 header "ID3"
            if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) {
                return null;
            }
            
            const version = data[3];
            
            // Parse synchsafe size (always used for tag size in ID3v2)
            const tagSize = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f);
            
            let offset = 10;
            const tagEnd = Math.min(10 + tagSize, data.length);
            
            while (offset + 10 <= tagEnd) {
                const frameId = String.fromCharCode(data[offset], data[offset+1], data[offset+2], data[offset+3]);
                offset += 4;
                
                let frameSize = 0;
                if (version === 4) {
                    // ID3v2.4 uses synchsafe size
                    frameSize = ((data[offset] & 0x7f) << 21) | ((data[offset+1] & 0x7f) << 14) | ((data[offset+2] & 0x7f) << 7) | (data[offset+3] & 0x7f);
                } else {
                    // ID3v2.3 uses big-endian size
                    frameSize = (data[offset] << 24) | (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3];
                }
                offset += 4; // frame size
                offset += 2; // flags
                
                if (frameSize <= 0 || frameSize > 10000000) break;
                
                if (frameId === 'APIC') {
                    const frameData = data.subarray(offset, offset + frameSize);
                    if (frameData.length < 3) return null;
                    
                    let pos = 1; // skip text encoding byte
                    
                    // MIME type (null-terminated Latin-1 string)
                    let mime = '';
                    while (pos < frameData.length && frameData[pos] !== 0) {
                        mime += String.fromCharCode(frameData[pos++]);
                    }
                    pos++; // skip null terminator
                    
                    // Picture type (1 byte)
                    if (pos >= frameData.length) return null;
                    pos++; // skip picture type
                    
                    // Description (null-terminated, encoding-dependent — skip it)
                    while (pos < frameData.length && frameData[pos] !== 0) pos++;
                    if (pos < frameData.length) pos++;
                    
                    // Remaining bytes are the picture data
                    const imageData = frameData.subarray(pos);
                    
                    if (imageData.length === 0) return null;
                    
                    return {
                        mime: mime && mime.length > 0 ? mime : 'image/jpeg',
                        bytes: imageData
                    };
                }
                
                offset += frameSize;
            }
        } catch (e) {
            console.warn("ID3 extraction error:", e.message);
        }
        return null;
    }

    // ID3v2 Text Frame extractor (for TIT2, TPE1, etc.)
    function extractID3TextFrame(arrayBuffer, frameId) {
        try {
            const data = new Uint8Array(arrayBuffer);
            const tag = parseID3Frames(data);
            if (tag && tag.frames[frameId]) {
                const frameData = tag.frames[frameId];
                // Simple text decoder, assumes UTF-8 or similar for text frames
                // Skips the first byte (encoding byte)
                const textDecoder = new TextDecoder('utf-8', { fatal: false });
                // We need to find the first null terminator for some encodings
                const nullIndex = frameData.indexOf(0, 1);
                const textData = frameData.subarray(1, nullIndex > 0 ? nullIndex : frameData.length);
                return textDecoder.decode(textData).trim();
            }
        } catch (e) { /* ignore extraction errors */ }
        return null;
    }


    // Unified cover extraction: tries ID3 APIC, MP4 covr, FLAC PICTURE, Vorbis METADATA_BLOCK_PICTURE
    function extractCoverFromArrayBuffer(arrayBuffer, filename = '') {
        // try ID3 APIC first (existing parser)
        try {
            const apic = extractAPICFromArrayBuffer(arrayBuffer);
            if (apic && apic.bytes && apic.bytes.length > 0) return apic;
        } catch (e) { /* ignore */ }

        const data = new Uint8Array(arrayBuffer);

        // MP4 (covr) extractor
        const mp4 = extractMP4Cover(data);
        if (mp4) return mp4;

        // FLAC PICTURE extractor
        const flac = extractFLACPicture(data);
        if (flac) return flac;

        // Vorbis/OGG METADATA_BLOCK_PICTURE extractor (search for base64 entry)
        const vorbis = extractVorbisPicture(data);
        if (vorbis) return vorbis;

        return null;
    }


    // improved findBox: supports extended sizes (size==1) and zero-size (to EOF)
    function findBox(data, type, start = 0, end = data.length) {
        const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let pos = start;
        while (pos + 8 <= end) {
            let size = dv.getUint32(pos, false); // big-endian
            const t = String.fromCharCode(
                data[pos+4], data[pos+5], data[pos+6], data[pos+7]
            );
            let headerSize = 8;
            if (size === 1) {
                // extended size: 64-bit size at pos+8
                if (pos + 16 > end) break;
                const high = dv.getUint32(pos + 8, false);
                const low = dv.getUint32(pos + 12, false);
                // may exceed Number precision for massive files, but ok for images
                size = high * 4294967296 + low;
                headerSize = 16;
            } else if (size === 0) {
                // box extends to end of parent
                size = end - pos;
            }
            const boxStart = pos + headerSize;
            const boxEnd = pos + size;
            if (boxEnd > end || size <= 0) break;
            if (t === type) return { pos, size, start: boxStart, end: boxEnd };
            pos += size;
        }
        return null;
    }

    function extractMP4Cover(data) {
        try {
            // Find 'covr' anywhere in file (many MP4 variants put it under ilst/meta)
            const covrBoxInfo = findBox(data, 'covr', 0, data.length);
            if (!covrBoxInfo) {
                // sometimes cover is stored as '©alb' (iTunes) or inside ilst->covr; try to locate ilst then covr
                const ilst = findBox(data, 'ilst', 0, data.length);
                if (ilst) {
                    const altCovr = findBox(data, 'covr', ilst.start, ilst.end);
                    if (altCovr) covrBoxInfo = altCovr;
                }
            }
            if (!covrBoxInfo) return null;

            // within covr, find 'data' box(s)
            const dataBox = findBox(data, 'data', covrBoxInfo.start, covrBoxInfo.end);
            if (!dataBox) return null;

            // Extract payload area; don't assume fixed 8-byte header — scan inside payload for an actual image
            const payload = data.subarray(dataBox.start, dataBox.end);
            // First try to find an image signature inside the payload
            const found = findImageInData(payload);
            if (found) return found;

            // If not found, try skipping common data header bytes (4 or 8) and re-scan
            const attempts = [8, 4, 0];
            for (const skip of attempts) {
                if (payload.length <= skip) continue;
                const alt = payload.subarray(skip);
                const f = findImageInData(alt);
                if (f) return f;
            }

            // Last resort: pick payload after an 8-byte header (common) and guess mime from leading bytes
            const alt = payload.subarray(8);
            const mime = guessMimeFromBytes(alt) || guessMimeFromBytes(payload) || 'image/jpeg';
            return alt.length ? { mime, bytes: alt } : null;
        } catch (e) {
            return null;
        }
    }

    function extractFLACPicture(data) {
        try {
            // 'fLaC' header at start
            if (!(data[0] === 0x66 && data[1] === 0x4C && data[2] === 0x61 && data[3] === 0x43)) return null;
            let pos = 4;
            while (pos + 4 <= data.length) {
                const header = data[pos];
                const isLast = !!(header & 0x80);
                const blockType = header & 0x7f;
                const len = (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
                pos += 4;
                if (blockType === 6) { // PICTURE
                    // parse picture according to FLAC spec
                    let p = pos;
                    // skip 4 bytes: picture type
                    p += 4;
                    // MIME length + MIME string
                    const mimeLen = (data[p] << 24) | (data[p+1] << 16) | (data[p+2] << 8) | data[p+3];
                    p += 4;
                    const mime = String.fromCharCode(...data.subarray(p, p + mimeLen));
                    p += mimeLen;
                    // description length
                    const descLen = (data[p] << 24) | (data[p+1] << 16) | (data[p+2] << 8) | data[p+3];
                    p += 4 + descLen;
                    // skip width/height/depth/colors (16 bytes)
                    p += 16;
                    // picture data length
                    const picLen = (data[p] << 24) | (data[p+1] << 16) | (data[p+2] << 8) | data[p+3];
                    p += 4;
                    const bytes = data.subarray(p, p + picLen);
                    if (bytes && bytes.length > 0) return { mime: mime || 'image/jpeg', bytes };
                    return null;
                } else {
                    pos += len;
                }
                if (isLast) break;
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    function extractVorbisPicture(data) {
        try {
            // Convert initial portion to string to find METADATA_BLOCK_PICTURE entries or base64 encoded picture
            const sample = 200000; // 200KB should be enough for comments
            const len = Math.min(data.length, sample);
            const text = new TextDecoder('utf-8', { fatal: false }).decode(data.subarray(0, len));
            // Vorbis comment with METADATA_BLOCK_PICTURE= base64
            const marker = 'METADATA_BLOCK_PICTURE=';
            const idx = text.indexOf(marker);
            if (idx !== -1) {
                const remainder = text.substring(idx + marker.length);
                // Base64 may be trimmed; grab until whitespace/newline
                const m = remainder.match(/([A-Za-z0-9+/=]+)/);
                if (m && m[1]) {
                    const b64 = m[1];
                    const bytes = base64ToUint8Array(b64);
                    // FLAC PICTURE is stored; parse similarly to FLAC picture structure
                    // The picture block in Vorbis is a FLAC-style picture; first 4 bytes = picture type etc.
                    // Try to detect image mime by scanning for JPEG/PNG signatures inside bytes
                    const mime = guessMimeFromBytes(bytes) || 'image/jpeg';
                    return { mime, bytes };
                }
            }
            // As fallback try to find any image signature in the file (JPEG/PNG)
            const img = findImageInData(data);
            if (img) return img;
        } catch (e) {
            return null;
        }
        return null;
    }

    // Utility: guess mime from leading bytes
    function guessMimeFromBytes(bytes) {
        if (!bytes || bytes.length < 4) return null;
        // JPEG
        if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[bytes.length - 2] === 0xFF && bytes[bytes.length - 1] === 0xD9) {
            return 'image/jpeg';
        }
        // PNG
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
            return 'image/png';
        }
        // GIF
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
            return 'image/gif';
        }
        // WebP (RIFF + "WEBP")
        if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
            && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
            return 'image/webp';
        }
        return null;
    }

    // Convert base64 string to Uint8Array
    function base64ToUint8Array(b64) {
        try {
            const binary = atob(b64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        } catch (e) {
            return null;
        }
    }

    // Try to find an embedded image by scanning for JPEG/PNG signatures in the file data
    function findImageInData(data) {
        try {
            // Search for JPEG (FF D8 ... FF D9)
            for (let i = 0; i < data.length - 1; i++) {
                if (data[i] === 0xFF && data[i + 1] === 0xD8) {
                    // find JPEG end
                    for (let j = i + 2; j < data.length - 1; j++) {
                        if (data[j] === 0xFF && data[j + 1] === 0xD9) {
                            const bytes = data.subarray(i, j + 2);
                            return { mime: 'image/jpeg', bytes };
                        }
                    }
                }
            }
            // Search for PNG (89 50 4E 47 ... IEND chunk)
            for (let i = 0; i < data.length - 8; i++) {
                if (data[i] === 0x89 && data[i+1] === 0x50 && data[i+2] === 0x4E && data[i+3] === 0x47) {
                    // PNG ends with IEND chunk: 00 00 00 00 49 45 4E 44 AE 42 60 82 (but simpler: search "IEND")
                    for (let j = i + 8; j < data.length - 8; j++) {
                        if (data[j] === 0x49 && data[j+1] === 0x45 && data[j+2] === 0x4E && data[j+3] === 0x44) {
                            const end = j + 8 + 4; // IEND + CRC (4 bytes CRC after "IEND")
                            const bytes = data.subarray(i, Math.min(end, data.length));
                            return { mime: 'image/png', bytes };
                        }
                    }
                }
            }
            // WebP (RIFF) search: find "RIFF" then "WEBP"
            for (let i = 0; i < data.length - 12; i++) {
                if (data[i] === 0x52 && data[i+1] === 0x49 && data[i+2] === 0x46 && data[i+3] === 0x46
                    && data[i+8] === 0x57 && data[i+9] === 0x45 && data[i+10] === 0x42 && data[i+11] === 0x50) {
                    // try to extract until end of RIFF chunk (size at i+4)
                    const dv = new DataView(data.buffer, data.byteOffset + i);
                    const size = dv.getUint32(4, false);
                    const end = i + 8 + (size || 0);
                    const bytes = data.subarray(i, Math.min(end, data.length));
                    return { mime: 'image/webp', bytes };
                }
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    // Generic ID3 frame parser
    function parseID3Frames(data) {
        if (data.length < 10 || data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) {
            return null; // Not an ID3 tag
        }

        const version = data[3];
        const tagSize = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f);
        let offset = 10;
        const tagEnd = Math.min(10 + tagSize, data.length);
        const frames = {};

        while (offset + 10 <= tagEnd) {
            const frameId = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
            offset += 4;

            let frameSize = 0;
            if (version === 4) { // ID3v2.4
                frameSize = ((data[offset] & 0x7f) << 21) | ((data[offset + 1] & 0x7f) << 14) | ((data[offset + 2] & 0x7f) << 7) | (data[offset + 3] & 0x7f);
            } else { // ID3v2.3
                frameSize = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
            }
            offset += 4; // frame size
            offset += 2; // flags

            if (frameSize <= 0 || (offset + frameSize) > tagEnd) break;

            // Only store the first occurrence of a frame
            if (!frames[frameId]) {
                frames[frameId] = data.subarray(offset, offset + frameSize);
            }

            offset += frameSize;
        }

        return {
            version,
            frames
        };
    }


    // --- Playlist Management ---
    const PLAYLISTS_KEY = 'genesis_playlists';
    let playlists = {};

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

    function createPlaylist(name) {
        if (!name || name.trim().length === 0) {
            showMessage('Playlist name cannot be empty.');
            return false;
        }
        const id = Date.now().toString();
        playlists[id] = {
            id,
            name: name.trim(),
            trackIds: []
        };
        savePlaylists();
        renderPlaylists();
        return true;
    }

    function deletePlaylist(id) {
        if (!confirm(`Delete playlist "${playlists[id].name}"?`)) return;
        delete playlists[id];
        savePlaylists();
        renderPlaylists();
    }

    function addTrackToPlaylist(playlistId, trackId) {
        if (!playlists[playlistId]) return false;
        if (!playlists[playlistId].trackIds.includes(trackId)) {
            playlists[playlistId].trackIds.push(trackId);
            savePlaylists();
        }
        return true;
    }

    function removeTrackFromPlaylist(playlistId, trackId) {
        if (!playlists[playlistId]) return false;
        playlists[playlistId].trackIds = playlists[playlistId].trackIds.filter(id => id !== trackId);
        savePlaylists();
        return true;
    }

    function renderPlaylists() {
        const playlistsList = document.getElementById('playlists-list');
        const playlistIds = Object.keys(playlists);

        if (playlistIds.length === 0) {
            playlistsList.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-compact-disc" style="font-size: 48px; color: #ddd; margin-bottom: 10px;"></i>
                    <p>No playlists yet. Create one to get started!</p>
                </div>
            `;
        } else {
            playlistsList.innerHTML = playlistIds.map(id => {
                const playlist = playlists[id];
                const trackCount = playlist.trackIds.length;
                return `
                    <div class="playlist-card" data-id="${id}">
                        <div class="playlist-card-icon">
                            <i class="fas fa-music"></i>
                        </div>
                        <div class="playlist-card-name">${playlist.name}</div>
                        <div class="playlist-card-count">${trackCount} track${trackCount !== 1 ? 's' : ''}</div>
                        <div class="playlist-card-actions">
                            <button class="btn-edit playlist-edit-btn" title="Edit playlist"><i class="fas fa-edit"></i></button>
                            <button class="btn-delete playlist-delete-btn" title="Delete playlist"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Attach event listeners
        playlistsList.querySelectorAll('.playlist-card').forEach(card => {
            const id = card.dataset.id;
            card.addEventListener('click', (e) => {
                if (e.target.closest('.playlist-edit-btn') || e.target.closest('.playlist-delete-btn')) return;
                openPlaylistView(id);
            });
        });

        playlistsList.querySelectorAll('.playlist-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.closest('.playlist-card').dataset.id;
                editPlaylist(id);
            });
        });

        playlistsList.querySelectorAll('.playlist-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.closest('.playlist-card').dataset.id;
                deletePlaylist(id);
            });
        });

        // Also render in sidebar
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
            return `
                <div class="sidebar-playlist-item" data-id="${id}">
                    <i class="fas fa-list-ul"></i>
                    <span>${playlist.name}</span>
                </div>
            `;
        }).join('');

        // Attach click handlers
        sidebarPlaylistsContainer.querySelectorAll('.sidebar-playlist-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                openPlaylistView(id);
                // Update active state
                sidebarPlaylistsContainer.querySelectorAll('.sidebar-playlist-item').forEach(el => {
                    el.classList.remove('active');
                });
                item.classList.add('active');
            });
        });
    }

  // --- New Helper Function for Playlist View ---
    function getTrackDetailsFromId(trackId) {
        // This function retrieves full track data from the IndexedDB based on its ID.
        // Since this requires async IndexedDB access, we'll return a promise.
        return new Promise((resolve, reject) => {
            if (!dbInstance) {
                return reject(new Error("Database not initialized."));
            }
            const transaction = dbInstance.transaction([DB_STORE], 'readonly');
            const store = transaction.objectStore(DB_STORE);
            const request = store.get(trackId);

            request.onsuccess = (e) => {
                const trackData = e.target.result;
                if (trackData) {
                    resolve(trackData);
                } else {
                    reject(new Error(`Track ID ${trackId} not found.`));
                }
            };

            request.onerror = (e) => {
                reject(e.target.error);
            };
        });
    }
// Global reference to the currently open menu
    openContextMenu = null;

    // --- Helper function to close any open context menu ---
    function closeContextMenu() {
        if (openContextMenu) {
            openContextMenu.classList.remove('active');
            openContextMenu.remove(); // Clean up from DOM
            openContextMenu = null;
        }
    }

    // --- Action Handler ---
    function handleTrackAction(trackId, action) {
        // You'll need to define trackQueue somewhere in your global state
        const trackInQueue = trackQueue.find(t => t.id === trackId);
        
        switch (action) {
            case 'add-to-new-playlist':
                const newName = prompt('Enter new playlist name:');
                if (newName) {
                    const newPlaylistId = createPlaylist(newName); // Assumes createPlaylist exists
                    if (newPlaylistId && trackId) {
                        addToPlaylist(newPlaylistId, trackId); // Assumes addToPlaylist exists
                        showMessage(`Added track to new playlist "${newName}".`);
                    }
                }
                break;
            
            case 'add-to-queue':
                if (trackInQueue) {
                    showMessage("Track is already in the queue.");
                    return;
                }
                // Logic to add to the end of your global trackQueue
                // You'll need the full track data for this
                getTrackDetailsFromId(trackId).then(trackData => {
                    trackQueue.push(trackData); 
                    // You might need to call a function to refresh the visual queue list (if you have one)
                    showMessage("Added track to queue.");
                }).catch(e => console.error(e));
                break;

            case 'remove-from-queue':
                // Assuming this action is only available in the Queue view
                if (trackInQueue) {
                    trackQueue = trackQueue.filter(t => t.id !== trackId);
                    // Update the current track index if the removed track was before it
                    if (currentTrackIndex > trackQueue.findIndex(t => t.id === trackId)) {
                        currentTrackIndex--;
                    }
                    showMessage("Removed track from queue.");
                    // You'd need to refresh the Queue UI here
                }
                break;

            case 'view-details':
                showMessage(`Viewing details for Track ID: ${trackId}`);
                // Implement a modal to show full metadata (artist, album, bitrate, etc.)
                break;
        }

        // After an action, always close the menu
        closeContextMenu();
    }

    // --- Menu Renderer and Event Attacher ---
    function renderContextMenu(trackId, buttonElement, isTrackInQueue = false) {
        // 1. Close any existing menu
        closeContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.dataset.trackId = trackId;

        // Define menu items
        const menuItems = [
            { action: 'add-to-new-playlist', icon: 'fas fa-plus', text: 'Add to New Playlist' },
            // Add existing playlists dynamically here later
            { action: 'add-to-queue', icon: 'fas fa-list', text: 'Add to Queue' },
            { action: 'view-details', icon: 'fas fa-info-circle', text: 'View Track Details' },
        ];

        // Add conditional items
        if (isTrackInQueue) {
             menuItems.push({ action: 'remove-from-queue', icon: 'fas fa-minus-circle', text: 'Remove from Queue' });
        }

        // Build the HTML for the menu
        menuItems.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'context-menu-item';
            itemEl.innerHTML = `<i class="${item.icon}"></i> <span>${item.text}</span>`;
            itemEl.addEventListener('click', () => {
                handleTrackAction(trackId, item.action);
            });
            menu.appendChild(itemEl);
        });

        // 2. Insert menu into the DOM right after the button's parent (the row)
        buttonElement.parentElement.appendChild(menu);

        // 3. Show the menu and set global reference
        // Use a short delay to ensure it's positioned before showing
        setTimeout(() => {
            menu.classList.add('active');
            openContextMenu = menu;
        }, 10);
    }

    // Global click listener to close the menu when clicking anywhere else
    document.addEventListener('click', (event) => {
        // Only close if the click was not on the menu itself or the toggle button
        if (openContextMenu && !openContextMenu.contains(event.target) && !event.target.closest('.track-action-btn')) {
            closeContextMenu();
        }
    });
// REPLACE with this complete function:
async function openPlaylistView(id) {
    const playlist = playlists[id];
    
    // NOTE: Ensure these two DOM elements are defined at the top of your script!
    // const playlistsListContainer = document.getElementById('playlists-list');
    // const playlistDetailView = document.getElementById('playlist-detail-view');

    // 1. Manage View Transition
    playlistsListContainer.classList.add('hidden'); // Hide the list of all playlists
    playlistDetailView.classList.remove('hidden'); // Show the detail view
    playlistDetailView.innerHTML = ''; // Clear previous content

    // Add a button to go back to the playlist list
    const backButton = document.createElement('button');
    backButton.innerHTML = '<i class="fas fa-arrow-left"></i> Back to Playlists';
    backButton.className = 'btn-secondary playlist-back-btn';
    backButton.onclick = () => {
        playlistDetailView.classList.add('hidden');
        playlistsListContainer.classList.remove('hidden');
    };

    // 2. Render Playlist Header
    const headerHTML = `
        <div class="playlist-detail-header">
            ${backButton.outerHTML}
            <h2 style="font-size: 28px; color: var(--dark-color); margin: 0;">${playlist.name}</h2>
            <p style="color: var(--text-color); margin: 0;">${playlist.trackIds.length} Tracks</p>
        </div>
        <div class="track-list-header">
            <span>#</span>
            <span>Title</span>
            <span>Artist</span>
            <span>Duration</span>
            <span></span>
        </div>
        <div id="playlist-track-list"></div>
    `;
    playlistDetailView.insertAdjacentHTML('beforeend', headerHTML);
    const trackListContainer = document.getElementById('playlist-track-list');


    // 3. Render Tracks
    if (playlist.trackIds.length === 0) {
        trackListContainer.innerHTML = '<p style="padding: 20px;">This playlist is empty. Add tracks from your library.</p>';
        return;
    }

    let trackIndex = 1;
    
    // Fetch and display each track asynchronously
    for (const trackId of playlist.trackIds) {
        try {
            const trackData = await getTrackDetailsFromId(trackId); 

            // Assumes formatTime() is defined elsewhere
            const durationFormatted = trackData.duration ? formatTime(trackData.duration) : '--:--';
            
            // Determine initial button state
            const isTrackInCurrentPlaylist = playlist.trackIds.includes(trackId);
            const initialIcon = isTrackInCurrentPlaylist ? 'fas fa-minus' : 'fas fa-plus';
            const initialClass = isTrackInCurrentPlaylist ? 'remove' : 'add';

            const trackRow = document.createElement('div');
            trackRow.className = 'track-list-row';
            trackRow.dataset.id = trackId; 
            
            trackRow.innerHTML = `
                <span>${trackIndex++}</span>
                <span>${trackData.name || 'Unknown Title'}</span>
                <span>${trackData.artist || 'Local File'}</span>
                <span>${durationFormatted}</span>
                <button class="track-toggle-btn ${initialClass}" title="${isTrackInCurrentPlaylist ? 'Remove from Playlist' : 'Add to Playlist'}">
                    <i class="${initialIcon}"></i>
                </button>
            `;

            // 4. Attach Click Listener to Play Track (Row Click)
            trackRow.addEventListener('click', (e) => {
                // Ignore clicks on the toggle button
                if (e.target.closest('.track-toggle-btn')) return;
                
                const startIndex = playlist.trackIds.indexOf(trackId);
                startPlayback(playlist.trackIds, startIndex);
            });
            
            // 5. Attach Click Listener to the Toggle Button
            const toggleBtn = trackRow.querySelector('.track-toggle-btn');
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the row's 'play' action
                
                // Call the simple toggle function using the playlist ID (id)
                toggleTrackInPlaylist(id, trackId, toggleBtn);
            });
            
            trackListContainer.appendChild(trackRow);

        } catch (error) {
            console.error("Error fetching track for playlist:", error);
            trackListContainer.insertAdjacentHTML('beforeend', `<div class="track-list-row" style="color: red;"><span>${trackIndex++}</span><span>Error loading track (ID: ${trackId}).</span><span></span><span></span><span></span></div>`);
        }
    }
}

    // ===================================
    // 4. Playlist & Playback Core Logic (Integrated)
    // ===================================

    // --- Data Retrieval Helper ---
    function getTrackDetailsFromId(trackId) {
        // Find the track in the main global trackQueue
        const trackData = trackQueue.find(t => t.id === trackId);
        if (trackData) {
            return Promise.resolve(trackData); 
        }
        return Promise.reject(new Error(`Track ID ${trackId} not found in library.`));
    }


    // --- Core Playback Function ---
    function startPlayback(trackIds, startIndex = 0) {
        if (!trackIds || trackIds.length === 0) return;
        
        const startTrackId = trackIds[startIndex];
        
        // Find the global index of the selected track from the entire library (trackQueue)
        const globalIndex = trackQueue.findIndex(t => t.id === startTrackId);
        
        if (globalIndex !== -1 && trackQueue[globalIndex]?.objectURL) {
            loadTrack(globalIndex);
        } else {
            showMessage("Could not load the selected track for playback.");
        }
    }


    // --- Simple Toggle Action ---
    function toggleTrackInPlaylist(playlistId, trackId, buttonElement) {
        const playlist = playlists[playlistId];
        const index = playlist.trackIds.indexOf(trackId);

        if (index > -1) {
            // Track is in the playlist, so REMOVE it
            playlist.trackIds.splice(index, 1);
            buttonElement.innerHTML = '<i class="fas fa-plus"></i>'; // Change icon to Plus
            buttonElement.classList.remove('remove');
            buttonElement.classList.add('add');
            showMessage(`Removed track from playlist "${playlist.name}".`);
        } else {
            // Track is NOT in the playlist, so ADD it
            playlist.trackIds.push(trackId);
            buttonElement.innerHTML = '<i class="fas fa-minus"></i>'; // Change icon to Minus
            buttonElement.classList.remove('add');
            buttonElement.classList.add('remove');
            showMessage(`Added track to playlist "${playlist.name}".`);
        }

        // NOTE: Make sure you have a savePlaylists() function defined elsewhere
        // that saves the 'playlists' object to localStorage.
        savePlaylists(); 
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

    // Create Playlist Button
    const createPlaylistBtn = document.getElementById('create-playlist-btn');
    if (createPlaylistBtn) {
        createPlaylistBtn.addEventListener('click', () => {
            const name = prompt('Enter playlist name:');
            if (name) createPlaylist(name);
        });
    }

    // Load playlists on init
    loadPlaylists();
    renderPlaylists();
// --- Seek Logic Helper ---
    // Calculates the time based on a mouse/touch event position
    function calculateSeekTime(event) {
        // Use clientX for mouse/touch position
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const rect = progressBarContainer.getBoundingClientRect();
        
        // Calculate the relative X position within the bar, clamped between 0 and 1
        let x = clientX - rect.left;
        let percentage = x / rect.width;
        percentage = Math.max(0, Math.min(1, percentage)); 

        const duration = audioPlayer.duration;
        // Calculate the new time and update the audio element
        if (!isNaN(duration) && isFinite(duration)) {
            const newTime = duration * percentage;
            audioPlayer.currentTime = newTime;
            // Immediate UI update for smooth dragging
            progressFill.style.width = `${percentage * 100}%`;
            progressHead.style.left = `${percentage * 100}%`;
        }
    }

    // --- Drag and Click to Seek Implementation ---
    // let isDragging = false;

    // 1. Start Dragging (Mouse Down/Touch Start)
    progressBarContainer.addEventListener('mousedown', (e) => {
        isDragging = true;
        audioPlayer.pause(); // Pause playback while seeking
        calculateSeekTime(e);
    });
    progressBarContainer.addEventListener('touchstart', (e) => {
        isDragging = true;
        audioPlayer.pause(); 
        calculateSeekTime(e);
    });

    // 2. Dragging (Mouse Move/Touch Move) - Attached to Document for safety
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            e.preventDefault(); // Prevent text selection/scrolling during drag
            calculateSeekTime(e);
        }
    });
    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            e.preventDefault(); 
            calculateSeekTime(e);
        }
    });
    
    // 3. Stop Dragging (Mouse Up/Touch End) - Attached to Document for safety
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            if (isPlaying) {
                // Only resume if the player was playing before the drag started
                audioPlayer.play().catch(e => console.error("Play resume failed:", e));
            }
        }
    });
    document.addEventListener('touchend', () => {
        if (isDragging) {
            isDragging = false;
            if (isPlaying) {
                audioPlayer.play().catch(e => console.error("Play resume failed:", e));
            }
        }
    });

    // Prevent default behaviour for progressHead on mousedown to avoid conflicts
    progressHead.addEventListener('mousedown', (e) => e.stopPropagation());
    progressHead.addEventListener('touchstart', (e) => e.stopPropagation());

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

}); // close DOMContentLoaded listener
