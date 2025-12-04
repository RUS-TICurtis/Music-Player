let config = {
    playerContext: null,
    albumsContent: null,
    albumDetailView: null,
    albumsSection: null,
    startPlayback: () => {},
    showMessage: () => {},
    renderDetailTrackList: () => {},
};

export function init(dependencies) {
    config = { ...config, ...dependencies };
}

export function renderAlbumsGrid() {
    if (!config.albumsContent) return;

    const albums = {};

    config.playerContext.libraryTracks.forEach(track => {
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
        config.albumsContent.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No albums found in your library.</p></div>`;
        return;
    }

    config.albumsContent.innerHTML = albumList.map(album => `
        <div class="album-card">
            <div class="album-art-circular">
                ${album.coverURL ? `<img src="${album.coverURL}" alt="${album.name}">` : `<div class="placeholder-icon"><i class="fas fa-compact-disc"></i></div>`}
            </div>
            <div class="album-name">${album.name}</div>
            <div class="album-artist">${album.artist}</div>
        </div>
    `).join('');

    config.albumsContent.querySelectorAll('.album-card').forEach((card, index) => {
        card.addEventListener('click', () => {
            const album = albumList[index];
            openAlbumView(album);
        });
    });
}

function openAlbumView(album) {
    config.albumsSection.classList.add('hidden');
    config.albumDetailView.classList.remove('hidden');
    config.albumDetailView.innerHTML = `
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
        <div class="track-list-header"> <!-- Header for the list -->
            <input type="checkbox" class="select-all-checkbox" title="Select all tracks">
            <span style="grid-column: 2;">#</span><span>Title</span><span>Album</span><span>Duration</span><span></span>
        </div>
        <div id="album-track-list"></div>
    `;

    document.getElementById('album-detail-back-btn').addEventListener('click', () => {
        config.albumDetailView.classList.add('hidden');
        config.albumsSection.classList.remove('hidden');
    });

    document.getElementById('album-play-all-btn').addEventListener('click', () => {
        config.startPlayback(album.trackIds, 0, false);
        config.showMessage(`Playing album: ${album.name}`);
    });

    document.getElementById('album-shuffle-btn').addEventListener('click', () => {
        config.startPlayback(album.trackIds, 0, true);
        config.showMessage(`Shuffling album: ${album.name}`);
    });

    config.renderDetailTrackList(album.trackIds, document.getElementById('album-track-list'), { showAlbum: false });
}