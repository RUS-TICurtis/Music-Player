import { playerContext } from './state.js';
import { formatTime, truncate } from './utils.js';

// DOM Elements Helpers
export const elements = {
    msgText: () => document.getElementById('modal-text'),
    msgModal: () => document.getElementById('message-modal'),
    confirmModal: () => document.getElementById('confirm-modal'),
    confirmModalTitle: () => document.getElementById('confirm-modal-title'),
    confirmModalText: () => document.getElementById('confirm-modal-text'),
    confirmOkBtn: () => document.getElementById('confirm-ok-btn'),
    confirmCancelBtn: () => document.getElementById('confirm-cancel-btn'),
    mainSections: () => document.querySelectorAll('.main-section'),
    albumDetailView: () => document.getElementById('album-detail-view'),
    artistDetailView: () => document.getElementById('artist-detail-view'),
    menuItems: () => document.querySelectorAll('.menu-item'),
    bottomNavItems: () => document.querySelectorAll('.bottom-nav .nav-item'),
    selectionCount: () => document.getElementById('selection-count'),
    selectionBar: () => document.getElementById('selection-action-bar'),
    themeToggle: () => document.getElementById('theme-toggle-checkbox'),
    libraryGrid: () => document.getElementById('library-grid'),
    libraryGridViewBtn: () => document.getElementById('library-grid-view-btn'),
    libraryListViewBtn: () => document.getElementById('library-list-view-btn'),
    extendedInfoPanel: () => document.getElementById('extended-info-panel'),
    mainContent: () => document.querySelector('.main-content'),
    searchDropdown: () => document.getElementById('search-dropdown'),
    searchInput: () => document.getElementById('search-input'),
    inputModal: () => document.getElementById('input-modal'),
    inputModalTitle: () => document.getElementById('input-modal-title'),
    inputModalLabel: () => document.getElementById('input-modal-label'),
    inputModalField: () => document.getElementById('generic-input-field'),
    inputModalOkBtn: () => document.getElementById('input-modal-ok-btn'),
    inputModalCancelBtn: () => document.getElementById('input-modal-cancel-btn'),
};

export function showMessage(msg) {
    // Silence toast-like messages as requested, but we can keep the logic
    // Or just make it do nothing if we want to remove obtrusive messages.
    // Let's at least log it or only show critical errors.
    console.log("Message:", msg);
    // elements.msgText().innerHTML = msg;
    // elements.msgModal().classList.remove('hidden');
}

export function showInputModal(title, label, initialValue = "", placeholder = "Type here...") {
    return new Promise(resolve => {
        const modal = elements.inputModal();
        const titleEl = elements.inputModalTitle();
        const labelEl = elements.inputModalLabel();
        const field = elements.inputModalField();
        const okBtn = elements.inputModalOkBtn();
        const cancelBtn = elements.inputModalCancelBtn();

        titleEl.textContent = title;
        labelEl.textContent = label;
        field.value = initialValue;
        field.placeholder = placeholder;

        modal.classList.remove('hidden');
        field.focus();

        const close = (val) => {
            modal.classList.add('hidden');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            field.onkeydown = null;
            resolve(val);
        };

        okBtn.onclick = () => close(field.value);
        cancelBtn.onclick = () => close(null);
        field.onkeydown = (e) => {
            if (e.key === 'Enter') close(field.value);
            if (e.key === 'Escape') close(null);
        };
    });
}

export function showConfirmation(title, text) {
    return new Promise(resolve => {
        elements.confirmModalTitle().textContent = title;
        elements.confirmModalText().innerHTML = text;
        const modal = elements.confirmModal();
        const okBtn = elements.confirmOkBtn();
        const cancelBtn = elements.confirmCancelBtn();

        modal.classList.remove('hidden');

        okBtn.onclick = () => {
            modal.classList.add('hidden');
            resolve(true);
        };
        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            resolve(false);
        };
    });
}

