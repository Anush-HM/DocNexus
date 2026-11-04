// DocNexus — sign-in state shared by every page.
// Adds the login token to every call to the backend and sends you to the login page when it expires.
(function () {
  const KEY = 'docnexus_auth';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };

  window.DocAuth = {
    token: () => (read() || {}).token || null,
    user: () => (read() || {}).user || null,
    save(token, user) { try { localStorage.setItem(KEY, JSON.stringify({ token, user })); } catch (e) { /* storage blocked */ } },
    logout() {
      try { localStorage.removeItem(KEY); sessionStorage.removeItem('docnexus_project_id'); } catch (e) { /* ignore */ }
      location.href = 'login.html';
    },
    // call at the top of a page that needs an account
    require() {
      if (!this.token()) {
        location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
        return false;
      }
      return true;
    },
    // small "email · Sign out" block for the nav bars
    mount(el) {
      const u = this.user();
      if (!el || !u) return;
      el.innerHTML = `<span class="text-[11px] text-zinc-500 hidden sm:inline">${(u.name || u.email).replace(/[<>&"]/g, '')}</span>
        <button onclick="DocAuth.logout()" class="text-[11px] text-zinc-500 hover:text-zinc-200 border border-white/10 rounded-lg px-2.5 py-1 transition-colors">Sign out</button>`;
    },
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = /\/api\/(projects|auth\/me)/.test(url);
    if (isApi && window.DocAuth.token()) {
      init = Object.assign({}, init);
      const h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
      h.set('Authorization', 'Bearer ' + window.DocAuth.token());
      init.headers = h;
    }
    return nativeFetch(input, init).then((res) => {
      if (isApi && res.status === 401) window.DocAuth.logout();
      return res;
    });
  };
})();
