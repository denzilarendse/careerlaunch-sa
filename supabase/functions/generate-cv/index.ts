import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clip(value: unknown, max = 12000) {
  return String(value ?? "").slice(0, max);
}


function cleanList(value: unknown, max = 40) {
  return Array.isArray(value)
    ? value.map((item) => clip(item, 500).trim()).filter(Boolean).slice(0, max)
    : [];
}

function uniqueList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function buildStructuredFallback(evidence: Record<string, unknown>, reason: string) {
  const profile = recordOf(evidence.profile);
  const manual = recordOf(evidence.manual_cv);
  const opportunity = recordOf(evidence.selected_opportunity);
  const experience = Array.isArray(evidence.experience)
    ? evidence.experience.map(recordOf)
    : [];
  const education = Array.isArray(evidence.education)
    ? evidence.education.map(recordOf)
    : [];
  const storedSkills = Array.isArray(evidence.skills)
    ? evidence.skills.map(recordOf)
    : [];

  const fullName = clip(manual.full_name || profile.full_name, 200).trim();
  const email = clip(manual.email || profile.email, 320).trim();
  const phone = clip(manual.phone || profile.phone, 80).trim();
  const altPhone = clip(manual.alternative_phone || profile.alternative_phone, 80).trim();
  const location = clip(
    manual.location ||
      [profile.city, profile.province].map((v) => clip(v, 120).trim()).filter(Boolean).join(", "),
    300,
  ).trim();
  const address = clip(manual.address || profile.address_text, 500).trim();
  const summary = clip(manual.professional_summary || profile.summary, 3000).trim();

  const targetRoles = uniqueList([
    ...cleanList(manual.target_roles, 10),
    ...cleanList(evidence.selected_target_roles, 10),
  ]);
  const targetRole = clip(opportunity.title || targetRoles[0], 240).trim();
  const organization = clip(opportunity.organization, 240).trim();

  const selectedSkills = uniqueList([
    ...cleanList(manual.core_skills, 40),
    ...cleanList(manual.skills, 40),
    ...cleanList(evidence.selected_skills, 40),
    ...storedSkills.map((item) => clip(item.skill_name, 200).trim()).filter(Boolean),
  ]);
  const strengths = uniqueList([
    ...cleanList(manual.strengths, 30),
    ...cleanList(evidence.selected_strengths, 30),
  ]);
  const languages = uniqueList([
    ...cleanList(manual.languages, 20),
    ...cleanList(profile.languages, 20),
  ]);

  const cv: string[] = [];
  cv.push(fullName ? `# ${fullName}` : "# Curriculum Vitae");
  const contacts = [
    email,
    phone,
    altPhone ? `Alternative: ${altPhone}` : "",
    location,
    address,
  ].filter(Boolean);
  if (contacts.length) {
    cv.push("", "## Contact Details", ...contacts);
  }

  if (summary || targetRole) {
    cv.push("", "## Professional Summary");
    cv.push(summary || `Career focus: ${targetRole}.`);
  }

  if (experience.length) {
    cv.push("", "## Work Experience");
    for (const item of experience) {
      const role = clip(item.job_title, 240).trim() || "Role";
      const employer = clip(item.employer, 240).trim();
      const dates = [item.start_date, item.end_date].map((v) => clip(v, 80).trim()).filter(Boolean).join(" – ");
      cv.push(`### ${role}${employer ? ` — ${employer}` : ""}${dates ? ` (${dates})` : ""}`);
      const itemLocation = clip(item.location, 240).trim();
      if (itemLocation) cv.push(itemLocation);
      const description = clip(item.description, 6000).trim();
      if (description) cv.push(description);
      for (const achievement of cleanList(item.achievements, 20)) cv.push(`- ${achievement}`);
    }
  } else {
    const notes = clip(manual.experience_notes, 6000).trim();
    if (notes) cv.push("", "## Projects / Volunteering / Responsibilities", notes);
  }

  if (education.length) {
    cv.push("", "## Education");
    for (const item of education) {
      const qualification = clip(item.qualification, 300).trim() || "Qualification";
      const institution = clip(item.institution, 300).trim();
      cv.push(`### ${qualification}${institution ? ` — ${institution}` : ""}`);
      const field = clip(item.field_of_study, 300).trim();
      if (field) cv.push(field);
      const subjects = cleanList(item.subjects, 30);
      if (subjects.length) cv.push(`Subjects: ${subjects.join(", ")}`);
      const result = clip(item.result_summary, 1000).trim();
      if (result) cv.push(result);
    }
  }

  if (selectedSkills.length) cv.push("", "## Core Skills", ...selectedSkills.map((item) => `- ${item}`));
  if (strengths.length) cv.push("", "## Strengths", ...strengths.map((item) => `- ${item}`));
  if (languages.length) cv.push("", "## Languages", ...languages.map((item) => `- ${item}`));

  const availability = clip(manual.availability || profile.availability, 500).trim();
  if (availability) cv.push("", "## Availability", availability);

  const referenceValues = Array.isArray(manual.references)
    ? manual.references.map((item) => typeof item === "string" ? item : clip(recordOf(item).text, 500)).filter(Boolean)
    : Array.isArray(profile.references)
      ? profile.references.map((item) => typeof item === "string" ? item : clip(recordOf(item).text, 500)).filter(Boolean)
      : [];
  if (referenceValues.length) cv.push("", "## References", ...referenceValues);

  const warnings = [
    reason,
    !fullName ? "Add your full name before submitting this CV." : "",
    !email && !phone ? "Add at least one reliable contact method before submitting." : "",
    !experience.length ? "No formal work experience is currently stored; the draft does not invent any." : "",
    !education.length ? "No education record is currently stored." : "",
    Array.isArray(evidence.uploaded_documents) && evidence.uploaded_documents.length
      ? "Uploaded documents were not automatically interpreted by the structured fallback. Review and add any factual details you want included."
      : "",
  ].filter(Boolean);

  const targetLabel = targetRole
    ? `${targetRole}${organization ? ` at ${organization}` : ""}`
    : "the advertised opportunity";
  const salutation = "Dear Hiring Team,";
  const cover = [
    salutation,
    "",
    `I am applying for ${targetLabel}.`,
    "",
    "My attached CV presents the education, experience and skills that I have provided to CareerLaunch SA. I have kept the application factual and have not added qualifications or experience that are not in my record.",
    "",
    "I would welcome the opportunity to discuss my application further. Thank you for considering my application.",
    "",
    fullName ? `Kind regards,\n${fullName}` : "Kind regards",
  ].join("\n");

  const subject = targetRole
    ? `Application: ${targetRole}${fullName ? ` — ${fullName}` : ""}`
    : `Job application${fullName ? ` — ${fullName}` : ""}`;
  const emailBody = [
    "Dear Hiring Team,",
    "",
    `Please find attached my application for ${targetLabel}.`,
    "My CV and supporting application material are included for your consideration.",
    "",
    "Kind regards,",
    fullName,
    phone,
    email,
  ].filter((line, index, arr) => line !== "" || arr[index - 1] !== "").join("\n").trim();

  return {
    generation_mode: "structured_fallback",
    cv_markdown: cv.join("\n").trim(),
    cover_letter_markdown: cover,
    motivation_letter_markdown: "",
    form_completion_markdown: "",
    email_subject: subject,
    email_body: emailBody,
    checklist: [
      "Open the official vacancy source and confirm the closing date and reference number.",
      "Review every CV statement against your real documents and experience.",
      "Check all mandatory qualifications, licences and experience before submitting.",
      "Attach only the documents requested by the employer.",
      "Submit through the official application route and keep proof of submission.",
    ],
    warnings,
    match_notes: [
      targetRole ? `Draft prepared for: ${targetLabel}.` : "No specific vacancy was selected.",
      "This structured fallback does not infer missing facts or silently copy employer requirements into your CV.",
    ],
  };
}

