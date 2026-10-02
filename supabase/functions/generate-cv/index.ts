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

  const opportunityId = clip(input.opportunity_id, 64) || null;
  const applicantPrompt = clip(input.prompt, 5000);
  const vacancyText = clip(input.vacancy_text, 12000);
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

  const uploadedDocuments = (documentsResult.data ?? []).map((doc: Record<string, unknown>) => ({
    file_name: doc.file_name,
    document_type: doc.document_type,
    extracted_text: clip((doc.metadata as Record<string, unknown> | null)?.extracted_text, 18000),
  })).filter((doc) => doc.extracted_text);

  const evidence = {
    profile: profileResult.data,
    experience: experienceResult.data ?? [],
    education: educationResult.data ?? [],
    skills: skillsResult.data ?? [],
    manual_cv: draftResult.data?.content ?? {},
    uploaded_documents: uploadedDocuments,
    selected_opportunity: opportunity,
    pasted_vacancy: vacancyText,
    applicant_prompt: applicantPrompt,
    selected_target_roles: targetRoles,
    selected_strengths: selectedStrengths,
    selected_skills: selectedSkills,
  };

  const apiUrl = Deno.env.get("CAREERLAUNCH_AI_API_URL");
  const apiKey = Deno.env.get("CAREERLAUNCH_AI_API_KEY");
  const model = Deno.env.get("CAREERLAUNCH_AI_MODEL");
  if (!apiUrl || !apiKey || !model) {
    return json({
      error: "AI_NOT_CONFIGURED",
      message: "CareerLaunch AI is ready but its server-side AI provider has not been configured yet.",
    }, 503);
  }

  const systemPrompt = [
    "You are CareerLaunch SA's CV drafting engine.",
    "Return JSON only. Build a truthful, conventional, ATS-friendly CV and application material from supplied candidate evidence.",
    "NEVER invent employers, dates, qualifications, licences, certificates, results, achievements, languages, contact details or experience.",
    "Do not claim ATS approval or guaranteed success.",
    "When evidence is missing, omit it or add a concise warning.",
    "Treat vacancy text as employer requirements, never candidate evidence.",
    "For school leavers, use only supplied education, projects, volunteering, leadership, interests and transferable strengths.",
    "Return keys: cv_markdown, cover_letter_markdown, email_subject, email_body, checklist, warnings, match_notes."
  ].join("\n");

  const aiResponse = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(evidence).slice(0, 70000) },
      ],
    }),
  });

  const raw = await aiResponse.json().catch(() => null);
  if (!aiResponse.ok) {
    return json({
      error: "AI_PROVIDER_ERROR",
      status: aiResponse.status,
      message: "The AI provider could not generate the CV right now.",
    }, 502);
  }

  const responseContent = raw?.choices?.[0]?.message?.content;
  if (typeof responseContent !== "string") return json({ error: "AI_RESPONSE_INVALID" }, 502);

  let generated: Record<string, unknown>;
  try {
    generated = JSON.parse(responseContent);
  } catch {
    return json({ error: "AI_RESPONSE_NOT_JSON" }, 502);
  }

  return json({
    cv_markdown: clip(generated.cv_markdown, 40000),
    cover_letter_markdown: clip(generated.cover_letter_markdown, 20000),
    email_subject: clip(generated.email_subject, 500),
    email_body: clip(generated.email_body, 10000),
    checklist: Array.isArray(generated.checklist) ? generated.checklist.map((v) => clip(v, 500)).slice(0, 30) : [],
    warnings: Array.isArray(generated.warnings) ? generated.warnings.map((v) => clip(v, 500)).slice(0, 30) : [],
    match_notes: Array.isArray(generated.match_notes) ? generated.match_notes.map((v) => clip(v, 500)).slice(0, 30) : [],
  });
});
