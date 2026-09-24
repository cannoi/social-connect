let currentMode = 'login';

function switchTab(mode) {
  currentMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('tab-login-btn').className = `tab ${isLogin ? 'active' : ''}`;
  document.getElementById('tab-reg-btn').className = `tab ${!isLogin ? 'active' : ''}`;
  document.getElementById('reg-fields').style.display = isLogin ? 'none' : 'block';
  document.getElementById('auth-submit-btn').innerText = isLogin ? 'Đăng Nhập' : 'Đăng Ký';
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
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'flex';
      showFeed();
    } else {
      document.getElementById('auth-error').innerText = data.error || 'Có lỗi xảy ra';
    }
  } catch (err) {
    document.getElementById('auth-error').innerText = 'Lỗi kết nối mạng';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('main-screen').style.display = 'flex';
      showFeed();
    }
  } catch (e) {}
}

async function showFeed() {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event && event.target && event.target.classList.add('active');

  const area = document.getElementById('content-area');
  area.innerHTML = `
    <div class="post-box">
      <form onsubmit="createPost(event)">
        <textarea id="post-content" placeholder="Bạn đang nghĩ gì thế?"></textarea>
        <input type="text" id="media-url" placeholder="Link hình ảnh hoặc video (tùy chọn)" style="margin-bottom:0.75rem;">
        <button type="submit" class="btn primary">Đăng Bài</button>
      </form>
    </div>
    <div id="posts-list">Đang tải bảng tin...</div>
  `;
  loadPosts();
}

async function loadPosts() {
  try {
    const res = await fetch('/api/posts');
    const posts = await res.json();
    const list = document.getElementById('posts-list');
    if (posts.length === 0) {
      list.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Chưa có bài viết nào.</p>';
      return;
    }
    list.innerHTML = posts.map(p => `
      <div class="post-card">
        <div class="post-header">
          <img src="${p.avatar_url}" class="avatar">
          <div>
            <div class="post-author">${p.display_name}</div>
            <div class="post-time">${new Date(p.created_at).toLocaleString('vi-VN')}</div>
          </div>
        </div>
        <div class="post-content">${escapeHtml(p.content)}</div>
        ${p.media_url ? `<img src="${escapeHtml(p.media_url)}" class="post-media">` : ''}
        <div class="post-actions">
          <button class="action-btn ${p.user_liked ? 'liked' : ''}" onclick="toggleLike(${p.id})">❤️ ${p.likes_count}</button>
          <button class="action-btn" onclick="toggleComments(${p.id})">💬 Bình luận</button>
        </div>
        <div id="comments-${p.id}" class="comments-section" style="display:none;">
          <div id="comments-list-${p.id}">Đang tải...</div>
          <form onsubmit="addComment(event, ${p.id})" style="margin-top:0.5rem;">
            <input type="text" placeholder="Viết bình luận..." id="comment-input-${p.id}" required>
          </form>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('posts-list').innerHTML = '<p style="text-align:center; color:var(--danger);">Không thể tải bài viết.</p>';
  }
}

async function createPost(e) {
  e.preventDefault();
  const content = document.getElementById('post-content').value;
  const media_url = document.getElementById('media-url').value;
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, media_url })
  });
  if (res.ok) {
    showFeed();
  }
}

async function toggleLike(postId) {
  await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
  loadPosts();
}

async function toggleComments(postId) {
  const sec = document.getElementById(`comments-${postId}`);
  if (sec.style.display === 'none') {
    sec.style.display = 'block';
    loadComments(postId);
  } else {
    sec.style.display = 'none';
  }
}

async function loadComments(postId) {
  const res = await fetch(`/api/posts/${postId}/comments`);
  const comments = await res.json();
  const list = document.getElementById(`comments-list-${postId}`);
  if (comments.length === 0) {
    list.innerHTML = '<div class="comment-item">Chưa có bình luận nào.</div>';
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="comment-item"><strong>${c.display_name}:</strong> ${escapeHtml(c.content)}</div>
  `).join('');
}

async function addComment(e, postId) {
  e.preventDefault();
  const input = document.getElementById(`comment-input-${postId}`);
  await fetch(`/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: input.value })
  });
  input.value = '';
  loadComments(postId);
}

async function showProfile() {
  const area = document.getElementById('content-area');
  const res = await fetch('/api/me');
  const user = await res.json();
  area.innerHTML = `
    <div class="post-card" style="text-align:center;">
      <img src="${user.avatar_url}" style="width:80px;height:80px;border-radius:50%;margin-bottom:1rem;">
      <h2>${user.display_name}</h2>
      <p style="color:var(--text-muted);">@${user.username}</p>
      <p style="margin-top:0.5rem;font-size:0.9rem;color:var(--text-muted);">Tham gia từ: ${new Date(user.created_at).toLocaleDateString('vi-VN')}</p>
    </div>
  `;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

checkAuth();
