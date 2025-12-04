let config = {
    audioPlayer: null,
    playerContext: null,
    playIcon: null,
    shuffleBtn: null,
    repeatBtn: null,
    playBtn: null,
    nextBtn: null,
    prevBtn: null,
    updatePlaybackBar: () => {},
    renderQueueTable: () => {},
    savePlaybackState: () => {},
    showMessage: () => {},
    handleTimeUpdate: () => {},
};

let repeatState = 0; // 0: no-repeat, 1: repeat-all, 2: repeat-one
let isShuffled = false;
export function init(dependencies) {
    config = { ...config, ...dependencies };
    repeatState = config.playerContext.repeatState || 0;

    // Attach event listeners
    config.playBtn.addEventListener('click', () => config.playerContext.isPlaying ? pauseTrack() : playTrack()); // This is correct
    config.nextBtn.addEventListener('click', nextTrack); // This is correct
    config.prevBtn.addEventListener('click', prevTrack);
    config.shuffleBtn.addEventListener('click', toggleShuffle);
    config.repeatBtn.addEventListener('click', toggleRepeat);

    config.audioPlayer.addEventListener('timeupdate', config.handleTimeUpdate);
    config.audioPlayer.addEventListener('ended', nextTrack);
}

export function playTrack() {
    if (!config.audioPlayer.src) return;
    config.playerContext.isPlaying = true;
    config.audioPlayer.play().catch(e => console.error("Playback failed:", e));
    config.playIcon.className = 'fas fa-pause';
    document.querySelector('.playback-bar')?.classList.add('playing');
}

export function pauseTrack() {
    config.audioPlayer.pause();
    config.playerContext.isPlaying = false;
    config.playIcon.className = 'fas fa-play';
    document.querySelector('.playback-bar')?.classList.remove('playing');
}

export function loadTrack(index, autoPlay = true) { // autoPlay is true by default
    config.playerContext.currentTrackIndex = index;
    const track = config.playerContext.trackQueue[index];
    
    config.audioPlayer.src = track.objectURL;
    config.updatePlaybackBar(track);

    config.renderQueueTable();
    config.savePlaybackState();

    if (autoPlay) {
        // Wait for the audio to be ready before playing to avoid race conditions.
        const canPlayHandler = () => {
            playTrack();
            config.audioPlayer.removeEventListener('canplay', canPlayHandler); // Clean up the listener
        };
        config.audioPlayer.addEventListener('canplay', canPlayHandler);
    }
}

export function startPlayback(tracksOrIds, startIndex = 0, shuffle = false) {
    if (!tracksOrIds || tracksOrIds.length === 0) return;

    let newQueue = tracksOrIds.map(item => {
        if (typeof item === 'string') {
            // If it's a string, assume it's a track ID and find it in the library
            return config.playerContext.libraryTracks.find(t => t.id === item);
        } else if (typeof item === 'object' && item !== null) {
            return item; // If it's already a track object, use it directly
        }
    }).filter(Boolean);

    if (newQueue.length === 0) {
        config.playerContext.showMessage("Could not load the selected track for playback.");
        return;
    }

    if (shuffle) {
        // Fisher-Yates shuffle algorithm
        for (let i = newQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
        }
        startIndex = 0; // Always start from the beginning of a shuffled queue
    }

    // Always replace the current queue with the new one.
    config.playerContext.trackQueue = newQueue;
    loadTrack(startIndex);
}

export function nextTrack() {
    if (!config.playerContext.trackQueue || config.playerContext.trackQueue.length === 0) return;
    let nextIndex = config.playerContext.isShuffled 
        ? Math.floor(Math.random() * config.playerContext.trackQueue.length) 
        : config.playerContext.currentTrackIndex + 1;
    
    if (repeatState === 2) { // Repeat One
        if (config.playerContext.currentTrackIndex !== -1) loadTrack(config.playerContext.currentTrackIndex, true);
        return;
    }

    if (nextIndex >= config.playerContext.trackQueue.length) { // End of queue
        if (repeatState === 1) { // Repeat All
            nextIndex = 0;
        } else { // No repeat
            pauseTrack();
            return;
        }
    }
    
    if (config.playerContext.trackQueue[nextIndex]?.objectURL) {
        loadTrack(nextIndex);
    }
}

export function prevTrack() {
    if (!config.playerContext.trackQueue || config.playerContext.trackQueue.length === 0) return;
    if (config.audioPlayer.currentTime > 3) {
        config.audioPlayer.currentTime = 0;
        return;
    }
    const prevIndex = (config.playerContext.currentTrackIndex - 1 + config.playerContext.trackQueue.length) % config.playerContext.trackQueue.length;
    if (config.playerContext.trackQueue[prevIndex]?.objectURL) loadTrack(prevIndex);
}

function toggleShuffle() {
    config.playerContext.isShuffled = !config.playerContext.isShuffled;
    setShuffleState(config.playerContext.isShuffled);
    config.savePlaybackState();
}

function toggleRepeat() {
    repeatState = (repeatState + 1) % 3;
    config.playerContext.repeatState = repeatState;
    updateRepeatButtonUI();
    config.savePlaybackState();
}

export function updateRepeatButtonUI() {
    config.repeatBtn.classList.remove('repeat-one');
    config.repeatBtn.style.color = 'var(--text-color)';
    let title = "Repeat Off";

    if (repeatState === 1) { // Repeat All
        config.repeatBtn.style.color = 'var(--primary-color)';
        title = "Repeat All";
    } else if (repeatState === 2) { // Repeat One
        config.repeatBtn.style.color = 'var(--primary-color)';
        config.repeatBtn.classList.add('repeat-one');
        title = "Repeat One";
    }
    config.repeatBtn.title = title;
}

export function getRepeatState() {
    return repeatState;
}

export function setRepeatState(state) {
    repeatState = state;
}

export function setShuffleState(shuffle) {
    config.playerContext.isShuffled = shuffle;
    if (config.shuffleBtn) {
        config.shuffleBtn.style.color = config.playerContext.isShuffled ? 'var(--primary-color)' : 'var(--text-color)';
    }
}