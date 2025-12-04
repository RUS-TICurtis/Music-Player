let config = {
    playerContext: null,
    artistsContent: null,
    artistDetailView: null,
    artistsSection: null,
    startPlayback: () => {},
    showMessage: () => {},
    renderDetailTrackList: () => {},
};

export function init(dependencies) {
    config = { ...config, ...dependencies };
}

export function renderArtistsGrid() {
    if (!config.artistsContent) return;

    const artists = {};

    config.playerContext.libraryTracks.forEach(track => {
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
        config.artistsContent.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No artists found in your library.</p></div>`;
        return;
    }

    config.artistsContent.innerHTML = artistList.map(artist => `
        <div class="artist-card" data-artist-name="${artist.name}">
            <div class="album-art-circular">
                ${artist.coverURL ? `<img src="${artist.coverURL}" alt="${artist.name}">` : `<div class="placeholder-icon"><i class="fas fa-user"></i></div>`}
            </div>
            <div class="album-name">${artist.name}</div>
        </div>
    `).join('');

    config.artistsContent.querySelectorAll('.artist-card').forEach((card, index) => {
        card.addEventListener('click', () => {
            const artist = artistList[index];
            openArtistView(artist);
        });
    });
}

function openArtistView(artist) {
    config.artistsSection.classList.add('hidden');
    config.artistDetailView.classList.remove('hidden');
    config.artistDetailView.innerHTML = `
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
        config.artistDetailView.classList.add('hidden');
        config.artistsSection.classList.remove('hidden');
    });

    document.getElementById('artist-play-all-btn').addEventListener('click', () => {
        config.startPlayback(artist.trackIds, 0, false);
        config.showMessage(`Playing all tracks by ${artist.name}`);
    });

    document.getElementById('artist-shuffle-btn').addEventListener('click', () => {
        config.startPlayback(artist.trackIds, 0, true); // Pass true for shuffle
        config.showMessage(`Shuffling tracks by ${artist.name}`);
    });

    config.renderDetailTrackList(artist.trackIds, document.getElementById('artist-track-list'), { showArtist: false, showAlbum: true });
}