import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('careerlaunch shell contains core journeys',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const phrase of ['Professional CV','Job-specific pack','Verified opportunities','MATRIC LAUNCHPAD']){
    assert.ok(html.includes(phrase),phrase);
  }
});

test('no privileged secret variable names in browser source',async()=>{
  const js=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  assert.equal(/SERVICE_ROLE|PRIVATE_KEY|ACCESS_TOKEN|API_SECRET/i.test(js),false);
});

test('live-test signup is email and password only',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  assert.ok(html.includes('No OTP or email confirmation is required.'));
  assert.equal(html.includes('signupPasswordConfirm'),false);
  assert.match(js,/authRequest\('signup',\{email:email\.value\.trim\(\),password:password\.value\}\)/);
  assert.equal(/signInWithOtp|verifyOtp|magic.?link/i.test(js),false);
});

test('successful authentication enters the protected workspace',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  for(const phrase of ['CareerLaunch workspace','Dashboard','Profile','CV Builder','Opportunities','Study & Funding','Applications']){
    assert.ok(html.includes(phrase),phrase);
  }
  assert.match(js,/async function enterApp\(\)/);
  assert.match(js,/if\(storeSession\(data\)\)[\s\S]*?enterApp\(\)/);
  assert.match(js,/if\(!storeSession\(data\)\)throw new Error[\s\S]*?enterApp\(\)/);
  assert.match(js,/signOutBtn[\s\S]*?leaveApp/);
});

test('all authenticated tabs have live data hooks',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  for(const id of [
    'statProfile','researchPulse','profileForm','experienceForm','educationForm','skillForm',
    'cvForm','opportunityList','studyList','applicationList'
  ]){
    assert.ok(html.includes(`id="${id}"`),id);
  }
  for(const table of ['profiles','candidate_experience','candidate_education','candidate_skills','opportunities','application_packs','applications']){
    assert.ok(js.includes(table),table);
  }
});

test('opportunity research preserves provenance and never claims automatic submission',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  assert.ok(html.includes('official source'));
  assert.ok(html.includes('verification'));
  assert.ok(js.includes('It has not been submitted anywhere.'));
  assert.ok(js.includes('Open official source'));
});
