// Wiring diagram dynamic loader
const boards = [
    { value: 'esp32s3', label: 'ESP32-S3 DevKitC-1 (8MB Flash) - Recommended', file: 'ESP32-S3-DevKitC-1.md', expertMode: false },
    { value: 'esp32s3supermini', label: 'ESP32-S3 Super Mini (4MB Flash)', file: 'ESP32-S3-SuperMini.md', expertMode: false },
    { value: 'esp32c3', label: 'ESP32-C3', file: 'ESP32-C3.md', expertMode: true },
    { value: 'lilygo', label: 'LilyGO T-Energy S3', file: 'LilyGO-T-Energy-S3.md', expertMode: true }
];

let currentBoard = 'esp32s3'; // Default board

function initWiringDiagram() {
    const container = document.getElementById('wiring-diagram-container');
    if (!container) return;

    // Create board selector
    const selectorHTML = `
        <div class="board-selector">
            <label for="board-select"><strong>Select Your Board:</strong></label>
            <select id="board-select" class="board-dropdown">
                ${boards.map(board => `
                    <option value="${board.value}" ${board.value === currentBoard ? 'selected' : ''}>
                        ${board.label}${board.expertMode ? ' (Expert)' : ''}
                    </option>
                `).join('')}
            </select>
        </div>
        <div id="wiring-content" class="wiring-content"></div>
    `;
    
    container.innerHTML = selectorHTML;

    // Add event listener
    document.getElementById('board-select').addEventListener('change', (e) => {
        currentBoard = e.target.value;
        loadWiringDiagram(currentBoard);
    });

    // Load initial diagram
    loadWiringDiagram(currentBoard);
}

async function loadWiringDiagram(boardValue) {
    const board = boards.find(b => b.value === boardValue);
    if (!board) return;

    const contentDiv = document.getElementById('wiring-content');
    contentDiv.innerHTML = '<p>Loading wiring diagram...</p>';

    try {
        const response = await fetch(`wiring/${board.file}`);
        if (!response.ok) throw new Error('Failed to load wiring diagram');
        
        const markdown = await response.text();
        const html = convertMarkdownToHTML(markdown);
        
        contentDiv.innerHTML = html;
    } catch (error) {
        console.error('Error loading wiring diagram:', error);
        contentDiv.innerHTML = '<p class="error">Failed to load wiring diagram. Please try again.</p>';
    }
}

// Simple markdown to HTML converter for wiring diagrams
function convertMarkdownToHTML(markdown) {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

    // Links
    html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank">$1</a>');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Lists (unordered)
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Tables
    const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;
    html = html.replace(tableRegex, (match, header, rows) => {
        const headerCells = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
        const bodyRows = rows.trim().split('\n').map(row => {
            const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
        return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    });

    // Paragraphs (split by double newlines)
    const lines = html.split('\n');
    let inList = false;
    let inCodeBlock = false;
    let result = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes('<pre>')) inCodeBlock = true;
        if (line.includes('</pre>')) inCodeBlock = false;
        
        if (line.startsWith('<ul>')) inList = true;
        if (line.endsWith('</ul>')) inList = false;

        if (line.trim() && !line.startsWith('<') && !inList && !inCodeBlock) {
            result.push(`<p>${line}</p>`);
        } else {
            result.push(line);
        }
    }

    return result.join('\n');
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWiringDiagram);
} else {
    initWiringDiagram();
}
