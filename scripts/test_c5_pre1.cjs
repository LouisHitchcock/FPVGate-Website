const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function fixture(){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'firmware/c5/manifest.json'),'utf8'));
 const elements=new Map();
 function element(){return {value:'',hidden:true,disabled:false,checked:false,options:[{value:'',dataset:{}},{value:'rx',dataset:{}},{value:'mk',dataset:{}},{value:'mkpre',dataset:{boards:'xiao zero'}},{value:'mkprelegacy',dataset:{boards:'xiao'}}],style:{},innerHTML:'',textContent:'',listeners:{},addEventListener(t,fn){this.listeners[t]=fn}}}
 const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)}};
 const context=vm.createContext({document,navigator:{serial:{}},window:{isSecureContext:true},fetch:async()=>({ok:true,json:async()=>manifest}),console});
 const code=fs.readFileSync(path.join(root,'c5-radio.js'),'utf8').replace(/^import .*;\r?\n/,'');vm.runInContext(code,context);
 return {context,document,manifest};
}
test('pre-1 offers D6/D7 UART1 and Legacy D4/D5 on the XIAO, and the C5-Zero image',async()=>{
 const {context,document,manifest}=fixture();
 const cases=[['xiao','mkpre','xiaoc5_uart1_d6d7','D7 / GPIO12 (RX)',/D6\/D7 UART1 wiring/],['xiao','mkprelegacy','xiaoc5','D4 / GPIO23 (RX)',/Legacy D4\/D5 wiring/],['zero','mkpre','c5zero','GPIO4 (RX)',null]];
 for(const [board,fw,env,pin,note] of cases){
  document.getElementById('c5-board').value=board;document.getElementById('c5-firmware').value=fw;
  await vm.runInContext('selectBuild()',context);
  const build=manifest.builds[fw+'-'+board];
  assert.equal(build.environment,env);
  assert.equal(build.version,'1.3.0-pre-1');
  assert.equal(document.getElementById('c5-flash').disabled,false);
  const release=document.getElementById('c5-release').innerHTML,wiring=document.getElementById('c5-wiring').innerHTML;
  assert.match(release,/Testing prerelease/);
  assert.match(release,/soak.*NOT PASSED/);
  assert.match(release,/1\.9\.0-alpha-6/);
  assert.ok(wiring.includes(pin),pin);
  if(note) assert.match(wiring,note);
 }
 assert.equal(manifest.builds['mkpre-xiao'].app_version,'1.3.0-pre-1-d6d7+xiaoc5');
 assert.match(manifest.builds['mkpre-xiao'].qualification,/build only/);
});
test('Legacy D4/D5 is XIAO only and pre-1 is not offered on unbuilt boards',async()=>{
 const {context,document,manifest}=fixture();
 for(const [board,fw] of [['devkit','mkpre'],['mini','mkpre'],['','mkpre'],['zero','mkprelegacy'],['devkit','mkprelegacy']]){
  document.getElementById('c5-board').value=board;document.getElementById('c5-firmware').value=fw;
  await vm.runInContext('selectBuild()',context);
  assert.equal(document.getElementById('c5-flash').disabled,true);
  assert.equal(document.getElementById('c5-firmware').value,'');
 }
 assert.equal(manifest.builds['mkprelegacy-zero'],undefined);
});
test('stable remains 1.2.6 and has no pre-1 warning',async()=>{
 const {context,document,manifest}=fixture();
 document.getElementById('c5-board').value='xiao';document.getElementById('c5-firmware').value='mk';
 await vm.runInContext('selectBuild()',context);
 assert.equal(manifest.builds['mk-xiao'].version,'1.2.6');
 assert.equal(document.getElementById('c5-flash').disabled,false);
 assert.doesNotMatch(document.getElementById('c5-release').innerHTML,/Testing prerelease/);
});
