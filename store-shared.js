const STORE_API = 'https://fpvgate-store.fpvgate-analytics.workers.dev';

const CATEGORY_LABELS = {
    'fpvgate': 'FPVGate Hardware',
    'components': 'Components',
    'misc': 'Misc'
};

const CATEGORY_LINKS = {
    'fpvgate': 'shop-fpvgate.html',
    'components': 'shop-components.html',
    'misc': 'shop-misc.html'
};

// --- Cart (localStorage) ---
function getCart() { return JSON.parse(localStorage.getItem('fpvgate_cart') || '[]'); }
function saveCart(cart) { localStorage.setItem('fpvgate_cart', JSON.stringify(cart)); updateCartUI(); }

function updateCartUI() {
    const cart = getCart();
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    const countEl = document.getElementById('cart-count');
    if (countEl) {
        countEl.textContent = count;
        countEl.style.display = count > 0 ? 'inline-flex' : 'none';
    }
    const itemsEl = document.getElementById('cart-items');
    const footer = document.getElementById('cart-footer');
    if (!itemsEl) return;
    if (cart.length === 0) {
        itemsEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">Your cart is empty</div>';
        if (footer) footer.style.display = 'none';
        return;
    }
    if (footer) footer.style.display = 'block';
    let subtotal = 0;
    itemsEl.innerHTML = cart.map((item, idx) => {
        subtotal += item.price * item.quantity;
        return `<div class="cart-item">
            <div class="cart-item-img">${item.image ? `<img src="${item.image}" alt="${escHtml(item.name)}">` : ''}</div>
            <div class="cart-item-info">
                <div class="cart-item-name">${escHtml(item.name)}</div>
                <div class="cart-item-price">&pound;${item.price.toFixed(2)}</div>
                <div class="cart-item-qty">
                    <button onclick="changeQty(${idx},-1)">-</button>
                    <span>${item.quantity}</span>
                    <button onclick="changeQty(${idx},1)">+</button>
                </div>
            </div>
            <button class="cart-item-remove" onclick="removeFromCart(${idx})">&times;</button>
        </div>`;
    }).join('');
    const subtotalEl = document.getElementById('cart-subtotal');
    if (subtotalEl) subtotalEl.innerHTML = '&pound;' + subtotal.toFixed(2);
}

function addToCart(product) {
    const cart = getCart();
    const existing = cart.find(i => i.id === product.id);
    if (existing) {
        if (existing.quantity < (product.maxQuantity || 5)) existing.quantity++;
    } else {
        cart.push({ id: product.id, name: product.name, price: product.price, quantity: 1, image: product.image || '', maxQuantity: product.maxQuantity || 5 });
    }
    saveCart(cart);
    if (window.fpvgateAnalytics) window.fpvgateAnalytics.track('cart_add', { product_id: product.id, product_name: product.name, price: product.price });
    if (!document.getElementById('cart-panel').classList.contains('open')) toggleCart();
}

function removeFromCart(idx) {
    const cart = getCart(); cart.splice(idx, 1); saveCart(cart);
}

function changeQty(idx, dir) {
    const cart = getCart();
    cart[idx].quantity += dir;
    if (cart[idx].quantity <= 0) cart.splice(idx, 1);
    else if (cart[idx].quantity > cart[idx].maxQuantity) cart[idx].quantity = cart[idx].maxQuantity;
    saveCart(cart);
}

function toggleCart() {
    const panel = document.getElementById('cart-panel');
    const overlay = document.getElementById('cart-overlay');
    const isOpen = panel.classList.toggle('open');
    overlay.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
    if (isOpen && window.fpvgateAnalytics) window.fpvgateAnalytics.track('cart_open', {});
}

// --- Recently Viewed ---
function getRecentlyViewed() { return JSON.parse(localStorage.getItem('fpvgate_recent') || '[]'); }

function addRecentlyViewed(product) {
    let recent = getRecentlyViewed();
    recent = recent.filter(p => p.id !== product.id);
    recent.unshift({ id: product.id, name: product.name, price: product.price, image: product.image, category: product.category });
    if (recent.length > 12) recent.pop();
    localStorage.setItem('fpvgate_recent', JSON.stringify(recent));
}

