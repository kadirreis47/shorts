import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const LANGUAGES: Record<string, string> = {
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { srt, targetLanguage } = await req.json();

    if (!srt || !targetLanguage) {
      return new Response(
        JSON.stringify({ error: "Missing srt or targetLanguage" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const langName = LANGUAGES[targetLanguage] ?? targetLanguage;

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
      // Parse SRT entries
      const entries = srt.split(/\n\n+/).filter((e) => e.trim());
      const subtitles = entries.map((entry) => {
        const lines = entry.split("\n");
        const timeLine = lines[1] ?? "";
        const text = lines.slice(2).join(" ");
        return { timeLine, text };
      });

      // Batch translate all subtitle texts
      const textsToTranslate = subtitles.map((s) => s.text);
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
              content: `You are a professional subtitle translator. Translate each subtitle line into ${langName}. Keep translations natural and concise, matching the original tone. Return a JSON array of translated strings, one per input line, in the same order. Do not add numbering or extra formatting.`,
            },
            {
              role: "user",
              content: JSON.stringify(textsToTranslate),
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        const translations: string[] = parsed.translations ?? parsed;
        const translatedSrt = subtitles.map((s, i) => `${i + 1}\n${s.timeLine}\n${translations[i] ?? s.text}\n`).join("\n");
        return new Response(JSON.stringify({ translatedSrt, language: langName }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fallback: return original with a note
    return new Response(JSON.stringify({
      translatedSrt: srt,
      language: langName,
      note: "Translation requires OpenAI API key",
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
