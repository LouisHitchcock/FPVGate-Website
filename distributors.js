(function () {
    'use strict';
    const form = document.querySelector('[data-enquiry-form]') || document.getElementById('distributor-form');
    const isSupport = form.dataset.enquiryForm === 'support';
    const button = form.querySelector('button[type=submit]');
    const originalLabel = button.textContent.trim();
    const status = form.querySelector('[data-enquiry-status]') || document.getElementById('distributor-status');
    const preview = ['localhost', '127.0.0.1', ''].includes(location.hostname) && !window.FPVGATE_LOCAL_REVIEW;
    let sending = false;
    if (preview) {
        const notice = document.createElement('p');
        notice.className = 'distributor-preview';
        notice.textContent = 'Local preview: requests are not sent from this page.';
        form.prepend(notice);
    }
    function report(message, state) {
        status.textContent = message;
        status.dataset.state = state;
        status.focus();
    }
    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (sending || !form.reportValidity()) return;
        if (preview) {
            report('Preview only: your form is complete, but no request has been sent. The live form will save your enquiry in the private ticket inbox and notify shop.fpvgate@gmail.com.', 'preview');
            return;
        }
        sending = true;
        button.disabled = true;
        button.textContent = 'Sending enquiry...';
        status.textContent = '';
        const data = Object.fromEntries(new FormData(form));
        data.consent = form.elements.consent.checked;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch('https://fpvgate-store.fpvgate-analytics.workers.dev/' + (isSupport ? 'support-enquiry' : 'distributor-enquiry'), {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: controller.signal
            });
            let result;
            try {result = await response.json();} catch {throw new Error('The enquiry service is unavailable. Please try again or email shop.fpvgate@gmail.com.');}
            if (!response.ok || result.success !== true) throw new Error(result.error || 'Your application could not be delivered. Please try again or email shop.fpvgate@gmail.com.');
            form.reset();
            report('Thank you. Your ' + (isSupport ? 'support request' : 'distributor enquiry') + ' has been received by FPVGate.' + (result.reference ? ' Reference: ' + result.reference + '.' : '') + (isSupport ? ' We will reply to the email address you supplied to help with your request.' : ' We will reply to the email address you supplied to discuss your store and order terms.'), 'success');
        } catch (error) {
            report(error.name === 'AbortError' ? 'We could not confirm delivery before the connection timed out. Please email shop.fpvgate@gmail.com if you need to check, or try again. Your form details have been kept.' : error.message + ' Your form details have been kept.', 'error');
        } finally {
            clearTimeout(timeout);
            sending = false;
            button.disabled = false;
            button.textContent = originalLabel;
        }
    });
})();
