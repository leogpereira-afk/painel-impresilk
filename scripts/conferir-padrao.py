#!/usr/bin/env python3
"""Confere se os sistemas da Impresilk estão dentro do padrão.

O padrão está escrito em Dre/PADRAO-DOS-SISTEMAS.md. Aqui ele vira pergunta que
se responde BATENDO nas portas que estão no ar — não lendo código.

    export SBP=sbp_...        # token do Supabase (Account → Access Tokens)
    python3 scripts/conferir-padrao.py

O que ele faz: cria UMA conta descartável (zz_padrao) com papel em todos os
sistemas, pede os crachás pela entrada única, e pergunta em cada porta:

    1. o crachá do próprio sistema abre?        deve abrir
    2. o crachá de OUTRO sistema abre?          deve recusar
    3. sem credencial nenhuma abre?             deve recusar

Depois confere que conta desativada não recebe crachá, que papel desativado não
recebe, e que nenhum config.js público carrega segredo. Apaga tudo no fim,
inclusive o usuário no Supabase Auth.

Sai com código 1 se qualquer coisa estiver fora do padrão.
"""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

PROJ = os.environ.get("SUPABASE_PROJECT_REF", "heveemylixartyijxewh")
FN = f"https://{PROJ}.supabase.co/functions/v1"
MGMT = f"https://api.supabase.com/v1/projects/{PROJ}"

# sistema -> (function de dados, papel mais baixo, ação de leitura)
PORTAS = {
    "pops": ("pops-sync", "equipe", "list"),
    "brief": ("brief-sync", "medidor", "list"),
    "pcp": ("pcp-sync", "montagem", "list"),
    "dre": ("dre-sync", "equipe", "list"),
    # o Compras tem gate duplo (token público do fornecedor + crachá); a
    # conferência dele é a do token, feita à parte
}
BUNDLES = {
    "pops": "https://leogpereira-afk.github.io/pops-fabricacao/config.js",
    "brief": "https://leogpereira-afk.github.io/brief-medicao/config.js",
    "pcp": "https://leogpereira-afk.github.io/impresilk/config.js",
    "dre": "https://leogpereira-afk.github.io/impresilk-dre/config.js",
}
USUARIO, SENHA = "zz_padrao", "conferencia-do-padrao-707"


def http(url, dados=None, metodo=None, cab=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    req = urllib.request.Request(url, data=corpo, method=metodo or ("POST" if corpo else "GET"))
    # Sem User-Agent próprio a Management API responde 1010 (bloqueio da Cloudflare).
    req.add_header("User-Agent", "curl/8.7.1")
    for k, v in (cab or {}).items():
        req.add_header(k, v)
    if corpo:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t.strip().startswith(("{", "[")) else {})
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try:
            return e.code, json.loads(t)
        except Exception:
            return e.code, {"_": t[:160]}
    except Exception as e:  # rede
        return 0, {"_": str(e)[:80]}


