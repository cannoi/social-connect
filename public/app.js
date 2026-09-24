let currentMode = 'login';
let currentUser = null;
let feedTab = 'foryou';
let activeChat = null;
let currentPage = 'home';

function switchTab(mode) {
  currentMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('tab-login-btn').className = 'tab' + (isLogin ? ' active' : '');
  document.getElementById('tab-reg-btn').className = 'tab' + (!isLogin ? ' active' : '');
  document.getElementById('reg-fields').style.display = isLogin ? 'none' : 'block';
  document.getElementById('auth-submit-btn').innerText = isLogin ? 'Sign in' : 'Join';
  document.getElementById('auth-error').innerText = '';
}

async function handleAuth(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const display_name = document.getElementById('display_name').value;
  const endpoint = currentMode === 'login' ? '/api/login' : '/api/register';
  const body = currentMode === 'login' ? { username, password } : { username, password, display_name };
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'flex';
      await loadMe();
      go('home');
    } else {
      document.getElementById('auth-error').innerText = data.error || 'Something went wrong';
    }
  } catch (err) {
    document.getElementById('auth-error').innerText = 'Network error';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

async function loadMe() {
  const res = await fetch('/api/me');
  if (res.ok) currentUser = await res.json();
}

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      currentUser = await res.json();
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'flex';
      go('home');
    }
  } catch (e) {}
}

function setActiveNav(page) {
  document.querySelectorAll('.nav-btn[data-page]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-page') === page);
  });
  const titles = { home: 'Home', discover: 'Discover', communities: 'Communities', messages: 'Messages', notifications: 'Alerts', profile: 'Profile', space: 'My Space' };
  const el = document.getElementById('page-title');
  if (el) el.textContent = titles[page] || 'SocialConnect';
}

function go(page) {
  currentPage = page;
  setActiveNav(page);
  const map = { home: showFeed, discover: showDiscover, communities: showCommunities, messages: showMessages, notifications: showNotifications, profile: showProfile, space: showSpace };
  (map[page] || showFeed)();
  loadRightbar();
}

function openComposer() { document.getElementById('composer').style.display = 'grid'; }
function closeComposer() { document.getElementById('composer').style.display = 'none'; }

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function postCard(p) {
  return `
    <article class="post-card">
      <div class="post-header">
        <img src="${p.avatar_url}" class="avatar" alt="">
        <div>
          <div class="post-author">${escapeHtml(p.display_name)}</div>
          <div class="post-time">@${escapeHtml(p.username)} · ${new Date(p.created_at).toLocaleString()} ${p.community_name ? '· ' + escapeHtml(p.community_name) : ''}</div>
        </div>
      </div>
      <div class="post-content">${escapeHtml(p.content || '')}</div>
      ${p.media_url ? `<img src="${escapeHtml(p.media_url)}" class="post-media" alt="">` : ''}
      <div class="post-actions">
        <button class="action-btn ${p.user_liked ? 'liked' : ''}" onclick="toggleLike(${p.id})">♥ ${p.likes_count || 0}</button>
        <button class="action-btn" onclick="toggleComments(${p.id})">💬 ${p.comments_count || 0}</button>
        <button class="action-btn" onclick="sharePost(${p.id})">↗ ${p.shares_count || 0}</button>
      </div>
      <div id="comments-${p.id}" class="comments-section" style="display:none;">
        <div id="comments-list-${p.id}">Loading...</div>
        <form onsubmit="addComment(event, ${p.id})" style="margin-top:.5rem;">
          <input type="text" placeholder="Write a comment..." id="comment-input-${p.id}" required>
        </form>
      </div>
    </article>`;
}

async function showFeed() {
  const area = document.getElementById('content-area');
  area.innerHTML = `
    <div class="feed-tabs">
      <button class="chip ${feedTab==='foryou'?'active':''}" onclick="feedTab='foryou';showFeed()">For You</button>
      <button class="chip ${feedTab==='following'?'active':''}" onclick="feedTab='following';showFeed()">Following</button>
    </div>
    <div class="post-box">
      <form onsubmit="createPost(event)">
        <textarea id="home-post-content" placeholder="What's happening?"></textarea>
        <input type="text" id="home-media-url" placeholder="Photo link (optional)">
        <button type="submit" class="btn primary">Post</button>
      </form>
    </div>
    <div id="posts-list">Loading feed...</div>`;
  loadPosts();
}

async function loadPosts() {
  try {
    const res = await fetch('/api/posts?tab=' + feedTab);
    const posts = await res.json();
    const list = document.getElementById('posts-list');
    if (!list) return;
    if (!posts.length) {
      list.innerHTML = '<p class="empty">No posts yet. Say hello.</p>';
      return;
    }
    list.innerHTML = posts.map(postCard).join('');
  } catch (e) {
    const list = document.getElementById('posts-list');
    if (list) list.innerHTML = '<p class="empty">Could not load posts.</p>';
  }
}

