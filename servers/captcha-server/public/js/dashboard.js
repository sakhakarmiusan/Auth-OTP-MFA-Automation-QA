async function apiGet(url) {
  const res = await fetch(url, { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Not logged in');
  return data;
}

function populateDashboard(user) {
  document.getElementById('dash-name').textContent = user.name || '';
  document.getElementById('dash-email').textContent = user.email || user.phone || '';
  document.getElementById('dash-avatar').textContent = (user.name || 'U').charAt(0).toUpperCase();
  document.getElementById('dash-welcome').textContent = `✅ स्वागतम्, ${user.name || ''}!`;
  NepaliCalendar.init();
}

(async () => {
  try {
    const data = await apiGet('/api/me');
    document.getElementById('not-logged').style.display = 'none';
    document.getElementById('full-dashboard').style.display = 'block';
    populateDashboard(data.user);
  } catch {
    document.getElementById('not-logged').style.display = 'block';
    document.getElementById('full-dashboard').style.display = 'none';
  }
})();

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  window.location.href = '/';
});

