(function () {
	var statusEl = document.getElementById('offline-status');
	var statusText = document.getElementById('offline-status-text');
	function update() {
		if (navigator.onLine) {
			statusEl.classList.add('is-online');
			statusText.textContent = 'Connexion rétablie — rechargement…';
			setTimeout(function () {
				window.location.reload();
			}, 600);
		} else {
			statusEl.classList.remove('is-online');
			statusText.textContent = 'Aucune connexion';
		}
	}
	document
		.getElementById('offline-retry')
		.addEventListener('click', () => window.location.reload());
	window.addEventListener('online', update);
	window.addEventListener('offline', update);
	update();
})();