async function createPost(e) {
  e.preventDefault();
  const content = (document.getElementById('post-content') || document.getElementById('home-post-content') || {}).value || '';
  const media_url = (document.getElementById('media-url') || document.getElementById('home-media-url') || {}).value || '';
  const res = await fetch('/api/posts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, media_url })
  });
  if (res.ok) {
    closeComposer();
    if (document.getElementById('home-post-content')) document.getElementById('home-post-content').value = '';
    if (document.getElementById('home-media-url')) document.getElementById('home-media-url').value = '';
    if (document.getElementById('post-content')) document.getElementById('post-content').value = '';
    if (document.getElementById('media-url')) document.getElementById('media-url').value = '';
    if (currentPage === 'home') showFeed();
    else go('home');
  }
}

async function toggleLike(postId) {
  await fetch('/api/posts/' + postId + '/like', { method: 'POST' });
  if (currentPage === 'home') loadPosts();
}
async function sharePost(postId) {
  await fetch('/api/posts/' + postId + '/share', { method: 'POST' });
  if (currentPage === 'home') loadPosts();
}
async function toggleComments(postId) {
  const sec = document.getElementById('comments-' + postId);
  if (!sec) return;
  if (sec.style.display === 'none') { sec.style.display = 'block'; loadComments(postId); }
  else sec.style.display = 'none';
}
async function loadComments(postId) {
  const res = await fetch('/api/posts/' + postId + '/comments');
  const comments = await res.json();
  const list = document.getElementById('comments-list-' + postId);
  if (!list) return;
  if (!comments.length) { list.innerHTML = '<div class="comment-item">No comments yet.</div>'; return; }
  list.innerHTML = comments.map(c => `<div class="comment-item"><strong>${escapeHtml(c.display_name)}:</strong> ${escapeHtml(c.content)}</div>`).join('');
}
async function addComment(e, postId) {
  e.preventDefault();
  const input = document.getElementById('comment-input-' + postId);
  await fetch('/api/posts/' + postId + '/comments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: input.value })
  });
  input.value = '';
  loadComments(postId);
}

async function showDiscover() {
  const area = document.getElementById('content-area');
  area.innerHTML = '<p class="empty">Loading discover...</p>';
  const [people, communities, trending] = await Promise.all([
    fetch('/api/people').then(r => r.json()),
    fetch('/api/communities').then(r => r.json()),
    fetch('/api/trending').then(r => r.json())
  ]);
  area.innerHTML = `
    <div class="card"><h3>People</h3></div>
    <div class="grid">${people.map(personCard).join('') || '<p class="empty">No people yet.</p>'}</div>
    <div class="card"><h3>Communities</h3></div>
    <div class="grid">${communities.map(commCard).join('')}</div>
    <div class="card"><h3>Trending</h3>${trending.map(t => `<div class="notice">${escapeHtml((t.content||'').slice(0,80))} · ♥ ${t.likes_count||0}</div>`).join('') || '<p class="muted">Nothing trending yet.</p>'}</div>`;
}

function personCard(p) {
  return `<div class="person-card">
    <div class="row">
      <div class="post-header" style="margin:0">
        <img src="${p.avatar_url}" class="avatar" alt="">
        <div><div class="post-author">${escapeHtml(p.display_name)}</div><div class="muted">@${escapeHtml(p.username)}</div></div>
      </div>
      <button class="btn ${p.is_following ? '' : 'primary'}" onclick="toggleFollow(${p.id})">${p.is_following ? 'Following' : 'Follow'}</button>
    </div>
    <div class="muted">${escapeHtml(p.bio || 'New here')}</div>
  </div>`;
}

function commCard(c) {
  return `<div class="comm-card">
    <div class="cover" style="background:${escapeHtml(c.cover || '#dbeafe')}">${c.avatar || '◌'}</div>
    <div class="row"><strong>${escapeHtml(c.name)}</strong><span class="muted">${c.members || 0} members</span></div>
    <div class="muted">${escapeHtml(c.description || '')}</div>
    <button class="btn ${c.joined ? '' : 'primary'}" onclick="toggleJoin(${c.id})">${c.joined ? 'Joined' : 'Join'}</button>
  </div>`;
}

async function toggleFollow(id) {
  await fetch('/api/follow/' + id, { method: 'POST' });
  if (currentPage === 'discover') showDiscover();
  else loadRightbar();
}
async function toggleJoin(id) {
  await fetch('/api/communities/' + id + '/join', { method: 'POST' });
  if (currentPage === 'communities' || currentPage === 'discover') go(currentPage);
}

async function showCommunities() {
  const rows = await fetch('/api/communities').then(r => r.json());
  document.getElementById('content-area').innerHTML = `<div class="grid">${rows.map(commCard).join('')}</div>`;
}

