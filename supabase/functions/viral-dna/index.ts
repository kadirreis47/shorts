import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { niche } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apiKeyRow } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    if (openaiKey) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: `You are a viral content DNA extraction AI. Analyze the top-performing Shorts in the given niche and extract their structural formula. Return JSON: {formulas: [{formula_name, hook_length_seconds, scene_count, pacing_pattern, emotional_arc, cta_placement, avg_retention, avg_views, extracted_dna: {hook_formula, scene_structure, emotional_beats, transition_pattern}}]}. Provide 3-5 proven formulas.` },
            { role: "user", content: `Niche: ${niche ?? "general"}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        // Store formulas
        const formulas = result.formulas ?? [];
        for (const f of formulas) {
          await supabase.from("viral_formulas").insert({ niche, ...f });
        }
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback
    const formulas = [
      { formula_name: "Curiosity Loop", hook_length_seconds: 3, scene_count: 5, pacing_pattern: "Fast-medium-fast", emotional_arc: "Curiosity-Surprise-Satisfaction", cta_placement: "Last 5 seconds", avg_retention: 72, avg_views: 100000, extracted_dna: { hook_formula: "Question + bold promise", scene_structure: "Hook → proof → twist → payoff → CTA", emotional_beats: ["curiosity", "tension", "relief"], transition_pattern: "Quick cuts on beats" } },
      { formula_name: "Story Arc", hook_length_seconds: 5, scene_count: 6, pacing_pattern: "Medium build-up", emotional_arc: "Empathy-Tension-Resolution", cta_placement: "Last 3 seconds", avg_retention: 68, avg_views: 80000, extracted_dna: { hook_formula: "Personal story opener", scene_structure: "Setup → conflict → struggle → lesson → CTA", emotional_beats: ["empathy", "tension", "triumph"], transition_pattern: "Crossfade on emotional shifts" } },
      { formula_name: "List Bomb", hook_length_seconds: 2, scene_count: 5, pacing_pattern: "Rapid fire", emotional_arc: "Interest-Surprise-Action", cta_placement: "After last item", avg_retention: 65, avg_views: 60000, extracted_dna: { hook_formula: "Number + bold claim", scene_structure: "Hook → item 1 → item 2 → item 3 → CTA", emotional_beats: ["interest", "surprise", "urgency"], transition_pattern: "Hard cuts every 8 seconds" } },
    ];
    return new Response(JSON.stringify({ formulas }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