def main() -> int:
    if not os.environ.get("SBP"):
        print("Falta o token: export SBP=sbp_...", file=sys.stderr)
        return 2

    cab_mgmt = {"Authorization": "Bearer " + os.environ["SBP"]}

    def sql(q):
        _, d = http(f"{MGMT}/database/query", {"query": q}, cab=cab_mgmt)
        return d if isinstance(d, list) else []

    st, chaves = http(f"{MGMT}/api-keys", cab=cab_mgmt)
    if not isinstance(chaves, list):
        print(f"não consegui as chaves do projeto (HTTP {st}). Token válido?", file=sys.stderr)
        return 2
    ch = {k["name"]: k["api_key"] for k in chaves}
    anon, service = ch["anon"], ch["service_role"]
    ANON = {"apikey": anon, "Authorization": f"Bearer {anon}"}
    ADM = {"apikey": service, "Authorization": f"Bearer {service}"}

    def limpar():
        sql(f"delete from equipe_contas where usuario='{USUARIO}';"
            f" delete from acesso_senha_legado where conta_id in"
            f"  (select id from acesso_conta where usuario='{USUARIO}');"
            f" delete from acesso_papel where conta_id in"
            f"  (select id from acesso_conta where usuario='{USUARIO}');"
            f" delete from acesso_conta where usuario='{USUARIO}';")
        # o usuário no Auth some por aqui: a Management API recusa DELETE em auth.users
        _, us = http(f"https://{PROJ}.supabase.co/auth/v1/admin/users?per_page=500", cab=ADM)
        for u in us.get("users", []):
            if u["email"].startswith(f"{USUARIO}@"):
                http(f"https://{PROJ}.supabase.co/auth/v1/admin/users/{u['id']}",
                     metodo="DELETE", cab=ADM)

    fora = []
    limpar()

    salt = os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", SENHA.encode(), salt, 120000, 32)
    papeis = " ".join(
        f"insert into acesso_papel (conta_id,sistema,papel,ativo)"
        f" select id,'{s}','{p}',true from acesso_conta where usuario='{USUARIO}';"
        for s, (_, p, _) in PORTAS.items())
    sql(f"insert into acesso_conta (usuario,nome,tipo,ativo)"
        f" values ('{USUARIO}','Zz Conferencia','pessoa',true);" + papeis +
        f" insert into acesso_senha_legado (conta_id,origem,hash,salt,iter)"
        f" select id,'teste','{h.hex()}','{salt.hex()}',120000"
        f" from acesso_conta where usuario='{USUARIO}';")

    st, r = http(f"{FN}/acesso-entrar",
                 {"action": "entrar", "usuario": USUARIO, "senha": SENHA}, cab=ANON)
    crachas = {k: (v or {}).get("token", "") for k, v in (r.get("crachas") or {}).items()}
    if not crachas:
        print(f"a entrada única não emitiu crachá (HTTP {st}): {str(r)[:120]}")
        limpar()
        return 1

    print("PORTA            próprio   de outro   sem nada")
    print("-" * 52)
    for sis, (fn, _papel, acao) in PORTAS.items():
        meu = crachas.get(sis, "")
        outro = next((t for s, t in crachas.items() if s != sis), "")
        a, _ = http(f"{FN}/{fn}", {"action": acao},
                    cab={"apikey": anon, "Authorization": f"Bearer {meu}"})
        b, _ = http(f"{FN}/{fn}", {"action": acao},
                    cab={"apikey": anon, "Authorization": f"Bearer {outro}"})
        c, _ = http(f"{FN}/{fn}", {"action": acao}, cab={"apikey": anon})
        # 400 conta como "passou pela porta": a ação existe, o corpo é que não serve
        ok = (a in (200, 400), b in (401, 403), c in (401, 403))
        if not ok[0]:
            fora.append(f"{sis}: o próprio crachá não abre (HTTP {a})")
        if not ok[1]:
            fora.append(f"{sis}: crachá de OUTRO sistema abre (HTTP {b})")
        if not ok[2]:
            fora.append(f"{sis}: abre sem credencial (HTTP {c})")
        marca = lambda v, o: f"{v}{'' if o else ' ←'}"
        print(f"{fn:<16} {marca(a, ok[0]):<9} {marca(b, ok[1]):<10} {marca(c, ok[2])}")

    sql(f"update acesso_conta set ativo=false where usuario='{USUARIO}';")
    st_d, _ = http(f"{FN}/acesso-entrar",
                   {"action": "entrar", "usuario": USUARIO, "senha": SENHA}, cab=ANON)
    if st_d != 401:
        fora.append(f"conta desativada ainda recebe crachá (HTTP {st_d})")
    sql(f"update acesso_conta set ativo=true where usuario='{USUARIO}';")

    algum = next(iter(PORTAS))
    sql(f"update acesso_papel set ativo=false where sistema='{algum}' and conta_id in"
        f" (select id from acesso_conta where usuario='{USUARIO}');")
    _, r2 = http(f"{FN}/acesso-entrar",
                 {"action": "entrar", "usuario": USUARIO, "senha": SENHA}, cab=ANON)
    if algum in (r2.get("crachas") or {}):
        fora.append(f"papel desativado ({algum}) continua recebendo crachá")

    print("\nsegredo no bundle público:")
    for sis, url in BUNDLES.items():
        try:
            with urllib.request.urlopen(url) as x:
                txt = x.read().decode()
        except Exception as e:
            print(f"   {sis:<8} não consegui ler ({str(e)[:40]})")
            continue
        achados = set(re.findall(r'(APP_TOKEN|API_TOKEN|TOKEN)\s*=\s*["\'][^"\']{8,}', txt))
        print(f"   {sis:<8} {'limpo' if not achados else 'TEM SEGREDO: ' + str(achados)}")
        if achados:
            fora.append(f"{sis}: segredo no config.js público")

    limpar()
    sobra = sql(f"select count(*) as n from acesso_conta where usuario='{USUARIO}';")
    if sobra and sobra[0]["n"]:
        fora.append("a conta de teste não foi apagada")

    print("\n" + "=" * 52)
    if fora:
        print(f"FORA DO PADRÃO ({len(fora)}):")
        for f in fora:
            print("  •", f)
        return 1
    print("Todos no padrão.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
