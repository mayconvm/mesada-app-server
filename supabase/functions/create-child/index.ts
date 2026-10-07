import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Nova alteração: agora recebemos o "role" vindo do Frontend (child ou parent)
    const { name, email, password, role = 'child' } = await req.json()

    // 1. Pegamos o JWT do cabeçalho
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Cabeçalho Authorization faltando.')
    }
    const jwt = authHeader.replace('Bearer ', '')

    // 2. Cliente do Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Validamos QUEM FEZ a requisição através do JWT
    const { data: { user: parentUser }, error: getParentError } = await supabaseClient.auth.getUser(jwt)

    if (getParentError || !parentUser) {
      throw new Error('Não autorizado. Token de pai/mãe ausente ou inválido. Detalhe: ' + getParentError?.message);
    }

    // 3. Cliente de ADMIN
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Criamos a conta Admin (Bypass no fluxo tradicional)
    const { data: newAuthData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto confima pra evitar fricção
      user_metadata: {
        display_name: name,
        role: role
      }
    })

    if (createError) throw new Error('Erro ao criar usuário no Auth: ' + createError.message);

    if (newAuthData?.user) {
        // Se for child, atrelamos ao ID de quem requisitou (o Pai original). Se for parent auxiliar, deixamos null (ou futuro family_id)
        const newParentId = role === 'child' ? parentUser.id : null;

        // Upsert (não update): o perfil pode ainda não existir caso o trigger
        // handle_new_user não tenha rodado; assim o vínculo nunca se perde em silêncio.
        const { error: profileUpdateError } = await supabaseAdmin
          .from('profiles')
          .upsert({
             id: newAuthData.user.id,
             display_name: name,
             role: role,
             parent_id: newParentId,
          }, { onConflict: 'id' });
          
        if (profileUpdateError) {
           throw new Error('Conta criada, mas falha ao atualizar perfil: ' + profileUpdateError.message);
        }
    }

    return new Response(
      JSON.stringify({ message: "Dependente criado e atrelado com sucesso ao seu perfil." }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
