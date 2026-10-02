import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('careerlaunch shell contains core journeys',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const phrase of ['Professional CV','AI role-specific CVs','Verified opportunities','MATRIC LAUNCHPAD']){
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

test('authenticated workspace includes expanded CV and shortlist journeys',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const phrase of [
    'Dashboard','Profile','CV Builder','Opportunities','Shortlisted','Study & Funding','Applications',
    'Complete conventional CV structure','UPLOAD CV OR DOCUMENTS','AI CV GENERATOR','Your five priority applications'
  ]){
    assert.ok(html.includes(phrase),phrase);
  }
});

test('searchable multi-selects and school-leaver paths exist',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const options=await readFile(new URL('../src/career-options.js',import.meta.url),'utf8');
  for(const id of ['roleSearch','strengthSearch','skillSearchCv','roleOther','strengthOther','skillOtherCv','noExperienceYet','firstJobMode']){
    assert.ok(html.includes(`id="${id}"`),id);
  }
  for(const phrase of ['Sales Assistant','Office Administrator','Willingness to learn','Basic computer literacy','Other']){
    assert.ok(options.includes(phrase),phrase);
  }
});

test('manual CV covers conventional optional sections and export',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const id of [
    'manualName','manualPhone','manualAltPhone','manualEmail','manualLocation','manualAddress',
    'manualSummary','manualExperienceList','manualEducationList','manualLanguages',
    'manualAvailability','manualReferences','saveManualPdf','saveManualDocx'
  ]){
    assert.ok(html.includes(`id="${id}"`),id);
  }
});

test('live data hooks include uploads, shortlist and AI edge function',async()=>{
  const js=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  for(const table of [
    'profiles','candidate_experience','candidate_education','candidate_skills',
    'candidate_documents','opportunities','shortlisted_opportunities','cv_drafts',
    'application_packs','applications'
  ]){
    assert.ok(js.includes(table),table);
  }
  assert.ok(js.includes("functionRequest('generate-cv'"));
  assert.ok(js.includes('candidate-documents/'));
  assert.ok(js.includes('state.shortlist.length>=5'));
});

test('opportunity research preserves provenance and never claims automatic submission',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  assert.ok(html.includes('official source'));
  assert.ok(html.includes('verification time'));
  assert.ok(js.includes('It has not been submitted anywhere.'));
  assert.ok(js.includes('Open official source'));
});
