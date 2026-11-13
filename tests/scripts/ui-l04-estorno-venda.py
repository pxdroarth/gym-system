"""Teste de tela L04 · estorno de venda no fluxo padrao da unidade e na opcao de tres contas.

Cobre: o atendente solicita, registra a autorizacao que o gestor deu por WhatsApp
e executa (quantidade invalida, mes fechado e nova tentativa apos reabertura);
o gestor aprova no sistema e nao aprova o proprio pedido; o dono liga a opcao de
tres contas distintas e o atendente deixa de poder executar o proprio pedido; a
fila do Financeiro mostra a origem da autorizacao; visao no celular.

Pre-requisitos (base DESCARTAVEL):
  - API em http://localhost:3001 sobre base criada com `npm run db:seed:dev`;
  - frontend em http://localhost:5173 (`npm --prefix frontend run dev`);
  - Python com `pip install playwright` e `playwright install chromium`.

Uso (na raiz do repositorio):
  python tests/scripts/ui-l04-estorno-venda.py
Variaveis: GS_DB (padrao backend/academia.sqlite, somente leitura), GS_SHOTS (pasta dos prints).

O teste fecha e reabre o mes corrente na Matriz pela API (owner, com motivo) e
liga e desliga a opcao de tres contas na Matriz.
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
SHOTS = os.environ.get("GS_SHOTS", "test-results/ui-l04-estorno")
total = falhas = 0


def check(label, cond, extra=""):
    global total, falhas
    total += 1
    falhas += 0 if cond else 1
    print(f"{'[OK]     ' if cond else '[FALHOU] '}{label}{' - ' + str(extra) if extra != '' else ''}", flush=True)


def api(method, path, token=None, body=None, unit=None):
    req = urllib.request.Request(API + path, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if unit:
        req.add_header("X-Unit-Id", str(unit))
    data = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, data) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def entrar_api(login):
    _, r = api("POST", "/auth/login", body={"login": login, "senha": "dev12345"})
    return r["data"]["token"], r["data"]["usuario"]


def q1(sql, params=()):
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try:
        return con.execute(sql, params).fetchone()
    finally:
        con.close()


async def entrar(page, login):
    await page.context.clear_cookies()
    await page.goto(f"{WEB}/login")
    await page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
    await page.goto(f"{WEB}/login")
    await page.get_by_label("Login ou email").fill(login)
    await page.get_by_label("Senha").fill("dev12345")
    await page.get_by_role("button", name="Entrar").click()
    await page.wait_for_url(lambda u: "/login" not in u, timeout=15000)


async def abrir_venda(page, venda_id):
    await page.goto(f"{WEB}/vendas-produtos")
    await page.wait_for_load_state("networkidle")
    titulo = page.get_by_role("heading", name=f"Estorno da venda #{venda_id}")
    for _ in range(3):
        await page.locator(f'tr[data-venda-id="{venda_id}"]').get_by_role("button", name="Estorno").click()
        try:
            await titulo.wait_for(timeout=5000)
            return
        except Exception:
            await page.wait_for_timeout(500)
    await titulo.wait_for()


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    owner, owner_user = entrar_api("owner")
    gestor, gestor_user = entrar_api("gestor")
    recepcao, recepcao_user = entrar_api("recepcao")
    matriz = [u for u in owner_user["allowedUnits"] if u["codigo"] == "matriz"][0]["id"]
    boundary = "----l04e"
    nome = f"UI L04E {int(time.time())}"
    corpo = "".join(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n" for k, v in
                    {"nome": nome, "preco": "12", "estoque": "20"}.items()) + f"--{boundary}--\r\n"
    req = urllib.request.Request(API + "/produtos", data=corpo.encode(), method="POST")
    req.add_header("Authorization", f"Bearer {owner}")
    req.add_header("X-Unit-Id", str(matriz))
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    produto = json.loads(urllib.request.urlopen(req).read())
    vendas = []
    for qtd in (3, 1, 1):
        s, v = api("POST", "/vendas-produtos", owner, {"produto_id": produto["id"], "quantidade": qtd}, unit=matriz)
        vendas.append(v["id"])
    check("setup: tres vendas do produto de R$ 12 na Matriz", s == 201, s)
    va, vb, vc = vendas
    # pedido B do atendente e pedido C do gestor, criados pela API
    api("POST", f"/vendas-produtos/{vb}/estornos", recepcao, {"motivo": "Cobrado em duplicidade"})
    api("POST", f"/vendas-produtos/{vc}/estornos", gestor, {"motivo": "Gestor pede o estorno"})

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        # ---------- atendente solicita e registra a autorizacao do gestor por WhatsApp ----------
        await entrar(page, "recepcao")
        await abrir_venda(page, va)
        await page.get_by_role("button", name="Solicitar estorno").click()
        await page.locator(".ui-modal").get_by_role("alert").wait_for()
        check("atendente: solicitar sem motivo mostra a recusa na tela", "motivo" in (await page.locator(".ui-modal").get_by_role("alert").inner_text()).lower())
        await page.get_by_label("Motivo do estorno").fill("Cliente devolveu 1 unidade lacrada")
        await page.get_by_role("button", name="Solicitar estorno").click()
        form = page.get_by_role("form", name="Registrar autorização externa")
        await form.wait_for()
        check("atendente: nao ve o botao de aprovar no sistema", await page.get_by_role("button", name="Aprovar estorno").count() == 0)
        autorizador = page.get_by_label("Quem autorizou")
        await page.wait_for_function("() => document.querySelectorAll('select option').length > 2")
        valores = await autorizador.locator("option").evaluate_all("os => os.map(o => o.value)")
        check("atendente: lista de autorizadores traz o gestor e nao traz a propria conta",
              str(gestor_user["id"]) in valores and str(recepcao_user["id"]) not in valores, valores)
        await autorizador.select_option(str(gestor_user["id"]))
        await page.get_by_label("Referência da mensagem ou e-mail").fill("Grupo Equipe Matriz, 10:42, \"pode estornar\"")
        await page.get_by_role("button", name="Registrar autorização externa").click()
        await page.get_by_text("Autorização externa via WhatsApp").first.wait_for()
        texto = await page.locator(".ui-modal").inner_text()
        check("atendente: detalhe mostra origem externa, autorizador, quem registrou e que foi declarada",
              "Registrada por:" in texto and "declarada por quem a registrou" in texto and "Grupo Equipe Matriz" in texto, texto[:200])
        await page.screenshot(path=f"{SHOTS}/1-atendente-registrou-whatsapp.png")
        row = q1("SELECT status, aprovado_por, autorizacao_canal, autorizacao_registrada_por FROM venda_estorno WHERE venda_id = ?", (va,))
        check("base: aprovada, autorizador gestor, canal whatsapp, registrada pelo atendente",
              row == ("aprovada", str(gestor_user["id"]), "whatsapp", str(recepcao_user["id"])), row)

        # ---------- atendente executa: quantidade invalida, mes fechado, reabertura ----------
        hoje = time.localtime()
        ano, mes = hoje.tm_year, hoje.tm_mon
        s, _ = api("POST", f"/fechamento-mensal/{ano}/{mes}/fechar", owner, unit=matriz)
        check(f"setup: {mes}/{ano} fechado na Matriz", s == 200, s)
        campo = page.get_by_label("Unidades recebidas em condição de venda (0 a 3)")
        await campo.fill("4")
        await page.get_by_role("button", name="Executar estorno").click()
        alerta = page.locator(".ui-modal").get_by_role("alert")
        await alerta.wait_for()
        check("atendente: quantidade 4 de 3 recusada na tela", "entre zero e a quantidade vendida" in await alerta.inner_text())
        await campo.fill("1")
        await page.get_by_role("button", name="Executar estorno").click()
        await page.get_by_text("Período fechado.", exact=False).first.wait_for()
        await page.screenshot(path=f"{SHOTS}/2-atendente-periodo-fechado.png")
        check("atendente: mes fechado mostra 'Período fechado' e mantem a autorizacao",
              q1("SELECT status FROM venda_estorno WHERE venda_id = ?", (va,))[0] == "aprovada")
        s, _ = api("POST", f"/fechamento-mensal/{ano}/{mes}/reabrir", owner, {"motivo": "UI L04E"}, unit=matriz)
        check("setup: owner reabre o mes", s == 200, s)
        estoque_antes = q1("SELECT estoque FROM produto WHERE id = ?", (produto["id"],))[0]
        await campo.fill("1")
        await page.get_by_role("button", name="Executar estorno").click()
        await page.get_by_text("1 de 3 reposta(s) ao estoque", exact=False).wait_for()
        await page.screenshot(path=f"{SHOTS}/3-atendente-executou.png")
        estoque_depois = q1("SELECT estoque FROM produto WHERE id = ?", (produto["id"],))[0]
        inv = q1("SELECT valor, tipo FROM conta_financeira c JOIN venda_estorno e ON e.lancamento_inverso_id = c.id WHERE e.venda_id = ?", (va,))
        check("atendente: executou apos reabrir, repos 1 e estornou R$ 36", estoque_depois == estoque_antes + 1 and inv == (36.0, "despesa"),
              (estoque_antes, estoque_depois, inv))
        await page.get_by_role("button", name="Fechar modal").click()

        # ---------- gestor aprova no sistema e nao aprova o proprio pedido ----------
        await entrar(page, "gestor")
        await abrir_venda(page, vc)
        botao = page.get_by_role("button", name="Aprovar estorno")
        await botao.wait_for()
        check("gestor: no proprio pedido o botao de aprovar fica desabilitado com aviso",
              await botao.is_disabled() and await page.get_by_text("Você solicitou este estorno e não pode aprová-lo.").count() == 1)
        await page.get_by_role("button", name="Fechar modal").click()
        await abrir_venda(page, vb)
        await page.get_by_role("button", name="Aprovar estorno").click()
        await page.get_by_text("Aprovação no sistema").first.wait_for()
        check("gestor: aprovou no sistema o pedido do atendente e nao ve executar",
              q1("SELECT status, autorizacao_canal FROM venda_estorno WHERE venda_id = ?", (vb,)) == ("aprovada", "sistema")
              and await page.get_by_role("button", name="Executar estorno").count() == 0)
        await page.screenshot(path=f"{SHOTS}/4-gestor-aprovou.png")
        await page.get_by_role("button", name="Fechar modal").click()

        # ---------- dono liga a opcao de tres contas ----------
        await entrar(page, "owner")
        await page.goto(f"{WEB}/financeiro/estornos-venda")
        caixa = page.get_by_label("Exigir três contas distintas")
        await caixa.wait_for()
        # caixa controlada: o estado so muda depois que a API confirma
        await caixa.click()
        await page.get_by_text("Esta unidade exige três contas distintas", exact=False).first.wait_for()
        check("dono: liga a opcao de tres contas pela tela", await caixa.is_checked()
              and q1("SELECT estorno_venda_contas_distintas FROM unit WHERE id = ?", (matriz,))[0] == 1)
        await page.get_by_role("button", name="Concluídos").click()
        fila = page.locator("tr", has_text=nome).filter(has_text="Estornada")
        await fila.first.wait_for()
        texto_fila = await fila.first.inner_text()
        check("dono: fila mostra a origem externa e quem registrou", "Autorização externa via WhatsApp" in texto_fila and "registrada por" in texto_fila, texto_fila)
        await page.screenshot(path=f"{SHOTS}/5-dono-tres-contas.png")

        # ---------- com a opcao ligada o atendente nao executa o proprio pedido ----------
        await entrar(page, "recepcao")
        await abrir_venda(page, vb)
        await page.get_by_test_id("aviso-tres-contas").wait_for()
        executar = page.get_by_role("button", name="Executar estorno")
        check("atendente: com tres contas, executar o proprio pedido fica bloqueado com aviso",
              await executar.is_disabled() and await page.get_by_text("quem solicitou ou autorizou não executa", exact=False).count() >= 1)
        await page.screenshot(path=f"{SHOTS}/6-atendente-bloqueado-tres-contas.png")
        api("PATCH", "/vendas-produtos/estornos/politica", owner, {"contas_distintas": False}, unit=matriz)

        # ---------- celular ----------
        mobile = await browser.new_page(viewport={"width": 390, "height": 844})
        await entrar(mobile, "recepcao")
        await abrir_venda(mobile, va)
        await mobile.get_by_text("Registrada por:", exact=False).wait_for()
        await mobile.screenshot(path=f"{SHOTS}/7-celular-detalhe.png")
        check("celular: atendente ve a venda estornada e quem atuou em cada etapa",
              await mobile.get_by_text("Execução:", exact=False).count() >= 1)
        await browser.close()

    print(f"\n[ui-l04-estorno] {total - falhas}/{total} verificacoes OK")
    sys.exit(1 if falhas else 0)


asyncio.run(main())
