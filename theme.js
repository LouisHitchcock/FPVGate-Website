/**
 * Theme + navigation behaviour.
 *
 * The initial theme is applied by a small inline snippet in each page's
 * <head> so there is no flash of the wrong palette before this file loads.
 * This script only handles the toggle and the mobile menu.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'fpvgate-theme';

    function current() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
            btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
            btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
        });
    }

    function init() {
        apply(current());

        document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var next = current() === 'light' ? 'dark' : 'light';
                apply(next);
                try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* private mode */ }
            });
        });

        // Mobile menu
        document.querySelectorAll('[data-nav-toggle]').forEach(function (btn) {
            var links = document.querySelector('.nav-links');
            if (!links) return;
            btn.addEventListener('click', function () {
                var open = btn.classList.toggle('active');
                links.classList.toggle('nav-open', open);
                btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        });

        // Mark the current page in the nav
        var here = location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.nav-links a').forEach(function (a) {
            if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