function extractResponseText(raw: unknown) {
  const root = recordOf(raw);
  if (typeof root.output_text === "string" && root.output_text.trim()) {
    return root.output_text.trim();
  }
  const pieces: string[] = [];
  if (Array.isArray(root.output)) {
    for (const itemValue of root.output) {
      const item = recordOf(itemValue);
      if (!Array.isArray(item.content)) continue;
      for (const partValue of item.content) {
        const part = recordOf(partValue);
        if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string") {
          pieces.push(part.text);
        }
      }
    }
  }
  return pieces.join("\n").trim();
}

function normalizeConversation(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-30).map((itemValue) => {
    const item = recordOf(itemValue);
    const role = item.role === "assistant" ? "assistant" : "user";
    return { role, content: clip(item.content, 4000).trim() };
  }).filter((item) => item.content);
}

function blockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,3})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(host.replaceAll(":", ""))) return true;
  return false;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchVacancyPage(rawUrl: string) {
  let current = new URL(rawUrl);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (!["https:", "http:"].includes(current.protocol) || blockedHostname(current.hostname)) {
      throw new Error("UNSAFE_VACANCY_URL");
    }
    const response = await fetch(current.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "CareerLaunchSA/1.0 vacancy-reader" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("VACANCY_REDIRECT_INVALID");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`VACANCY_FETCH_${response.status}`);
    const length = Number(response.headers.get("content-length") || "0");
    if (length > 1_500_000) throw new Error("VACANCY_PAGE_TOO_LARGE");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("VACANCY_CONTENT_UNSUPPORTED");
    }
    const raw = (await response.text()).slice(0, 1_500_000);
    const text = contentType.includes("html") ? stripHtml(raw) : raw.replace(/\s+/g, " ").trim();
    return {
      source_url: current.toString(),
      source_host: current.hostname,
      vacancy_text: text.slice(0, 24000),
    };
  }
  throw new Error("VACANCY_REDIRECT_LIMIT");
}

