import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { comments, videoId, brandVoice } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: apiKeyRow } = await supabase.from("api_keys").select("value").eq("key", "openai").maybeSingle();
    const openaiKey = apiKeyRow?.value;

    if (openaiKey && comments?.length > 0) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: `You are an AI community manager. Draft replies to YouTube comments in a ${brandVoice ?? "friendly and professional"} tone. For each comment, return JSON: {replies: [{comment_id, drafted_reply, sentiment ("positive"|"neutral"|"negative"|"question")}]}. Keep replies under 2 sentences, authentic, and engaging.` },
            { role: "user", content: `Comments: ${JSON.stringify(comments)}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.8,
        }),
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content);
        const replies = result.replies ?? [];
        if (videoId) {
          for (const r of replies) {
            const comment = comments.find((c: any) => c.id === r.comment_id);
            await supabase.from("auto_replies").insert({
              video_id: videoId, comment_id: r.comment_id, comment_text: comment?.text ?? "",
              comment_author: comment?.author ?? "", drafted_reply: r.drafted_reply, sentiment: r.sentiment,
            });
          }
        }
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback
    const replies = (comments ?? []).map((c: any) => ({
      comment_id: c.id, drafted_reply: "Thanks for watching! Appreciate the feedback.", sentiment: "neutral",
    }));
    return new Response(JSON.stringify({ replies }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
