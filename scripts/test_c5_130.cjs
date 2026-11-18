const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function fixture(){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'firmware/c5/manifest.json'),'utf8'));
 const elements=new Map();
 function element(){return {value:'',hidden:true,disabled:false,checked:false,options:[{value:'',dataset:{}},{value:'rx',dataset:{}},{value:'mk',dataset:{}},{value:'mklegacy',dataset:{boards:'xiao'}}],style:{},innerHTML:'',textContent:'',listeners:{},addEventListener(t,fn){this.listeners[t]=fn}}}
 const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)}};
 const context=vm.createContext({document,navigator:{serial:{}},window:{isSecureContext:true},fetch:async()=>({ok:true,json:async()=>manifest}),console});
 const code=fs.readFileSync(path.join(root,'c5-radio.js'),'utf8').replace(/^import .*;\r?\n/,'');vm.runInContext(code,context);
 return {context,document,manifest};
}
test('1.3.0 offers D6/D7 UART1 (c5mkaio) and Legacy D4/D5 on the XIAO, and the C5-Zero image',async()=>{
 const {context,document,manifest}=fixture();
 const cases=[['xiao','mk','c5mkaio','D7 / GPIO12 (RX)',/D6\/D7 UART1 wiring/,'1.3.0+c5mkaio'],['xiao','mklegacy','xiaoc5','D4 / GPIO23 (RX)',/Legacy D4\/D5 wiring/,'1.3.0+xiaoc5'],['zero','mk','c5zero','GPIO4 (RX)',null,'1.3.0+c5zero']];
 for(const [board,fw,env,pin,note,app] of cases){
  document.getElementById('c5-board').value=board;document.getElementById('c5-firmware').value=fw;
  await vm.runInContext('selectBuild()',context);
  const build=manifest.builds[fw+'-'+board];
  assert.equal(build.environment,env);
  assert.equal(build.version,'1.3.0');
  assert.equal(build.tag,'v1.3.0');
  assert.equal(build.app_version,app);
  assert.notEqual(build.prerelease,true);
  assert.equal(document.getElementById('c5-flash').disabled,false);
  const wiring=document.getElementById('c5-wiring').innerHTML;
  assert.ok(wiring.includes(pin),pin);
  if(note) assert.match(wiring,note);
 }
});
test('every 1.3.0 image matches its manifest size, hash and board',async()=>{
 const crypto=require('node:crypto');
 const {manifest}=fixture();
 for(const [key,build] of Object.entries(manifest.builds).filter(([k])=>!k.startsWith('rx-'))){
  for(const part of build.parts){
   const bytes=fs.readFileSync(path.join(root,part.path));
   assert.equal(bytes.length,part.size,part.path);
   assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),part.sha256,part.path);
  }
  const app=fs.readFileSync(path.join(root,build.parts.at(-1).path)).subarray(48,80).toString('latin1').split('\0')[0];
  assert.equal(app,build.app_version,key);
 }
});
test('Legacy D4/D5 is XIAO only and no pre-release builds remain',async()=>{
 const {context,document,manifest}=fixture();
 for(const [board,fw] of [['zero','mklegacy'],['devkit','mklegacy'],['mini','mklegacy'],['','mklegacy']]){
  document.getElementById('c5-board').value=board;document.getElementById('c5-firmware').value=fw;
  await vm.runInContext('selectBuild()',context);
  assert.equal(document.getElementById('c5-flash').disabled,true);
  assert.equal(document.getElementById('c5-firmware').value,'');
 }
 assert.equal(Object.keys(manifest.builds).filter(k=>/^mkpre/.test(k)).length,0);
});