function renderRecentlyViewed() {
    const container = document.getElementById('recently-viewed');
    if (!container) return;
    const recent = getRecentlyViewed();
    if (recent.length === 0) {
        container.parentElement.style.display = 'none';
        return;
    }
    container.parentElement.style.display = '';
    container.innerHTML = recent.map(p => `
        <div class="strip-card" onclick="viewRecentProduct('${p.id}', '${p.category || 'fpvgate'}')" style="cursor:pointer">
            <div class="strip-card-img">
                ${p.image ? `<img src="${p.image}" alt="${escHtml(p.name)}">` : '<div class="strip-card-placeholder"><span>No Image</span></div>'}
            </div>
            <div class="strip-card-info">
                <span class="strip-card-name">${escHtml(p.name)}</span>
                <span class="strip-card-price">&pound;${p.price.toFixed(2)}</span>
            </div>
        </div>
    `).join('');
}

function viewRecentProduct(id, category) {
    const page = CATEGORY_LINKS[category] || 'shop-fpvgate.html';
    window.location.href = page + '?id=' + encodeURIComponent(id);
}

// --- Search ---
let searchDebounce = null;
function initSearch() {
    const input = document.getElementById('store-search');
    if (!input) return;
    input.addEventListener('input', function() {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            const q = input.value.trim();
            if (q.length >= 2) {
                performSearch(q);
            } else if (q.length === 0) {
                hideSearchResults();
                const defaultGrid = document.getElementById('search-default-content');
                if (defaultGrid) defaultGrid.style.display = '';
            }
        }, 300);
    });
}

async function performSearch(q) {
    const resultsEl = document.getElementById('search-results');
    const defaultGrid = document.getElementById('search-default-content');
    if (!resultsEl) return;

    resultsEl.innerHTML = '<div class="search-loading">Searching...</div>';
    resultsEl.style.display = 'block';
    if (defaultGrid) defaultGrid.style.display = 'none';

    try {
        const resp = await fetch(STORE_API + '/products?q=' + encodeURIComponent(q));
        const products = await resp.json();
        if (!products.length) {
            resultsEl.innerHTML = '<div class="search-empty">No products found for "' + escHtml(q) + '".</div>';
            return;
        }
        resultsEl.innerHTML = '<div class="search-results-header">Results for "' + escHtml(q) + '" (' + products.length + ')</div>' +
            '<div class="product-grid">' +
            products.map((p, pi) => renderProductCard(p, pi)).join('') +
            '</div>';
        window._searchProducts = products;

        resultsEl.querySelectorAll('.product-card').forEach((card, i) => {
            card.addEventListener('click', () => openProductModal(i, '_searchProducts'));
        });
    } catch (e) {
        resultsEl.innerHTML = '<div class="search-error">Failed to search. Please try again.</div>';
    }
}

function hideSearchResults() {
    const resultsEl = document.getElementById('search-results');
    if (resultsEl) resultsEl.style.display = 'none';
}

// --- Product Rendering ---
function renderProductCard(p, pi) {
    return `<div class="product-card" onclick="openProductModal(${pi})" style="cursor:pointer">
        <div class="product-image">
            ${p.images && p.images.length > 1
                ? `<div class="carousel" id="carousel-${pi}">
                    <div class="carousel-track" style="transform:translateX(0)">${p.images.map(img => `<div class="carousel-slide"><img src="${img}" alt="${escHtml(p.name)}"></div>`).join('')}</div>
                    <button class="carousel-btn carousel-prev" onclick="event.stopPropagation();moveCarousel(${pi},-1)">&#8249;</button>
                    <button class="carousel-btn carousel-next" onclick="event.stopPropagation();moveCarousel(${pi},1)">&#8250;</button>
                    <div class="carousel-dots">${p.images.map((_,i) => `<button class="carousel-dot${i===0?' active':''}" onclick="event.stopPropagation();goToSlide(${pi},${i})"></button>`).join('')}</div>
                </div>`
                : p.images && p.images.length === 1
                    ? `<img src="${p.images[0]}" alt="${escHtml(p.name)}" style="width:100%;height:100%;object-fit:cover;">`
                    : p.image
                        ? `<img src="${p.image}" alt="${escHtml(p.name)}" style="width:100%;height:100%;object-fit:cover;">`
                        : `<div class="product-image-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                <line x1="8" y1="21" x2="16" y2="21"></line>
                                <line x1="12" y1="17" x2="12" y2="21"></line>
                            </svg>
                            <span>Product Image</span>
                        </div>`
            }
        </div>
        <div class="product-info">
            <h2 class="product-name">${escHtml(p.name)}</h2>
            <p class="product-description">${escHtml(p.shortDescription || p.description)}</p>
            ${p.stock <= 0 ? '<p style="color:var(--error-color);font-weight:600;margin-top:8px;">Out of Stock</p>' : ''}
            <div class="product-price-row">
                <span class="product-price">&pound;${p.price.toFixed(2)}</span>
                <button class="btn btn-primary" onclick="event.stopPropagation();addToCart(window._products[${pi}])"
                    ${p.stock <= 0 ? 'disabled' : ''}>
                    ${p.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
                </button>
            </div>
        </div>
    </div>`;
}

