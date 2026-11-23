'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('frontend/auth.js','utf8');

function setup() {
  const storage = new Map();
  const sessionStorage = {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const location = {origin:'https://example.cloudfront.net',search:'',assigned:null,assign(url){this.assigned=url;}};
  const history = {replaced:null,replaceState(_a,_b,url){this.replaced=url;}};
  const calls=[];
  const fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({access_token:'access',refresh_token:'refresh',expires_in:3600})};};
  const window={GATHER_CONFIG:{apiUrl:'https://api.example',cognitoDomain:'https://auth.example',cognitoClientId:'client123'},location};
  const context={window,location,history,sessionStorage,fetch,crypto:webcrypto,TextEncoder,URLSearchParams,btoa,Date,Uint8Array,Number,Boolean,JSON,String,Error};
  vm.runInNewContext(source,context);
  return {auth:window.GatherAuth,location,history,storage,calls};
}

test('sign-in sends a PKCE challenge and random state', async()=>{
  const x=setup(); await x.auth.signIn();
  const target=new URL(x.location.assigned);
  assert.equal(target.origin,'https://auth.example');
  assert.equal(target.pathname,'/oauth2/authorize');
  assert.equal(target.searchParams.get('response_type'),'code');
  assert.equal(target.searchParams.get('code_challenge_method'),'S256');
  const flow=JSON.parse(x.storage.get('gather.auth.client123.flow'));
  assert.equal(target.searchParams.get('state'),flow.state);
  const digest=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(flow.verifier));
  assert.equal(target.searchParams.get('code_challenge'),Buffer.from(digest).toString('base64url'));
});

test('valid callback exchanges code and removes it from the address bar', async()=>{
  const x=setup();await x.auth.signIn();const flow=JSON.parse(x.storage.get('gather.auth.client123.flow'));
  x.location.search='?code=sample-code&state='+encodeURIComponent(flow.state);
  await x.auth.completeRedirect();
  assert.equal(x.history.replaced,'https://example.cloudfront.net/');
  assert.equal(x.calls.length,1);
  const form=x.calls[0].options.body;
  assert.equal(form.get('code_verifier'),flow.verifier);
  assert.equal(form.get('redirect_uri'),'https://example.cloudfront.net/');
  assert.equal(await x.auth.accessToken(),'access');
  assert.equal(x.storage.has('gather.auth.client123.flow'),false);
});

test('mismatched state is rejected without exchanging the code', async()=>{
  const x=setup();await x.auth.signIn();x.location.search='?code=sample-code&state=wrong';
  await assert.rejects(x.auth.completeRedirect(),/session expired/);
  assert.equal(x.calls.length,0);
  assert.equal(x.history.replaced,'https://example.cloudfront.net/');
});

test('expired access token is refreshed with the refresh token', async()=>{
  const x=setup();
  x.storage.set('gather.auth.client123.tokens',JSON.stringify({accessToken:'old',refreshToken:'refresh',expiresAt:0}));
  assert.equal(await x.auth.accessToken(),'access');
  assert.equal(x.calls[0].options.body.get('grant_type'),'refresh_token');
});
