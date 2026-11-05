const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function element() { return {textContent:'', value:'', style:{}, children:[], replaceChildren(){this.children=[];}, append(p){this.children.push(p);}, addEventListener(){}}; }
const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
get('gradeSelect').value = '2';
const current = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','');
let payload = {version:1,school:'운양고등학교',updatedAt:new Date().toISOString(),coverage:{meals:[current,current],events:[current,current]},meals:[{date:current,type:'2',name:'중식',dishes:['우유(2)','<img onerror=alert(1)>'],calories:'100 Kcal'}],events:[{date:current,name:'2학년 지필고사',grades:[2],gradeUnknown:false},{date:current,name:'3학년 행사',grades:[3],gradeUnknown:false}]};
let fail = false;
const context = vm.createContext({console, Intl, Date, setTimeout,clearTimeout,AbortController, document:{getElementById:get,createElement:element,addEventListener(){}},fetch:async()=>{if(fail)throw Error('offline');return{ok:true,json:async()=>payload};}});
vm.runInContext(readFileSync('school-data.js','utf8'),context);
(async()=>{
 await vm.runInContext('SchoolData.load()',context);
 assert.match(get('lunchContent').textContent,/우유\(2\)/);
 assert.match(get('lunchContent').textContent,/<img onerror/); // displayed as text, not HTML
 assert.equal(get('recentEvents').children.length,1);
 assert.match(get('examDdayBadge').textContent,/D-Day/);
 fail = true;
 await vm.runInContext('SchoolData.load()',context);
 assert.match(get('dataStatus').textContent,/이전 자료/);
 assert.match(get('lunchContent').textContent,/우유/);
 fail = false;
 payload = {...payload,meals:[],events:[]};
 await vm.runInContext('SchoolData.load()',context);
 assert.match(get('lunchContent').textContent,/등록된 중식 정보가 없습니다/);
 assert.match(get('examDdayBadge').textContent,/미등록/);
 payload = {version:1,school:'운양고등학교',updatedAt:null,coverage:{meals:[],events:[]},meals:[],events:[]};
 await vm.runInContext('SchoolData.load()',context);
 assert.match(get('dataStatus').textContent,/아직 자동 갱신/);
 console.log('UI checks passed: display, grade filtering, D-day, failed refresh, empty/uninitialized data');
})().catch(e=>{console.error(e);process.exit(1);});