// --- Product Modal ---
let modalCarouselState = 0;

function openProductModal(pi, sourceArray) {
    const arr = sourceArray || '_products';
    const p = window[arr][pi];
    if (!p) return;

    addRecentlyViewed(p);
    renderRecentlyViewed();

    const modal = document.getElementById('product-modal');
    const imgEl = document.getElementById('modal-image');

    if (p.images && p.images.length > 1) {
        imgEl.innerHTML = `<div class="carousel" id="modal-carousel">
            <div class="carousel-track" style="transform:translateX(0)">${p.images.map(img => `<div class="carousel-slide"><img src="${img}" alt="${escHtml(p.name)}"></div>`).join('')}</div>
            <button class="carousel-btn carousel-prev" onclick="event.stopPropagation();moveModalCarousel(-1)">&#8249;</button>
            <button class="carousel-btn carousel-next" onclick="event.stopPropagation();moveModalCarousel(1)">&#8250;</button>
            <div class="carousel-dots">${p.images.map((_,i) => `<button class="carousel-dot${i===0?' active':''}" onclick="event.stopPropagation();goToModalSlide(${i})"></button>`).join('')}</div>
        </div>`;
        modalCarouselState = 0;
    } else if ((p.images && p.images.length === 1) || p.image) {
        const src = (p.images && p.images[0]) || p.image;
        imgEl.innerHTML = `<img src="${src}" alt="${escHtml(p.name)}">`;
    } else {
        imgEl.innerHTML = `<div class="product-image-placeholder" style="height:100%"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg><span>No Image</span></div>`;
    }

    document.getElementById('modal-name').textContent = p.name;
    document.getElementById('modal-price').innerHTML = '&pound;' + p.price.toFixed(2);
    document.getElementById('modal-stock').textContent = p.stock <= 0 ? 'Out of Stock' : '';
    document.getElementById('modal-actions').innerHTML = `
        <button class="btn btn-primary" onclick="addToCart(${arr}[${pi}])"
            ${p.stock <= 0 ? 'disabled' : ''}>
            ${p.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>`;

    const descEl = document.getElementById('modal-description');
    if (p.longDescription) {
        descEl.innerHTML = '<div class="modal-product-details">' + p.longDescription + '</div>';
    } else {
        descEl.textContent = p.shortDescription || p.description;
    }

    if (p.featured) {
        const nameEl = document.getElementById('modal-name');
        nameEl.innerHTML = escHtml(p.name) + ' <span class="featured-badge">Featured</span>';
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeProductModal() { document.getElementById('product-modal').classList.remove('active'); document.body.style.overflow = ''; }
function moveModalCarousel(dir) { const c=document.getElementById('modal-carousel');if(!c)return;const t=c.querySelectorAll('.carousel-slide').length;modalCarouselState+=dir;if(modalCarouselState<0)modalCarouselState=t-1;if(modalCarouselState>=t)modalCarouselState=0;goToModalSlide(modalCarouselState); }
function goToModalSlide(idx) { const c=document.getElementById('modal-carousel');if(!c)return;modalCarouselState=idx;c.querySelector('.carousel-track').style.transform='translateX(-'+idx*100+'%)';c.querySelectorAll('.carousel-dot').forEach((d,i)=>d.classList.toggle('active',i===idx)); }
document.addEventListener('keydown', function(e) { if(!document.getElementById('product-modal').classList.contains('active'))return;if(e.key==='Escape')closeProductModal();if(e.key==='ArrowLeft')moveModalCarousel(-1);if(e.key==='ArrowRight')moveModalCarousel(1); });
const carouselState={};
function moveCarousel(pi,dir){const c=document.getElementById('carousel-'+pi);if(!c)return;const total=c.querySelectorAll('.carousel-slide').length;carouselState[pi]=(carouselState[pi]||0)+dir;if(carouselState[pi]<0)carouselState[pi]=total-1;if(carouselState[pi]>=total)carouselState[pi]=0;goToSlide(pi,carouselState[pi])}
function goToSlide(pi,idx){const c=document.getElementById('carousel-'+pi);if(!c)return;carouselState[pi]=idx;c.querySelector('.carousel-track').style.transform='translateX(-'+idx*100+'%)';c.querySelectorAll('.carousel-dot').forEach((d,i)=>d.classList.toggle('active',i===idx))}

// --- Utility ---
function escHtml(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}

// --- Init ---
updateCartUI();
renderRecentlyViewed();
initSearch();