import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { script, videoId } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Analyze script for silence points and filler words
    const words = script.split(/\s+/);
    const fillerWords = ["um", "uh", "like", "you know", "so", "basically", "actually", "literally"];
    let fillerCount = 0;
    const removedSegments: Array<{ start: number; end: number; type: string; text: string }> = [];

    // Estimate timestamps based on word count (avg 150 words per minute = 2.5 words/sec)
    const wordsPerSecond = 2.5;
    let currentTime = 0;
    for (const word of words) {
      const duration = word.length / 10; // rough estimate
      const cleanWord = word.toLowerCase().replace(/[.,!?]/g, "");
      if (fillerWords.includes(cleanWord)) {
        fillerCount++;
        removedSegments.push({ start: currentTime, end: currentTime + duration, type: "filler", text: word });
      }
      // Simulate silence detection (pauses > 0.5s between sentences)
      if (/[.!?]/.test(word)) {
        removedSegments.push({ start: currentTime + duration, end: currentTime + duration + 0.7, type: "silence", text: "[pause]" });
      }
      currentTime += duration + 0.1;
    }

    const originalDuration = currentTime;
    const removedTime = removedSegments.reduce((sum, s) => sum + (s.end - s.start), 0);
    const cleanedDuration = originalDuration - removedTime;

    const { data: job } = await supabase.from("silence_removal_jobs").insert({
      video_id: videoId, original_duration: originalDuration, cleaned_duration: cleanedDuration,
      removed_segments: removedSegments, filler_word_count: fillerCount, status: "ready",
    }).select().single();

    return new Response(JSON.stringify({
      jobId: job.id, originalDuration, cleanedDuration, removedSegments: removedSegments,
      fillerWordCount: fillerCount, timeSaved: removedTime,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
