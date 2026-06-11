import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { foodName, servingSize } = await req.json()

    if (!foodName) {
      return new Response(JSON.stringify({ error: 'foodName gerekli' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      return new Response(JSON.stringify({ error: 'Groq API anahtarı yapılandırılmamış' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const prompt = `"${foodName}" için besin değerlerini tahmin et${servingSize ? ` (porsiyon: ${servingSize})` : ''}.
Sadece JSON döndür, başka hiçbir şey yazma:
{"calories":number,"protein_g":number,"carb_g":number,"fat_g":number,"serving_size":string}
Tüm değerler sayı olmalı. serving_size "100g" gibi bir string olmalı.`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return new Response(JSON.stringify({ error: `Groq hatası: ${err}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content ?? ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Geçersiz yanıt formatı' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const nutrition = JSON.parse(jsonMatch[0])

    return new Response(JSON.stringify(nutrition), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
