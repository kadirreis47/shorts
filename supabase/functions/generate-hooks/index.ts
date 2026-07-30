import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const HOOK_FORMULAS = [
  { formula: "Curiosity Gap", template: "Most people don't know this about {topic}, but..." },
  { formula: "Bold Claim", template: "This is the most important thing you'll ever learn about {topic}." },
  { formula: "Question Hook", template: "Why does {topic} work the way it does? The answer will shock you." },
  { formula: "Contrarian", template: "Everything you've been told about {topic} is wrong." },
  { formula: "Story Hook", template: "I discovered the truth about {topic} by accident, and it changed everything." },
  { formula: "Stat Shock", template: "90% of people get {topic} completely wrong. Here's the truth." },
  { formula: "List Hook", template: "3 things about {topic} that nobody talks about — #2 is insane." },
  { formula: "Fear Hook", template: "If you don't understand {topic}, you're already losing." },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { topic, niche, tone } = await req.json();

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
              content: `You are a viral YouTube Shorts hook writer. Generate 5 hook variations for the given topic. Each hook should be 1-2 sentences, under 15 seconds of speech. Use proven viral formulas: curiosity gaps, bold claims, contrarian takes, story hooks, stat shocks, fear hooks. Return JSON array of {text, formula, predictedScore (1-100)} sorted by predictedScore descending.`,
            },
            {
              role: "user",
              content: `Topic: ${topic}\nNiche: ${niche ?? "general"}\nTone: ${tone ?? "engaging"}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.9,
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        const hooks = parsed.hooks ?? parsed;
        return new Response(JSON.stringify({ hooks }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fallback: generate locally from templates
    const hooks = HOOK_FORMULAS.slice(0, 5).map((f, i) => ({
      text: f.template.replace(/{topic}/g, topic),
      formula: f.formula,
      predictedScore: 85 - i * 5,
    }));

    return new Response(JSON.stringify({ hooks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
