#!/usr/bin/env python3
"""Gera k8s/templates/functions-code-configmap.yaml a partir de supabase/functions/.

Chaves achatadas: '/' vira '___' (ConfigMap nao aceita '/' em keys).
O initContainer do Deployment reconverte e reconstroi a arvore num emptyDir.
Saida deterministica (arquivos ordenados) para diffs limpos no git.

Uso: make functions-code
"""
import hashlib
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "supabase" / "functions"
OUT = REPO / "k8s" / "templates" / "functions-code-configmap.yaml"
SEP = "___"


def enc(rel: str) -> str:
    return rel.replace("/", SEP)


def main() -> int:
    if not SRC.is_dir():
        print(f"ERRO: {SRC} nao existe", file=sys.stderr)
        return 1
    files = sorted(p for p in SRC.rglob("*") if p.is_file())
    if not files:
        print("ERRO: nenhuma funcao encontrada", file=sys.stderr)
        return 1
    digest = hashlib.sha256()
    entries = []
    for p in files:
        rel = p.relative_to(SRC).as_posix()
        data = p.read_bytes()
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            print(f"ERRO: {rel} nao e UTF-8", file=sys.stderr)
            return 1
        digest.update(rel.encode() + b"\0" + data)
        indented = "\n".join("    " + ln if ln.strip() else "" for ln in text.splitlines())
        entries.append(f"  {enc(rel)}: |\n{indented}\n")
    code_hash = digest.hexdigest()[:12]
    body = (
        "# GERADO por make functions-code. NAO editar a mao.\n"
        f"# code-hash: {code_hash}\n"
        "apiVersion: v1\n"
        "kind: ConfigMap\n"
        "metadata:\n"
        '  name: {{ include "mesada.fullname" . }}-functions\n'
        "  labels:\n"
        '    {{- include "mesada.labels" . | nindent 4 }}\n'
        "  annotations:\n"
        f"    mesada/code-hash: {code_hash}\n"
        "data:\n" + "".join(entries)
    )
    OUT.write_text(body)
    print(f"OK: {len(files)} arquivos -> {OUT.relative_to(REPO)} (hash {code_hash})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
