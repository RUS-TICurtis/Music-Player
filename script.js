// Genesis Player Core Script

// Helpers
const byId = id => document.getElementById(id) || null;
const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

// Elements
const audio = byId('audio-player');
const playBtn = byId('play-btn');
const playIcon = byId('play-icon');
const prevBtn = byId('prev-btn');
const nextBtn = byId('next-btn');
const shuffleBtn = byId('shuffle-btn');
const repeatBtn = byId('repeat-btn');
const progressContainer = byId('progress-container');
const progressFill = byId('progress-fill');
const currentTimeEl = byId('current-time');
const durationEl = byId('duration');
const volumeSlider = byId('volume-slider');
const queueList = byId('queue-list');
const songTitle = byId('song-title');
const artistName = byId('artist-name');
const fileInput = byId('file-input');
const folderInput = byId('folder-input');
const urlModal = byId('url-modal');
const urlInput = byId('url-input');
const urlLoadBtn = byId('url-load-btn');
const urlCancelBtn = byId('url-cancel-btn');
const openMenuBtn = byId('open-menu-btn');
const openMenuDropdown = byId('open-menu-dropdown');
const openFilesOption = byId('open-files-option');
const openFolderOption = byId('open-folder-option');
const openUrlOption = byId('open-url-option');
const profilePicInput = byId('profile-pic-input');
const profilePic = byId('profile-pic');
const usernameInput = byId('username-input');
const sidebar = document.querySelector('.sidebar');
const sidebarToggle = byId('sidebar-toggle');
const bottomNavItems = document.querySelectorAll('.bottom-nav .nav-item');

let queue = [];
let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let isRepeat = false;

// Track object URLs to avoid leaks
const objectURLs = new Set();
function createObjectURL(file) {
  const u = URL.createObjectURL(file);
  objectURLs.add(u);
  return u;
}
function revokeAllObjectURLs(keepUrl = null) {
  [...objectURLs].filter(u => u !== keepUrl).forEach(u => {
    try { URL.revokeObjectURL(u); } catch {}
    objectURLs.delete(u);
  });
}

// 🎵 Load Files
on(openFilesOption, 'click', () => fileInput && fileInput.click());
on(openFolderOption, 'click', () => folderInput && folderInput.click());
on(openUrlOption, 'click', () => urlModal && urlModal.classList.remove('hidden'));

on(fileInput, 'change', e => loadTracks(e.target.files));
on(folderInput, 'change', e => loadTracks(e.target.files));

on(urlLoadBtn, 'click', () => {
  if (!urlInput) return;
  const url = urlInput.value.trim();
  if (url) {
    queue.push({ title: url.split('/').pop() || url, artist: 'URL Stream', src: url, isObjectURL: false });
    currentIndex = queue.length - 1;
    renderQueue();
    loadTrack(currentIndex);
    urlModal && urlModal.classList.add('hidden');
  }
});
on(urlCancelBtn, 'click', () => urlModal && urlModal.classList.add('hidden'));

// 🎧 Playback
on(playBtn, 'click', () => {
  if (!audio) return;
  if (audio.paused) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
});
if (audio) {
  audio.addEventListener('play', () => {
    isPlaying = true;
    playIcon?.classList.replace('fa-play', 'fa-pause');
  });
  audio.addEventListener('pause', () => {
    isPlaying = false;
    playIcon?.classList.replace('fa-pause', 'fa-play');
  });
  audio.addEventListener('ended', () => {
    if (isRepeat) {
      loadTrack(currentIndex);
      audio.play().catch(() => {});
    } else {
      changeTrack(1);
    }
  });
}

on(prevBtn, 'click', () => changeTrack(-1));
on(nextBtn, 'click', () => changeTrack(1));
on(shuffleBtn, 'click', () => {
  isShuffle = !isShuffle;
  shuffleBtn?.classList.toggle('active', isShuffle);
});
on(repeatBtn, 'click', () => {
  isRepeat = !isRepeat;
  repeatBtn?.classList.toggle('active', isRepeat);
});
on(volumeSlider, 'input', () => {
  if (audio && volumeSlider) audio.volume = Number(volumeSlider.value);
});