export function switchSection(targetId, detailId = null) {
    elements.mainSections().forEach(section => section.classList.add('hidden'));

    // Also hide detail views specifically if needed
    const detailViews = ['album-detail-view', 'artist-detail-view', 'playlist-detail-view'];
    detailViews.forEach(id => document.getElementById(id)?.classList.add('hidden'));

    const target = document.getElementById(targetId);
    if (target) target.classList.remove('hidden');

    // Apply body class for section-specific CSS (like FAB visibility)
    document.body.className = document.body.className.replace(/section-\S+/g, '').trim();
    document.body.classList.add(`section-${targetId}`);

    const items = [...elements.menuItems(), ...elements.bottomNavItems()];
    items.forEach(item => {
        item.classList.toggle('active', item.dataset.target === targetId);
    });

    // Persist UI State
    localStorage.setItem('genesis_active_section', targetId);
    if (detailId) {
        localStorage.setItem('genesis_active_detail_id', detailId);
    } else if (!detailViews.includes(targetId)) {
        // If switching to a main section, clear the detail ID
        localStorage.removeItem('genesis_active_detail_id');
    }
}

export function applyTheme(theme) {
    const themeToggle = elements.themeToggle();
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.body.classList.remove('dark-theme');
        if (themeToggle) themeToggle.checked = false;
    }
}

export function restoreSearch() {
    const searchInput = elements.searchInput();
    const lastSearch = localStorage.getItem('genesis_last_search');
    if (lastSearch && searchInput) {
        searchInput.value = lastSearch;
        // Optionally trigger a search if you want results to show immediately
    }
}

export function updateSelectionBar() {
    const count = playerContext.selectedTrackIds.size;
    const bar = elements.selectionBar();
    const countEl = elements.selectionCount();
    if (count > 0 && bar && countEl) {
        countEl.textContent = count;
        bar.classList.remove('hidden');
    } else if (bar) {
        bar.classList.add('hidden');
    }
}

export function switchLibraryView(view) {
    const grid = elements.libraryGrid();
    const gridBtn = elements.libraryGridViewBtn();
    const listBtn = elements.libraryListViewBtn();

    if (view === 'grid') {
        grid.classList.remove('list-view');
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    } else {
        grid.classList.add('list-view');
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
    }
    localStorage.setItem('genesis_library_view', view);
}

// Search Dropdown Logic
export function renderSearchDropdown(highlightedSearchIndex = -1) {
    const searchDropdown = elements.searchDropdown();
    const searchInput = elements.searchInput();
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        searchDropdown.classList.add('hidden');
        searchDropdown.innerHTML = '';
        return;
    }

    const results = playerContext.libraryTracks
        .filter(track =>
            (track.title && track.title.toLowerCase().includes(query)) ||
            (track.artist && track.artist.toLowerCase().includes(query)))
        .slice(0, 10);

    if (results.length === 0) {
        searchDropdown.innerHTML = `<div class="no-results">No results found for "${query}"</div>`;
        searchDropdown.classList.remove('hidden');
        return;
    }

    searchDropdown.innerHTML = results.map(track => {
        const duration = track.duration ? formatTime(track.duration) : '';
        const icon = track.isURL ? '<i class="fas fa-globe"></i>' : '<i class="fas fa-music"></i>';
        return `
            <div class="result-item" data-track-id="${track.id}" role="option">
                ${icon}
                <div class="label">${truncate(track.title, 40)} <span class="search-artist-label">- ${truncate(track.artist || 'Unknown', 20)}</span></div>
                <div class="meta">${duration}</div>
            </div>
        `;
    }).join('');

    searchDropdown.classList.remove('hidden');
}

export function updateSearchHighlight(items, highlightedSearchIndex) {
    items.forEach((item, index) => {
        if (index === highlightedSearchIndex) {
            item.classList.add('highlighted');
            item.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        } else {
            item.classList.remove('highlighted');
        }
    });
}

export function updateGlobalPlayingState(trackId) {
    // Remove from all previous
    document.querySelectorAll('.currently-playing').forEach(el => el.classList.remove('currently-playing'));
    if (!trackId) return;
    // Add to all matches (rows in lists/queue and cards in home/discover)
    const selectors = [
        `.track-list-row[data-id="${trackId}"]`,
        `.recent-media-card[data-track-id="${trackId}"]`
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el => {
        el.classList.add('currently-playing');
    });
}
