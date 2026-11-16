const STORE_API = 'https://fpvgate-store.fpvgate-analytics.workers.dev';


// Preview credentials stay in this tab and are sent only to the store API.
const previewFragment = new URLSearchParams(location.hash.slice(1)).get('store-preview');
if (previewFragment) {
 sessionStorage.setItem('fpvgate_preview_token', previewFragment);
 history.replaceState(null, '', location.pathname + location.search);
}
const storePreview = new URLSearchParams(location.search).get('preview') === '1';
async function storeFetch(input) {
 const url = new URL(input);const headers = {};
 if (storePreview) {url.searchParams.set('preview', '1');headers.Authorization = 'Bearer ' + (sessionStorage.getItem('fpvgate_preview_token') || '');}
 const response = await fetch(url.toString(), { headers, cache: 'no-store' });
 if (!response.ok) throw new Error(storePreview ? 'Open preview again from the admin product editor.' : 'Could not load products');
 return response;
}
if (storePreview) {
 const banner=document.createElement('div');banner.style.cssText='position:sticky;top:0;z-index:99999;padding:14px;background:#ffe08a;color:#111;text-align:center';
 banner.textContent='Admin preview - includes drafts and scheduled releases. Purchases are disabled. ';
 const exit=document.createElement('a');exit.href=location.pathname;exit.textContent='Exit preview';exit.onclick=()=>sessionStorage.removeItem('fpvgate_preview_token');banner.append(exit);document.body.prepend(banner);
}

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
                ${cartLinePreorderQty(item) > 0 ? `<div class="cart-item-preorder">Pre-order: ships ${formatShipDate(item.preorderShipDate)}</div>` : ''}
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
 if (storePreview) return;
 if (product.variants?.length && !product.variantId) {window._variantProduct=[product];openProductModal(0,'_variantProduct');return;}
    const cart = getCart();
    const maxQuantity = Math.min(product.maxQuantity || 5, availableQty(product));
    if (maxQuantity <= 0 || cart.filter(i => i.id === product.id).reduce((sum,i) => sum+i.quantity,0) >= maxQuantity) return;
    const existing = cart.find(i => i.id === product.id && (i.variantId || null) === (product.variantId || null));
    if (existing) {
        existing.maxQuantity = maxQuantity;
        existing.inStock = product.stock;
        existing.preorderShipDate = product.preorderShipDate || null;
        if (existing.quantity < maxQuantity) existing.quantity++;
    } else {
        cart.push({ id: product.id, variantId: product.variantId || null, name: product.name, price: product.price, quantity: 1, image: product.image || '', maxQuantity, inStock: product.stock, preorderShipDate: product.preorderShipDate || null });
    }
    saveCart(cart);
    if (window.fpvgateAnalytics) window.fpvgateAnalytics.track('cart_add', { product_id: product.id, product_name: product.name, price: product.price, category: product.category || '' });
    if (!document.getElementById('cart-panel').classList.contains('open')) toggleCart();
}

function removeFromCart(idx) {
    const cart = getCart(); cart.splice(idx, 1); saveCart(cart);
}