function assistantFallback(evidence: Record<string, unknown>) {
  const opportunity = recordOf(evidence.selected_opportunity);
  const conversation = Array.isArray(evidence.conversation) ? evidence.conversation : [];
  const target = clip(opportunity.title || evidence.pasted_vacancy || evidence.applicant_prompt, 220).trim();
  return {
    generation_mode: "structured_fallback",
    assistant_message: target
      ? "I can help build this application. Tell me whether I should use your saved CareerLaunch details or start fresh, and add any important experience, education or achievements that are not already saved."
      : "What role, vacancy, learnership, bursary or scholarship are you applying for? You can name the role, paste the advert, upload it, or provide the official vacancy link.",
    questions: conversation.length
      ? ["Is there anything important in your education, experience, volunteering, projects, licences or achievements that I must include?"]
      : ["What are you applying for?", "Should I use your saved CareerLaunch details or start fresh?"],
    ready_to_generate: Boolean(target),
    missing_items: [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "AUTH_REQUIRED" }, 401);

  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const publishableKey = publishableKeys
    ? JSON.parse(publishableKeys)["default"]
    : Deno.env.get("SUPABASE_ANON_KEY");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!supabaseUrl || !publishableKey) return json({ error: "SUPABASE_CONFIG_MISSING" }, 500);

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return json({ error: "INVALID_SESSION" }, 401);
  const userId = userData.user.id;

  let input: Record<string, unknown> = {};
  try {
    input = await req.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const mode = clip(input.mode, 40) || "generate";
  const opportunityId = clip(input.opportunity_id, 64) || null;
  const applicantPrompt = clip(input.prompt, 5000);
  let vacancyText = clip(input.vacancy_text, 24000);
  const vacancyUrl = clip(input.vacancy_url, 2000);
  const applicationKind = clip(input.application_kind, 80) || "job";
  const useExistingDetails = input.use_existing_details !== false;
  const conversation = normalizeConversation(input.conversation);
  if (mode === "fetch_vacancy") {
    if (!vacancyUrl) return json({ error: "VACANCY_URL_REQUIRED" }, 400);
    try {
      return json(await fetchVacancyPage(vacancyUrl));
    } catch (error) {
      return json({
        error: "VACANCY_FETCH_FAILED",
        message: error instanceof Error ? error.message : "CareerLaunch could not read that vacancy link.",
      }, 400);
    }
  }

  let vacancyFetchNote = "";
  if (vacancyUrl && !vacancyText) {
    try {
      const fetched = await fetchVacancyPage(vacancyUrl);
      vacancyText = fetched.vacancy_text;
    } catch (error) {
      vacancyFetchNote = error instanceof Error ? error.message : "Vacancy link could not be read.";
    }
  }

  const targetRoles = Array.isArray(input.target_roles)
    ? input.target_roles.map((v) => clip(v, 120)).slice(0, 10)
    : [];
  const selectedStrengths = Array.isArray(input.strengths)
    ? input.strengths.map((v) => clip(v, 120)).slice(0, 20)
    : [];
  const selectedSkills = Array.isArray(input.skills)
    ? input.skills.map((v) => clip(v, 120)).slice(0, 30)
    : [];

  const [
    profileResult,
    experienceResult,
    educationResult,
    skillsResult,
    draftResult,
    documentsResult,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("candidate_experience").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("candidate_education").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("candidate_skills").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("cv_drafts").select("content").eq("user_id", userId).maybeSingle(),
    supabase.from("candidate_documents").select("document_type,file_name,metadata,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);

  for (const result of [
    profileResult, experienceResult, educationResult, skillsResult, draftResult, documentsResult,
  ]) {
    if (result.error) return json({ error: "DATA_READ_FAILED", detail: result.error.message }, 400);
  }

  let opportunity: unknown = null;
  if (opportunityId) {
    const result = await supabase.from("opportunities").select("*").eq("id", opportunityId).maybeSingle();
    if (result.error) return json({ error: "OPPORTUNITY_READ_FAILED", detail: result.error.message }, 400);
    opportunity = result.data;
  }

  const documentEvidence = (documentsResult.data ?? []).map((doc: Record<string, unknown>) => ({
    file_name: doc.file_name,
    document_type: doc.document_type,
    extracted_text: clip((doc.metadata as Record<string, unknown> | null)?.extracted_text, 18000),
  })).filter((doc) => doc.extracted_text);

  const evidence = {
    profile: useExistingDetails ? profileResult.data : null,
    experience: useExistingDetails ? (experienceResult.data ?? []) : [],
    education: useExistingDetails ? (educationResult.data ?? []) : [],
    skills: useExistingDetails ? (skillsResult.data ?? []) : [],
    manual_cv: useExistingDetails ? (draftResult.data?.content ?? {}) : {},
    uploaded_documents: useExistingDetails ? documentEvidence : [],
    selected_opportunity: opportunity,
    pasted_vacancy: vacancyText,
    vacancy_url: vacancyUrl,
    vacancy_fetch_note: vacancyFetchNote,
    applicant_prompt: applicantPrompt,
    application_kind: applicationKind,
    use_existing_details: useExistingDetails,
    conversation,
    selected_target_roles: targetRoles,
    selected_strengths: selectedStrengths,
    selected_skills: selectedSkills,
  };

  const apiUrl = Deno.env.get("CAREERLAUNCH_AI_API_URL") ?? "https://api.openai.com/v1/responses";
  const apiKey = Deno.env.get("CAREERLAUNCH_AI_API_KEY");
  const model = Deno.env.get("CAREERLAUNCH_AI_MODEL") ?? "gpt-6-luna";

  if (!apiKey) {
    console.log(JSON.stringify({event:"careerlaunch_generate_cv",mode:"structured_fallback",reason:"missing_provider_key"}));
    return json(buildStructuredFallback(
      evidence as Record<string, unknown>,
      "The external AI provider key is not configured, so CareerLaunch generated a structured evidence-only draft instead."
    ));
  }

  if (mode === "assistant") {
    if (!apiKey) {
      console.log(JSON.stringify({event:"careerlaunch_generate_cv",mode:"assistant_fallback",reason:"missing_provider_key"}));
      return json(assistantFallback(evidence as Record<string, unknown>));
    }

    const assistantSchema = {
      type: "object",
      additionalProperties: false,
      required: ["assistant_message", "questions", "ready_to_generate", "missing_items"],
      properties: {
        assistant_message: { type: "string" },
        questions: { type: "array", items: { type: "string" } },
        ready_to_generate: { type: "boolean" },
        missing_items: { type: "array", items: { type: "string" } },
      },
    };

    const assistantPrompt = `You are CareerLaunch SA's interactive career-application assistant.
Talk naturally like a capable conversational assistant while remaining focused on producing a truthful application.

GOAL
Guide the applicant from an initial request such as "make me a CV" to a complete application package.

BEHAVIOUR
- First establish the target: role, vacancy, advert, official link, learnership, bursary, scholarship or government post.
- Respect use_existing_details. If true, use the saved CareerLaunch evidence and ask only for meaningful gaps. If false, interview the applicant from scratch.
- Ask concise questions. Prefer one to three related questions at a time rather than a long questionnaire.
- If the applicant has no formal work experience, ask about education, projects, volunteering, leadership, practical responsibilities and extracurricular activities without turning them into paid employment.
- Treat statements the applicant gives in the conversation as applicant-provided evidence, but never infer qualifications, dates, employers, licences, achievements or results that were not supplied.
- Treat vacancy requirements only as employer requirements.
- Never promise ATS approval or employment. Use "ATS-friendly".
- For bursaries, scholarships and learnerships, ask what is needed for a truthful motivational letter.
- For government applications, help with Z83 completion and completeness checks, but never sign, initial, consent or make a declaration on the applicant's behalf.
- If an uploaded or linked form requires a handwritten signature or personal declaration, say so clearly.
- Set ready_to_generate true when a useful draft can be produced, even if optional details remain missing. Missing facts must be listed rather than invented.

Return JSON only.`;

    const assistantResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 2500,
        instructions: assistantPrompt,
        input: JSON.stringify(evidence).slice(0, 70000),
        text: {
          format: {
            type: "json_schema",
            name: "careerlaunch_cv_interview",
            schema: assistantSchema,
            strict: true,
          },
        },
      }),
    });

    const rawAssistant = await assistantResponse.json().catch(() => null);
    if (!assistantResponse.ok) {
      console.log(JSON.stringify({event:"careerlaunch_generate_cv",mode:"assistant_fallback",reason:"provider_error",status:assistantResponse.status,model}));
      return json(assistantFallback(evidence as Record<string, unknown>));
    }
    const assistantContent = extractResponseText(rawAssistant);
    try {
      const parsed = JSON.parse(assistantContent);
      console.log(JSON.stringify({event:"careerlaunch_generate_cv",mode:"assistant_ai",model}));
      return json({
        generation_mode: "ai_provider",
        assistant_message: clip(parsed.assistant_message, 6000),
        questions: Array.isArray(parsed.questions) ? parsed.questions.map((v: unknown) => clip(v, 800)).slice(0, 8) : [],
        ready_to_generate: Boolean(parsed.ready_to_generate),
        missing_items: Array.isArray(parsed.missing_items) ? parsed.missing_items.map((v: unknown) => clip(v, 500)).slice(0, 20) : [],
      });
    } catch {
      return json(assistantFallback(evidence as Record<string, unknown>));
    }
  }

  const systemPrompt = `You are CareerLaunch SA's CV drafting engine.
Return JSON only.

OBJECTIVE
Create a truthful, conventional, ATS-friendly South African CV and application material from the supplied candidate evidence.

NON-NEGOTIABLE TRUTH RULES
- NEVER invent employers, dates, qualifications, licences, certificates, academic results, achievements, languages, contact details, experience, references, responsibilities or skills.
- Treat vacancy text and employer requirements only as TARGET REQUIREMENTS, never as candidate evidence.
- Applicant statements in the supplied conversation are applicant-provided evidence. Use them only as stated and do not expand them into unsupported claims.
- If use_existing_details is false, do not import facts from the saved profile, saved CV, stored experience, education, skills or documents.
- If a requirement is unsupported by candidate evidence, do not claim it. Put it in warnings and match_notes instead.
- Do not claim ATS approval, guaranteed screening success, guaranteed interviews or guaranteed employment.
- Never fabricate metrics, percentages or accomplishments to make a bullet sound stronger.

ATS-FRIENDLY STRUCTURE
- Use a simple single-column text-first structure.
- Use conventional headings that applicant tracking systems commonly parse: Contact Details, Professional Summary, Work Experience, Education, Core Skills, Languages, Certifications or Training, Projects or Volunteering, Availability and References when evidence exists.
- Do not use tables, columns, icons, graphics, photos, text boxes, decorative symbols, headers or footers in the generated CV.
- Prefer concise bullets and reverse-chronological work experience when dates are available.
- Keep the CV concise. Aim for about one to two pages worth of content unless the supplied evidence clearly requires more detail.
- Tailor emphasis and terminology to the selected opportunity without changing candidate facts.
- Use vacancy keywords only where the candidate evidence genuinely supports them.

SOUTH AFRICAN JOBSEEKER GUIDANCE
- Keep the CV short, readable, accurate and tailored to the specific vacancy.
- Emphasise education, qualifications, skills, languages, career history, volunteering, positions of responsibility, awards and references only when supplied.
- Cover letters should be concise, generally three to four short paragraphs, and grounded in the same evidence.

APPLICATION PACKAGE MODES
- For ordinary jobs, produce a CV, cover letter and application email.
- For professional/executive applications, use a polished senior tone only when the evidence supports it.
- For bursaries, scholarships and learnerships, produce a motivational letter when the supplied evidence supports one.
- For government applications, include Z83 completion guidance where relevant. Never sign, initial, consent, certify or make a legal declaration for the applicant.
- For uploaded forms, produce a form-completion worksheet using only supplied facts. Mark unanswered mandatory fields as MISSING and tell the applicant where a handwritten signature or declaration is required.
- Never alter the official form's wording or imply that a generated worksheet is the official signed form.

SCHOOL LEAVER / FIRST-JOB MODE
- Lack of formal employment must not block generation.
- Prioritise education, relevant subjects, projects, volunteering, leadership, extracurricular activities, community involvement, practical responsibilities, awards, training and transferable strengths when they are actually present in evidence.
- Do not describe school activities as paid employment.
- Do not manufacture workplace experience for a first-time jobseeker.

OUTPUT QUALITY
- Professional Summary must be specific to the evidence and target, not generic filler.
- Work bullets should use action-oriented language only when supported by the supplied duties or achievements.
- If references are absent, omit the section rather than inventing referees.
- If languages or availability are absent, omit them.
- If the vacancy has mandatory criteria that are not supported, explicitly warn the applicant before submission.

Return exactly these keys:
cv_markdown (string),
cover_letter_markdown (string),
motivation_letter_markdown (string; empty when not relevant),
form_completion_markdown (string; empty when not relevant),
email_subject (string),
email_body (string),
checklist (array of strings),
warnings (array of strings),
match_notes (array of strings).`;

  const responseSchema = {
    type: "object",
    additionalProperties: false,
    required: [
      "cv_markdown",
      "cover_letter_markdown",
      "motivation_letter_markdown",
      "form_completion_markdown",
      "email_subject",
      "email_body",
      "checklist",
      "warnings",
      "match_notes",
    ],
    properties: {
      cv_markdown: { type: "string" },
      cover_letter_markdown: { type: "string" },
      motivation_letter_markdown: { type: "string" },
      form_completion_markdown: { type: "string" },
      email_subject: { type: "string" },
      email_body: { type: "string" },
      checklist: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
      match_notes: { type: "array", items: { type: "string" } },
    },
  };

  const aiResponse = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 12000,
      instructions: systemPrompt,
      input: JSON.stringify(evidence).slice(0, 70000),
      text: {
        format: {
          type: "json_schema",
          name: "careerlaunch_cv_pack",
          schema: responseSchema,
          strict: true,
        },
      },
    }),
  });

  const raw = await aiResponse.json().catch(() => null);
  if (!aiResponse.ok) {
    console.log(JSON.stringify({event:"careerlaunch_generate_cv",mode:"structured_fallback",reason:"provider_error",status:aiResponse.status,model}));
    return json(buildStructuredFallback(
      evidence as Record<string, unknown>,
      `The AI provider was unavailable (status ${aiResponse.status}), so CareerLaunch generated a structured evidence-only draft instead.`
    ));
  }

  const content = extractResponseText(raw);
  if (!content) {
    console.log(JSON.stringify({event:"careerlaunch_generate_cv",mode:"structured_fallback",reason:"invalid_provider_response",model}));
    return json(buildStructuredFallback(
      evidence as Record<string, unknown>,
      "The AI provider returned an invalid response, so CareerLaunch generated a structured evidence-only draft instead."
    ));
  }

  let generated: Record<string, unknown>;
  try {
    generated = JSON.parse(content);
  } catch {
    console.log(JSON.stringify({event:"careerlaunch_generate_cv",mode:"structured_fallback",reason:"provider_response_not_json",model}));
    return json(buildStructuredFallback(
      evidence as Record<string, unknown>,
      "The AI provider response could not be parsed, so CareerLaunch generated a structured evidence-only draft instead."
    ));
  }

  const safe = {
    generation_mode: "ai_provider",
    provider_model: model,
    cv_markdown: clip(generated.cv_markdown, 40000),
    cover_letter_markdown: clip(generated.cover_letter_markdown, 20000),
    motivation_letter_markdown: clip(generated.motivation_letter_markdown, 20000),
    form_completion_markdown: clip(generated.form_completion_markdown, 30000),
    email_subject: clip(generated.email_subject, 500),
    email_body: clip(generated.email_body, 10000),
    checklist: Array.isArray(generated.checklist) ? generated.checklist.map((v) => clip(v, 500)).slice(0, 30) : [],
    warnings: Array.isArray(generated.warnings) ? generated.warnings.map((v) => clip(v, 500)).slice(0, 30) : [],
    match_notes: Array.isArray(generated.match_notes) ? generated.match_notes.map((v) => clip(v, 500)).slice(0, 30) : [],
  };

  console.log(JSON.stringify({event:"careerlaunch_generate_cv",mode:"ai_provider",model,application_kind:applicationKind}));
  return json(safe);
});
