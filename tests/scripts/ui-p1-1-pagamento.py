"""Teste de tela GS-07 P1.1: clique duplo e reenvio apos timeout no perfil do aluno.

Pre-requisitos (base DESCARTAVEL):
  - API em http://localhost:3001 sobre base criada com `npm run db:seed:dev`;
  - frontend em http://localhost:5173 iniciado com VITE_PAGAMENTO_TIMEOUT_MS=2000
    (o cenario C espera o timeout do cliente);
  - Python com `pip install playwright` e `playwright install chromium`.

Uso (na raiz do repositorio):
  set VITE_PAGAMENTO_TIMEOUT_MS=2000 && npm --prefix frontend run dev
  python tests/scripts/ui-p1-1-pagamento.py
Variaveis: GS_DB (padrao backend/academia.sqlite, somente leitura), GS_SHOTS (pasta dos prints).

Cenarios: A) clique duplo -> 1 requisicao, 1 pagamento, 1 lancamento;
B) servidor grava e a resposta se perde (falha de rede) -> reenvio com a mesma
chave nao duplica; C) timeout do cliente (2 s) com o pagamento ja gravado ->
reenvio com a mesma chave nao duplica; D) tentativas diferentes usam chaves diferentes.
"""
import asyncio
import json
import os
import sqlite3
import sys
import time
import urllib.request

from playwright.async_api import async_playwright

API = "http://localhost:3001"
WEB = "http://localhost:5173"
DB = os.environ.get("GS_DB", "backend/academia.sqlite")
SHOTS = os.environ.get("GS_SHOTS", ".")
RUN = hex(int(time.time()))[2:]

total = 0
falhas = 0


def check(label, cond, extra=""):
    global total, falhas
    total += 1
    if not cond:
        falhas += 1
    print(f"{'[OK]     ' if cond else '[FALHOU] '}{label}{' - ' + str(extra) if extra != '' else ''}", flush=True)


