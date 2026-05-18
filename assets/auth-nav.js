(function() {
  window.getUser = function() {
    try { return JSON.parse(localStorage.getItem('tt_user')); } catch(e) { return null; }
  };

  var nav = document.querySelector('nav.menu');
  if (!nav) return;

  var user = window.getUser();
  
  var inSubdir = window.location.pathname.indexOf('/recipes/') !== -1 && window.location.pathname.indexOf('recipes.html') === -1;
  var prefix = inSubdir ? '../' : '';

  // Remove "Admin" link if present (clean slate)
  var links = nav.querySelectorAll('a');
  links.forEach(function(a) {
    if (a.textContent === 'Admin') a.remove();
  });

  if (user) {
    // Create Dropdown Container
    var dropdown = document.createElement('div');
    dropdown.className = 'dropdown';
    dropdown.style.cursor = 'pointer';

    // Toggle
    var toggle = document.createElement('div');
    toggle.className = 'dropdown-toggle';
    toggle.innerHTML = 'My Account <i class="fa-solid fa-chevron-down" style="font-size: 12px"></i>';
    dropdown.appendChild(toggle);

    // List
    var list = document.createElement('div');
    list.className = 'dropdown-list';
    list.style.right = '0';
    list.style.left = 'auto'; // Align to right
    
    // Helper to add link to list
    function addLink(text, href, onClick) {
        var a = document.createElement('a');
        a.href = href;
        a.textContent = text;
        a.style.display = 'block';
        a.style.padding = '8px 12px';
        a.style.color = '#333';
        if (onClick) a.onclick = onClick;
        list.appendChild(a);
    }

    if (user.role === 'admin') {
        addLink('Admin', prefix + 'admin.html');
    }
    addLink('Dashboard', prefix + 'dashboard.html');
    addLink('Profile', prefix + 'profile.html');
    addLink('Messages', prefix + 'messages.html');
    addLink('Manage Ads', prefix + 'manage-ads.html');
    
    addLink('Logout', '#', function(e) {
      e.preventDefault();
      localStorage.removeItem('tt_user');
      window.location.href = prefix + 'index.html';
    });

    dropdown.appendChild(list);
    nav.appendChild(dropdown);
  } else {
    // Add "Login"
    var login = document.createElement('a');
    login.href = prefix + 'login.html';
    login.textContent = 'Login';
    nav.appendChild(login);
  }
})();