import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const htmlUrl=new URL('../index.html',import.meta.url);
const jsUrl=new URL('../src/main.js',import.meta.url);
const optionsUrl=new URL('../src/career-options.js',import.meta.url);
const netlifyUrl=new URL('../netlify.toml',import.meta.url);
const edgeUrl=new URL('../supabase/functions/generate-cv/index.ts',import.meta.url);

test('careerlaunch shell contains core journeys',async()=>{
  const html=await readFile(htmlUrl,'utf8');
  for(const phrase of ['Professional CV','AI role-specific CVs','Verified opportunities','MATRIC LAUNCHPAD']){
    assert.ok(html.includes(phrase),phrase);
  }
});

test('browser source contains no privileged secrets',async()=>{
  const js=await readFile(jsUrl,'utf8');
  assert.equal(/SERVICE_ROLE|PRIVATE_KEY|ACCESS_TOKEN|API_SECRET|sb_secret_/i.test(js),false);
});

test('live-test signup remains email and password only',async()=>{
  const html=await readFile(htmlUrl,'utf8');
  const js=await readFile(jsUrl,'utf8');
  assert.ok(html.includes('No OTP or email confirmation is required.'));
  assert.equal(/signInWithOtp|verifyOtp|magic.?link/i.test(js),false);
  assert.match(js,/authRequest\('signup',\{email:email\.value\.trim\(\),password:password\.value\}\)/);
  assert.match(js,/grant_type=password/);
});

test('searchable multi-selects support multiple roles strengths skills and Other',async()=>{
  const html=await readFile(htmlUrl,'utf8');
  const options=await readFile(optionsUrl,'utf8');
  for(const id of ['roleSearch','strengthSearch','skillSearchCv','roleOther','strengthOther','skillOtherCv','noExperienceYet','firstJobMode']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  for(const phrase of ['Sales Assistant','Office Administrator','Willingness to learn','Basic computer literacy','Other']){
    assert.ok(options.includes(phrase),phrase);
  }
});

test('manual CV is optional and covers conventional structure',async()=>{
  const html=await readFile(htmlUrl,'utf8');
  for(const id of [
    'manualName','manualPhone','manualAltPhone','manualEmail','manualLocation','manualAddress','manualSummary',
    'manualCoreSkills','manualExperienceList','manualEducationList','manualLanguages','manualAvailability','manualReferences'
  ]){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.ok(html.includes('All fields are optional'));
});

test('documents support multiple private uploads and AI-readable extraction',async()=>{
  const html=await readFile(htmlUrl,'utf8');
  const js=await readFile(jsUrl,'utf8');
  assert.match(html,/id="documentFile"[^>]*multiple/);
  assert.ok(js.includes('candidate_documents'));
  assert.ok(js.includes('candidate-documents/'));
  assert.ok(js.includes('extracted_text'));
  assert.ok(js.includes('pdfjs-dist@6.3.289'));
});

test('manual and AI CVs export PDF DOCX locally and to cloud',async()=>{
  const html=await readFile(htmlUrl,'utf8');
  const js=await readFile(jsUrl,'utf8');
  for(const id of [
    'saveManualPdf','saveManualDocx','saveManualCloudPdf','saveManualCloudDocx',
    'saveAiPdf','saveAiDocx','saveAiCloudPdf','saveAiCloudDocx'
  ]){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.ok(js.includes('jspdf@4.2.1'));
  assert.ok(js.includes("uploadCandidateDocument(file,'generated_cv')"));
});

test('AI CV supports selected or pasted vacancies using authenticated edge function',async()=>{
  const html=await readFile(htmlUrl,'utf8');
  const js=await readFile(jsUrl,'utf8');
  assert.ok(html.includes('id="aiVacancyText"'));
  assert.ok(js.includes("functionRequest('generate-cv'"));
  assert.ok(js.includes("vacancy_text:valueOrNull('#aiVacancyText')"));
  assert.ok(html.includes('ATS-friendly'));
  assert.equal(/ATS approved/i.test(html+js),false);
});

test('shortlist is capped at five and supports role-specific CV generation',async()=>{
  const html=await readFile(htmlUrl,'utf8');
  const js=await readFile(jsUrl,'utf8');
  assert.ok(html.includes('Your five priority applications'));
  assert.ok(js.includes('state.shortlist.length>=5'));
  assert.ok(js.includes('shortlisted_opportunities'));
  assert.ok(js.includes('generateShortlistCvs'));
});

test('research preserves official provenance and submission truthfulness',async()=>{
  const html=await readFile(htmlUrl,'utf8');
  const js=await readFile(jsUrl,'utf8');
  assert.ok(html.includes('official source'));
  assert.ok(html.includes('verification time'));
  assert.ok(js.includes('It has not been submitted anywhere.'));
  assert.ok(js.includes('Open official source'));
});

test('CSP permits pinned browser document libraries and Supabase',async()=>{
  const config=await readFile(netlifyUrl,'utf8');
  assert.ok(config.includes('https://cdn.jsdelivr.net'));
  assert.ok(config.includes('worker-src'));
  assert.ok(config.includes('https://rqyvfbuvdhbtwakkqnok.supabase.co'));
});


test('sign out revokes the remote session before clearing local state',async()=>{
  const js=await readFile(jsUrl,'utf8');
  assert.ok(js.includes('/auth/v1/logout'));
  assert.ok(js.includes('await revokeSession(session)'));
  assert.ok(js.includes('localStorage.removeItem(SESSION_KEY)'));
});

test('build emits a release identity for exact deployment verification',async()=>{
  const build=await readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  assert.ok(build.includes("release.json"));
  assert.ok(build.includes("GITHUB_SHA"));
  assert.ok(build.includes("generated_at"));
});


test('structured fallback stays truthful when AI provider is unavailable',async()=>{
  const edge=await readFile(edgeUrl,'utf8');
  const js=await readFile(jsUrl,'utf8');
  assert.ok(edge.includes('buildStructuredFallback'));
  assert.ok(edge.includes('generation_mode: "structured_fallback"'));
  assert.ok(edge.includes('does not infer missing facts'));
  assert.ok(js.includes("generation_mode==='structured_fallback'"));
  assert.ok(js.includes('Structured evidence-only CV draft'));
});
