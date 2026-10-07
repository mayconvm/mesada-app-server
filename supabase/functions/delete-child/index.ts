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
    const { child_id } = await req.json()
    if (!child_id) {
      throw new Error('Informe o child_id do dependente.')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Cabeçalho Authorization faltando.')
    }
    const jwt = authHeader.replace('Bearer ', '')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const { data: { user: parentUser }, error: getParentError } = await supabaseClient.auth.getUser(jwt)

    if (getParentError || !parentUser) {
      throw new Error('Não autorizado. Token de pai/mãe ausente ou inválido. Detalhe: ' + getParentError?.message);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Só o responsável vinculado pode excluir (e só dependentes, nunca gestores).
    const { data: target, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, parent_id')
      .eq('id', child_id)
      .single()

    if (targetError || !target) {
      throw new Error('Dependente não encontrado.')
    }
    if (target.role !== 'child' || target.parent_id !== parentUser.id) {
      throw new Error('Não autorizado a excluir este perfil.')
    }

    // ON DELETE CASCADE limpa profiles/accounts/transactions/child_goals/dreams.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(child_id)
    if (deleteError) throw new Error('Erro ao excluir login: ' + deleteError.message)

    return new Response(
      JSON.stringify({ message: "Dependente excluído com sucesso." }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