function changeQty(idx, dir) {
    const cart = getCart();
    const remaining = Math.max(0, cart[idx].maxQuantity - cart.reduce((sum,item,i) => sum + (i !== idx && item.id === cart[idx].id ? item.quantity : 0), 0));
    cart[idx].quantity = Math.min(cart[idx].quantity + dir, remaining);
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
                <span class="strip-card-price">${p.variants?.length ? 'From ' : ''}&pound;${p.price.toFixed(2)}</span>
            </div>
        </div>
    `).join('');
}

function viewRecentProduct(id, category) {
    const page = CATEGORY_LINKS[category] || 'shop-fpvgate.html';
    window.location.href = page + (storePreview ? '?preview=1&id=' : '?id=') + encodeURIComponent(id);
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
        const resp = await storeFetch(STORE_API + '/products?q=' + encodeURIComponent(q));
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

// --- Pre-orders ---
// When a product sells out and pre-orders are enabled, the API reports
// stock: 0 with a preorderShipDate, and available counts the pre-order places
// left. Buyers must see the dispatch date before they commit.
function availableQty(p) { return p.available !== undefined ? p.available : p.stock; }
function isPreorder(p) { return p.stock <= 0 && !!p.preorderShipDate && availableQty(p) > 0; }
function buyButtonLabel(p) { if (p.variants?.length) return availableQty(p) <= 0 ? 'Out of Stock' : 'Choose variant'; return isPreorder(p) ? 'Pre-order' : availableQty(p) <= 0 ? 'Out of Stock' : 'Add to Cart'; }

function cartLinePreorderQty(item) {
    if (!item.preorderShipDate) return 0;
    return Math.max(0, item.quantity - (item.inStock || 0));
}

function formatShipDate(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate + 'T00:00:00Z');
    if (isNaN(d)) return isoDate;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function renderStockNotice(p) {
    if (isPreorder(p)) {
        return `<div class="preorder-notice">
            <strong>This is a pre-order</strong>
            <p>This item is not in stock yet. Orders placed now will not be shipped until <strong>${formatShipDate(p.preorderShipDate)}</strong>.</p>
        </div>`;
    }
    if (availableQty(p) <= 0) return 'Out of Stock';
    // A cart can spill past the remaining stock into pre-order units
    if (p.preorderShipDate && p.stock > 0 && p.stock < (p.maxQuantity || 5)) {
        return `<div class="preorder-notice preorder-notice-quiet">
            <p>Only ${p.stock} in stock. Any more than that are pre-orders and will not be shipped until <strong>${formatShipDate(p.preorderShipDate)}</strong>.</p>
        </div>`;
    }
    return '';
}

// The API orders featured products by most recently updated. Only explicitly
// featured products qualify; an empty selection leaves the normal shop header.
function renderFeaturedHero(products) {
    const section = document.getElementById('store-featured');
    if (!section) return;
    const product = products.find(p => p.featured === true);
    section.hidden = !product;
    window._heroProducts = product ? [product] : [];
    if (!product) return;
    document.getElementById('featured-product-name').textContent = product.name;
    document.getElementById('featured-product-description').textContent = product.shortDescription || product.description || '';
    document.getElementById('featured-product-price').textContent = (product.variants?.length ? 'From ' : '') + '\u00a3' + product.price.toFixed(2);
    document.getElementById('featured-product-stock').innerHTML = renderStockNotice(product);
    const imageButton = document.getElementById('featured-product-image');
    imageButton.replaceChildren();
    if (product.image) {
        const image = document.createElement('img');
        image.src = product.image;image.alt = product.name;image.fetchPriority = 'high';
        imageButton.append(image);
    } else {
        const placeholder = document.createElement('span');placeholder.textContent = 'No image available';imageButton.append(placeholder);
    }
    imageButton.setAttribute('aria-label', 'View ' + product.name);
    imageButton.onclick = document.getElementById('featured-product-view').onclick = () => openProductModal(0, '_heroProducts');
}

// --- Product Rendering ---
function renderProductCard(p, pi) {
    return `<div class="product-card" data-pi="${pi}" style="cursor:pointer">
        <div class="product-image">
            ${p.images && p.images.length > 1
                ? `<div class="carousel" id="carousel-${pi}">
                    <div class="carousel-track" style="transform:translateX(0)">${p.images.map(img => `<div class="carousel-slide"><img src="${img}" alt="${escHtml(p.name)}"></div>`).join('')}</div>
                    <button class="carousel-btn carousel-prev" onclick="event.stopPropagation();moveCarousel(${pi},-1)">&#8249;</button>
                    <button class="carousel-btn carousel-next" onclick="event.stopPropagation();moveCarousel(${pi},1)">&#8250;</button>
                    <div class="carousel-dots">${p.images.map((_,i) => `<button class="carousel-dot${i===0?' active':''}" onclick="event.stopPropagation();goToSlide(${pi},${i})"></button>`).join('')}</div>
                </div>`
                : p.images && p.images.length === 1
                    ? `<img src="${p.images[0]}" alt="${escHtml(p.name)}" style="width:100%;height:100%;object-fit:contain;">`
                    : p.image
                        ? `<img src="${p.image}" alt="${escHtml(p.name)}" style="width:100%;height:100%;object-fit:contain;">`
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
            ${isPreorder(p)
                ? `<p class="preorder-flag">Pre-order: ships ${formatShipDate(p.preorderShipDate)}</p>`
                : availableQty(p) <= 0 ? '<p style="color:var(--error-color);font-weight:600;margin-top:8px;">Out of Stock</p>' : ''}
            <div class="product-price-row">
                <span class="product-price">${p.variants?.length ? 'From ' : ''}&pound;${p.price.toFixed(2)}</span>
                <button class="btn btn-primary" onclick="event.stopPropagation();addToCart(window._products[${pi}])"
                    ${availableQty(p) <= 0 ? 'disabled' : ''}>
                    ${buyButtonLabel(p)}
                </button>
            </div>
        </div>
    </div>`;
}

// --- Product Modal ---
let modalCarouselState = 0;
let activeProductLink = '';
let productLinkRequest = 0;
let linkedProductsPromise = null;
let productPreviewLinks = null;
let productPreviewPromise = null;

function loadProductPreviewLinks() {
    if (!productPreviewPromise) {
        const url = new URL('product-previews.json', window.location.href);
        productPreviewPromise = fetch(url.href, { cache: 'no-cache' }).then(response => {
            if (!response.ok) throw new Error('Preview links unavailable');
            return response.json();
        }).then(links => { productPreviewLinks = links; }).catch(() => {
            productPreviewPromise = null;
        });
    }
    return productPreviewPromise;
}

function productShareUrl(id) {
    if (productPreviewLinks && Object.hasOwn(productPreviewLinks, id)) {
        const preview = new URL(productPreviewLinks[id], window.location.href);
        if (preview.origin === new URL(window.location.href).origin) return preview.href;
    }
    const url = new URL('shop.html', window.location.href);
    url.searchParams.set('id', id);
    return url.href;
}

function setProductUrl(id) {
    const url = new URL(window.location.href);
    if (id === null) url.searchParams.delete('id');
    else url.searchParams.set('id', id);
    if (url.href !== window.location.href) window.history.pushState(null, '', url.href);
}

async function copyProductLink(button) {
    if (!activeProductLink) return;
    const id = new URL(window.location.href).searchParams.get('id');
    const fallback = activeProductLink;
    await loadProductPreviewLinks();
    const link = id ? productShareUrl(id) : fallback;
    try {
        await navigator.clipboard.writeText(link);
        button.textContent = 'Link copied!';
        setTimeout(() => { button.textContent = 'Copy link'; }, 2000);
    } catch (e) {
        window.prompt('Copy this product link:', link);
    }
}

function showProductLinkMessage(message, retry) {
    let notice = document.getElementById('product-link-message');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'product-link-message';
        notice.className = 'search-empty';
        notice.setAttribute('role', 'status');
        (document.querySelector('.store-hero .container') || document.body).appendChild(notice);
    }
    notice.textContent = message;
    if (retry) {
        const button = document.createElement('button');
        button.className = 'btn btn-secondary';
        button.textContent = 'Try again';
        button.addEventListener('click', openProductFromUrl);
        notice.appendChild(button);
    }
}

async function openProductFromUrl() {
    const request = ++productLinkRequest;
    const id = new URL(window.location.href).searchParams.get('id');
    document.getElementById('product-link-message')?.remove();
    closeProductModal(false);
    if (!id) return;
    try {
        if (!linkedProductsPromise) {
            linkedProductsPromise = storeFetch(STORE_API + '/products').then(response => {
                if (!response.ok) throw new Error('Could not load products');
                return response.json();
            }).catch(error => { linkedProductsPromise = null; throw error; });
        }
        const products = await linkedProductsPromise;
        if (request !== productLinkRequest) return;
        const index = products.findIndex(product => product.id === id);
        if (index < 0) {
            showProductLinkMessage('This product is unavailable or no longer listed. You can browse the store below.');
            return;
        }
        window._linkedProducts = products;
        openProductModal(index, '_linkedProducts', false);
    } catch (e) {
        if (request === productLinkRequest) showProductLinkMessage('Unable to load this product. Please try again.', true);
    }
}

window.addEventListener('popstate', openProductFromUrl);

function openProductModal(pi, sourceArray, updateUrl = true) {
    const arr = sourceArray || '_products';
    const p = window[arr]?.[pi];
    if (!p) return;
    if (updateUrl) { ++productLinkRequest; setProductUrl(p.id); }
    activeProductLink = productShareUrl(p.id);
    document.getElementById('product-link-message')?.remove();

    if (!storePreview) { addRecentlyViewed(p); renderRecentlyViewed(); }

    if (window.fpvgateAnalytics) {
        window.fpvgateAnalytics.track('product_view', {
            product_id: p.id,
            product_name: p.name,
            price: p.price,
            category: p.category || ''
        });
    }

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
    document.getElementById('modal-stock').innerHTML = renderStockNotice(p);
    document.getElementById('modal-actions').innerHTML = `
        <button class="btn btn-primary" onclick="addToCart(${arr}[${pi}])"
            ${availableQty(p) <= 0 ? 'disabled' : ''}>
            ${buyButtonLabel(p)}
        </button>
        <button type="button" class="btn btn-secondary" onclick="copyProductLink(this)">Copy link</button>`;

    if (p.variants?.length) {
        window._selectedVariantProduct=null;
        const select=document.createElement('select');select.id='product-variant';select.setAttribute('aria-label','Product variant');select.className='product-variant-select';
        const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a variant';select.append(placeholder);
        p.variants.forEach(v=>{const option=document.createElement('option');option.value=v.id;option.textContent=v.name+' - \u00a3'+v.price.toFixed(2);select.append(option)});
        const buy=document.querySelector('#modal-actions .btn-primary');buy.disabled=true;buy.removeAttribute('onclick');buy.onclick=()=>{if(window._selectedVariantProduct)addToCart(window._selectedVariantProduct)};
        select.onchange=()=>{const v=p.variants.find(v=>v.id===select.value);window._selectedVariantProduct=v?{...p,variantId:v.id,name:p.name+' - '+v.name,price:v.price}:null;buy.disabled=storePreview||!v||availableQty(p)<=0;buy.textContent=v?buyButtonLabel({...p,variants:[]}):'Choose variant';document.getElementById('modal-price').textContent='\u00a3'+(v?v.price:p.price).toFixed(2)};
        document.getElementById('modal-actions').prepend(select);
    }
    if(storePreview){const buy=document.querySelector('#modal-actions .btn-primary');if(buy)buy.disabled=true;}
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

function closeProductModal(updateUrl = true) {
    if (updateUrl) { ++productLinkRequest; setProductUrl(null); }
    activeProductLink = '';
    document.getElementById('product-modal').classList.remove('active');
    document.body.style.overflow = '';
}
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
loadProductPreviewLinks();
openProductFromUrl();

if(storePreview)document.querySelectorAll('a[href]').forEach(link=>{const url=new URL(link.href,location.href);if(url.origin===location.origin&&/\/shop(?:-[a-z]+)?\.html$/.test(url.pathname)){url.searchParams.set('preview','1');link.href=url.toString()}});