// ⏱ Progress
if (audio) {
  audio.addEventListener('timeupdate', () => {
    if (!audio.duration || !progressFill) return;
    const percent = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = `${percent}%`;
    currentTimeEl && (currentTimeEl.textContent = formatTime(audio.currentTime));
    durationEl && (durationEl.textContent = isFinite(audio.duration) ? formatTime(audio.duration) : '0:00');
  });
}
on(progressContainer, 'click', (e) => {
  if (!audio || !progressContainer.getBoundingClientRect) return;
  if (!audio.duration) return;
  const rect = progressContainer.getBoundingClientRect();
  const clientX = e.clientX ?? (e.touches?.[0]?.clientX) ?? 0;
  const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  audio.currentTime = percent * audio.duration;
});
function formatTime(sec) {
  if (!isFinite(sec) || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// 📂 Load & Render
function loadTracks(files) {
  if (!files || files.length === 0) return;
  const currentSrc = audio?.src || null;
  revokeAllObjectURLs(currentSrc);
  queue = [...files].map(file => ({
    title: file.name,
    artist: 'Local File',
    src: createObjectURL(file),
    isObjectURL: true
  }));
  currentIndex = 0;
  renderQueue();
  loadTrack(currentIndex);
}
function loadTrack(index) {
  if (!audio) return;
  const track = queue[index];
  if (!track) return;
  audio.pause();
  audio.src = track.src;
  try { audio.load(); } catch {}
  audio.currentTime = 0;
  songTitle && (songTitle.textContent = track.title || '');
  artistName && (artistName.textContent = track.artist || '');
  highlightQueue(index);
}
function changeTrack(step) {
  if (!queue || queue.length === 0) return;
  currentIndex = isShuffle ? Math.floor(Math.random() * queue.length)
                           : (currentIndex + step + queue.length) % queue.length;
  loadTrack(currentIndex);
  audio?.play().catch(() => {});
}
function renderQueue() {
  if (!queueList) return;
  queueList.innerHTML = '';
  queue.forEach((track, i) => {
    const item = document.createElement('div');
    item.className = 'queue-item' + (i === currentIndex ? ' active' : '');
    item.innerHTML = `
      <div class="queue-item-icon"><i class="fas fa-music"></i></div>
      <div class="queue-item-info">
        <h4>${track.title}</h4>
        <p>${track.artist}</p>
      </div>
    `;
    item.addEventListener('click', () => {
      currentIndex = i;
      loadTrack(i);
      audio?.play().catch(() => {});
    });
    queueList.appendChild(item);
  });
}
function highlightQueue(index) {
  if (!queueList) return;
  [...queueList.children].forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });
}

// 👤 Profile
on(profilePicInput, 'change', e => {
  const file = e.target.files[0];
  if (file) profilePic.src = URL.createObjectURL(file);
});
on(usernameInput, 'blur', () => {
  const name = usernameInput.value.trim();
  if (name) localStorage.setItem('genesis-username', name);
});
window.addEventListener('load', () => {
  const savedName = localStorage.getItem('genesis-username');
  if (savedName && usernameInput) usernameInput.value = savedName;
});

// 🔽 Dropdown toggle
on(openMenuBtn, 'click', () => openMenuDropdown?.classList.toggle('hidden'));

// 📱 Sidebar Toggle + Close
on(sidebarToggle, 'click', () => sidebar?.classList.toggle('active'));

document.addEventListener('click', (e) => {
  if (window.innerWidth <= 992) {
    if (sidebar && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
      sidebar.classList.remove('active');
    }
  }
});
// 📱 Bottom Nav Activation with View Switching
bottomNavItems.forEach(item => {
  item.addEventListener('click', () => {
    // Highlight active nav item
    bottomNavItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    // Hide all main sections
    document.querySelectorAll('.main-section').forEach(sec => sec.classList.add('hidden'));

    // Show selected section
    const section = item.querySelector('span').textContent.toLowerCase();
    const target = document.getElementById(`${section}-section`);
    if (target) target.classList.remove('hidden');
  });
});
