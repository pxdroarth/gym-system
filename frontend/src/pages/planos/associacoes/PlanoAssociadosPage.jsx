import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";

const API = "http://localhost:3001";

function Badge({ children, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center justify-center min-w-[1.5rem] px-2 h-6 text-xs font-semibold rounded-full bg-blue-100 text-blue-700"
    >
      {children}
    </span>
  );
}

/**
 * Tela de vinculação de planos compartilhados (Responsável -> Associados)
 * Padrão: Transfer List (lista de busca à esquerda, associados à direita).
 * - Busca alunos por nome/matrícula (GET /alunos/pesquisa)
 * - Mostra associados do responsável (GET /plano-associado/:responsavelId)
 * - Adiciona vínculo (POST /plano-associado { aluno_id, responsavel_id })
 * - Remove vínculo (DELETE /plano-associado/:id)
 */
export default function PlanoAssociadosPage() {
  // Responsável selecionado
  const [responsavelBusca, setResponsavelBusca] = useState("");
  const [responsavelResultados, setResponsavelResultados] = useState([]);
  const [responsavelSel, setResponsavelSel] = useState(null); // {id, nome, matricula}

  // Vinculados do responsável (lado direito)
  const [associados, setAssociados] = useState([]); // [{id, aluno_id, nome, matricula}]
  const [carregandoAssociados, setCarregandoAssociados] = useState(false);

  // Busca de alunos para adicionar (lado esquerdo)
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]); // alunos encontrados
  const [buscando, setBuscando] = useState(false);

  // --- Busca de RESPONSÁVEL (autocomplete simples) ---
  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      const termo = (responsavelBusca || "").trim();
      if (!termo) {
        if (active) setResponsavelResultados([]);
        return;
      }
      try {
        const url = new URL(`${API}/alunos/pesquisa`);
        url.searchParams.set("termo", termo);
        url.searchParams.set("pagina", "1");
        url.searchParams.set("limite", "10");
        const r = await fetch(url);
        if (r.ok) {
          const jr = await r.json();
          if (active) setResponsavelResultados(jr.alunos || []);
        }
      } catch {/* noop */}
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [responsavelBusca]);

  // Carrega vinculados ao mudar o responsável
  useEffect(() => {
    if (!responsavelSel?.id) {
      setAssociados([]);
      return;
    }
    (async () => {
      try {
        setCarregandoAssociados(true);
        const r = await fetch(`${API}/plano-associado/${responsavelSel.id}`);
        if (!r.ok) throw new Error("Erro ao carregar vínculos");
        const jr = await r.json();
        // jr.associados: [{id, nome, matricula}] — nossa API retorna id do vínculo como id
        const arr = (jr.associados || []).map((a) => ({
          id: a.id, // id do vínculo
          aluno_id: a.aluno_id || a.id_aluno || a.aluno_id, // tolerância
          nome: a.nome,
          matricula: a.matricula,
        }));
        setAssociados(arr);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setCarregandoAssociados(false);
      }
    })();
  }, [responsavelSel?.id]);

  // Busca de alunos para ADICIONAR (lado esquerdo)
  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      const termo = (busca || "").trim();
      if (!termo || !responsavelSel?.id) {
        if (active) setResultados([]);
        return;
      }
      setBuscando(true);
      try {
        const url = new URL(`${API}/alunos/pesquisa`);
        url.searchParams.set("termo", termo);
        url.searchParams.set("pagina", "1");
        url.searchParams.set("limite", "20");
        const r = await fetch(url);
        if (r.ok) {
          const jr = await r.json();
          let lista = jr.alunos || [];
          // filtra: não mostrar o próprio responsável e nem quem já está vinculado
          const idsJa = new Set(associados.map((a) => a.aluno_id));
          lista = lista.filter((a) => a.id !== responsavelSel.id && !idsJa.has(a.id));
          if (active) setResultados(lista);
        }
      } catch {/* noop */}
      finally { setBuscando(false); }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [busca, responsavelSel?.id, associados]);

  async function adicionarAluno(aluno) {
    if (!responsavelSel?.id) return;
    try {
      const resp = await fetch(`${API}/plano-associado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aluno_id: Number(aluno.id),
          responsavel_id: Number(responsavelSel.id),
        }),
      });
      const txt = await resp.text();
      if (!resp.ok) throw new Error(txt || "Falha ao vincular");
      const body = txt ? JSON.parse(txt) : {};
      toast.success(`Vinculado: ${aluno.matricula} - ${aluno.nome}`);
      setAssociados((prev) => [
        ...prev,
        { id: body.id, aluno_id: aluno.id, nome: aluno.nome, matricula: aluno.matricula },
      ]);
      setResultados((prev) => prev.filter((x) => x.id !== aluno.id));
      setBusca("");
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function removerVinculo(v) {
    try {
      const r = await fetch(`${API}/plano-associado/${v.id}`, { method: "DELETE" });
      const txt = await r.text();
      if (!r.ok) throw new Error(txt || "Falha ao remover vínculo");
      toast.info(`Removido: ${v.matricula} - ${v.nome}`);
      setAssociados((prev) => prev.filter((a) => a.id !== v.id));
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function removerTodos() {
    if (associados.length === 0) return;
    const confirma = confirm(
      `Remover TODOS os ${associados.length} vínculos deste responsável?`
    );
    if (!confirma) return;

    // dispara em paralelo
    await Promise.allSettled(
      associados.map((v) =>
        fetch(`${API}/plano-associado/${v.id}`, { method: "DELETE" })
      )
    );
    toast.info("Todos os vínculos foram removidos.");
    setAssociados([]);
  }

  const bloqueado = !responsavelSel?.id;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-bold text-blue-700 mb-6">
        Vínculos de Planos Compartilhados
      </h1>

      {/* Seleção do Responsável */}
      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <label className="block text-sm font-semibold mb-2">
          Selecione o responsável
        </label>

        <div className="flex gap-3 items-start flex-col md:flex-row">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Buscar por matrícula ou nome..."
              value={responsavelBusca}
              onChange={(e) => setResponsavelBusca(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />

            {/* dropdown simples com resultados */}
            {!!responsavelBusca && responsavelResultados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto border rounded bg-white shadow">
                {responsavelResultados.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setResponsavelSel({
                        id: r.id,
                        nome: r.nome,
                        matricula: r.matricula,
                      });
                      setResponsavelResultados([]);
                      setResponsavelBusca(`${r.matricula} - ${r.nome}`);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100"
                  >
                    <span className="font-mono text-xs mr-2">{r.matricula}</span>{" "}
                    {r.nome}
                  </button>
                ))}
              </div>
            )}

            {!!responsavelBusca && responsavelResultados.length === 0 && (
              <div className="text-xs text-gray-500 mt-1">Nenhum resultado.</div>
            )}
          </div>

          {responsavelSel?.id && (
            <div className="flex items-center gap-3 bg-blue-50 rounded px-3 py-2">
              <div className="font-semibold text-blue-800">
                Responsável:&nbsp;
                <span className="font-mono text-xs">{responsavelSel.matricula}</span>{" "}
                - {responsavelSel.nome}
              </div>
              <div className="text-sm text-blue-700">
                Vinculados: <Badge>{associados.length}</Badge>
              </div>
              <button
                className="text-blue-700 hover:underline"
                onClick={() => {
                  setResponsavelSel(null);
                  setAssociados([]);
                  setResultados([]);
                  setResponsavelBusca("");
                }}
              >
                trocar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Transfer List */}
      <div
        className={`grid md:grid-cols-2 gap-6 ${
          bloqueado ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {/* Painel ESQUERDO: Buscar e adicionar */}
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Alunos disponíveis</h3>
            <div className="text-xs text-gray-600">
              Resultados: <Badge title="Resultados da busca">{resultados.length}</Badge>
            </div>
          </div>

          <input
            type="text"
            placeholder="Digite para buscar por matrícula ou nome…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-3"
            disabled={bloqueado}
          />

          <div className="border rounded max-h-80 overflow-auto divide-y">
            {buscando && (
              <div className="p-3 text-sm text-gray-500">Buscando…</div>
            )}
            {!buscando && resultados.length === 0 && (
              <div className="p-3 text-sm text-gray-500">Nenhum resultado.</div>
            )}
            {resultados.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium">{a.nome}</div>
                  <div className="text-xs text-gray-500 font-mono">
                    {a.matricula}
                  </div>
                </div>
                <button
                  className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => adicionarAluno(a)}
                >
                  Adicionar
                </button>
              </div>
            ))}
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Dica: pesquise e vá adicionando. Quem estiver à direita já está
            vinculado ao responsável.
          </p>
        </div>

        {/* Painel DIREITO: Associados do responsável */}
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Vinculados ao responsável</h3>
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-600">
                Vinculados: <Badge title="Total de vinculados">{associados.length}</Badge>
              </div>
              <button
                className={`px-3 py-1 rounded ${
                  associados.length === 0
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
                onClick={removerTodos}
                disabled={associados.length === 0}
              >
                Remover todos
              </button>
            </div>
          </div>

          <div className="border rounded max-h-80 overflow-auto divide-y">
            {carregandoAssociados && (
              <div className="p-3 text-sm text-gray-500">Carregando…</div>
            )}
            {!carregandoAssociados && associados.length === 0 && (
              <div className="p-3 text-sm text-gray-500">
                Nenhum aluno vinculado.
              </div>
            )}
            {associados.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium">{v.nome}</div>
                  <div className="text-xs text-gray-500 font-mono">
                    {v.matricula}
                  </div>
                </div>
                <button
                  className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  onClick={() => removerVinculo(v)}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Remover não altera o plano do responsável — apenas desvincula o aluno.
          </p>
        </div>
      </div>
    </div>
  );
}
