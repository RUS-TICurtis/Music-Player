import { playerContext } from './state.js';
import { renderDetailTrackList } from './library-manager.js';
import { showMessage, switchSection } from './ui-manager.js';

let startPlaybackFn = null;

export function setArtistDependencies(startPlayback) {
    startPlaybackFn = startPlayback;
}

export function renderArtistsGrid() {
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

    artistsContent.innerHTML = artistList.map((artist, index) => `
    <div class="artist-card" data-index="${index}">
        <div class="album-art-circular">
            ${artist.coverURL ? `<img src="${artist.coverURL}" alt="${artist.name}">` : `<div class="placeholder-icon"><i class="fas fa-user"></i></div>`}
        </div>
        <div class="album-name">${artist.name}</div>
    </div>
`).join('');

    artistsContent.querySelectorAll('.artist-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = card.dataset.index;
            const artist = artistList[index];
            openArtistView(artist);
        });
    });
}

export function openArtistView(artist) {
    const artistDetailView = document.getElementById('artist-detail-view');
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
        const artistsSection = document.getElementById('artists-section');
        if (artistsSection) artistsSection.classList.remove('hidden');
        else {
            // Fallback if artists section doesn't exist or we want to go home
            // import('./ui-manager.js').then(ui => ui.switchSection('home-section'));
            // But simpler to just unhide whatever we have or do nothing.
            // Usually there IS an artists section.
            document.getElementById('home-section')?.classList.remove('hidden');
        }
    });

    document.getElementById('artist-play-all-btn').addEventListener('click', () => {
        if (startPlaybackFn) startPlaybackFn(artist.trackIds, 0, false);
        // showMessage(`Playing all tracks by ${artist.name}`);
    });

    document.getElementById('artist-shuffle-btn').addEventListener('click', () => {
        if (startPlaybackFn) startPlaybackFn(artist.trackIds, 0, true);
        // showMessage(`Shuffling tracks by ${artist.name}`);
    });

    renderDetailTrackList(artist.trackIds, document.getElementById('artist-track-list'), { showArtist: false, showAlbum: true });

    switchSection('artist-detail-view', artist.name);
}

export function openArtistByName(artistName) {
    if (!artistName) return;
    const tracks = playerContext.libraryTracks.filter(t => (t.artist || 'Unknown Artist') === artistName);
    if (tracks.length === 0) return;

    const artist = {
        name: artistName,
        coverURL: tracks.find(t => t.coverURL)?.coverURL || null,
        trackIds: tracks.map(t => t.id)
    };
    openArtistView(artist);
}
