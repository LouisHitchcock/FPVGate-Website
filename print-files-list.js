// Lists the 3D print files from print-files/parts.json in the docs, linking
// each part to its 3D preview on print-files.html and to the STL itself.
(function () {
    'use strict';

    const container = document.getElementById('print-files-list');
    if (!container) return;

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    function render(parts) {
        if (!parts.length) {
            container.innerHTML = '<p>No print files have been published yet. Check back soon.</p>';
            return;
        }

        const showMaterial = parts.some(p => p.print && p.print.material);

        container.innerHTML = `
            <table class="print-parts-table">
                <thead>
                    <tr><th>Part</th><th>Build</th>${showMaterial ? '<th>Material</th>' : ''}<th></th></tr>
                </thead>
                <tbody>
                    ${parts.map(part => `
                        <tr>
                            <td>${escapeHtml(part.name)}${(part.quantity || 1) > 1 ? ` <span class="mono">×${part.quantity}</span>` : ''}</td>
                            <td>${escapeHtml(part.build || 'Other')}</td>
                            ${showMaterial ? `<td>${escapeHtml((part.print && part.print.material) || '')}</td>` : ''}
                            <td>
                                <a href="print-files.html#${encodeURIComponent(part.id)}">View in 3D</a>
                                <a href="print-files/${escapeHtml(part.file)}" download>Download STL</a>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    fetch('print-files/parts.json', { cache: 'no-cache' })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => render((data.parts || []).filter(p => p.id && p.name && p.file)))
        .catch(err => {
            console.error('Failed to load print file manifest:', err);
            container.innerHTML = '<p>Could not load the parts list. See the <a href="print-files.html">3D print files page</a>.</p>';
        });
})();
