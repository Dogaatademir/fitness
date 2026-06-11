import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type RequestBody =
  | {
      mode: 'activity'
      activityName: string
      durationMinutes: number
      weightKg: number
      ageYears: number
    }
  | {
      mode: 'workout'
      weightKg: number
      heightCm: number
      ageYears: number
      durationMinutes: number
      exercises: Array<{
        name: string
        type: string
        sets: Array<{
          weight_kg?: number
          reps?: number
          duration_minutes?: number
          distance_km?: number
          held_seconds?: number
        }>
      }>
    }

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      return new Response(JSON.stringify({ error: 'Groq API anahtarı yapılandırılmamış' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let prompt: string

    if (body.mode === 'activity') {
      prompt = `Bir kişi ${body.durationMinutes} dakika "${body.activityName}" yaptı.
Kişi bilgileri: ${body.weightKg} kg, ${body.ageYears} yaş.
MET yöntemini kullan: kalori = MET × kg × saat
Bu aktivite için gerçekçi bir MET değeri seç ve kaloriyi hesapla.
Sadece JSON döndür, başka hiçbir şey yazma:
{"calories_burned":number,"met_value":number,"notes":"kısa açıklama"}
Tüm sayısal değerler number olmalı.`
    } else {
      const exerciseLines = body.exercises.map(ex => {
        const setLines = ex.sets.map(s => {
          const parts = []
          if (s.weight_kg) parts.push(`${s.weight_kg}kg`)
          if (s.reps) parts.push(`${s.reps} tekrar`)
          if (s.duration_minutes) parts.push(`${s.duration_minutes} dk`)
          if (s.distance_km) parts.push(`${s.distance_km} km`)
          if (s.held_seconds) parts.push(`${s.held_seconds}s`)
          return parts.join(', ')
        }).filter(Boolean).join(' | ')
        return `- ${ex.name} (${ex.type}): ${setLines}`
      }).join('\n')

      prompt = `Bir kişi ${body.durationMinutes} dakikalık antrenman yaptı.
Kişi bilgileri: ${body.weightKg} kg, ${body.heightCm} cm boy, ${body.ageYears} yaş.
Antrenman içeriği:
${exerciseLines}
Bu antrenman sırasında yakılan kaloriyi hesapla (EPOC hariç, sadece egzersiz süresi).
MET yöntemini kullan; kardiyo için spesifik MET, ağırlık antrenmanı için ~5 MET.
Sadece JSON döndür, başka hiçbir şey yazma:
{"calories_burned":number,"notes":"kısa açıklama"}
calories_burned bir sayı olmalı.`
    }

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
        max_tokens: 150,
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

    const result = JSON.parse(jsonMatch[0])

    // Ağırlık antrenmanı için EPOC etkisi: +%10 (literatür: %6–15 arası)
    if (body.mode === 'workout' && typeof result.calories_burned === 'number') {
      const hasStrength = body.exercises.some(e => e.type === 'strength' || e.type === 'bodyweight')
      if (hasStrength) {
        result.calories_burned = Math.round(result.calories_burned * 1.10)
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