def api(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def contagens(mensalidade_id):
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try:
        pags = con.execute("SELECT id, chave_idempotencia FROM pagamento WHERE mensalidade_id = ?", (mensalidade_id,)).fetchall()
        ids = [p[0] for p in pags] or [-1]
        q = ",".join("?" * len(ids))
        lanc = con.execute(
            f"SELECT COUNT(*) FROM conta_financeira WHERE deleted_at IS NULL AND origem = 'pagamento_mensalidade' AND origem_id IN ({q})", ids
        ).fetchone()[0]
        status = con.execute("SELECT status FROM mensalidade WHERE id = ?", (mensalidade_id,)).fetchone()[0]
        return {"pagamentos": len(pags), "lancamentos": lanc, "status": status, "chaves": [p[1] for p in pags]}
    finally:
        con.close()


def preparar(token, plano_id, sufixo):
    s, aluno = api("POST", "/alunos", token, {
        "nome": f"UI P1.1 {RUN} {sufixo}", "data_nascimento": "1990-01-01",
        "plano_id": plano_id, "dia_vencimento": 10, "status": "ativo",
    })
    aluno = aluno.get("data", aluno)
    hoje = time.strftime("%Y-%m-%d")
    s2, m = api("POST", "/mensalidades", token, {
        "aluno_id": aluno["id"], "plano_id": plano_id, "vencimento": hoje[:8] + "10", "valor_cobrado": 80,
    })
    m = m.get("data", m)
    check(f"setup {sufixo}: aluno e mensalidade de R$ 80 em aberto", s == 201 and s2 == 201, f"{s} {s2}")
    return aluno["id"], m["id"]


async def abrir_perfil(page, aluno_id, mensalidade_id):
    await page.goto(f"{WEB}/alunos/{aluno_id}")
    await page.get_by_role("button", name="Mensalidades").click()
    botao = page.get_by_test_id(f"pagar-mensalidade-{mensalidade_id}")
    await botao.wait_for()
    return botao


async def main():
    s, login = api("POST", "/auth/login", body={"login": "owner", "senha": "dev12345"})
    token = login["data"]["token"]
    _, planos = api("GET", "/planos", token)
    planos = planos.get("data", planos) if isinstance(planos, dict) else planos
    plano_id = planos[0]["id"]

    aluno_a, mens_a = preparar(token, plano_id, "clique-duplo")
    aluno_b, mens_b = preparar(token, plano_id, "rede-cai")
    aluno_c, mens_c = preparar(token, plano_id, "timeout")

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await page.goto(f"{WEB}/login")
        await page.get_by_label("Login ou email").fill("owner")
        await page.get_by_label("Senha").fill("dev12345")
        await page.get_by_role("button", name="Entrar").click()
        await page.wait_for_url(lambda u: "/login" not in u)

        enviados = []

        def registrar(req):
            if req.method == "POST" and req.url.rstrip("/").endswith("/pagamentos"):
                enviados.append({"chave": req.headers.get("idempotency-key"), "body": req.post_data})

        page.on("request", registrar)

        # ---------- A. clique duplo ----------
        async def atrasar(route):
            await asyncio.sleep(1.0)
            await route.continue_()

        await page.route("**/pagamentos", atrasar)
        botao = await abrir_perfil(page, aluno_a, mens_a)
        enviados.clear()
        await botao.dblclick()
        await asyncio.sleep(0.3)
        desabilitado = await botao.is_disabled()
        rotulo = (await botao.inner_text()).strip()
        await page.screenshot(path=f"{SHOTS}/p11-a-pagando.png")
        check("A: durante a requisicao o botao fica desabilitado em 'Pagando...'", desabilitado and "Pagando" in rotulo, rotulo)
        await page.get_by_text("Pagamento registrado com sucesso.").wait_for(timeout=8000)
        await asyncio.sleep(0.5)
        c = contagens(mens_a)
        check("A: clique duplo enviou uma unica requisicao", len(enviados) == 1, len(enviados))
        check("A: 1 pagamento e 1 lancamento na base, mensalidade paga",
              c["pagamentos"] == 1 and c["lancamentos"] == 1 and c["status"] == "pago", c)
        check("A: requisicao levou Idempotency-Key", bool(enviados and enviados[0]["chave"]), enviados[0]["chave"] if enviados else None)
        await page.unroute("**/pagamentos")

        # ---------- B. falha de rede depois de o servidor gravar ----------
        estado = {"n": 0}

        async def cair_na_volta(route):
            estado["n"] += 1
            if estado["n"] == 1:
                await route.fetch()           # servidor processa e grava
                await route.abort("timedout")  # resposta se perde no caminho
            else:
                await route.continue_()

        await page.route("**/pagamentos", cair_na_volta)
        botao = await abrir_perfil(page, aluno_b, mens_b)
        enviados.clear()
        await botao.click()
        await page.get_by_text("Sem confirmacao do servidor", exact=False).wait_for(timeout=8000)
        c1 = contagens(mens_b)
        rotulo = (await botao.inner_text()).strip()
        await page.screenshot(path=f"{SHOTS}/p11-b-sem-confirmacao.png")
        check("B: servidor gravou, tela recebeu falha de rede e oferece 'Reenviar pagamento'",
              c1["pagamentos"] == 1 and "Reenviar pagamento" in rotulo, f"{c1} '{rotulo}'")
        await botao.click()
        await page.get_by_text("Pagamento ja registrado anteriormente", exact=False).wait_for(timeout=8000)
        await asyncio.sleep(0.5)
        c2 = contagens(mens_b)
        await page.screenshot(path=f"{SHOTS}/p11-b-reenvio.png")
        check("B: reenvio usou a mesma Idempotency-Key e o mesmo corpo",
              len(enviados) == 2 and enviados[0]["chave"] == enviados[1]["chave"] and enviados[0]["body"] == enviados[1]["body"],
              [e["chave"] for e in enviados])
        check("B: continua 1 pagamento e 1 lancamento, mensalidade paga",
              c2["pagamentos"] == 1 and c2["lancamentos"] == 1 and c2["status"] == "pago", c2)
        await page.unroute("**/pagamentos")

        # ---------- C. timeout do cliente (axios, 2 s) ----------
        estado = {"n": 0}

        async def demorar(route):
            estado["n"] += 1
            if estado["n"] == 1:
                resp = await route.fetch()    # servidor grava na hora
                await asyncio.sleep(3.0)      # resposta chega depois do timeout
                try:
                    await route.fulfill(response=resp)
                except Exception:
                    pass
            else:
                await route.continue_()

        await page.route("**/pagamentos", demorar)
        botao = await abrir_perfil(page, aluno_c, mens_c)
        enviados.clear()
        await botao.click()
        await page.get_by_text("Sem confirmacao do servidor", exact=False).wait_for(timeout=8000)
        c1 = contagens(mens_c)
        check("C: timeout de 2 s no cliente com o pagamento ja gravado no servidor", c1["pagamentos"] == 1, c1)
        await asyncio.sleep(1.5)
        await botao.click()
        await page.get_by_text("Pagamento ja registrado anteriormente", exact=False).wait_for(timeout=8000)
        await asyncio.sleep(0.5)
        c2 = contagens(mens_c)
        await page.screenshot(path=f"{SHOTS}/p11-c-timeout-reenvio.png")
        check("C: reenvio apos timeout com a mesma chave", len(enviados) == 2 and enviados[0]["chave"] == enviados[1]["chave"],
              [e["chave"] for e in enviados])
        check("C: continua 1 pagamento e 1 lancamento, mensalidade paga",
              c2["pagamentos"] == 1 and c2["lancamentos"] == 1 and c2["status"] == "pago", c2)
        await page.unroute("**/pagamentos")

        # ---------- D. nova tentativa depois de sucesso gera chave nova ----------
        chaves = set(contagens(mens_a)["chaves"] + contagens(mens_b)["chaves"] + contagens(mens_c)["chaves"])
        check("D: cada tentativa teve chave propria (3 pagamentos, 3 chaves distintas)", len(chaves) == 3, chaves)

        await browser.close()

    print(f"\n[ui-p1.1] {total - falhas}/{total} verificacoes OK")
    sys.exit(1 if falhas else 0)


asyncio.run(main())
