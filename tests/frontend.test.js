'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const source = readFileSync('frontend/app.js','utf8');

class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.style={};this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.checked=false;this.attributes={};this.button=null;}
  addEventListener(type,fn){this.listeners[type]=fn;}
  async dispatch(type,extra={}){return this.listeners[type]?.({preventDefault(){},...extra});}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(key,val){this.attributes[key]=val;}
  querySelector(selector){if(selector==='button'){if(!this.button)this.button=new Element('button');return this.button;}return null;}
  showModal(){} close(){} reset(){}
}
async function setup(remote=false){
  const ids=[...readFileSync('frontend/index.html','utf8').matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const document={getElementById:id=>elements[id],createElement:tag=>new Element(tag)};
  const store=new Map();const localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
  const window={GATHER_CONFIG:remote?{apiUrl:'https://api.example'}:{},GatherAuth:{configured:true,completeRedirect:async()=>{},accessToken:async()=>null}};
  const ctx={window,document,localStorage,crypto:webcrypto,structuredClone,Date,String,Number,Boolean,Error,console};
  vm.runInNewContext(source,ctx);
  await new Promise(resolve=>setImmediate(resolve));
  return {elements,store};
}

test('browser demo creates an event and tracks overdue tasks',async()=>{
  const {elements:e,store}=await setup();
  assert.equal(e['mode-label'].textContent,'Browser demo');
  e['event-title'].value='Launch event';e['event-date'].value='2099-12-01';e['event-category'].value='Workshop';e['event-location'].value='Online';
  await e['event-form'].dispatch('submit',{submitter:new Element('button')});
  assert.equal(e['detail-title'].textContent,'Launch event');
  e['task-title'].value='Reserve venue';e['task-due'].value='2000-01-01';
  await e['task-form'].dispatch('submit',{submitter:new Element('button')});
  assert.equal(e['progress-count'].textContent,1);
  const checkbox=e.tasks.children[0].children[0];checkbox.checked=true;await checkbox.dispatch('change');
  assert.equal(e['detail-progress'].textContent,'100%');
  assert.equal(e['progress-count'].textContent,0);
  const saved=JSON.parse(store.get('gather-demo-v2'));
  assert.equal(saved.events.find(x=>x.title==='Launch event').category,'Workshop');
});

test('AWS mode remains closed until the user signs in',async()=>{
  const {elements:e}=await setup(true);
  assert.equal(e['mode-label'].textContent,'Sign in required');
  assert.equal(e['account-button'].hidden,false);
  assert.equal(e['open-event'].disabled,true);
  assert.equal(e['task-title'].disabled,true);
});
