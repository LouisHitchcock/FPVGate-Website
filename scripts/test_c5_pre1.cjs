const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function fixture(){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'firmware/c5/manifest.json'),'utf8'));
 const elements=new Map();
 function element(){return {value:'',hidden:true,disabled:false,checked:false,options:[{value:''},{value:'rx'},{value:'mk'},{value:'mkpre'}],style:{},innerHTML:'',textContent:'',listeners:{},addEventListener(t,fn){this.listeners[t]=fn}}}
 const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)}};
 const context=vm.createContext({document,navigator:{serial:{}},window:{isSecureContext:true},fetch:async()=>({ok:true,json:async()=>manifest}),console});
 const code=fs.readFileSync(path.join(root,'c5-radio.js'),'utf8').replace(/^import .*;\r?\n/,'');vm.runInContext(code,context);
 return {context,document,manifest};
}
test('pre-1 selects exact standard images with a visible qualification notice',async()=>{
 const {context,document,manifest}=fixture();
 for(const board of ['xiao','zero']){
  document.getElementById('c5-board').value=board;document.getElementById('c5-firmware').value='mkpre';
  await vm.runInContext('selectBuild()',context);
  assert.equal(document.getElementById('c5-flash').disabled,false);
  assert.equal(manifest.builds['mkpre-'+board].version,'1.3.0-pre-1');
  assert.match(document.getElementById('c5-release').innerHTML,/Testing prerelease/);
  assert.match(document.getElementById('c5-release').innerHTML,/soak.*NOT PASSED/);
  assert.match(document.getElementById('c5-release').innerHTML,/1\.9\.0-alpha-6/);
 }
});
test('pre-1 cannot select an unbuilt board or the modified D6/D7 wiring',async()=>{
 const {context,document,manifest}=fixture();
 for(const board of ['devkit','mini','']){
  document.getElementById('c5-board').value=board;document.getElementById('c5-firmware').value='mkpre';
  await vm.runInContext('selectBuild()',context);
  assert.equal(document.getElementById('c5-flash').disabled,true);
  assert.equal(document.getElementById('c5-firmware').value,'');
 }
 assert.equal(manifest.builds['mkpre-xiaoc5_uart1_d6d7'],undefined);
});
test('stable remains 1.2.6 and has no pre-1 warning',async()=>{
 const {context,document,manifest}=fixture();
 document.getElementById('c5-board').value='xiao';document.getElementById('c5-firmware').value='mk';
 await vm.runInContext('selectBuild()',context);
 assert.equal(manifest.builds['mk-xiao'].version,'1.2.6');
 assert.equal(document.getElementById('c5-flash').disabled,false);
 assert.doesNotMatch(document.getElementById('c5-release').innerHTML,/Testing prerelease/);
});
