import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ScriptRequest {
  topic: string;
  niche?: string;
  tone?: string;
  duration?: number;
  hookFormula?: string;
  bodyStructure?: string;
  cta?: string;
}

// Built-in script templates — no API key needed, fully free and unlimited
const HOOK_TEMPLATES = [
  "Did you know that {topic} can change everything?",
  "Here's what nobody tells you about {topic}...",
  "Stop scrolling. This about {topic} will blow your mind.",
  "I tested {topic} for 30 days. Here's what happened.",
  "The truth about {topic} that they don't want you to know.",
  "Everyone is wrong about {topic}. Here's why.",
  "This one trick about {topic} changed my life.",
  "You're doing {topic} wrong. Let me show you the right way.",
  "What if everything you knew about {topic} was a lie?",
  "The secret to {topic} that experts won't share.",
];

const BODY_TEMPLATES = [
  "First, understand the basics. {topic} works because of three key principles. Principle one: consistency matters more than intensity. Principle two: small daily actions compound over time. Principle three: tracking your progress keeps you motivated.",
  "Here's the breakdown. Step one — start small. Don't try to master {topic} all at once. Step two — focus on one thing at a time. Multitasking kills progress. Step three — measure your results weekly so you can adjust.",
  "Let me explain. {topic} isn't complicated, but most people overthink it. The key is simplicity. Focus on what actually moves the needle. Cut the noise. Double down on what works. That's how you win.",
  "The research is clear. Studies show that {topic} delivers results when done consistently. Not perfectly — just consistently. The people who succeed aren't the ones who never fail. They're the ones who never quit.",
  "Think about it this way. {topic} is like building a house. You need a solid foundation first. Then layer by layer, you build up. Skip steps and the whole thing collapses. Take your time and do it right.",
];

const CTA_TEMPLATES = [
  "Follow for more tips like this!",
  "Like and subscribe if this helped you!",
  "Save this video and come back to it later!",
  "Drop a comment with your thoughts!",
  "Share this with someone who needs to see it!",
  "Hit follow for daily tips on this and more!",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template: string, topic: string): string {
  return template.replace(/\{topic\}/g, topic);
}

function generateScriptLocally(topic: string, niche: string, tone: string, duration: number) {
  const hook = fillTemplate(pickRandom(HOOK_TEMPLATES), topic);
  const body = fillTemplate(pickRandom(BODY_TEMPLATES), topic);
  const cta = pickRandom(CTA_TEMPLATES);

  // Build title
  const titleTemplates = [
    `${topic}: The Complete Guide`,
    `The Truth About ${topic}`,
    `${topic} — What You Need to Know`,
    `How to Master ${topic}`,
    `${topic} Explained in ${duration} Seconds`,
  ];
  const title = pickRandom(titleTemplates);

  // Split body+hook+cta into scenes
  const fullScript = `${hook} ${body} ${cta}`;
  const sentences = fullScript.match(/[^.!?]+[.!?]+/g) ?? [fullScript];

  // Group sentences into scenes of ~5 seconds each
  const sceneCount = Math.max(3, Math.min(6, Math.ceil(duration / 5)));
  const sentencesPerScene = Math.ceil(sentences.length / sceneCount);
  const scenes = [];
  for (let i = 0; i < sentences.length; i += sentencesPerScene) {
    const sceneSentences = sentences.slice(i, i + sentencesPerScene).join(" ").trim();
    if (sceneSentences) {
      scenes.push({
        text: sceneSentences,
        duration: Math.ceil(duration / sceneCount),
        visual: topic,
        keywords: [topic, niche || topic, `${topic} tips`].filter(Boolean).slice(0, 3),
      });
    }
  }

  return { title, hook, script: fullScript, cta, scenes };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body: ScriptRequest = await req.json();
    const {
      topic,
      niche = "",
      tone = "engaging",
      duration = 30,
    } = body;

    if (!topic?.trim()) {
      return new Response(
        JSON.stringify({ error: "Topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if OpenAI key exists — if so, use it for better quality
    const { data: apiKeyRow } = await supabase
      .from("api_keys")
      .select("value")
      .eq("key", "openai")
      .maybeSingle();

    const openaiKey = apiKeyRow?.value;

    if (openaiKey) {
      // Use OpenAI for higher quality scripts
      const durationGuidance =
        duration <= 15
          ? "Keep it punchy and fast — 3-4 sentences max."
          : duration <= 30
            ? "Aim for 5-7 sentences. Each sentence should be short and impactful."
            : "Aim for 8-12 sentences. Build a mini-narrative with a clear arc.";

      const systemPrompt = `You are an elite viral YouTube Shorts script writer. You specialize in writing scripts that maximize retention, engagement, and watch time. You understand the psychology of what makes people stop scrolling and watch to the end.

CORE PRINCIPLES:
- The first 3 seconds determine everything. Open with a pattern interrupt: a counterintuitive fact, a bold claim, a curiosity gap, or a surprising question.
- Use open loops early ("...and the last one changed everything") to drive completion.
- Keep sentences SHORT. 5-12 words max per sentence. Punchy. Rhythmic.
- Use concrete numbers, specific examples, and vivid imagery — not vague generalities.
- Create emotional peaks every 5-7 seconds to prevent drop-off.
- The body should deliver on the hook's promise with 2-4 rapid-fire value points.
- End with a strong CTA that feels natural, not forced.

STRUCTURAL REQUIREMENTS:
- ${durationGuidance}
- Total target duration: ~${duration} seconds when read aloud at normal pace.
- No emojis. No stage directions. No "[music]" or "[visual]" tags. Just the spoken words.

SCENE STRUCTURE:
- Split the script into 3-8 scenes. Each scene is a visual segment.
- Each scene's "text" is the exact spoken lines for that segment.
- Each scene's "duration" is the seconds that segment takes (they should sum to ~${duration}).
- Each scene's "visual" is a concrete, searchable image/video concept (e.g., "person running at sunrise", "close-up of coffee brewing", "city skyline at night"). Make these specific and cinematic.
- Each scene's "keywords" are 2-4 English search terms for finding stock footage (e.g., ["morning routine", "sunrise", "productivity"]).

VIRAL HOOK FORMULAS (use one):
- "Nobody talks about this, but..." + surprising claim
- "I wish someone told me this about {topic} sooner."
- "This is going to sound crazy, but..." + counterintuitive statement
- "Here's what {number} days of {topic} taught me."
- "The reason you're struggling with {topic} isn't what you think."

Return JSON in this exact shape:
{"title": "...", "hook": "...", "script": "...", "cta": "...", "scenes": [{"text": "...", "duration": N, "visual": "...", "keywords": ["...", "..."]}]}

The "title" should be under 70 characters, emotionally compelling, and click-optimized.
The "hook" is the first 1-2 sentences (the scroll-stopper).
The "script" is the complete spoken script (hook + body + cta combined).
The "cta" is the final call to action line.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Write a ${duration}-second YouTube Shorts script about: ${topic}${niche ? ` (niche: ${niche})` : ""}. Tone: ${tone}.`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.8,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          try {
            const parsed = JSON.parse(content);
            return new Response(JSON.stringify(parsed), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } catch {
            // Fall through to local generation
          }
        }
      }
      // If OpenAI fails, fall through to local generation
    }

    // Local template-based generation — free, unlimited, no API key needed
    const result = generateScriptLocally(topic, niche, tone, duration);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
