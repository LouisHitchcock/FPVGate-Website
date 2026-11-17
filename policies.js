(function () {
    'use strict';
    const here = location.pathname.split('/').pop();
    document.querySelectorAll('.policy-nav a').forEach(link => {if (link.getAttribute('href') === here) link.setAttribute('aria-current','page');});
    const topic = new URLSearchParams(location.search).get('topic');
    const select = document.querySelector('#support-form [name=topic]');
    if (select && [...select.options].some(option => option.value === topic)) select.value = topic;
    const status = document.getElementById('analytics-preference-status');
    function renderPreference() {
        if (!status) return;
        try {
            const disabled = localStorage.getItem('fpvgate_analytics_optout') === '1';
            status.textContent = disabled ? 'Optional FPVGate analytics are disabled in this browser.' : 'FPVGate analytics are currently enabled in this browser.';
            document.getElementById('disable-analytics').disabled = disabled;
            document.getElementById('enable-analytics').disabled = !disabled;
        } catch {status.textContent = 'Browser storage is unavailable, so a preference cannot be saved here.';}
    }
    for (const [id, disabled] of [['disable-analytics',true],['enable-analytics',false]]) {
        const button = document.getElementById(id);
        if (button) button.onclick = () => {
            try {
                if (disabled) localStorage.setItem('fpvgate_analytics_optout','1'); else localStorage.removeItem('fpvgate_analytics_optout');
                if (window.fpvgateAnalytics) {if (disabled) window.fpvgateAnalytics.disable(); else window.fpvgateAnalytics.enable();}
            } catch {if (status) status.textContent = 'Your browser could not save this preference.';return;}
            renderPreference();
        };
    }
    const clear = document.getElementById('clear-recent-products');
    if (clear) clear.onclick = () => {
        const result = document.getElementById('clear-recent-status');
        try {localStorage.removeItem('fpvgate_recent');result.textContent = 'Recently viewed products cleared. Your cart has not been changed.';}
        catch {result.textContent = 'Your browser could not clear this data.';}
    };
    renderPreference();
})();
