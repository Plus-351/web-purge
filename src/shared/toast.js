// Shared toast helper for extension pages
(function () {
    function ensureContainer(id = 'toast-container') {
        let c = document.getElementById(id);
        if (!c) {
            c = document.createElement('div');
            c.id = id;
            c.setAttribute('aria-live', 'polite');
            c.setAttribute('aria-atomic', 'true');
            document.body.appendChild(c);
        }
        return c;
    }

    function showToast(message, timeout = 3000, type = 'info', containerId = 'toast-container') {
        try {
            const container = ensureContainer(containerId);
            const div = document.createElement('div');
            div.className = `toast ${type}`;
            div.textContent = message;
            container.appendChild(div);
            setTimeout(() => {
                div.style.transition = 'opacity 240ms ease, transform 240ms ease';
                div.style.opacity = '0';
                div.style.transform = 'translateY(6px)';
                setTimeout(() => div.remove(), 260);
            }, timeout);
        } catch (e) { /* swallow */ }
    }

    // Expose globally for pages that don't use modules
    window.showToast = showToast;
})();
