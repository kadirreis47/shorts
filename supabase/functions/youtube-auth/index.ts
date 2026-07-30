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
        JSON.stringify({ error: "YouTube OAuth credentials not configured. Add them in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const channelId = url.searchParams.get("state");
    const redirectUri = `${url.origin}/functions/v1/youtube-auth`;

    // Step 1: Generate auth URL
    if (req.method === "GET" && !code) {
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", channelId || "");

      return new Response(
        JSON.stringify({ authUrl: authUrl.toString() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Exchange code for tokens
    if (code) {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        return new Response(
          JSON.stringify({ error: "Token exchange failed", detail: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const tokens = await tokenResponse.json();

      // Get channel info
      const channelResponse = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );

      let ytChannelId: string | null = null;
      let ytChannelName: string | null = null;
      if (channelResponse.ok) {
        const channelData = await channelResponse.json();
        const ytChannel = channelData.items?.[0];
        ytChannelId = ytChannel?.id ?? null;
        ytChannelName = ytChannel?.snippet?.title ?? null;
      }

      // Store tokens
      if (channelId) {
        await supabase.from("youtube_tokens").upsert(
          {
            channel_id: channelId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
            youtube_channel_id: ytChannelId,
            youtube_channel_name: ytChannelName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "channel_id" },
        );
      }

      // Return an HTML page that closes the popup and notifies the parent
      return new Response(
        `<!DOCTYPE html><html><body><script>
          window.opener?.postMessage({ type: 'youtube-connected', channelId: '${channelId}', youtubeChannelName: ${JSON.stringify(ytChannelName)} }, '*');
          window.close();
        </script><p style="font-family:sans-serif;padding:2rem;text-align:center">YouTube connected! You can close this window.</p></body></html>`,
        { headers: { ...corsHeaders, "Content-Type": "text/html" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "No code provided" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
