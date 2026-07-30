import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { name, style, voiceId } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apiKeyRow } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    // Generate avatar face image
    let faceUrl = `https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg?auto=compress&cs=tinysrgb&w=400`;

    if (openaiKey) {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: `Professional headshot of a ${style ?? "professional"} AI presenter, clean background, looking at camera, high quality, portrait orientation`,
          n: 1,
          size: "1024x1024",
        }),
      });
      const data = await response.json();
      if (data.data?.[0]?.url) faceUrl = data.data[0].url;
    }

    const { data: avatar } = await supabase.from("avatar_presets").insert({
      name, face_image_url: faceUrl, voice_id: voiceId, style: style ?? "professional", is_custom: true,
    }).select().single();

    return new Response(JSON.stringify({ avatar }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
