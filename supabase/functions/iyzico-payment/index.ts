import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const { price, cartItems, buyer } = body;

    // TODO: Insert Iyzico API Keys via Deno.env.get('IYZICO_API_KEY')
    // TODO: Construct Iyzico request logic here
    
    // Taslak donus
    return new Response(
      JSON.stringify({ 
        message: "Iyzico odeme baslatildi (Taslak)",
        status: "success",
        price,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
});
