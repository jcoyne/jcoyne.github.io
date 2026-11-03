(() => {
  'use strict';

  const STORAGE_KEY = 'stanfordtube-library-v1';
  const BATCH_SIZE = 36;
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    grid: $('#video-grid'), sentinel: $('#load-sentinel'), filters: $('#filters'),
    search: $('#search-input'), clear: $('#clear-search'), sidebar: $('#sidebar'),
    scrim: $('#sidebar-scrim'), menu: $('#menu-toggle'), modal: $('#video-modal'),
    playlistModal: $('#playlist-modal'), choices: $('#playlist-choices'),
    overview: $('#playlist-overview'), browse: $('#browse-panel')
  };
  const defaultLibrary = () => ({ liked: [], later: [], history: [], playlists: [], view: 'home' });
  let library = readLibrary();
  let videos = [];
  let byId = new Map();
  let thumbnails = {};
  let matched = [];
  let shown = 0;
  let currentView = 'home';
  let selectedCollection = 'all';
  let activeVideo = null;
  let playlistTarget = null;
  let metadataController = null;
  let toastTimer;
  let searchTimer;

  function readLibrary() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!data || typeof data !== 'object') return defaultLibrary();
      return {
        liked: Array.isArray(data.liked) ? data.liked : [],
        later: Array.isArray(data.later) ? data.later : [],
        history: Array.isArray(data.history) ? data.history : [],
        playlists: Array.isArray(data.playlists) ? data.playlists.filter(p => p && typeof p.name === 'string' && Array.isArray(p.items)) : [],
        view: typeof data.view === 'string' ? data.view : 'home'
      };
    } catch { return defaultLibrary(); }
  }
  function saveLibrary() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(library)); }
    catch { toast('Could not save to this browser. Check that storage is available.'); }
    updateNavigation();
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function parseCSV(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
        else if (c === '"') quoted = false;
        else value += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(value); value = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(value); value = '';
        if (row.some(cell => cell !== '')) rows.push(row);
        row = [];
      } else value += c;
    }
    if (row.length || value) { row.push(value); rows.push(row); }
    const headers = rows.shift();
    return rows.map(cells => Object.fromEntries(headers.map((header, i) => [header, cells[i] || ''])));
  }
  function thumbnail(id) {
    const filename = thumbnails[id]?.filename;
    if (typeof filename !== 'string' || !/\.(jp2|jpe?g|png|tiff?|webp)$/i.test(filename)) return null;
    const imageId = `${id}/${filename.replace(/\.[^.]+$/, '')}`;
    return `https://stacks.stanford.edu/image/iiif/${encodeURIComponent(imageId)}/full/!640,360/0/default.jpg`;
  }
  const collectionName = text => text ? text.replace(/\s*:\s*\d{4}.*$/, '').replace(/^Stanford University,\s*/, '') : 'Stanford Digital Repository';
  const nameFor = id => byId.get(id)?.title || 'Untitled video';
  const validItems = ids => ids.filter(id => byId.has(id));
  const isPlaylistView = () => currentView.startsWith('playlist:');
  const activePlaylist = () => library.playlists.find(p => p.id === currentView.slice(9));
  const syncScrollLock = () => { document.body.style.overflow = elements.modal.open || elements.playlistModal.open ? 'hidden' : ''; };

  function setView(view, updateHash = true) {
    if (!['home','liked','history','later','playlists'].includes(view) && !view.startsWith('playlist:')) view = 'home';
    if (view.startsWith('playlist:') && !library.playlists.some(p => p.id === view.slice(9))) view = 'playlists';
    currentView = view;
    library.view = view;
    saveLibrary();
    selectedCollection = 'all';
    closeSidebar();
    if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(view)}`);
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function updateNavigation() {
    $('#liked-count').textContent = library.liked.length || '';
    $('#later-count').textContent = library.later.length || '';
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === currentView || (item.dataset.view === 'playlists' && isPlaylistView())));
    $('#sidebar-playlists').innerHTML = library.playlists.length
      ? library.playlists.map(p => `<button class="playlist-link ${currentView === `playlist:${p.id}` ? 'active' : ''}" data-playlist-id="${escapeHTML(p.id)}"><span class="playlist-mini-icon">▤</span><span>${escapeHTML(p.name)}</span></button>`).join('')
      : '<p class="sidebar-empty">Make a playlist to collect videos you love.</p>';
  }
  function currentIds() {
    if (currentView === 'liked') return validItems(library.liked);
    if (currentView === 'history') return validItems(library.history);
    if (currentView === 'later') return validItems(library.later);
    if (isPlaylistView()) return validItems(activePlaylist()?.items || []);
    return videos.map(video => video.id);
  }
  function updateIntro() {
    const content = {
      home: ['Ideas worth <em>watching.</em>', "Lectures, conversations, performances, and moments from across Stanford's collections. Find something that stays with you.", 'Explore videos'],
      liked: ['Videos you <em>liked.</em>', 'The videos you have marked as favorites, all in one place.', 'Liked videos'],
      history: ['Your viewing <em>history.</em>', 'A trail of the ideas you have explored.', 'Recently watched'],
      later: ['Watch it <em>later.</em>', 'Good things are worth coming back to.', 'Saved videos'],
      playlists: ['Your <em>playlists.</em>', 'Make your own paths through the archive.', 'Your playlists']
    };
    const playlist = isPlaylistView() ? activePlaylist() : null;
    const [title, description, section] = playlist
      ? [escapeHTML(playlist.name), `${playlist.items.length} saved ${playlist.items.length === 1 ? 'video' : 'videos'} in this playlist.`, 'Videos in this playlist']
      : content[currentView] || content.home;
    $('#page-title').innerHTML = title;
    $('#page-description').textContent = description;
    $('#section-title').textContent = section;
    document.title = `${playlist?.name || section} — StanfordTube`;
  }
  function renderFilters() {
    if (currentView !== 'home') { elements.filters.hidden = true; return; }
    elements.filters.hidden = false;
    const counts = new Map();
    videos.forEach(video => { if (video.collection) counts.set(video.collection, (counts.get(video.collection) || 0) + 1); });
    const collections = [...counts].sort((a,b) => b[1]-a[1]).slice(0, 8);
    elements.filters.innerHTML = `<button class="filter-chip ${selectedCollection === 'all' ? 'active' : ''}" data-collection="all">All videos</button>` + collections.map(([name]) => `<button class="filter-chip ${selectedCollection === name ? 'active' : ''}" data-collection="${escapeHTML(name)}" title="${escapeHTML(name)}">${escapeHTML(collectionName(name))}</button>`).join('');
  }
  function render() {
    updateNavigation();
    updateIntro();
    const overview = currentView === 'playlists';
    elements.browse.hidden = overview;
    elements.overview.hidden = !overview;
    if (overview) { renderPlaylistOverview(); return; }
    if (isPlaylistView()) {
      const playlist = activePlaylist();
      elements.overview.hidden = false;
      elements.overview.innerHTML = `<div class="playlist-tools"><button class="secondary-button" data-delete-playlist="${escapeHTML(playlist.id)}">Delete playlist</button></div>`;
    }
    renderFilters();
    const query = elements.search.value.trim().toLocaleLowerCase();
    matched = currentIds().map(id => byId.get(id)).filter(video => video && (selectedCollection === 'all' || video.collection === selectedCollection) && (!query || video.search.includes(query)));
    shown = 0;
    elements.grid.replaceChildren();
    const count = matched.length;
    $('#results-label').textContent = `${count.toLocaleString()} ${count === 1 ? 'video' : 'videos'}${query ? ` matching “${elements.search.value.trim()}”` : ''}`;
    const empty = count === 0;
    $('#empty-state').hidden = !empty;
    elements.sentinel.hidden = empty;
    if (empty) {
      $('#empty-title').textContent = query ? 'No matches found' : currentView === 'home' ? 'No videos found' : 'Nothing here yet';
      $('#empty-description').textContent = query ? 'Try a different search term or collection.' : ({liked:'Videos you like will appear here.',history:'Videos you open will appear here.',later:'Save videos to build your watch later list.'}[currentView] || 'Add a video to get started.');
      $('#empty-action').hidden = !query;
      $('#empty-action').textContent = 'Clear search';
    }
    loadMore();
  }
  function cardHTML(video) {
    const liked = library.liked.includes(video.id);
    const later = library.later.includes(video.id);
    const imageUrl = thumbnail(video.id);
    return `<article class="card" data-id="${video.id}"><button class="card-media" data-open="${video.id}" aria-label="Watch ${escapeHTML(video.title)}"><span class="card-fallback" aria-hidden="true">S</span>${imageUrl ? `<img src="${imageUrl}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}<span class="card-play" aria-hidden="true">▶</span></button><div class="card-info"><div class="card-text"><button class="card-title" data-open="${video.id}">${escapeHTML(video.title)}</button><p class="card-collection" title="${escapeHTML(video.collection || 'Stanford Digital Repository')}">${escapeHTML(collectionName(video.collection))}</p><div class="card-actions"><button class="card-action ${liked ? 'active' : ''}" data-like="${video.id}" aria-label="${liked ? 'Unlike' : 'Like'} ${escapeHTML(video.title)}" aria-pressed="${liked}"><span aria-hidden="true">${liked ? '♥' : '♡'}</span> Like</button><button class="card-action ${later ? 'active' : ''}" data-later="${video.id}" aria-label="${later ? 'Remove from watch later' : 'Save to watch later'}" aria-pressed="${later}"><span aria-hidden="true">${later ? '▣' : '▱'}</span> Watch later</button></div></div><button class="card-more" data-add-playlist="${video.id}" aria-label="Add ${escapeHTML(video.title)} to playlist" title="Add to playlist">⋯</button></div></article>`;
  }
  function loadMore() {
    if (shown >= matched.length) return;
    const next = matched.slice(shown, shown + BATCH_SIZE);
    elements.grid.insertAdjacentHTML('beforeend', next.map(cardHTML).join(''));
    shown += next.length;
    elements.sentinel.hidden = shown >= matched.length;
  }
  function renderPlaylistOverview() {
    const cards = library.playlists.map(p => {
      const first = p.items.find(id => byId.has(id));
      const imageUrl = first ? thumbnail(first) : null;
      return `<button class="playlist-card" data-playlist-id="${escapeHTML(p.id)}"><div class="playlist-cover">${imageUrl ? `<img src="${imageUrl}" alt="" loading="lazy" onerror="this.remove()">` : '▤'}</div><strong>${escapeHTML(p.name)}</strong><p>${p.items.length} ${p.items.length === 1 ? 'video' : 'videos'}</p></button>`;
    }).join('');
    elements.overview.innerHTML = `<div class="playlist-header"><h2>Made by you</h2><button class="primary-button" data-create-playlist>+ New playlist</button></div>${cards ? `<div class="playlist-cards">${cards}</div>` : '<div class="empty-state"><span class="empty-icon">▤</span><h3>Start a collection</h3><p>Create a playlist to keep related videos together.</p></div>'}`;
  }
  function toggleArray(key, id) {
    const list = library[key];
    const index = list.indexOf(id);
    if (index === -1) list.unshift(id); else list.splice(index, 1);
    saveLibrary();
    toast(index === -1 ? (key === 'liked' ? 'Added to liked videos' : 'Saved to watch later') : (key === 'liked' ? 'Removed from liked videos' : 'Removed from watch later'));
    if (['liked','later'].includes(currentView) && currentView === key) render();
    else refreshCard(id);
    updateDetailActions();
  }
  function refreshCard(id) {
    const card = [...document.querySelectorAll('.card')].find(c => c.dataset.id === id);
    if (card) card.outerHTML = cardHTML(byId.get(id));
  }
  async function openVideo(id, updateHash = true) {
    const video = byId.get(id);
    if (!video) return;
    activeVideo = video;
    if (metadataController) metadataController.abort();
    metadataController = new AbortController();
    library.history = [id, ...library.history.filter(item => item !== id)].slice(0, 300);
    saveLibrary();
    if (currentView === 'history') render();
    $('#video-title').textContent = video.title;
    $('#detail-collection').textContent = collectionName(video.collection);
    $('#detail-meta').textContent = 'Stanford Digital Repository';
    $('#detail-description').textContent = 'Loading details…';
    $('#source-link').href = video.purl;
    $('#player-wrap').innerHTML = `<iframe title="${escapeHTML(video.title)}" src="https://embed.stanford.edu/iframe?url=${encodeURIComponent(video.purl)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="eager"></iframe>`;
    updateDetailActions();
    if (!elements.modal.open) elements.modal.showModal();
    syncScrollLock();
    if (updateHash) history.pushState(null, '', `#watch=${id}`);
    try {
      const response = await fetch(`${video.purl}.json`, { signal: metadataController.signal });
      if (!response.ok) throw new Error(`Metadata ${response.status}`);
      const metadata = await response.json();
      if (activeVideo?.id !== id) return;
      const description = metadata.description || {};
      const date = description.event?.flatMap(e => e.date || []).find(d => d.value)?.value || '';
      const contributors = (description.contributor || []).map(c => c.name?.map(n => n.value).filter(Boolean).join(' ')).filter(Boolean).slice(0,3);
      const notes = (description.note || []).filter(n => n.value && n.displayLabel !== 'Reformatted').map(n => n.value);
      const summary = notes.find(n => n.length > 35 && !/^Reformatted/i.test(n)) || '';
      $('#detail-meta').textContent = [date, contributors.join(', '), 'Stanford Digital Repository'].filter(Boolean).join('  ·  ');
      $('#detail-description').textContent = summary || 'Explore this item and its full record in the Stanford Digital Repository.';
    } catch (error) {
      if (error.name !== 'AbortError' && activeVideo?.id === id) $('#detail-description').textContent = 'Explore this item and its full record in the Stanford Digital Repository.';
    }
  }
  function closeVideo(updateHash = true) {
    if (!elements.modal.open) return;
    if (elements.playlistModal.open) closePlaylistDialog();
    if (metadataController) metadataController.abort();
    activeVideo = null;
    elements.modal.close();
    $('#player-wrap').replaceChildren();
    syncScrollLock();
    if (updateHash) history.replaceState(null, '', `#${encodeURIComponent(currentView)}`);
  }
  function updateDetailActions() {
    if (!activeVideo) return;
    const liked = library.liked.includes(activeVideo.id);
    const later = library.later.includes(activeVideo.id);
    $('#detail-like').classList.toggle('active', liked);
    $('#detail-like').innerHTML = `<span aria-hidden="true">${liked ? '♥' : '♡'}</span> ${liked ? 'Liked' : 'Like'}`;
    $('#detail-like').setAttribute('aria-pressed', liked);
    $('#detail-later').classList.toggle('active', later);
    $('#detail-later').innerHTML = `<span aria-hidden="true">${later ? '▣' : '▱'}</span> ${later ? 'Saved' : 'Watch later'}`;
    $('#detail-later').setAttribute('aria-pressed', later);
  }
  function openPlaylistDialog(target = null) {
    playlistTarget = target;
    $('#playlist-dialog-title').textContent = target ? 'Add to playlist' : 'Create a playlist';
    $('#playlist-name').value = '';
    renderPlaylistChoices();
    if (!elements.playlistModal.open) elements.playlistModal.showModal();
    syncScrollLock();
    if (!target) $('#playlist-name').focus();
  }
  function closePlaylistDialog() {
    if (elements.playlistModal.open) elements.playlistModal.close();
    playlistTarget = null;
    syncScrollLock();
  }
  function renderPlaylistChoices() {
    elements.choices.innerHTML = playlistTarget
      ? (library.playlists.length ? library.playlists.map(p => `<button class="playlist-choice" data-choice="${escapeHTML(p.id)}"><span>${escapeHTML(p.name)}</span><span class="check">${p.items.includes(playlistTarget) ? '✓' : '+'}</span></button>`).join('') : '<p class="playlist-choice-empty">No playlists yet. Create one below.</p>')
      : '';
  }
  function createPlaylist(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const target = playlistTarget;
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
    library.playlists.unshift({ id, name: trimmed, items: target ? [target] : [] });
    saveLibrary();
    toast('Playlist created');
    closePlaylistDialog();
    if (target) {
      if (currentView === 'playlists' || isPlaylistView()) render();
    } else setView(`playlist:${id}`);
  }
  function togglePlaylistItem(playlistId) {
    const playlist = library.playlists.find(p => p.id === playlistId);
    if (!playlist || !playlistTarget) return;
    const index = playlist.items.indexOf(playlistTarget);
    if (index === -1) playlist.items.unshift(playlistTarget); else playlist.items.splice(index, 1);
    saveLibrary();
    renderPlaylistChoices();
    toast(index === -1 ? `Added to ${playlist.name}` : `Removed from ${playlist.name}`);
    if (isPlaylistView()) render();
  }
  function deletePlaylist(id) {
    const playlist = library.playlists.find(p => p.id === id);
    if (!playlist || !confirm(`Delete “${playlist.name}”?`)) return;
    library.playlists = library.playlists.filter(p => p.id !== id);
    saveLibrary();
    setView('playlists');
    toast('Playlist deleted');
  }
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function closeSidebar() { elements.sidebar.classList.remove('open'); elements.scrim.hidden = true; elements.menu.setAttribute('aria-expanded', 'false'); }
  function routeFromHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash.startsWith('watch=')) {
      const id = hash.slice(6);
      if (byId.has(id)) openVideo(id, false);
      return;
    }
    closeVideo(false);
    setView(hash || library.view || 'home', false);
  }

  document.addEventListener('click', event => {
    const target = event.target;
    const nav = target.closest('[data-view]');
    if (nav) { setView(nav.dataset.view); return; }
    const playlist = target.closest('[data-playlist-id]');
    if (playlist) { setView(`playlist:${playlist.dataset.playlistId}`); return; }
    const filter = target.closest('[data-collection]');
    if (filter) { selectedCollection = filter.dataset.collection; render(); return; }
    const open = target.closest('[data-open]');
    if (open) { openVideo(open.dataset.open); return; }
    const liked = target.closest('[data-like]');
    if (liked) { toggleArray('liked', liked.dataset.like); return; }
    const later = target.closest('[data-later]');
    if (later) { toggleArray('later', later.dataset.later); return; }
    const add = target.closest('[data-add-playlist]');
    if (add) { openPlaylistDialog(add.dataset.addPlaylist); return; }
    if (target.closest('[data-create-playlist]')) openPlaylistDialog();
    const choice = target.closest('[data-choice]');
    if (choice) togglePlaylistItem(choice.dataset.choice);
    if (target.closest('[data-delete-playlist]')) deletePlaylist(target.closest('[data-delete-playlist]').dataset.deletePlaylist);
  });
  elements.search.addEventListener('input', () => {
    if (currentView === 'playlists') setView('home');
    elements.clear.hidden = !elements.search.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 140);
  });
  $('#search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); render(); });
  elements.clear.addEventListener('click', () => { elements.search.value = ''; elements.clear.hidden = true; render(); elements.search.focus(); });
  $('#empty-action').addEventListener('click', () => { elements.search.value = ''; elements.clear.hidden = true; selectedCollection = 'all'; render(); });
  $('#detail-like').addEventListener('click', () => activeVideo && toggleArray('liked', activeVideo.id));
  $('#detail-later').addEventListener('click', () => activeVideo && toggleArray('later', activeVideo.id));
  $('#detail-playlist').addEventListener('click', () => activeVideo && openPlaylistDialog(activeVideo.id));
  $('#close-video').addEventListener('click', () => closeVideo());
  $('#close-playlist').addEventListener('click', closePlaylistDialog);
  $('#quick-add-playlist').addEventListener('click', () => openPlaylistDialog());
  $('#playlist-form').addEventListener('submit', event => { event.preventDefault(); createPlaylist($('#playlist-name').value); });
  function clickedBackdrop(event, dialog) {
    if (event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  elements.modal.addEventListener('click', event => { if (clickedBackdrop(event, elements.modal)) closeVideo(); });
  elements.playlistModal.addEventListener('click', event => { if (clickedBackdrop(event, elements.playlistModal)) closePlaylistDialog(); });
  elements.modal.addEventListener('cancel', event => { event.preventDefault(); closeVideo(); });
  elements.playlistModal.addEventListener('cancel', event => { event.preventDefault(); closePlaylistDialog(); });
  elements.menu.addEventListener('click', () => { const open = elements.sidebar.classList.toggle('open'); elements.scrim.hidden = !open; elements.menu.setAttribute('aria-expanded', open); });
  elements.scrim.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !elements.modal.open && !elements.playlistModal.open) closeSidebar();
    if (event.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName) && !elements.modal.open && !elements.playlistModal.open) { event.preventDefault(); elements.search.focus(); }
  });
  window.addEventListener('hashchange', routeFromHash);
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { library = readLibrary(); render(); } });
  const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: '900px' });
  observer.observe(elements.sentinel);

  Promise.all([
    fetch('videos.csv').then(response => { if (!response.ok) throw new Error('Could not load videos.csv'); return response.text(); }),
    fetch('thumbnails.json').then(response => { if (!response.ok) throw new Error('Could not load thumbnails.json'); return response.json(); })
  ]).then(([text, imageManifest]) => {
    thumbnails = imageManifest;
    videos = parseCSV(text).map(row => ({ id: row.Druid, purl: row.Purl, title: row.Title || 'Untitled video', collection: row.Collection || '', search: `${row.Title} ${row.Collection}`.toLocaleLowerCase() })).filter(video => /^[a-z]{2}\d{3}[a-z]{2}\d{4}$/.test(video.id) && /^https:\/\/purl\.stanford\.edu\//.test(video.purl));
    byId = new Map(videos.map(video => [video.id, video]));
    routeFromHash();
  }).catch(error => {
    console.error(error);
    $('#results-label').textContent = 'Unable to load the collection';
    $('#empty-state').hidden = false;
    $('#empty-title').textContent = 'The archive could not load';
    $('#empty-description').textContent = 'Please refresh the page and try again.';
    elements.sentinel.hidden = true;
  });
})();
