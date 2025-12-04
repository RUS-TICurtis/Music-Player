/**
 * db.js
 * Defines the IndexedDB schema using Dexie.js.
 * This provides a structured, modern way to interact with the browser's local database.
 */

export const db = new Dexie('genesisDB');

db.version(3).stores({
  // Use Jamendo's ID as the primary key (&id).
  // Store all enriched data. audioBlob is for downloaded tracks.
  tracks: '&id, name, artist, album, *tags, audioBlob, coverURL, bio, lyricsUrl, similarArtists, downloaded',
  artists: '&id, name, genre, bio' // For future artist caching
}).upgrade(tx => {
  // Migration logic for future versions can go here.
  // Dexie automatically handles adding new properties to existing objects.
});