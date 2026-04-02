const fs = require('fs');
let c = fs.readFileSync('C:/Users/Louis/Desktop/Code/fpvgate-website/admin/script.js', 'utf8');

// Add currentEditImages tracking variable
c = c.replace(
    "let adminToken='',currentFilter=null,ordersData=[],liveStatsInterval=null;",
    "let adminToken='',currentFilter=null,ordersData=[],liveStatsInterval=null,currentEditImages=[];"
);

// Update editProduct to load and display images
c = c.replace(
    "document.getElementById('edit-product-modal').classList.add('open')}catch(e){alert('Failed to load product: '+e.message)}",
    "currentEditImages=JSON.parse(p.images||'[]');renderEditImageGallery();document.getElementById('edit-product-modal').classList.add('open')}catch(e){alert('Failed to load product: '+e.message)}"
);

// Add image functions before closeEditProductModal
const imgFuncs = `
function renderEditImageGallery(){const g=document.getElementById('edit-img-gallery');const cnt=document.getElementById('edit-img-count');cnt.textContent='('+currentEditImages.length+'/8)';if(currentEditImages.length===0){g.innerHTML='<div style="color:#a0aec0;font-size:13px">No images uploaded</div>';return}g.innerHTML=currentEditImages.map((key,i)=>'<div class="img-thumb"><img src="'+STORE_API+'/images/'+key+'"><button class="img-delete" onclick="deleteProductImage('+i+')">&times;</button>'+(i===0?'<span class="img-badge">Main</span>':'')+'</div>').join('')}
async function uploadProductImage(){const pid=document.getElementById('edit-product-id').value;const file=document.getElementById('edit-img-file').files[0];const status=document.getElementById('edit-img-status');if(!file)return;if(currentEditImages.length>=8){status.textContent='Maximum 8 images';status.style.color='#e53e3e';return}status.textContent='Uploading...';status.style.color='#4299e1';const fd=new FormData();fd.append('image',file);try{const r=await fetch(STORE_API+'/api/inventory/'+pid+'/images',{method:'POST',headers:{'Authorization':'Bearer '+adminToken},body:fd});const d=await r.json();if(d.error){status.textContent=d.error;status.style.color='#e53e3e';return}currentEditImages.push(d.key);renderEditImageGallery();status.textContent='Uploaded';status.style.color='#48bb78';document.getElementById('edit-img-file').value=''}catch(e){status.textContent='Failed: '+e.message;status.style.color='#e53e3e'}}
async function deleteProductImage(index){const pid=document.getElementById('edit-product-id').value;if(!confirm('Delete this image?'))return;try{const r=await storeApi('/api/inventory/'+pid+'/images/'+index,'DELETE');if(r.error){alert(r.error);return}currentEditImages.splice(index,1);renderEditImageGallery()}catch(e){alert('Failed: '+e.message)}}
`;

c = c.replace(
    'function closeEditProductModal(){',
    imgFuncs + 'function closeEditProductModal(){'
);

fs.writeFileSync('C:/Users/Louis/Desktop/Code/fpvgate-website/admin/script.js', c);
console.log('OK - image functions added');
