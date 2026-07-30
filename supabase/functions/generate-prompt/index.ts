import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  try {
    const { promptType, niche, topic, tone, variables } = await req.json();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      const fallback = generateLocalPrompts(promptType, niche, topic, tone);
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are an expert prompt engineer for short-form video content. Generate highly effective AI prompts.`;
    const userPrompt = `Generate 3 detailed AI prompts for ${promptType}.\nNiche: ${niche || "general"}\nTopic: ${topic || "any"}\nTone: ${tone || "engaging"}\nVariables: ${JSON.stringify(variables || {})}\n\nReturn JSON: {"prompts": ["prompt1", "prompt2", "prompt3"], "optimizedPrompt": "best one"}`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const fallback = generateLocalPrompts(promptType, niche, topic, tone);
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await resp.json();
    const content = JSON.parse(aiData.choices[0].message.content);
    return new Response(JSON.stringify(content), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function generateLocalPrompts(type: string, niche: string | null, topic: string | null, tone: string | null) {
  const n = niche || "your niche";
  const t = topic || "your topic";
  const tn = tone || "engaging";
  const prompts = [
    `Create a ${tn} 30-second short video script about ${t} in the ${n} niche. Include a strong hook in the first 3 seconds, 3 key points with visual descriptions, and a clear call-to-action. Format: [HOOK] / [BODY] / [CTA]`,
    `Write a viral short video concept about ${t} for ${n} audience. Specify: visual style, text overlay for each scene, background music mood, and caption text. Keep it fast-paced with scene changes every 3-4 seconds.`,
    `Design a ${tn} short-form video about ${t}. Include: 1) Pattern-interrupt opening 2) Value delivery in 15 seconds 3) Engagement trigger 4) CTA. Specify B-roll suggestions and text overlays for each segment.`,
  ];
  return { prompts, optimizedPrompt: prompts[0] };
}
