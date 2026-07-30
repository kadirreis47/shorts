import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: clientIdRow } = await supabase
      .from("api_keys")
      .select("value")
      .eq("key", "youtube_client_id")
      .maybeSingle();
    const { data: clientSecretRow } = await supabase
      .from("api_keys")
      .select("value")
      .eq("key", "youtube_client_secret")
      .maybeSingle();

    const clientId = clientIdRow?.value;
    const clientSecret = clientSecretRow?.value;

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "YouTube OAuth credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { channelId, videoId } = await req.json();
    if (!channelId || !videoId) {
      return new Response(
        JSON.stringify({ error: "channelId and videoId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get stored tokens
    const { data: tokenRow } = await supabase
      .from("youtube_tokens")
      .select("*")
      .eq("channel_id", channelId)
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return new Response(
        JSON.stringify({ error: "YouTube account not connected. Connect it in Channels." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let accessToken = tokenRow.access_token;

    // Refresh token if expired
    if (tokenRow.token_expires_at && new Date(tokenRow.token_expires_at) < new Date() && tokenRow.refresh_token) {
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokenRow.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (refreshResponse.ok) {
        const newTokens = await refreshResponse.json();
        accessToken = newTokens.access_token;
        await supabase.from("youtube_tokens").update({
          access_token: newTokens.access_token,
          token_expires_at: new Date(Date.now() + (newTokens.expires_in ?? 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", tokenRow.id);
      }
    }

    // Fetch the video record and its rendered video file
    const { data: video } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .maybeSingle();

    if (!video) {
      return new Response(
        JSON.stringify({ error: "Video not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!video.video_url) {
      return new Response(
        JSON.stringify({ error: "Video has not been rendered yet. Render it first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Download the video file from storage
    const videoPath = video.video_url.replace(/.*\/storage\/v1\/object\/public\/media\//, "");
    const { data: fileData, error: fileError } = await supabase
      .storage
      .from("media")
      .download(videoPath);

    if (fileError || !fileData) {
      return new Response(
        JSON.stringify({ error: "Failed to download video file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const videoBytes = new Uint8Array(await fileData.arrayBuffer());

    // Build YouTube upload metadata
    const title = video.title;
    const description = video.description || video.script || title;
    const tags = video.tags ?? [];
    const metadata = {
      snippet: {
        title,
        description,
        tags,
        categoryId: "22",
        defaultLanguage: "en",
        defaultAudioLanguage: "en",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    };

    const metadataJson = JSON.stringify(metadata);
    const encoder = new TextEncoder();
    const metadataBytes = encoder.encode(metadataJson);

    // Multipart body: metadata + video bytes
    const boundary = "----shortsflow" + Math.random().toString(36).slice(2);
    const beforeMeta = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    );
    const afterMeta = encoder.encode(
      `\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
    );
    const afterVideo = encoder.encode(`\r\n--${boundary}--\r\n`);

    const body = new Uint8Array(
      beforeMeta.length + metadataBytes.length + afterMeta.length + videoBytes.length + afterVideo.length,
    );
    let offset = 0;
    body.set(beforeMeta, offset); offset += beforeMeta.length;
    body.set(metadataBytes, offset); offset += metadataBytes.length;
    body.set(afterMeta, offset); offset += afterMeta.length;
    body.set(videoBytes, offset); offset += videoBytes.length;
    body.set(afterVideo, offset); offset += afterVideo.length;

    const uploadResponse = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(body.length),
        },
        body,
      },
    );

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      return new Response(
        JSON.stringify({ error: `YouTube upload failed: ${uploadResponse.status}`, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const uploadResult = await uploadResponse.json();
    const youtubeVideoId = uploadResult.id;

    // Update video record
    await supabase.from("videos").update({
      youtube_video_id: youtubeVideoId,
      status: "published",
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", videoId);

    // Log activity
    await supabase.from("activity_log").insert({
      type: "publish",
      message: `Published "${title}" to YouTube`,
      channel_id: channelId,
      video_id: videoId,
    });

    return new Response(
      JSON.stringify({ success: true, youtubeVideoId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
