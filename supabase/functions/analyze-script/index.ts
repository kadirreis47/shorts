import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { script, hook, niche } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: apiKeyRow } = await supabase
      .from("api_keys")
      .select("value")
      .eq("key", "openai")
      .maybeSingle();

    const openaiKey = apiKeyRow?.value;

    if (openaiKey) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a YouTube Shorts retention expert. Analyze the given script for viewer retention potential. Score each category 0-100: retention_score (will viewers watch to the end?), pacing_score (is the rhythm tight enough?), emotion_score (does it evoke feeling?), hook_strength (does the first 3 seconds grab attention?). Also provide 3-5 specific improvement suggestions as {type: "hook"|"pacing"|"emotion"|"clarity"|"cta", text, severity: "low"|"medium"|"high"} and 2-3 strengths as string array. Return JSON: {retention_score, pacing_score, emotion_score, hook_strength, suggestions: [...], strengths: [...]}.`,
            },
            {
              role: "user",
              content: `Script: ${script}\nHook: ${hook ?? "N/A"}\nNiche: ${niche ?? "general"}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const analysis = JSON.parse(content);
        return new Response(JSON.stringify(analysis), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fallback: basic heuristic analysis
    const words = script.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const sentences = script.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const avgSentenceLength = wordCount / Math.max(sentences.length, 1);
    const hasQuestion = /\?/.test(script);
    const hasNumbers = /\d/.test(script);
    const hasEmoji = /[\u{1F300}-\u{1FAFF}]/u.test(script);

    const retentionScore = Math.min(85, 50 + (hasNumbers ? 10 : 0) + (hasQuestion ? 15 : 0) + (avgSentenceLength < 15 ? 10 : 0));
    const pacingScore = avgSentenceLength < 12 ? 85 : avgSentenceLength < 18 ? 70 : 50;
    const emotionScore = Math.min(80, 40 + (hasQuestion ? 20 : 0) + (hasEmoji ? 10 : 0));
    const hookStrength = hook ? (hook.length < 100 ? 80 : 60) : 50;

    const suggestions: Array<{ type: string; text: string; severity: string }> = [];
    if (avgSentenceLength > 18) suggestions.push({ type: "pacing", text: "Shorten your sentences for faster delivery — aim for 12 words or fewer per sentence.", severity: "high" });
    if (!hasQuestion) suggestions.push({ type: "hook", text: "Add a question in the first 3 seconds to create curiosity.", severity: "medium" });
    if (!hasNumbers) suggestions.push({ type: "emotion", text: "Include specific numbers or statistics to boost credibility and engagement.", severity: "low" });
    if (wordCount > 200) suggestions.push({ type: "pacing", text: "Script may be too long for a Short — consider trimming to under 200 words.", severity: "medium" });
    if (!hook) suggestions.push({ type: "hook", text: "Add a dedicated hook separate from the main script.", severity: "high" });

    return new Response(JSON.stringify({
      retention_score: retentionScore,
      pacing_score: pacingScore,
      emotion_score: emotionScore,
      hook_strength: hookStrength,
      suggestions,
      strengths: ["Clear topic focus", "Structured narrative flow"],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