async function showMessages() {
  const convos = await fetch('/api/conversations').then(r => r.json());
  const area = document.getElementById('content-area');
  area.innerHTML = `
    <div class="chat-wrap">
      <div class="chat-list" id="chat-list">${convos.map(c => `
        <div class="chat-item ${activeChat===c.id?'active':''}" onclick="openChat(${c.id}, '${escapeHtml(c.display_name)}')">
          <strong>${escapeHtml(c.display_name)}</strong>
          <div class="muted">${escapeHtml(c.last_message || 'Say hello')}</div>
        </div>`).join('') || '<div class="empty">No chats yet.</div>'}</div>
      <div class="chat-view">
        <div class="chat-thread" id="chat-thread"><div class="empty">Pick a conversation</div></div>
        <form class="chat-compose" onsubmit="sendMessage(event)">
          <input id="chat-input" placeholder="Write a message..." autocomplete="off">
          <button class="btn primary" type="submit">Send</button>
        </form>
      </div>
    </div>`;
  if (activeChat) openChat(activeChat);
}

async function openChat(id) {
  activeChat = id;
  const msgs = await fetch('/api/messages/' + id).then(r => r.json());
  const thread = document.getElementById('chat-thread');
  if (!thread) return;
  thread.innerHTML = msgs.map(m => `<div class="bubble ${m.sender_id===currentUser.id?'me':''}">${escapeHtml(m.content)}</div>`).join('') || '<div class="empty">Start the chat</div>';
  thread.scrollTop = thread.scrollHeight;
}

async function sendMessage(e) {
  e.preventDefault();
  if (!activeChat) return;
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  await fetch('/api/messages/' + activeChat, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  openChat(activeChat);
}

async function showNotifications() {
  const rows = await fetch('/api/notifications').then(r => r.json());
  await fetch('/api/notifications/read', { method: 'POST' });
  const labels = { like: 'liked your post', comment: 'commented', follow: 'followed you', share: 'shared your post', message: 'sent a message' };
  document.getElementById('content-area').innerHTML = `<div class="card">${
    rows.map(n => `<div class="notice"><strong>${escapeHtml(n.actor_name || 'Someone')}</strong> ${labels[n.type] || n.type}<div class="muted">${new Date(n.created_at).toLocaleString()}</div></div>`).join('') || '<p class="empty">No alerts yet.</p>'
  }</div>`;
}

async function showProfile() {
  await loadMe();
  const u = currentUser || {};
  document.getElementById('content-area').innerHTML = `
    <div class="card profile-hero">
      <div class="cover" style="height:110px"></div>
      <img src="${u.avatar_url}" alt="">
      <h2>${escapeHtml(u.display_name || '')}</h2>
      <p class="muted">@${escapeHtml(u.username || '')}</p>
      <p>${escapeHtml(u.bio || 'Tell people a little about you.')}</p>
      <div class="stats"><span><b>${u.followers || 0}</b> followers</span><span><b>${u.following || 0}</b> following</span></div>
      <form onsubmit="saveProfile(event)">
        <input id="bio-input" placeholder="Short bio" value="${escapeHtml(u.bio || '')}">
        <button class="btn primary" type="submit">Save</button>
      </form>
    </div>`;
}

async function saveProfile(e) {
  e.preventDefault();
  await fetch('/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bio: document.getElementById('bio-input').value }) });
  showProfile();
}

async function showSpace() {
  const data = await fetch('/api/space').then(r => r.json());
  const exts = await fetch('/api/extensions').then(r => r.json());
  document.getElementById('content-area').innerHTML = `
    <div class="feed-tabs">
      <span class="muted">Your quiet space. Optional tools stay here.</span>
    </div>
    <div class="card"><h3>Posts</h3>${data.posts.map(postCard).join('') || '<p class="empty">No posts yet.</p>'}</div>
    <div class="card"><h3>Photos</h3>${data.photos.length ? data.photos.map(p => `<img class="post-media" src="${escapeHtml(p.media_url)}" alt="">`).join('') : '<p class="empty">No photos yet.</p>'}</div>
    <div class="card"><h3>Communities</h3>${data.communities.map(c => `<div class="notice">${escapeHtml(c.name)}</div>`).join('') || '<p class="empty">Join a community to see it here.</p>'}</div>
    <div class="card"><h3>Extensions</h3><div class="grid">${exts.map(x => `<div class="ext-card"><div>${x.icon} <strong>${escapeHtml(x.name)}</strong></div><div class="muted">${escapeHtml(x.description)}</div></div>`).join('')}</div></div>`;
}

async function loadRightbar() {
  const box = document.getElementById('rightbar');
  if (!box || window.innerWidth < 980) return;
  try {
    const [people, comms] = await Promise.all([
      fetch('/api/people').then(r => r.json()),
      fetch('/api/communities').then(r => r.json())
    ]);
    box.innerHTML = `
      <div class="card"><h3>Suggested</h3>${people.slice(0,3).map(p => `<div class="notice row"><span>@${escapeHtml(p.username)}</span><button class="btn" onclick="toggleFollow(${p.id})">${p.is_following?'✓':'Follow'}</button></div>`).join('') || '<p class="muted">More people will appear here.</p>'}</div>
      <div class="card"><h3>Communities</h3>${comms.slice(0,3).map(c => `<div class="notice">${escapeHtml(c.name)}</div>`).join('')}</div>`;
  } catch (e) {}
}

checkAuth();
