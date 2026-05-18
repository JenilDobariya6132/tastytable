(function () {
  // Helper to get user
  function getUser() {
    try { return JSON.parse(localStorage.getItem('tt_user') || 'null'); } catch (e) { return null; }
  }

  var path = window.location.pathname.split('/').pop();
  var id = (path || '').replace(/\.html$/i, '');
  
  // Determine correct ID for backend (static vs dynamic)
  var urlParams = new URLSearchParams(window.location.search);
  var queryId = urlParams.get('id');
  var recipeId = queryId;
  if (!recipeId) {
      if (path && path !== 'index.html' && path !== '') {
         recipeId = 'static-' + path;
      }
  }

  if (!recipeId) return;

  var user = getUser();
  var h1 = document.querySelector('h1');
  
  // 1. Inject Actions Bar
  var actions = document.querySelector('.actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'actions';
    actions.innerHTML = `
      <button id="act-like" class="action-btn"><i class="far fa-heart"></i> Like <span class="count" id="like-count">0</span></button>
      <button id="act-save" class="action-btn"><i class="far fa-bookmark"></i> Save</button>
      <button id="act-share" class="action-btn"><i class="fas fa-share-alt"></i> Share</button>
      <button id="act-print" class="action-btn"><i class="fas fa-print"></i> Print</button>
    `;
    if (h1 && h1.parentNode) {
      h1.parentNode.insertBefore(actions, h1.nextSibling);
    }
  }

  // 2. Inject Comments Section
  var main = document.querySelector('main') || document.querySelector('.recipe-container');
  var commentsSection = document.getElementById('comments-section');
  if (!commentsSection && main) {
    commentsSection = document.createElement('section');
    commentsSection.id = 'comments-section';
    commentsSection.className = 'section';
    commentsSection.style.marginTop = '40px';
    commentsSection.style.paddingTop = '20px';
    commentsSection.style.borderTop = '1px solid #eee';
    commentsSection.innerHTML = `
      <h3>Comments</h3>
      <div id="comments-list" style="margin-bottom: 20px;">Loading comments...</div>
      <form id="comment-form" style="display:flex; gap:10px;">
        <input type="text" id="comment-input" placeholder="Add a comment..." style="flex:1; padding:10px; border:1px solid #ddd; border-radius:4px;">
        <button type="submit" style="padding:10px 20px; background:#E67E22; color:white; border:none; border-radius:4px; cursor:pointer;">Post</button>
      </form>
    `;
    main.appendChild(commentsSection);
  }

  // 3. Initial Data Fetch (Likes, Saved status, Comments)
  function loadData() {
    // Likes
    fetch(`/recipes/${recipeId}/likes${user ? '?user_id='+user.id : ''}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          document.getElementById('like-count').textContent = data.likes;
          if (data.liked) {
            document.querySelector('#act-like i').className = 'fas fa-heart';
            document.querySelector('#act-like i').style.color = '#e74c3c';
          }
        }
      })
      .catch(e => console.error(e));

    // Saved (if logged in)
    if (user) {
        fetch(`/recipes/${recipeId}/is-saved?user_id=${user.id}`)
          .then(r => r.json())
          .then(data => {
            if (data.ok && data.saved) {
                document.getElementById('act-save').innerHTML = '<i class="fas fa-bookmark"></i> Saved';
                document.getElementById('act-save').classList.add('active');
            }
          })
          .catch(e => console.error(e));
    }

    // Comments
    loadComments();
  }

  function loadComments() {
    fetch(`/recipes/${recipeId}/comments`)
      .then(r => r.json())
      .then(data => {
        var list = document.getElementById('comments-list');
        if (data.comments && data.comments.length > 0) {
          list.innerHTML = data.comments.map(c => `
            <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #f9f9f9;">
              <strong>${c.user_name || 'User'}</strong> <span style="color:#999; font-size:0.8em;">${new Date(c.created_at).toLocaleDateString()}</span>
              <p style="margin: 5px 0;">${c.content || c.text}</p>
            </div>
          `).join('');
        } else {
          list.innerHTML = '<p>No comments yet. Be the first!</p>';
        }
      })
      .catch(e => {
        document.getElementById('comments-list').innerHTML = 'Failed to load comments.';
      });
  }

  loadData();

  // 4. Event Handlers

  // Like
  document.getElementById('act-like').addEventListener('click', function() {
    if (!user) return promptLogin();
    
    fetch(`/recipes/${recipeId}/like`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ user_id: user.id })
    })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        var icon = this.querySelector('i');
        var countSpan = this.querySelector('.count');
        var count = parseInt(countSpan.textContent) || 0;
        
        if (data.liked) {
          icon.className = 'fas fa-heart';
          icon.style.color = '#e74c3c';
          countSpan.textContent = count + 1;
        } else {
          icon.className = 'far fa-heart';
          icon.style.color = '';
          countSpan.textContent = Math.max(0, count - 1);
        }
      }
    });
  });

  // Comment
  var commentForm = document.getElementById('comment-form');
  if (commentForm) {
    commentForm.addEventListener('submit', function(e) {
      e.preventDefault();
      if (!user) return promptLogin();
      
      var text = document.getElementById('comment-input').value;
      if (!text.trim()) return;

      fetch(`/recipes/${recipeId}/comments`, { // Note: endpoint might be plural or singular based on server.js
        method: 'POST', // My server.js has /recipes/:id/comments for POST
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ user_id: user.id, content: text, text: text }) // Send both content/text to be safe
      })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          document.getElementById('comment-input').value = '';
          loadComments();
        } else {
          alert('Failed to post comment');
        }
      });
    });
  }

  // Save
  document.getElementById('act-save').addEventListener('click', function() {
    if (!user) return promptLogin();
    // Assuming endpoint /recipes/:id/save exists
    fetch(`/recipes/${recipeId}/save`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ user_id: user.id })
    }).then(r => r.json()).then(d => {
        if (d.ok) alert(d.saved ? 'Recipe saved!' : 'Removed from saved.');
        else alert('Action failed');
    });
  });

  // Share
  document.getElementById('act-share').addEventListener('click', function() {
    if (navigator.share) {
      navigator.share({ title: document.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  });

  // Print
  document.getElementById('act-print').addEventListener('click', function() {
    window.print();
  });

  function promptLogin() {
    if (confirm('Please login to perform this action.')) {
      var next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = (window.location.pathname.indexOf('/recipes/') !== -1 ? '../' : '') + 'login.html?next=' + next;
    }
  }

})();
