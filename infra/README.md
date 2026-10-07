# infra — Supabase self-hosted (Mesada)

Stack local: `docker compose` com Postgres, GoTrue, PostgREST, Kong,
Edge Functions e Mailpit. Deploy no cluster: chart Helm em `k8s/`
(`make upgrade-prod`).

## Roteamento / TLS (convenção do cluster)

- O Traefik do cluster **não tem `certResolver` configurado**. Qualquer
  `IngressRoute` com `tls.certResolver` é **descartado inteiro** pelo Traefik
  (`Router uses a nonexistent certificate resolver`) e a rota responde 404.
- Padrão funcional (ex.: `radicale-calendar`): rota no entrypoint **`web`**
  (HTTP puro), **sem bloco `tls`**, com TLS terminado **fora** do cluster
  (proxy reverso).
- O chart segue isso por padrão: `ingress.entrypoints=[web]`, `ingress.tls=false`.
  O template `ingressroute.yaml` só renderiza `tls:` quando habilitado —
  nunca referenciar resolver inexistente.
- URL pública: `https://apimesada.mayconvm.com.br` (TLS no proxy) →
  `http://<node>:80` → Traefik (`web`) → Kong (`:8000`).

## Segredos

Gerados por `node infra/gen-keys.mjs > infra/.env` (nunca commitar).
O `make upgrade-prod` lê `infra/.env` e repassa via `--set`.
