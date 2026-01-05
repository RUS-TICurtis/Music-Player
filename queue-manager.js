import { playerContext } from './state.js';
import { formatTime, truncate } from './utils.js';

let actions = {
    onPlay: null,
    onRemove: null
};

export function setQueueActions(onPlay, onRemove) {
    actions.onPlay = onPlay;
    actions.onRemove = onRemove;
}

export function renderQueueTable() {
    const queueList = document.getElementById('queue-list');
    if (!queueList) return;

    // Update the header count
    const headerTitle = document.getElementById('queue-header-title');
    if (headerTitle) headerTitle.textContent = `Play Queue (${playerContext.trackQueue.length})`;

    if (playerContext.trackQueue.length === 0) {
        queueList.innerHTML = '<div class="empty-state">Queue is empty</div>';
        return;
    }

    queueList.innerHTML = playerContext.trackQueue.map((track, index) => {
        const isPlaying = index === playerContext.currentTrackIndex;
        const duration = formatTime(track.duration);
        const activeClass = isPlaying ? 'active' : '';

        return `
        <div class="track-list-row queue-item ${activeClass} ${isPlaying ? 'currently-playing' : ''}" draggable="true" data-index="${index}">
            <div class="status-icon">
                <input type="checkbox" class="track-select-checkbox" data-index="${index}">
            </div>
            <div class="status-icon">
                <button class="row-play-btn"><i class="fas fa-play"></i></button>
                <div class="playing-bars">
                    <div class="bar bar1"></div>
                    <div class="bar bar2"></div>
                    <div class="bar bar3"></div>
                </div>
                <span class="row-index" style="font-size: 0.8em; opacity: 0.5;">${index + 1}</span>
            </div>
            <div class="track-title-col">
                <span class="track-title">${truncate(track.title, 40)}</span>
            </div>
            <div class="track-artist-col">
                <span class="track-artist">${truncate(track.artist || 'Unknown', 20)}</span>
            </div>
            <span class="track-album">${truncate(track.album || 'Unknown album', 20)}</span>
            <span class="track-year">${track.year || ''}</span>
            <span class="track-genre">${truncate(track.genre || 'Unknown genre', 20)}</span>
            <span class="track-duration">${duration}</span>
        </div>
        `;
    }).join('');

    // Add Event Listeners
    queueList.querySelectorAll('.queue-item').forEach(item => {
        const index = parseInt(item.dataset.index);
        item.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return;
            if (actions.onPlay) actions.onPlay(index);
        });

        const checkbox = item.querySelector('.track-select-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                item.classList.toggle('selected', e.target.checked);
            });
        }
    });

    // Handle select all
    const selectAll = document.getElementById('select-all-queue');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const checkboxes = queueList.querySelectorAll('.track-select-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = selectAll.checked;
                cb.closest('.track-list-row').classList.toggle('selected', cb.checked);
            });
        });
    }

    const activeItem = queueList.querySelector('.queue-item.active');
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
