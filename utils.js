export function truncate(str, n = 25) {
    if (!str || typeof str !== 'string') return str;
    return (str.length > n) ? str.substring(0, n) + '...' : str;
}

export function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function isValidString(str) {
    if (!str || typeof str !== 'string' || str.trim() === '') {
        return false;
    }
    // Check for the Unicode Replacement Character, which often indicates decoding errors.
    if (str.includes('\uFFFD')) {
        return false;
    }
    return true;
}

export function debounce(fn, ms = 200) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

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
