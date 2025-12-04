import { extractMetadata } from './metadata-extractor.js';

let config = {
    getDB: () => null,
    saveTrackToDB: () => Promise.reject(),
    deleteTrackFromDB: () => Promise.resolve(),
    showMessage: () => {},
    getLibrary: () => [],
    setLibrary: () => {},
    onLibraryUpdate: () => {}
};

/**
 * Initializes the library manager with necessary dependencies.
 * @param {object} dependencies - The dependencies from the main script.
 */
export function init(dependencies) {
    config = { ...config, ...dependencies };
}

/**
 * Saves the library's metadata to localStorage.
 */
export function saveLibraryMetadata() {
    // This function is now obsolete as Dexie handles persistence.
    // It can be kept for other potential uses or removed.
}

/**
 * Processes a list of files, extracts metadata, and adds them to the library.
 * @param {FileList} fileList - The list of files to process.
 */
export async function handleFiles(fileList, options = {}) {
    if (!fileList.length) return;
    if (!config.getDB()) return;

    config.showMessage(`Processing ${fileList.length} files...`);

    const newTracks = [];
    for (const file of Array.from(fileList)) {
        let metadata;
        if (options.isFromDiscover && options.discoverData) {
            // Use the metadata provided from the Discover API
            const data = options.discoverData;
            metadata = {
                id: data.id.toString(), // Ensure ID is a string
                name: data.name || 'Unknown Title',
                artist: data.artist_name || 'Unknown Artist',
                album: data.album_name || 'Unknown Album',
                coverURL: data.image || null,
                duration: data.duration || 0,
                // Map enriched fields from the discover object
                bio: data.bio || null,
                tags: data.tags || [],
                lyricsUrl: data.lyricsUrl || null,
                similarArtists: data.similarArtists || [],
            };
        } else {
            // Fallback to extracting metadata from the file itself
            metadata = await extractMetadata(file);
        }

        if (metadata) {
            // Create the full track object for Dexie
            const trackForDB = {
                ...metadata,
                downloaded: true, // Mark this track as fully downloaded
                audioBlob: file, // Store the actual file blob
            };
            await config.saveTrackToDB(trackForDB);
            newTracks.push(metadata); // Push metadata to the in-memory library
        }
    }

    if (newTracks.length > 0) {
        const currentLibrary = config.getLibrary();
        config.setLibrary([...currentLibrary, ...newTracks]);
        // No need to call saveLibraryMetadata() anymore
        config.showMessage(`Added ${newTracks.length} track(s).`);
        config.onLibraryUpdate();
    } else {
        config.showMessage("No valid audio files found.");
    }
}

/**
 * Removes a track from the library and its associated data.
 * @param {string} trackId - The ID of the track to remove.
 * @returns {object|null} The track that was removed, or null.
 */
export async function removeTrack(trackId) {
    const library = config.getLibrary();
    const index = library.findIndex(t => t.id === trackId);
    if (index === -1) return null;

    const [removedTrack] = library.splice(index, 1);
    config.setLibrary(library);

    // DB & URL Cleanup
    if (!removedTrack.isURL) await config.deleteTrackFromDB(removedTrack.id);
    if (removedTrack.objectURL && !removedTrack.isURL) URL.revokeObjectURL(removedTrack.objectURL);
    if (removedTrack.coverURL) URL.revokeObjectURL(removedTrack.coverURL);

    config.onLibraryUpdate();

    return removedTrack;
}

/**
 * Retrieves the full track object from the library by its ID.
 * @param {string} trackId The ID of the track to find.
 * @returns {object|null} The track data or null if not found.
 */
export function getTrackDetailsFromId(trackId) {
    const library = config.getLibrary();
    return library.find(t => t.id === trackId) || null;
}